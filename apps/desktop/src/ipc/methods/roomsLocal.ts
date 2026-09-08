import {
  RoomsLocalHttpRequestSchema,
  RoomsLocalHttpResponseSchema,
  type RoomsLocalHttpRequest,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";

import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/;
const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_CAS_BODY_BYTES = 5 * 1024 * 1024;

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "[::1]" || normalized === "::1") return true;
  if (!LOOPBACK_IPV4.test(normalized)) return false;
  return normalized
    .split(".")
    .every((part) => Number.isInteger(Number(part)) && Number(part) >= 0 && Number(part) <= 255);
}

export class RoomsLocalHttpRequestError extends Schema.TaggedErrorClass<RoomsLocalHttpRequestError>()(
  "RoomsLocalHttpRequestError",
  { message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}

const isRoomsLocalHttpRequestError = Schema.is(RoomsLocalHttpRequestError);

export function resolveRoomsLocalRequestUrl(request: RoomsLocalHttpRequest): URL {
  const base = new URL(request.baseUrl);
  if (
    base.protocol !== "http:" ||
    !isLoopbackHostname(base.hostname) ||
    base.username !== "" ||
    base.password !== "" ||
    (base.pathname !== "" && base.pathname !== "/") ||
    base.search !== "" ||
    base.hash !== ""
  ) {
    throw new RoomsLocalHttpRequestError({
      message: "Rooms Local API must use an HTTP loopback origin without credentials or a path.",
    });
  }

  if (!request.path.startsWith("/rooms/") && request.path !== "/cas") {
    throw new RoomsLocalHttpRequestError({
      message: "Rooms Local API requests must stay within /rooms/ or the exact /cas route.",
    });
  }
  const target = new URL(request.path, base);
  const allowedRoomsPath = target.pathname.startsWith("/rooms/");
  const allowedCasPath = target.pathname === "/cas" && target.search === "";
  if (target.origin !== base.origin || (!allowedRoomsPath && !allowedCasPath)) {
    throw new RoomsLocalHttpRequestError({
      message: "Rooms Local API requests cannot leave the configured loopback boundary.",
    });
  }
  if (allowedCasPath && request.method !== "POST") {
    throw new RoomsLocalHttpRequestError({ message: "Rooms Local CAS only accepts POST." });
  }
  return target;
}

export function decodeRoomsLocalRequestBody(request: RoomsLocalHttpRequest): {
  readonly bytes: Uint8Array;
  readonly contentType: string;
} | null {
  if (request.body === undefined) return null;
  const contentType = request.contentType ?? "application/json";
  if (contentType.trim() === "" || /[\r\n]/.test(contentType)) {
    throw new RoomsLocalHttpRequestError({ message: "Rooms Local Content-Type is invalid." });
  }
  if (request.bodyEncoding !== "base64") {
    return { bytes: new TextEncoder().encode(request.body), contentType };
  }
  if (request.path !== "/cas" || request.body.length % 4 !== 0 || !BASE64_BODY.test(request.body)) {
    throw new RoomsLocalHttpRequestError({ message: "Rooms Local CAS body is not valid base64." });
  }
  const bytes = Buffer.from(request.body, "base64");
  if (bytes.byteLength > MAX_CAS_BODY_BYTES) {
    throw new RoomsLocalHttpRequestError({
      message: "Rooms Local CAS uploads are limited to 5 MiB.",
    });
  }
  return { bytes, contentType };
}

const performRoomsLocalRequest = Effect.fn("desktop.ipc.roomsLocal.performRequest")(function* (
  request: RoomsLocalHttpRequest,
) {
  const target = yield* Effect.try({
    try: () => resolveRoomsLocalRequestUrl(request),
    catch: (cause) =>
      isRoomsLocalHttpRequestError(cause)
        ? cause
        : new RoomsLocalHttpRequestError({
            message: "Rooms Local API request configuration is invalid.",
            cause,
          }),
  });
  const httpClient = yield* HttpClient.HttpClient;
  // The server bounds local change waits to 30 seconds. This bridge deliberately adds no
  // shorter client timeout, so the existing one-shot IPC request can outlive a normal wait.
  let httpRequest =
    request.method === "GET" ? HttpClientRequest.get(target) : HttpClientRequest.post(target);
  const requestBody = yield* Effect.try({
    try: () => decodeRoomsLocalRequestBody(request),
    catch: (cause) =>
      isRoomsLocalHttpRequestError(cause)
        ? cause
        : new RoomsLocalHttpRequestError({
            message: "Rooms Local API request body is invalid.",
            cause,
          }),
  });
  if (requestBody !== null) {
    httpRequest = HttpClientRequest.bodyUint8Array(
      httpRequest,
      requestBody.bytes,
      requestBody.contentType,
    );
  }
  const response = yield* httpClient.execute(httpRequest).pipe(
    Effect.mapError(
      (cause) =>
        new RoomsLocalHttpRequestError({
          message: "Rooms Local API request failed.",
          cause,
        }),
    ),
  );
  const responseBody = yield* response.text.pipe(
    Effect.mapError(
      (cause) =>
        new RoomsLocalHttpRequestError({
          message: "Rooms Local API response could not be read.",
          cause,
        }),
    ),
  );
  return {
    status: response.status,
    headers: response.headers,
    body: responseBody,
  };
});

export const requestRoomsLocal = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.ROOMS_LOCAL_HTTP_REQUEST_CHANNEL,
  payload: RoomsLocalHttpRequestSchema,
  result: RoomsLocalHttpResponseSchema,
  handler: Effect.fn("desktop.ipc.roomsLocal.request")(function* (request) {
    return yield* performRoomsLocalRequest(request);
  }),
});
