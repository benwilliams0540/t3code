import { describe, expect, it } from "vite-plus/test";
import { RoomsHumanHttpRequestSchema } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import {
  decodeRoomsHumanRequestBody,
  resolveRoomsHumanRequestUrl,
  validateRoomsHumanBearer,
  validateRoomsHumanResponseStatus,
} from "./roomsHuman.ts";

const base = "http://127.0.0.1:33102";
const bearer = "header.payload.signature";
const room = "room:0198f7e2-1234-789a-8abc-123456789abc";
const channel = "channel:0198f7e2-1234-789a-8abc-123456789abc";
const decodeHumanRequest = Schema.decodeUnknownSync(RoomsHumanHttpRequestSchema);

describe("desktop Rooms human HTTP boundary", () => {
  it("allows only exact authenticated shared-Rooms routes and methods", () => {
    expect(
      resolveRoomsHumanRequestUrl({
        baseUrl: base,
        path: "/rooms/human/v1/session",
        method: "GET",
        bearer,
      }).pathname,
    ).toBe("/rooms/human/v1/session");
    expect(
      resolveRoomsHumanRequestUrl({
        baseUrl: base,
        path: `/rooms/human/v1/rooms/${encodeURIComponent(room)}/channels/${encodeURIComponent(channel)}/feed?limit=100`,
        method: "GET",
        bearer,
      }).search,
    ).toBe("?limit=100");
    for (const method of ["GET", "POST"] as const) {
      expect(
        resolveRoomsHumanRequestUrl({
          baseUrl: base,
          path: `/rooms/human/v1/rooms/${encodeURIComponent(room)}/stories`,
          method,
          bearer,
        }).pathname,
      ).toContain("/stories");
    }
    expect(() =>
      resolveRoomsHumanRequestUrl({
        baseUrl: base,
        path: "/rooms/human/v1/session",
        method: "POST",
        bearer,
      }),
    ).toThrow("allow-list");
    expect(() =>
      resolveRoomsHumanRequestUrl({
        baseUrl: base,
        path: "/rooms/human/v1/session?forward_to=other",
        method: "GET",
        bearer,
      }),
    ).toThrow("allow-list");
    expect(() =>
      resolveRoomsHumanRequestUrl({ baseUrl: base, path: "/events", method: "GET", bearer }),
    ).toThrow("allow-list");
  });

  it("accepts a credential-free HTTPS Shared Rooms origin", () => {
    expect(
      resolveRoomsHumanRequestUrl({
        baseUrl: "https://rooms.example.test",
        path: "/rooms/human/v1/session",
        method: "GET",
        bearer,
      }).origin,
    ).toBe("https://rooms.example.test");
  });

  it("rejects insecure remote, credentialed, and broadened origins", () => {
    for (const baseUrl of [
      "http://rooms.example.test",
      "http://user:secret@127.0.0.1:33102",
      "http://127.0.0.1:33102/nested",
      "https://rooms.example.test?query=value",
      "https://rooms.example.test#fragment",
    ]) {
      expect(() =>
        resolveRoomsHumanRequestUrl({
          baseUrl,
          path: "/rooms/human/v1/session",
          method: "GET",
          bearer,
        }),
      ).toThrow();
    }
  });

  it("rejects redirects without reading or following the response", () => {
    expect(() => validateRoomsHumanResponseStatus(302)).toThrow("redirects are not allowed");
    expect(() => validateRoomsHumanResponseStatus(200)).not.toThrow();
  });

  it("rejects header-breaking and oversized bearers", () => {
    expect(() => validateRoomsHumanBearer("token\r\nx-forwarded: bad")).toThrow("invalid");
    expect(() => validateRoomsHumanBearer("x".repeat(16 * 1024 + 1))).toThrow("invalid");
    expect(validateRoomsHumanBearer(bearer)).toBe(bearer);
  });

  it("does not forward arbitrary renderer-controlled headers", () => {
    const decoded = decodeHumanRequest({
      baseUrl: base,
      path: "/rooms/human/v1/session",
      method: "GET",
      bearer,
      headers: { "x-forwarded-for": "attacker", authorization: "replacement" },
    });
    expect(decoded).not.toHaveProperty("headers");
  });

  it("accepts bounded CAS bytes only on the shared room CAS path", () => {
    const request = {
      baseUrl: base,
      path: `/rooms/human/v1/rooms/${encodeURIComponent(room)}/cas`,
      method: "POST" as const,
      bearer,
      body: Buffer.from("shared evidence").toString("base64"),
      bodyEncoding: "base64" as const,
      contentType: "text/plain",
    };
    expect(Buffer.from(decodeRoomsHumanRequestBody(request)!.bytes).toString()).toBe(
      "shared evidence",
    );
    expect(() =>
      decodeRoomsHumanRequestBody({
        ...request,
        path: "/rooms/human/v1/invite-redemptions",
      }),
    ).toThrow("not valid base64");
  });
});
