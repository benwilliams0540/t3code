import { describe, expect, it } from "vite-plus/test";

import { decodeRoomsLocalRequestBody, resolveRoomsLocalRequestUrl } from "./roomsLocal.ts";

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
    ).toThrow("stay within /rooms/ or the exact /cas route");
  });

  it("rejects a normalized traversal out of the Rooms route namespace", () => {
    expect(() =>
      resolveRoomsLocalRequestUrl({
        baseUrl: "http://127.0.0.1:3000",
        path: "/rooms/local/../../events",
        method: "GET",
      }),
    ).toThrow("loopback boundary");
  });

  it("allows only POST on the exact CAS path", () => {
    expect(
      resolveRoomsLocalRequestUrl({
        baseUrl: "http://127.0.0.1:3000",
        path: "/cas",
        method: "POST",
      }).pathname,
    ).toBe("/cas");
    expect(() =>
      resolveRoomsLocalRequestUrl({
        baseUrl: "http://127.0.0.1:3000",
        path: "/cas/other",
        method: "POST",
      }),
    ).toThrow();
    expect(() =>
      resolveRoomsLocalRequestUrl({
        baseUrl: "http://127.0.0.1:3000",
        path: "/cas",
        method: "GET",
      }),
    ).toThrow("only accepts POST");
  });

  it("decodes bounded base64 CAS bytes with the declared media type", () => {
    const body = decodeRoomsLocalRequestBody({
      baseUrl: "http://127.0.0.1:3000",
      path: "/cas",
      method: "POST",
      body: Buffer.from("M4 artifact").toString("base64"),
      bodyEncoding: "base64",
      contentType: "text/plain",
    });
    expect(Buffer.from(body!.bytes).toString()).toBe("M4 artifact");
    expect(body!.contentType).toBe("text/plain");
  });

  it("rejects invalid base64 and header injection", () => {
    expect(() =>
      decodeRoomsLocalRequestBody({
        baseUrl: "http://127.0.0.1:3000",
        path: "/cas",
        method: "POST",
        body: "not base64",
        bodyEncoding: "base64",
      }),
    ).toThrow("not valid base64");
    expect(() =>
      decodeRoomsLocalRequestBody({
        baseUrl: "http://127.0.0.1:3000",
        path: "/rooms/local/workspace",
        method: "POST",
        body: "{}",
        contentType: "application/json\r\nx-bad: 1",
      }),
    ).toThrow("Content-Type is invalid");
  });
});
