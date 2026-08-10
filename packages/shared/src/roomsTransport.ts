import type { RoomsHumanHttpRequest } from "@t3tools/contracts";

export type RoomsOriginMode = "local" | "shared";

export type RoomsTransportPolicyErrorCode =
  | "invalid_origin"
  | "invalid_route"
  | "invalid_bearer"
  | "invalid_content_type"
  | "request_body_not_allowed"
  | "request_body_too_large"
  | "invalid_cas_body"
  | "cas_body_too_large";

export class RoomsTransportPolicyError extends Error {
  readonly code: RoomsTransportPolicyErrorCode;

  constructor(code: RoomsTransportPolicyErrorCode, message: string) {
    super(message);
    this.name = "RoomsTransportPolicyError";
    this.code = code;
  }
}

const LOOPBACK_IPV4 = /^127(?:\.\d{1,3}){3}$/;
const BASE64_BODY = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_CAS_BODY_BYTES = 5 * 1024 * 1024;
const MAX_JSON_BODY_BYTES = 64 * 1024;
const MAX_BEARER_BYTES = 16 * 1024;
const UUID_V7 = "[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const ROOM_ID = `room:${UUID_V7}`;
const CHANNEL_ID = `channel:${UUID_V7}`;
const STORY_ID = `story:${UUID_V7}`;

export function isRoomsLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "[::1]" || normalized === "::1") return true;
  if (!LOOPBACK_IPV4.test(normalized)) return false;
  return normalized
    .split(".")
    .every((part) => Number.isInteger(Number(part)) && Number(part) >= 0 && Number(part) <= 255);
}

export function normalizeRoomsOrigin(mode: RoomsOriginMode, value: string): string | null {
  try {
    const url = new URL(value.trim());
    const isCredentialFreeRoot =
      url.hostname !== "" &&
      url.username === "" &&
      url.password === "" &&
      (url.pathname === "" || url.pathname === "/") &&
      url.search === "" &&
      url.hash === "";
    if (!isCredentialFreeRoot) return null;
    if (url.protocol === "http:" && isRoomsLoopbackHostname(url.hostname)) return url.origin;
    if (mode === "shared" && url.protocol === "https:") return url.origin;
    return null;
  } catch {
    return null;
  }
}

function exactHumanRouteMethods(pathname: string): readonly ("GET" | "POST")[] {
  if (pathname === "/rooms/human/v1/session") return ["GET"];
  if (
    pathname === "/rooms/human/v1/bootstrap/redemptions" ||
    pathname === "/rooms/human/v1/invite-inspections" ||
    pathname === "/rooms/human/v1/invite-redemptions"
  ) {
    return ["POST"];
  }
  const routes: readonly [RegExp, readonly ("GET" | "POST")[]][] = [
    [new RegExp(`^/rooms/human/v1/rooms/${ROOM_ID}/workspace$`), ["GET"]],
    [new RegExp(`^/rooms/human/v1/rooms/${ROOM_ID}/invites$`), ["POST"]],
    [new RegExp(`^/rooms/human/v1/rooms/${ROOM_ID}/channels$`), ["POST"]],
    [new RegExp(`^/rooms/human/v1/rooms/${ROOM_ID}/channels/${CHANNEL_ID}/feed$`), ["GET"]],
    [new RegExp(`^/rooms/human/v1/rooms/${ROOM_ID}/channels/${CHANNEL_ID}/messages$`), ["POST"]],
    [new RegExp(`^/rooms/human/v1/rooms/${ROOM_ID}/changes$`), ["GET"]],
    [new RegExp(`^/rooms/human/v1/rooms/${ROOM_ID}/stories$`), ["GET", "POST"]],
    [new RegExp(`^/rooms/human/v1/rooms/${ROOM_ID}/stories/${STORY_ID}$`), ["GET"]],
    [
      new RegExp(
        `^/rooms/human/v1/rooms/${ROOM_ID}/stories/${STORY_ID}/(?:thread|evidence|transitions|reviews)$`,
      ),
      ["POST"],
    ],
    [new RegExp(`^/rooms/human/v1/rooms/${ROOM_ID}/cas$`), ["POST"]],
  ];
  return routes.find(([pattern]) => pattern.test(pathname))?.[1] ?? [];
}

