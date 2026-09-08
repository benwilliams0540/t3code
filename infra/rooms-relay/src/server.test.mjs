import * as Assert from "node:assert/strict";
import * as Crypto from "node:crypto";
import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { test } from "node:test";

import { createRoomsRelay, JsonStore, apnsPayload, validateRegistration } from "./server.mjs";

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function dpopProof({ privateKey, publicJwk, method, url, accessToken }) {
  const header = { alg: "ES256", typ: "dpop+jwt", jwk: publicJwk };
  const payload = {
    htm: method,
    htu: url,
    iat: Math.floor(Date.now() / 1000),
    jti: Crypto.randomUUID(),
    ...(accessToken
      ? { ath: base64url(Crypto.createHash("sha256").update(accessToken).digest()) }
      : {}),
  };
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = Crypto.sign("sha256", Buffer.from(input), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${base64url(signature)}`;
}

test("registration is Clerk-user scoped and survives restart", () => {
  const directory = Fs.mkdtempSync(Path.join(Os.tmpdir(), "rooms-relay-"));
  const file = Path.join(directory, "state.json");
  const store = new JsonStore(file);
  store.register("user_1", {
    deviceId: "phone",
    pushToken: "abcd",
    preferences: { notificationsEnabled: true },
  });
  Assert.equal(new JsonStore(file).devicesFor("user_1").length, 1);
  Assert.equal(new JsonStore(file).devicesFor("user_2").length, 0);
});

test("delivery identity is durable and registration enforces Alpha APNs routing", () => {
  const directory = Fs.mkdtempSync(Path.join(Os.tmpdir(), "rooms-relay-"));
  const store = new JsonStore(Path.join(directory, "state.json"));
  store.recordDelivery("stable-id", { ok: true, deviceId: "phone" });
  Assert.equal(new JsonStore(store.file).delivery("stable-id").ok, true);
  Assert.throws(() =>
    validateRegistration(
      {
        deviceId: "phone",
        platform: "ios",
        bundleId: "wrong",
        apsEnvironment: "sandbox",
        preferences: { notificationsEnabled: true },
      },
      "com.brw.threadspace.alpha",
    ),
  );
});

test("Rooms APNs payload preserves event identity and authoritative deep link", () => {
  const payload = apnsPayload({
    eventId: "event-1",
    roomId: "room:1",
    channelId: "channel:1",
    roomName: "Threadspace",
    channelName: "general",
    senderDisplayName: "Monroe",
    deepLink: "/rooms/room%3A1/channel%3A1",
  });
  Assert.equal(payload.eventId, "event-1");
  Assert.equal(payload.deepLink, "/rooms/room%3A1/channel%3A1");
  Assert.equal(payload.aps.alert.body, "Monroe posted in general");
});

test("Clerk exchange, DPoP registration, targeted publish, and idempotency interoperate", async () => {
  const directory = Fs.mkdtempSync(Path.join(Os.tmpdir(), "rooms-relay-"));
  const store = new JsonStore(Path.join(directory, "state.json"));
  const sent = [];
  const server = createRoomsRelay(
    {
      RELAY_ISSUER: "https://relay.example.test:8444",
      RELAY_TOKEN_SECRET: "test-token-secret",
      ROOMS_PUBLISH_TOKEN: "test-publisher-secret",
      ROOMS_CLERK_ISSUER: "https://clerk.example.test",
      ROOMS_CLERK_AUDIENCE: "rooms",
      ROOMS_CLERK_JWKS_URL: "https://clerk.example.test/jwks",
      APNS_BUNDLE_ID: "com.brw.threadspace.alpha",
    },
    {
      store,
      clerk: { verify: async () => ({ sub: "user_1" }) },
      apns: {
        send: async (token, message) => {
          sent.push({ token, eventId: message.eventId });
          return { status: 200, apnsId: "apns-1", reason: null };
        },
      },
    },
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const localOrigin = `http://127.0.0.1:${address.port}`;
  const relayOrigin = "https://relay.example.test:8444";
  const { privateKey, publicKey } = Crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const publicJwk = publicKey.export({ format: "jwk" });

  try {
    const tokenUrl = `${relayOrigin}/v1/client/dpop-token`;
    const tokenResponse = await fetch(`${localOrigin}/v1/client/dpop-token`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        dpop: dpopProof({ privateKey, publicJwk, method: "POST", url: tokenUrl }),
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token: "clerk-token",
        subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
        resource: relayOrigin,
        scope: "mobile:registration",
        client_id: "t3-mobile",
      }),
    });
    Assert.equal(tokenResponse.status, 200);
    const accessToken = (await tokenResponse.json()).access_token;

    const registrationUrl = `${relayOrigin}/v1/mobile/devices`;
    const registrationResponse = await fetch(`${localOrigin}/v1/mobile/devices`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `DPoP ${accessToken}`,
        dpop: dpopProof({
          privateKey,
          publicJwk,
          method: "POST",
          url: registrationUrl,
          accessToken,
        }),
      },
      body: JSON.stringify({
        deviceId: "phone",
        label: "Ben's iPhone",
        platform: "ios",
        iosMajorVersion: 26,
        bundleId: "com.brw.threadspace.alpha",
        apsEnvironment: "sandbox",
        pushToken: "abcdef",
        preferences: { notificationsEnabled: true },
      }),
    });
    Assert.equal(registrationResponse.status, 200);

    const message = {
      eventId: "event-1",
      recipientUserId: "user_1",
      roomId: "room:1",
      channelId: "channel:1",
      roomName: "Threadspace",
      channelName: "general",
      senderDisplayName: "Monroe",
      occurredAt: new Date().toISOString(),
      deepLink: "/rooms/room%3A1/channel%3A1",
    };
    for (let index = 0; index < 2; index += 1) {
      const publishResponse = await fetch(`${localOrigin}/v1/rooms/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer test-publisher-secret",
        },
        body: JSON.stringify(message),
      });
      Assert.equal(publishResponse.status, 200);
    }
    Assert.deepEqual(sent, [{ token: "abcdef", eventId: "event-1" }]);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
