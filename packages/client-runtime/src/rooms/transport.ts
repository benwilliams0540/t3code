import type { RoomsHumanHttpRequest, RoomsHumanHttpResponse } from "@t3tools/contracts";
import {
  resolveRoomsHumanRequestUrl,
  validateRoomsHumanRequestBody,
} from "@t3tools/shared/roomsTransport";

export type RoomsHumanTransportErrorCode =
  | "human_request_invalid"
  | "human_redirect_rejected"
  | "human_request_failed"
  | "human_response_read_failed";

export class RoomsHumanTransportError extends Error {
  readonly code: RoomsHumanTransportErrorCode;

  constructor(code: RoomsHumanTransportErrorCode) {
    super(
      code === "human_request_invalid"
        ? "The authenticated Rooms request is invalid."
        : code === "human_redirect_rejected"
          ? "The authenticated Rooms API redirect was rejected."
          : code === "human_response_read_failed"
            ? "The authenticated Rooms API response could not be read."
            : "The authenticated Rooms API request failed.",
    );
    this.name = "RoomsHumanTransportError";
    this.code = code;
  }
}

export interface RoomsHumanTransport {
  readonly request: (request: RoomsHumanHttpRequest) => Promise<RoomsHumanHttpResponse>;
}

export type RoomsHumanFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function decodeBase64(value: string): ArrayBuffer {
  const decoded = globalThis.atob(value);
  const buffer = new ArrayBuffer(decoded.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return buffer;
}

export function createRoomsHumanFetchTransport(
  fetchImplementation: RoomsHumanFetch = globalThis.fetch,
): RoomsHumanTransport {
  return {
    request: async (request) => {
      let target: URL;
      let validatedBody: ReturnType<typeof validateRoomsHumanRequestBody>;
      try {
        target = resolveRoomsHumanRequestUrl(request);
        validatedBody = validateRoomsHumanRequestBody(request);
      } catch {
        throw new RoomsHumanTransportError("human_request_invalid");
      }

      const body =
        validatedBody === null
          ? undefined
          : validatedBody.bodyEncoding === "base64"
            ? decodeBase64(validatedBody.body)
            : validatedBody.body;
      const headers = new Headers({ authorization: `Bearer ${request.bearer}` });
      if (validatedBody !== null) headers.set("content-type", validatedBody.contentType);

      let response: Response;
      try {
        response = await fetchImplementation(target, {
          method: request.method,
          headers,
          credentials: "omit",
          redirect: "manual",
          ...(body === undefined ? {} : { body }),
        });
      } catch {
        throw new RoomsHumanTransportError("human_request_failed");
      }
      if (
        response.type === "opaqueredirect" ||
        response.redirected ||
        (response.status >= 300 && response.status < 400)
      ) {
        throw new RoomsHumanTransportError("human_redirect_rejected");
      }
      try {
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.text(),
        };
      } catch {
        throw new RoomsHumanTransportError("human_response_read_failed");
      }
    },
  };
}
