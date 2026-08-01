import { describe, expect, it } from "vite-plus/test";

import { resolveRoomsLocalRequestUrl } from "./roomsLocal.ts";

describe("desktop Rooms Local HTTP boundary", () => {
  it.each([
    "http://127.0.0.1:3000",
    "http://127.9.8.7:3101",
    "http://localhost:3000",
    "http://[::1]:3000",
  ])("allows a loopback origin: %s", (baseUrl) => {
    expect(
      resolveRoomsLocalRequestUrl({
        baseUrl,
        path: "/rooms/local/workspace",
        method: "GET",
      }).pathname,
    ).toBe("/rooms/local/workspace");
  });

  it.each([
    "https://127.0.0.1:3000",
    "http://example.com:3000",
    "http://user@127.0.0.1:3000",
    "http://127.0.0.1:3000/nested",
  ])("rejects a non-loopback or broadened origin: %s", (baseUrl) => {
    expect(() =>
      resolveRoomsLocalRequestUrl({
        baseUrl,
        path: "/rooms/local/workspace",
        method: "GET",
      }),
    ).toThrow();
  });

  it("rejects requests outside the Rooms route namespace", () => {
    expect(() =>
      resolveRoomsLocalRequestUrl({
        baseUrl: "http://127.0.0.1:3000",
        path: "/events",
        method: "GET",
      }),
    ).toThrow("stay within /rooms/");
  });

  it("rejects a normalized traversal out of the Rooms route namespace", () => {
    expect(() =>
      resolveRoomsLocalRequestUrl({
        baseUrl: "http://127.0.0.1:3000",
        path: "/rooms/local/../../events",
        method: "GET",
      }),
    ).toThrow("loopback Rooms namespace");
  });
});
