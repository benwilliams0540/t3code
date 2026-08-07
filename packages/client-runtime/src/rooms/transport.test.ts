import type { RoomsHumanHttpRequest } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createRoomsHumanFetchTransport,
  RoomsHumanTransportError,
  type RoomsHumanFetch,
} from "./transport.ts";

const request: RoomsHumanHttpRequest = {
  baseUrl: "https://rooms.example.test",
  path: "/rooms/human/v1/session",
  method: "GET",
  bearer: "header.payload.signature",
};

describe("hosted Shared Rooms transport", () => {
  it("sends a bounded authenticated request without credentials or redirects", async () => {
    const calls: Array<readonly [RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchMock: RoomsHumanFetch = async (input, init) => {
      calls.push([input, init]);
      return new Response('{"status":"ready"}', {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const transport = createRoomsHumanFetchTransport(fetchMock);

    await expect(
      transport.request({
        ...request,
        headers: { authorization: "replacement", "x-forwarded-for": "attacker" },
      } as RoomsHumanHttpRequest),
    ).resolves.toMatchObject({ status: 200, body: '{"status":"ready"}' });

    const [target, init] = calls[0]!;
    expect(String(target)).toBe("https://rooms.example.test/rooms/human/v1/session");
    expect(String(target)).not.toContain(request.bearer);
    expect(init?.credentials).toBe("omit");
    expect(init?.redirect).toBe("manual");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${request.bearer}`);
    expect(headers.get("x-forwarded-for")).toBeNull();
    expect([...headers.keys()]).toEqual(["authorization"]);
  });

  it("rejects redirects before reading their response body", async () => {
    const transport = createRoomsHumanFetchTransport(
      vi.fn(async () => new Response(null, { status: 302, headers: { location: "http://bad" } })),
    );
    await expect(transport.request(request)).rejects.toEqual(
      new RoomsHumanTransportError("human_redirect_rejected"),
    );
  });

  it("normalizes invalid policy input and network failures", async () => {
    await expect(
      createRoomsHumanFetchTransport(vi.fn()).request({
        ...request,
        baseUrl: "http://rooms.example.test",
      }),
    ).rejects.toEqual(new RoomsHumanTransportError("human_request_invalid"));

    await expect(
      createRoomsHumanFetchTransport(
        vi.fn(async () => {
          throw new Error("secret lower-level failure");
        }),
      ).request(request),
    ).rejects.toEqual(new RoomsHumanTransportError("human_request_failed"));
  });
});
