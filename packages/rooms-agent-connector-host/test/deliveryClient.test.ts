import { describe, expect, it } from "vite-plus/test";

import {
  AgentDeliveryHttpClient,
  DeliveryClientError,
  parseAgentDeliveryPage,
  toInboundEvent,
} from "../src/deliveryClient.ts";

const response = (): Readonly<Record<string, unknown>> => ({
  contract: {
    id: "rooms.agent-deliveries",
    version: 1,
    schema_uri: "contracts/rooms/agent-deliveries/v1/schema.json",
  },
  binding: {
    room_id: "room:019fbf3b-8742-7fc2-b021-543a8cf3d379",
    agent_principal_id: "a:019fc9d0-0000-7000-8000-000000000003",
    host_machine_principal_id: "m:019fc9d0-0000-7000-8000-000000000004",
    profile: "read_write",
  },
  page: {
    after_seq: 41,
    next_cursor: 42,
    source_head_seq: 42,
    has_more: false,
    reason: "advanced",
  },
  deliveries: [
    {
      source_message_id: "019fc9d0-0000-7000-8000-000000000005",
      source_sequence: 42,
      trace_id: "rooms-message:019fc9d0-0000-7000-8000-000000000005",
      room_id: "room:019fbf3b-8742-7fc2-b021-543a8cf3d379",
      channel_id: "channel:019fbf45-d4df-78c3-8554-f5432c37a3c0",
      author: {
        principal_id: "h:019fc9d0-0000-7000-8000-000000000006",
        principal_type: "human",
        display_name: "Monroe",
      },
      mentioned_agent: true,
      occurred_at: "2026-08-03T12:00:00.000Z",
      body_markdown: "@Claw reply once",
      attachments: [],
      links: [],
    },
  ],
});

describe("rooms.agent-deliveries v1 client", () => {
  it("strictly parses the frozen response and maps server-owned mention truth", () => {
    const page = parseAgentDeliveryPage(response());
    const delivery = page.deliveries[0]!;
    const event = toInboundEvent(delivery, "connector:openclaw-local");

    expect(page.page).toEqual({
      afterSeq: 41,
      nextCursor: 42,
      sourceHeadSeq: 42,
      hasMore: false,
      reason: "advanced",
    });
    expect(event.mentioned).toBe(true);
    expect(event.authorPrincipalId).toBe("h:019fc9d0-0000-7000-8000-000000000006");
    expect(event.attachments).toEqual([]);
    expect(event.links).toEqual([]);
  });

  it("fails closed on contract drift, nonempty synthetic metadata, and invalid cursor bounds", () => {
    expect(() => parseAgentDeliveryPage({ ...response(), unexpected: true })).toThrowError(
      /frozen|invalid/u,
    );
    const metadata = structuredClone(response());
    (metadata.deliveries as Array<Record<string, unknown>>)[0]!.links = [
      { url: "https://not-source-truth.invalid" },
    ];
    expect(() => parseAgentDeliveryPage(metadata)).toThrowError(/links/u);
    const cursor = structuredClone(response());
    (cursor.page as Record<string, unknown>).next_cursor = 43;
    expect(() => parseAgentDeliveryPage(cursor)).toThrowError(/bounds/u);
  });

  it("uses HTTPS without redirects and keeps the bearer out of the delivery URL", async () => {
    const observed: Array<{ readonly url: string; readonly init: RequestInit | undefined }> = [];
    const bearer = "rooms-secret-never-in-url";
    const client = new AgentDeliveryHttpClient({
      baseUrl: "https://rooms.example.test",
      bearerToken: bearer,
      fetch: async (input, init) => {
        observed.push({ url: String(input), init });
        return Response.json(response());
      },
    });

    await expect(client.wait(41, 1_000)).resolves.toMatchObject({
      page: { afterSeq: 41, nextCursor: 42 },
    });
    expect(observed[0]?.url).toBe(
      "https://rooms.example.test/agent/v1/deliveries?after_seq=41&timeout_ms=1000",
    );
    expect(observed[0]?.url).not.toContain(bearer);
    expect(observed[0]?.init?.redirect).toBe("error");
    expect(new Headers(observed[0]?.init?.headers).get("authorization")).toBe(`Bearer ${bearer}`);
  });

  it("rejects invalid delivery origins before fetching", () => {
    for (const baseUrl of [
      "http://rooms.example.test",
      "https://user:secret@rooms.example.test",
      "https://rooms.example.test/nested",
      "https://rooms.example.test?token=secret",
      "https://rooms.example.test#fragment",
      "//rooms.example.test",
    ]) {
      expect(() => new AgentDeliveryHttpClient({ baseUrl, bearerToken: "secret" })).toThrowError(
        DeliveryClientError,
      );
    }
  });

  it("reports unavailable and cancelled delivery waits without exposing the bearer", async () => {
    const bearer = "rooms-secret-never-log-this";
    const unavailable = new AgentDeliveryHttpClient({
      baseUrl: "http://127.0.0.1:3000",
      bearerToken: bearer,
      fetch: async () => {
        throw new Error("network includes secret? no");
      },
    });
    await expect(unavailable.wait(0, 1_000)).rejects.toMatchObject({
      code: "delivery_unavailable",
      retryable: true,
    });
    await unavailable.wait(0, 1_000).catch((error: unknown) => {
      expect(error).toBeInstanceOf(DeliveryClientError);
      expect(String(error)).not.toContain(bearer);
    });

    const controller = new AbortController();
    const cancelled = new AgentDeliveryHttpClient({
      baseUrl: "http://127.0.0.1:3000",
      bearerToken: bearer,
      fetch: async (_input, init) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    });
    const pending = cancelled.wait(0, 1_000, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: "delivery_cancelled" });
  });
});
