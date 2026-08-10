import type { RoomsHumanHttpRequest } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  normalizeRoomsOrigin,
  resolveRoomsHumanRequestUrl,
  validateRoomsHumanBearer,
  validateRoomsHumanRequestBody,
} from "./roomsTransport.ts";

const bearer = "header.payload.signature";
const room = "room:0198f7e2-1234-789a-8abc-123456789abc";
const channel = "channel:0198f7e2-1234-789a-8abc-123456789abc";
const story = "story:0198f7e2-1234-789a-8abc-123456789abc";

describe("Rooms origin policy", () => {
  it("accepts HTTPS and loopback HTTP for Shared while Local stays loopback-only", () => {
    expect(normalizeRoomsOrigin("shared", "https://rooms.example.test/")).toBe(
      "https://rooms.example.test",
    );
    expect(normalizeRoomsOrigin("shared", "http://127.0.0.1:33102")).toBe("http://127.0.0.1:33102");
    expect(normalizeRoomsOrigin("local", "http://localhost:33102")).toBe("http://localhost:33102");
    expect(normalizeRoomsOrigin("local", "https://rooms.example.test")).toBeNull();
  });

  it.each([
    "http://rooms.example.test",
    "https://user:secret@rooms.example.test",
    "https://rooms.example.test/nested",
    "https://rooms.example.test?query=value",
    "https://rooms.example.test#fragment",
    "//rooms.example.test",
    "not a url",
  ])("rejects unsafe Shared origin %s", (origin) => {
    expect(normalizeRoomsOrigin("shared", origin)).toBeNull();
  });
});

describe("Shared Rooms request policy", () => {
  const request = (input: Partial<RoomsHumanHttpRequest> = {}): RoomsHumanHttpRequest => ({
    baseUrl: "https://rooms.example.test",
    path: "/rooms/human/v1/session",
    method: "GET",
    bearer,
    ...input,
  });

  it("preserves the exact route, method, and query allow-list", () => {
    const allowed: readonly RoomsHumanHttpRequest[] = [
      request(),
      request({ path: "/rooms/human/v1/bootstrap/redemptions", method: "POST" }),
      request({ path: `/rooms/human/v1/rooms/${encodeURIComponent(room)}/workspace` }),
      request({
        path: `/rooms/human/v1/rooms/${encodeURIComponent(room)}/channels/${encodeURIComponent(channel)}/feed?after_seq=3&limit=100`,
      }),
      request({
        path: `/rooms/human/v1/rooms/${encodeURIComponent(room)}/stories/${encodeURIComponent(story)}/reviews`,
        method: "POST",
      }),
    ];
    for (const candidate of allowed) {
      expect(resolveRoomsHumanRequestUrl(candidate).origin).toBe("https://rooms.example.test");
    }

    for (const unsafe of [
      request({ method: "POST" }),
      request({ path: "/rooms/human/v1/session?forward_to=other" }),
      request({ path: "/rooms/human/v1/session#fragment" }),
      request({ path: "//rooms.example.test/rooms/human/v1/session" }),
      request({ path: "/events" }),
    ]) {
      expect(() => resolveRoomsHumanRequestUrl(unsafe)).toThrow("allow-list");
    }
  });

  it("rejects invalid bearer and out-of-contract bodies", () => {
    expect(() => validateRoomsHumanBearer("token\r\nx-bad: 1")).toThrow("invalid");
    expect(() => validateRoomsHumanRequestBody(request({ body: "{}" }))).toThrow(
      "do not accept a body",
    );
    expect(() =>
      validateRoomsHumanRequestBody(request({ method: "POST", body: "x".repeat(64 * 1024 + 1) })),
    ).toThrow("64 KiB");
  });

  it("accepts bounded CAS bytes only on the Shared room CAS path", () => {
    const cas = request({
      path: `/rooms/human/v1/rooms/${encodeURIComponent(room)}/cas`,
      method: "POST",
      body: "c2hhcmVkIGV2aWRlbmNl",
      bodyEncoding: "base64",
      contentType: "text/plain",
    });
    expect(validateRoomsHumanRequestBody(cas)?.decodedByteLength).toBe(15);
    expect(() =>
      validateRoomsHumanRequestBody({
        ...cas,
        path: "/rooms/human/v1/invite-redemptions",
      }),
    ).toThrow("not valid base64");
  });
});
