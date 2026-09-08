import {
  RoomsHumanHttpRequestSchema,
  RoomsHumanHttpResponseSchema,
  type RoomsHumanHttpRequest,
} from "@t3tools/contracts";
import {
  resolveRoomsHumanRequestUrl as resolveSharedRoomsHumanRequestUrl,
  validateRoomsHumanBearer as validateSharedRoomsHumanBearer,
  validateRoomsHumanRequestBody,
} from "@t3tools/shared/roomsTransport";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export class RoomsHumanHttpRequestError extends Schema.TaggedErrorClass<RoomsHumanHttpRequestError>()(
  "RoomsHumanHttpRequestError",
  { message: Schema.String },
) {}

const isRoomsHumanHttpRequestError = Schema.is(RoomsHumanHttpRequestError);

export function validateRoomsHumanResponseStatus(status: number): void {
  if (status >= 300 && status < 400) {
    throw new RoomsHumanHttpRequestError({
      message: "Rooms human API redirects are not allowed.",
    });
  }
}

export function validateRoomsHumanBearer(bearer: string): string {
  try {
    return validateSharedRoomsHumanBearer(bearer);
  } catch {
    throw new RoomsHumanHttpRequestError({ message: "Rooms human bearer credential is invalid." });
  }
}

export function resolveRoomsHumanRequestUrl(request: RoomsHumanHttpRequest): URL {
  try {
    return resolveSharedRoomsHumanRequestUrl(request);
  } catch {
    throw new RoomsHumanHttpRequestError({
      message: "Rooms human API request is outside the exact authenticated route allow-list.",
    });
  }
}

export function decodeRoomsHumanRequestBody(request: RoomsHumanHttpRequest): {
  readonly bytes: Uint8Array;
  readonly contentType: string;
} | null {
  try {
    const body = validateRoomsHumanRequestBody(request);
    if (body === null) return null;
    return {
      bytes:
        body.bodyEncoding === "base64"
          ? Buffer.from(body.body, "base64")
          : new TextEncoder().encode(body.body),
      contentType: body.contentType,
    };
  } catch (cause) {
    throw new RoomsHumanHttpRequestError({
      message: cause instanceof Error ? cause.message : "Rooms human body is invalid.",
    });
  }
}

export const performRoomsHumanRequest = Effect.fn("desktop.ipc.roomsHuman.performRequest")(
  function* (request: RoomsHumanHttpRequest, fetchFn: typeof fetch = globalThis.fetch) {
    const target = yield* Effect.try({
      try: () => resolveRoomsHumanRequestUrl(request),
      catch: (cause) =>
        isRoomsHumanHttpRequestError(cause)
          ? cause
          : new RoomsHumanHttpRequestError({ message: "Rooms human request is invalid." }),
    });
    const requestBody = yield* Effect.try({
      try: () => decodeRoomsHumanRequestBody(request),
      catch: (cause) =>
        isRoomsHumanHttpRequestError(cause)
          ? cause
          : new RoomsHumanHttpRequestError({ message: "Rooms human body is invalid." }),
    });
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetchFn(target, {
          method: request.method,
          credentials: "omit",
          redirect: "manual",
          signal,
          headers: {
            ...(request.bearer === undefined ? {} : { authorization: `Bearer ${request.bearer}` }),
            ...(requestBody === null ? {} : { "content-type": requestBody.contentType }),
          },
          ...(requestBody === null ? {} : { body: requestBody.bytes as BodyInit }),
        }),
      catch: () => new RoomsHumanHttpRequestError({ message: "Rooms human API request failed." }),
    });
    yield* Effect.try({
      try: () => validateRoomsHumanResponseStatus(response.status),
      catch: (cause) =>
        isRoomsHumanHttpRequestError(cause)
          ? cause
          : new RoomsHumanHttpRequestError({ message: "Rooms human API response is invalid." }),
    });
    const responseBody = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: () =>
        new RoomsHumanHttpRequestError({
          message: "Rooms human API response could not be read.",
        }),
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
    };
  },
);

export const requestRoomsHuman = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.ROOMS_HUMAN_HTTP_REQUEST_CHANNEL,
  payload: RoomsHumanHttpRequestSchema,
  result: RoomsHumanHttpResponseSchema,
  handler: Effect.fn("desktop.ipc.roomsHuman.request")(function* (request) {
    return yield* performRoomsHumanRequest(request);
  }),
});
