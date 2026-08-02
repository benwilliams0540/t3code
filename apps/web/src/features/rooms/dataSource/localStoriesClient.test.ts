import type { RoomsLocalHttpRequest, RoomsLocalHttpResponse } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import storyWithThreadDocument from "./fixtures/local-stories-v1-story-with-thread.json";
import { createRoomsLocalChannelsClient, type RoomsLocalTransport } from "./localChannelsClient";

const roomId = storyWithThreadDocument.room_id;
const unlinkedStory = { ...storyWithThreadDocument, native_thread: null };
const collection = {
  contract: {
    id: "rooms.local-stories",
    version: 1,
    schema_uri: "contracts/rooms/local-stories/v1/schema.json",
  },
  room_id: roomId,
  capabilities: { "work.read": true, "work.create": true, "work.link_thread": true },
  stories: [storyWithThreadDocument],
};

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

describe("rooms.local-stories v1 client", () => {
  it("lists one ordered room-scoped story collection", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const transport = queuedTransport([response(200, collection)], requests);
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
    await expect(client.getStories(roomId)).resolves.toMatchObject({
      room_id: roomId,
      stories: [{ id: storyWithThreadDocument.id }],
    });
    expect(requests).toEqual([
      {
        baseUrl: "http://127.0.0.1:3000",
        path: `/rooms/${encodeURIComponent(roomId)}/stories`,
        method: "GET",
      },
    ]);
  });

  it("retains exact create bytes and request identity after an uncertain failure", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const transport = queuedTransport(
      [new Error("connection reset"), response(201, unlinkedStory)],
      requests,
    );
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
    const input = {
      requestId: "019fb900-1000-7000-8000-000000000030",
      title: "  Exact title bytes  ",
      storyType: "feature",
    };
    await expect(client.createStory(roomId, input)).rejects.toMatchObject({
      code: "local_api_unreachable",
    });
    await expect(client.createStory(roomId, input)).resolves.toMatchObject({
      value: { id: storyWithThreadDocument.id },
    });
    expect(requests[1]?.body).toBe(requests[0]?.body);
    expect(JSON.parse(requests[1]!.body!)).toEqual({
      request_id: input.requestId,
      title: input.title,
      story_type: input.storyType,
    });
  });

  it("retains the exact selected native identity through failure, success, and replay", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const transport = queuedTransport(
      [
        new Error("uncertain response"),
        response(201, storyWithThreadDocument, { "idempotency-replayed": "false" }),
        response(200, storyWithThreadDocument, { "idempotency-replayed": "true" }),
      ],
      requests,
    );
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
    const input = {
      requestId: "019fb900-1000-7000-8000-000000000031",
      environmentId: "environment-local",
      projectId: "project-rooms",
      threadId: "thread-composer-shortcuts",
    };
    await expect(
      client.linkStoryThread(roomId, storyWithThreadDocument.id, input),
    ).rejects.toMatchObject({ code: "local_api_unreachable" });
    const linked = await client.linkStoryThread(roomId, storyWithThreadDocument.id, input);
    const replay = await client.linkStoryThread(roomId, storyWithThreadDocument.id, input);
    expect(linked.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(requests[0]?.path).toBe(
      `/rooms/${encodeURIComponent(roomId)}/stories/${encodeURIComponent(storyWithThreadDocument.id)}/thread`,
    );
    expect(requests[0]?.body).toBe(requests[1]?.body);
    expect(requests[1]?.body).toBe(requests[2]?.body);
    expect(JSON.parse(requests[2]!.body!)).toEqual({
      request_id: "019fb900-1000-7000-8000-000000000031",
      environment_id: "environment-local",
      project_id: "project-rooms",
      thread_id: "thread-composer-shortcuts",
    });
  });

  it("rejects room, ordering, source, and association contradictions", async () => {
    const invalidDocuments = [
      { ...collection, room_id: "room:other" },
      {
        ...collection,
        stories: [
          storyWithThreadDocument,
          { ...unlinkedStory, id: "story:second", created_seq: 4 },
        ],
      },
      {
        ...collection,
        stories: [
          {
            ...storyWithThreadDocument,
            native_thread: { ...storyWithThreadDocument.native_thread, story_id: "story:other" },
          },
        ],
      },
      {
        ...collection,
        stories: [
          {
            ...storyWithThreadDocument,
            source_event: { ...storyWithThreadDocument.source_event, schema: 1 },
          },
        ],
      },
    ];

    for (const document of invalidDocuments) {
      const transport = queuedTransport([response(200, document)], []);
      const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
      await expect(client.getStories(roomId)).rejects.toMatchObject({ kind: "invalid_response" });
    }
  });

  it("preserves actionable producer errors", async () => {
    const transport = queuedTransport(
      [response(409, { error: "story_thread_conflict", message: "Already linked." })],
      [],
    );
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
    await expect(
      client.linkStoryThread(roomId, storyWithThreadDocument.id, {
        requestId: "019fb900-1000-7000-8000-000000000031",
        environmentId: "environment-local",
        projectId: "project-rooms",
        threadId: "thread-other",
      }),
    ).rejects.toMatchObject({ code: "story_thread_conflict", status: 409 });
  });
});
