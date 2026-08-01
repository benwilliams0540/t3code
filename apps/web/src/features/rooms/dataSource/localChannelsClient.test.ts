import type { RoomsLocalHttpRequest, RoomsLocalHttpResponse } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import emptyFeedDocument from "./fixtures/local-channels-v1-empty-channel.json";
import populatedFeedDocument from "./fixtures/local-channels-v1-populated-feed.json";
import zeroWorkspaceDocument from "./fixtures/local-channels-v1-zero-workspace.json";
import {
  createRoomsLocalChannelsClient,
  RoomsLocalClientError,
  type RoomsLocalTransport,
  validateRoomsLocalApiBaseUrl,
} from "./localChannelsClient";

const channelDocument = {
  id: "channel:019fb9f0-2000-7000-8000-000000000001",
  room_id: "room:019fb9f0-1000-7000-8000-000000000001",
  name: "# infra",
  slug: "infra",
  purpose: "Infrastructure work",
  created_at: "2026-08-01T15:20:00.000Z",
  source_event: {
    seq: 3,
    event_id: "019fb9f0-2000-7000-8000-000000000001",
    type: "channel.created",
    schema: 1,
  },
} as const;

function response(
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): RoomsLocalHttpResponse {
  return { status, headers, body: JSON.stringify(body) };
}

function queuedTransport(
  steps: Array<RoomsLocalHttpResponse | Error>,
  requests: RoomsLocalHttpRequest[],
): RoomsLocalTransport {
  return {
    request: async (request) => {
      requests.push(request);
      const step = steps.shift();
      if (!step) throw new Error("No queued response.");
      if (step instanceof Error) throw step;
      return step;
    },
  };
}

describe("rooms.local-channels v1 client", () => {
  it("accepts alternate loopback ports and rejects paths, credentials, TLS, or remote hosts", () => {
    expect(validateRoomsLocalApiBaseUrl(" http://127.0.0.1:3101/ ")).toEqual({
      ok: true,
      value: "http://127.0.0.1:3101",
    });
    expect(validateRoomsLocalApiBaseUrl("http://localhost:3000").ok).toBe(true);
    expect(validateRoomsLocalApiBaseUrl("http://127.8.9.10:3000").ok).toBe(true);
    expect(validateRoomsLocalApiBaseUrl("https://127.0.0.1:3000").ok).toBe(false);
    expect(validateRoomsLocalApiBaseUrl("http://example.com:3000").ok).toBe(false);
    expect(validateRoomsLocalApiBaseUrl("http://user@127.0.0.1:3000").ok).toBe(false);
    expect(validateRoomsLocalApiBaseUrl("http://127.0.0.1:3000/rooms").ok).toBe(false);
  });

  it("discovers an honestly empty server-authoritative workspace", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const transport = queuedTransport([response(200, zeroWorkspaceDocument)], requests);
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3101", () => transport);
    const workspace = await client.getWorkspace();
    expect(workspace.channels).toEqual([]);
    expect(requests).toEqual([
      {
        baseUrl: "http://127.0.0.1:3101",
        path: "/rooms/local/workspace",
        method: "GET",
      },
    ]);
  });

  it("creates and replays one channel with the exact same request content", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const transport = queuedTransport(
      [
        response(201, channelDocument, { "Idempotency-Replayed": "false" }),
        response(200, channelDocument, { "idempotency-replayed": "true" }),
      ],
      requests,
    );
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
    const input = {
      requestId: "019fb9f0-5000-7000-8000-000000000001",
      name: " # Infra ",
      purpose: " Infrastructure work ",
    };
    const created = await client.createChannel(channelDocument.room_id, input);
    const replay = await client.createChannel(channelDocument.room_id, input);

    expect(created.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.value.id).toBe(created.value.id);
    expect(requests[1]?.body).toBe(requests[0]?.body);
  });

  it("surfaces duplicate slugs and idempotency conflicts without inventing a channel", async () => {
    for (const code of ["channel_slug_conflict", "idempotency_key_conflict"] as const) {
      const transport = queuedTransport(
        [response(409, { error: code, message: `Server rejected ${code}.` })],
        [],
      );
      const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
      await expect(
        client.createChannel(channelDocument.room_id, {
          requestId: "019fb9f0-5000-7000-8000-000000000001",
          name: "infra",
          purpose: null,
        }),
      ).rejects.toMatchObject({ code, status: 409 });
    }
  });

  it("retains failed channel submission bytes when the caller retries", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const transport = queuedTransport(
      [new Error("connection reset"), response(201, channelDocument)],
      requests,
    );
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
    const input = {
      requestId: "019fb9f0-5000-7000-8000-000000000002",
      name: "infra",
      purpose: null,
    };
    await expect(client.createChannel(channelDocument.room_id, input)).rejects.toMatchObject({
      code: "local_api_unreachable",
    });
    await expect(client.createChannel(channelDocument.room_id, input)).resolves.toMatchObject({
      value: { slug: "infra" },
    });
    expect(requests[1]?.body).toBe(requests[0]?.body);
  });

  it("uses exclusive cursors and the first page snapshot for pinned pagination", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const transport = queuedTransport(
      [response(200, emptyFeedDocument), response(200, populatedFeedDocument)],
      requests,
    );
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
    const roomId = channelDocument.room_id;
    await client.getFeed(roomId, channelDocument.id, { limit: 2 });
    await client.getFeed(roomId, channelDocument.id, {
      afterSeq: 3,
      limit: 2,
      snapshotHeadSeq: 4,
    });
    expect(requests[0]?.path).toContain("?limit=2");
    expect(requests[1]?.path).toContain("after_seq=3&limit=2&snapshot_head_seq=4");
  });

  it.each([
    [403, "capability_denied"],
    [404, "channel_not_found"],
    [404, "channel_room_mismatch"],
  ] as const)("preserves actionable feed error %s %s", async (status, code) => {
    const transport = queuedTransport(
      [response(status, { error: code, message: `Server rejected ${code}.` })],
      [],
    );
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
    await expect(client.getFeed(channelDocument.room_id, channelDocument.id)).rejects.toMatchObject(
      { kind: "server", status, code },
    );
  });

  it("preserves exact Markdown across send failure, retry, and replay", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const item = populatedFeedDocument.items[0]!;
    const transport = queuedTransport(
      [
        new Error("uncertain response"),
        response(201, item, { "idempotency-replayed": "false" }),
        response(200, item, { "idempotency-replayed": "true" }),
      ],
      requests,
    );
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
    const input = {
      requestId: "019fb9f0-5000-7000-8000-000000000003",
      bodyMarkdown: "**Hello**\n\n- exact bytes",
    };
    await expect(
      client.createMessage(channelDocument.room_id, channelDocument.id, input),
    ).rejects.toBeInstanceOf(RoomsLocalClientError);
    const sent = await client.createMessage(channelDocument.room_id, channelDocument.id, input);
    const replay = await client.createMessage(channelDocument.room_id, channelDocument.id, input);
    expect(sent.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(requests[0]?.body).toBe(requests[1]?.body);
    expect(requests[1]?.body).toBe(requests[2]?.body);
    expect(JSON.parse(requests[1]!.body!)).toEqual({
      request_id: input.requestId,
      body_markdown: input.bodyMarkdown,
    });
  });
});
