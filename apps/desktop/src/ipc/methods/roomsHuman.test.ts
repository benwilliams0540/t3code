import { describe, expect, it } from "@effect/vitest";
import { RoomsHumanHttpRequestSchema } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { vi } from "vite-plus/test";

import {
  decodeRoomsHumanRequestBody,
  performRoomsHumanRequest,
  resolveRoomsHumanRequestUrl,
  validateRoomsHumanBearer,
} from "./roomsHuman.ts";

const base = "http://127.0.0.1:33102";
const bearer = "header.payload.signature";
const room = "room:0198f7e2-1234-789a-8abc-123456789abc";
const channel = "channel:0198f7e2-1234-789a-8abc-123456789abc";
const decodeHumanRequest = Schema.decodeUnknownSync(RoomsHumanHttpRequestSchema);

describe("desktop Rooms human HTTP boundary", () => {
  it("admits room creation without broadening other methods or query parameters", () => {
    const request = {
      baseUrl: base,
      path: "/rooms/human/v1/rooms",
      method: "POST" as const,
      bearer,
    };
    expect(resolveRoomsHumanRequestUrl(request).pathname).toBe(request.path);
    expect(() => resolveRoomsHumanRequestUrl({ ...request, method: "GET" })).toThrow("allow-list");
    expect(() =>
      resolveRoomsHumanRequestUrl({ ...request, path: `${request.path}?role=admin` }),
    ).toThrow("allow-list");
  });

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

  for (const [redirectCase, location] of [
    ["cross-origin", "https://other.example.test/rooms/human/v1/session"],
    ["downgrade", "http://127.0.0.1:33102/rooms/human/v1/session"],
  ] as const) {
    it.effect(`rejects a real ${redirectCase} redirect at the Electron request boundary`, () =>
      Effect.gen(function* () {
        const fetchFn = vi.fn<typeof fetch>(
          async () =>
            new Response("redirect response must not be returned", {
              status: 302,
              headers: { location },
            }),
        );
        const failure = yield* performRoomsHumanRequest(
          {
            baseUrl: "https://rooms.example.test",
            path: "/rooms/human/v1/session",
            method: "GET",
            bearer,
          },
          fetchFn,
        ).pipe(Effect.flip);

        expect(failure).toMatchObject({
          message: "Rooms human API redirects are not allowed.",
        });
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(fetchFn.mock.calls[0]?.[1]?.redirect).toBe("manual");
      }),
    );
  }

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
