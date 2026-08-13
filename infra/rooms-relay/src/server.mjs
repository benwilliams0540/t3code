import * as Crypto from "node:crypto";
import * as Fs from "node:fs";
import * as Http from "node:http";
import * as Http2 from "node:http2";
import * as Path from "node:path";
import { pathToFileURL } from "node:url";

const MAX_BODY_BYTES = 128 * 1024;
const TOKEN_TTL_SECONDS = 5 * 60;
const DPOP_CLOCK_SKEW_SECONDS = 90;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodePart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function parseJwt(value) {
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("jwt_invalid");
  return {
    header: decodePart(parts[0]),
    payload: decodePart(parts[1]),
    signingInput: Buffer.from(`${parts[0]}.${parts[1]}`),
    signature: Buffer.from(parts[2], "base64url"),
  };
}

function signJwt(header, payload, key, algorithm, dsaEncoding) {
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = Crypto.sign(algorithm, Buffer.from(signingInput), {
    key,
    ...(dsaEncoding ? { dsaEncoding } : {}),
  });
  return `${signingInput}.${base64url(signature)}`;
}

function signHmacJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = Crypto.createHmac("sha256", secret).update(signingInput).digest();
  return `${signingInput}.${base64url(signature)}`;
}

function verifyHmacJwt(value, secret) {
  const jwt = parseJwt(value);
  if (jwt.header.alg !== "HS256") throw new Error("jwt_algorithm_invalid");
  const expected = Crypto.createHmac("sha256", secret).update(jwt.signingInput).digest();
  if (
    expected.length !== jwt.signature.length ||
    !Crypto.timingSafeEqual(expected, jwt.signature)
  ) {
    throw new Error("jwt_signature_invalid");
  }
  return jwt.payload;
}

function jwkThumbprint(jwk) {
  if (jwk?.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) {
    throw new Error("dpop_jwk_invalid");
  }
  return base64url(
    Crypto.createHash("sha256")
      .update(JSON.stringify({ crv: "P-256", kty: "EC", x: jwk.x, y: jwk.y }))
      .digest(),
  );
}