function hasValidHumanQuery(target: URL): boolean {
  if (target.search === "") return true;
  const decodedPath = decodeURIComponent(target.pathname);
  const allowed = decodedPath.endsWith("/feed")
    ? new Set(["after_seq", "limit", "snapshot_head_seq"])
    : decodedPath.endsWith("/changes")
      ? new Set(["after_seq", "timeout_ms"])
      : new Set<string>();
  return [...target.searchParams.keys()].every((key) => allowed.has(key));
}

export function validateRoomsHumanBearer(bearer: string): string {
  if (
    bearer.trim() === "" ||
    bearer !== bearer.trim() ||
    /[\r\n]/.test(bearer) ||
    new TextEncoder().encode(bearer).byteLength > MAX_BEARER_BYTES
  ) {
    throw new RoomsTransportPolicyError(
      "invalid_bearer",
      "Rooms human bearer credential is invalid.",
    );
  }
  return bearer;
}

export function resolveRoomsHumanRequestUrl(request: RoomsHumanHttpRequest): URL {
  const normalizedOrigin = normalizeRoomsOrigin("shared", request.baseUrl);
  if (normalizedOrigin === null) {
    throw new RoomsTransportPolicyError(
      "invalid_origin",
      "Rooms human API must use HTTP loopback or HTTPS without credentials or a path.",
    );
  }
  if (!request.path.startsWith("/") || request.path.startsWith("//")) {
    throw new RoomsTransportPolicyError(
      "invalid_route",
      "Rooms human API request is outside the exact authenticated route allow-list.",
    );
  }
  const base = new URL(normalizedOrigin);
  const target = new URL(request.path, base);
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(target.pathname);
  } catch {
    throw new RoomsTransportPolicyError("invalid_route", "Rooms human API path is invalid.");
  }
  const expectedMethods = exactHumanRouteMethods(decodedPath);
  if (
    target.origin !== base.origin ||
    target.username !== "" ||
    target.password !== "" ||
    target.hash !== "" ||
    !expectedMethods.includes(request.method) ||
    !hasValidHumanQuery(target)
  ) {
    throw new RoomsTransportPolicyError(
      "invalid_route",
      "Rooms human API request is outside the exact authenticated route allow-list.",
    );
  }
  validateRoomsHumanBearer(request.bearer);
  return target;
}

export interface RoomsHumanRequestBody {
  readonly body: string;
  readonly bodyEncoding: "utf8" | "base64";
  readonly contentType: string;
  readonly decodedByteLength: number;
}

export function validateRoomsHumanRequestBody(
  request: RoomsHumanHttpRequest,
): RoomsHumanRequestBody | null {
  if (request.body === undefined) return null;
  if (request.method === "GET") {
    throw new RoomsTransportPolicyError(
      "request_body_not_allowed",
      "Rooms human GET requests do not accept a body.",
    );
  }
  const contentType = request.contentType ?? "application/json";
  if (contentType.trim() === "" || /[\r\n]/.test(contentType)) {
    throw new RoomsTransportPolicyError(
      "invalid_content_type",
      "Rooms human Content-Type is invalid.",
    );
  }
  if (request.bodyEncoding !== "base64") {
    const decodedByteLength = new TextEncoder().encode(request.body).byteLength;
    if (decodedByteLength > MAX_JSON_BODY_BYTES) {
      throw new RoomsTransportPolicyError(
        "request_body_too_large",
        "Rooms human JSON requests are limited to 64 KiB.",
      );
    }
    return {
      body: request.body,
      bodyEncoding: "utf8",
      contentType,
      decodedByteLength,
    };
  }
  const decodedPath = decodeURIComponent(new URL(request.path, request.baseUrl).pathname);
  if (
    !decodedPath.endsWith("/cas") ||
    request.body.length % 4 !== 0 ||
    !BASE64_BODY.test(request.body)
  ) {
    throw new RoomsTransportPolicyError(
      "invalid_cas_body",
      "Rooms human CAS body is not valid base64.",
    );
  }
  const padding = request.body.endsWith("==") ? 2 : request.body.endsWith("=") ? 1 : 0;
  const decodedByteLength = (request.body.length / 4) * 3 - padding;
  if (decodedByteLength > MAX_CAS_BODY_BYTES) {
    throw new RoomsTransportPolicyError(
      "cas_body_too_large",
      "Rooms human CAS uploads are limited to 5 MiB.",
    );
  }
  return {
    body: request.body,
    bodyEncoding: "base64",
    contentType,
    decodedByteLength,
  };
}
