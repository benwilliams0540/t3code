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

  if (!request.path.startsWith("/rooms/")) {
    throw new RoomsLocalHttpRequestError({
      message: "Rooms Local API requests must stay within /rooms/.",
    });
  }
  const target = new URL(request.path, base);
  if (target.origin !== base.origin || !target.pathname.startsWith("/rooms/")) {
    throw new RoomsLocalHttpRequestError({
      message: "Rooms Local API requests cannot leave the configured loopback Rooms namespace.",
    });
  }
  return target;
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
  let httpRequest =
    request.method === "GET" ? HttpClientRequest.get(target) : HttpClientRequest.post(target);
  if (request.body !== undefined) {
    httpRequest = HttpClientRequest.bodyText(httpRequest, request.body, "application/json");
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
  const body = yield* response.text.pipe(
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
    body,
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