function normalizeHtu(value) {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function verifyDpopProof({ proof, method, url, accessToken, now = Date.now() }) {
  const jwt = parseJwt(proof);
  if (jwt.header.alg !== "ES256" || jwt.header.typ?.toLowerCase() !== "dpop+jwt") {
    throw new Error("dpop_header_invalid");
  }
  const key = Crypto.createPublicKey({ key: jwt.header.jwk, format: "jwk" });
  const valid = Crypto.verify(
    "sha256",
    jwt.signingInput,
    { key, dsaEncoding: "ieee-p1363" },
    jwt.signature,
  );
  if (!valid) throw new Error("dpop_signature_invalid");
  if (
    jwt.payload.htm !== method.toUpperCase() ||
    normalizeHtu(jwt.payload.htu) !== normalizeHtu(url)
  ) {
    throw new Error("dpop_target_invalid");
  }
  const nowSeconds = Math.floor(now / 1000);
  if (
    !Number.isInteger(jwt.payload.iat) ||
    Math.abs(nowSeconds - jwt.payload.iat) > DPOP_CLOCK_SKEW_SECONDS
  ) {
    throw new Error("dpop_time_invalid");
  }
  if (typeof jwt.payload.jti !== "string" || jwt.payload.jti.length < 8) {
    throw new Error("dpop_jti_invalid");
  }
  if (accessToken) {
    const expectedAth = base64url(Crypto.createHash("sha256").update(accessToken).digest());
    if (jwt.payload.ath !== expectedAth) throw new Error("dpop_access_token_invalid");
  }
  return { thumbprint: jwkThumbprint(jwt.header.jwk), jti: jwt.payload.jti };
}

function audienceIncludes(actual, expected) {
  return typeof actual === "string"
    ? actual === expected
    : Array.isArray(actual) && actual.includes(expected);
}

class ClerkVerifier {
  constructor({ issuer, audience, jwksUrl, fetchImpl = fetch }) {
    this.issuer = issuer;
    this.audience = audience;
    this.jwksUrl = jwksUrl;
    this.fetchImpl = fetchImpl;
    this.keys = new Map();
    this.refreshedAt = 0;
  }

  async refresh() {
    const response = await this.fetchImpl(this.jwksUrl);
    if (!response.ok) throw new Error("clerk_jwks_unavailable");
    const body = await response.json();
    this.keys = new Map((body.keys ?? []).map((key) => [key.kid, key]));
    this.refreshedAt = Date.now();
  }

  async verify(token) {
    const jwt = parseJwt(token);
    if (jwt.header.alg !== "RS256" || typeof jwt.header.kid !== "string") {
      throw new Error("clerk_header_invalid");
    }
    if (!this.keys.has(jwt.header.kid) || Date.now() - this.refreshedAt > 5 * 60_000)
      await this.refresh();
    const jwk = this.keys.get(jwt.header.kid);
    if (!jwk) throw new Error("clerk_key_unknown");
    const valid = Crypto.verify(
      "RSA-SHA256",
      jwt.signingInput,
      Crypto.createPublicKey({ key: jwk, format: "jwk" }),
      jwt.signature,
    );
    if (!valid) throw new Error("clerk_signature_invalid");
    const now = Math.floor(Date.now() / 1000);
    if (jwt.payload.iss !== this.issuer || !audienceIncludes(jwt.payload.aud, this.audience))
      throw new Error("clerk_claim_invalid");
    if (
      typeof jwt.payload.sub !== "string" ||
      jwt.payload.sub.length === 0 ||
      jwt.payload.exp <= now ||
      (jwt.payload.nbf ?? 0) > now
    ) {
      throw new Error("clerk_claim_invalid");
    }
    return jwt.payload;
  }
}

class JsonStore {
  constructor(file) {
    this.file = file;
    this.state = { devices: {}, deliveries: {} };
    if (Fs.existsSync(file)) this.state = JSON.parse(Fs.readFileSync(file, "utf8"));
  }

  persist() {
    Fs.mkdirSync(Path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${process.pid}.tmp`;
    Fs.writeFileSync(temporary, JSON.stringify(this.state), { mode: 0o600 });
    Fs.renameSync(temporary, this.file);
  }

  register(userId, payload) {
    for (const [key, value] of Object.entries(this.state.devices)) {
      if (
        value.pushToken &&
        value.pushToken === payload.pushToken &&
        key !== `${userId}\n${payload.deviceId}`
      )
        delete this.state.devices[key];
    }
    this.state.devices[`${userId}\n${payload.deviceId}`] = {
      ...payload,
      userId,
      updatedAt: new Date().toISOString(),
    };
    this.persist();
  }

  unregister(userId, deviceId) {
    delete this.state.devices[`${userId}\n${deviceId}`];
    this.persist();
  }

  devicesFor(userId) {
    return Object.values(this.state.devices).filter((device) => device.userId === userId);
  }

  delivery(id) {
    return this.state.deliveries[id];
  }

  recordDelivery(id, result) {
    this.state.deliveries[id] = { ...result, recordedAt: new Date().toISOString() };
    this.persist();
  }
}

function readSecret(config, name) {
  const file = config[`${name}_FILE`];
  const value = file ? Fs.readFileSync(file, "utf8") : config[name];
  if (!value?.trim()) throw new Error(`${name.toLowerCase()}_missing`);
  return value.trim();
}

function requestUrl(request, issuer) {
  return new URL(request.url, issuer).toString();
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > MAX_BODY_BYTES) throw new Error("body_too_large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function json(response, status, body) {
  const encoded = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": encoded.length,
    "cache-control": "no-store",
  });
  response.end(encoded);
}

function bearer(request) {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ")) throw new Error("authorization_required");
  return value.slice(7);
}

function dpopAccessToken(request) {
  const value = request.headers.authorization;
  if (!value?.startsWith("DPoP ")) throw new Error("authorization_required");
  return value.slice(5);
}

function secureEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && Crypto.timingSafeEqual(a, b);
}

function validateRegistration(payload, bundleId) {
  if (typeof payload?.deviceId !== "string" || !payload.deviceId || payload.platform !== "ios")
    throw new Error("registration_invalid");
  if (payload.bundleId !== bundleId || payload.apsEnvironment !== "sandbox")
    throw new Error("registration_route_invalid");
  if (
    payload.pushToken !== undefined &&
    (typeof payload.pushToken !== "string" || !/^[0-9a-f]+$/iu.test(payload.pushToken))
  )
    throw new Error("push_token_invalid");
  if (typeof payload.preferences?.notificationsEnabled !== "boolean")
    throw new Error("preferences_invalid");
}

function validateMessage(payload) {
  for (const field of [
    "eventId",
    "recipientUserId",
    "roomId",
    "channelId",
    "roomName",
    "channelName",
    "occurredAt",
    "deepLink",
  ]) {
    if (typeof payload?.[field] !== "string" || !payload[field]) throw new Error("message_invalid");
  }
  if (!payload.deepLink.startsWith("/rooms/")) throw new Error("deep_link_invalid");
}

function apnsPayload(message) {
  return {
    aps: {
      alert: {
        title: message.roomName,
        body: message.senderDisplayName
          ? `${message.senderDisplayName} posted in ${message.channelName}`
          : `New message in ${message.channelName}`,
      },
      sound: "default",
    },
    environmentId: "rooms",
    threadId: message.eventId,
    deepLink: message.deepLink,
    eventId: message.eventId,
    roomId: message.roomId,
    channelId: message.channelId,
  };
}

class ApnsClient {
  constructor({ teamId, keyId, bundleId, privateKey }) {
    this.teamId = teamId;
    this.keyId = keyId;
    this.bundleId = bundleId;
    this.privateKey = Crypto.createPrivateKey(privateKey);
    this.cachedToken = null;
  }

  token() {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedToken && now - this.cachedToken.issuedAt < 50 * 60)
      return this.cachedToken.value;
    const value = signJwt(
      { alg: "ES256", kid: this.keyId },
      { iss: this.teamId, iat: now },
      this.privateKey,
      "sha256",
      "ieee-p1363",
    );
    this.cachedToken = { issuedAt: now, value };
    return value;
  }

  send(pushToken, message) {
    return new Promise((resolve, reject) => {
      const client = Http2.connect("https://api.sandbox.push.apple.com");
      client.once("error", reject);
      const request = client.request({
        ":method": "POST",
        ":path": `/3/device/${pushToken}`,
        authorization: `bearer ${this.token()}`,
        "apns-topic": this.bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
      });
      const chunks = [];
      let status = 0;
      let apnsId = null;
      request.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
        apnsId = headers["apns-id"] ?? null;
      });
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("error", reject);
      request.on("end", () => {
        client.close();
        let reason = null;
        try {
          reason = JSON.parse(Buffer.concat(chunks).toString("utf8")).reason ?? null;
        } catch {}
        resolve({ status, apnsId, reason });
      });
      request.end(JSON.stringify(apnsPayload(message)));
    });
  }
}

export function createRoomsRelay(config = process.env, overrides = {}) {
  const issuer = new URL(config.RELAY_ISSUER).origin;
  const tokenSecret = readSecret(config, "RELAY_TOKEN_SECRET");
  const publishToken = readSecret(config, "ROOMS_PUBLISH_TOKEN");
  const store =
    overrides.store ?? new JsonStore(config.RELAY_STORE_PATH ?? "/data/rooms-relay.json");
  const clerk =
    overrides.clerk ??
    new ClerkVerifier({
      issuer: config.ROOMS_CLERK_ISSUER,
      audience: config.ROOMS_CLERK_AUDIENCE,
      jwksUrl: config.ROOMS_CLERK_JWKS_URL,
    });
  const apns =
    overrides.apns ??
    new ApnsClient({
      teamId: config.APNS_TEAM_ID,
      keyId: config.APNS_KEY_ID,
      bundleId: config.APNS_BUNDLE_ID,
      privateKey: readSecret(config, "APNS_PRIVATE_KEY"),
    });
  const replay = new Map();

  async function authenticatedPrincipal(request) {
    const accessToken = dpopAccessToken(request);
    const claims = verifyHmacJwt(accessToken, tokenSecret);
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.iss !== issuer ||
      claims.aud !== issuer ||
      claims.exp <= now ||
      claims.scope !== "mobile:registration"
    )
      throw new Error("access_token_invalid");
    const proof = verifyDpopProof({
      proof: request.headers.dpop,
      method: request.method,
      url: requestUrl(request, issuer),
      accessToken,
    });
    if (proof.thumbprint !== claims.cnf?.jkt) throw new Error("dpop_binding_invalid");
    const replayKey = `${proof.thumbprint}\n${proof.jti}`;
    if (replay.has(replayKey)) throw new Error("dpop_replayed");
    replay.set(replayKey, Date.now());
    return claims.sub;
  }

  return Http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health")
        return json(response, 200, { ok: true, service: "rooms-relay" });
      if (request.method === "POST" && request.url === "/v1/client/dpop-token") {
        const form = new URLSearchParams(await readBody(request));
        if (
          form.get("resource") !== issuer ||
          form.get("scope") !== "mobile:registration" ||
          form.get("client_id") !== "t3-mobile"
        )
          throw new Error("token_request_invalid");
        const proof = verifyDpopProof({
          proof: request.headers.dpop,
          method: request.method,
          url: requestUrl(request, issuer),
        });
        const identity = await clerk.verify(form.get("subject_token") ?? "");
        const now = Math.floor(Date.now() / 1000);
        const accessToken = signHmacJwt(
          {
            iss: issuer,
            aud: issuer,
            sub: identity.sub,
            iat: now,
            exp: now + TOKEN_TTL_SECONDS,
            jti: Crypto.randomUUID(),
            scope: "mobile:registration",
            cnf: { jkt: proof.thumbprint },
          },
          tokenSecret,
        );
        return json(response, 200, {
          access_token: accessToken,
          issued_token_type: "urn:ietf:params:oauth:token-type:access_token",
          token_type: "DPoP",
          expires_in: TOKEN_TTL_SECONDS,
          scope: "mobile:registration",
        });
      }
      if (request.method === "POST" && request.url === "/v1/mobile/devices") {
        const userId = await authenticatedPrincipal(request);
        const payload = JSON.parse(await readBody(request));
        validateRegistration(payload, config.APNS_BUNDLE_ID);
        store.register(userId, payload);
        return json(response, 200, { ok: true });
      }
      if (request.method === "DELETE" && request.url?.startsWith("/v1/mobile/devices/")) {
        const userId = await authenticatedPrincipal(request);
        store.unregister(
          userId,
          decodeURIComponent(request.url.slice("/v1/mobile/devices/".length)),
        );
        return json(response, 200, { ok: true });
      }
      if (request.method === "POST" && request.url === "/v1/rooms/messages") {
        if (!secureEqual(bearer(request), publishToken)) throw new Error("publisher_invalid");
        const message = JSON.parse(await readBody(request));
        validateMessage(message);
        const deliveries = [];
        for (const device of store.devicesFor(message.recipientUserId)) {
          if (!device.pushToken || device.preferences?.notificationsEnabled !== true) continue;
          const deliveryId = Crypto.createHash("sha256")
            .update(`${message.eventId}\n${message.recipientUserId}\n${device.deviceId}`)
            .digest("hex");
          const prior = store.delivery(deliveryId);
          if (prior?.ok) {
            deliveries.push({ ...prior, duplicate: true });
            continue;
          }
          const result = await apns.send(device.pushToken, message);
          const delivery = {
            deviceId: device.deviceId,
            kind: "push_notification",
            ok: result.status >= 200 && result.status < 300,
            queued: false,
            apnsStatus: result.status || null,
            apnsReason: result.reason,
            apnsId: result.apnsId,
          };
          if (delivery.ok) store.recordDelivery(deliveryId, delivery);
          if (result.status === 410) store.unregister(device.userId, device.deviceId);
          deliveries.push(delivery);
        }
        const ok = deliveries.every((delivery) => delivery.ok);
        return json(response, ok ? 200 : 502, { ok, deliveries });
      }
      return json(response, 404, { code: "not_found" });
    } catch (error) {
      const code = error instanceof Error ? error.message : "internal_error";
      const status =
        code.includes("invalid") || code.includes("required") || code.includes("replayed")
          ? 401
          : code.includes("too_large")
            ? 413
            : 400;
      return json(response, status, { code });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 8080);
  createRoomsRelay().listen(port, "0.0.0.0", () =>
    console.log(JSON.stringify({ event: "rooms_relay_ready", port })),
  );
}

export { JsonStore, apnsPayload, validateRegistration };
