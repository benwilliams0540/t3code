import type { RoomsLocalHttpRequest, RoomsLocalHttpResponse } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import storyWithThreadDocument from "./fixtures/local-stories-v1-story-with-thread.json";
import storyAtHumanQaDocument from "./fixtures/local-stories-v2-story-at-human-qa.json";
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

describe("rooms.local-stories v1/v2 client", () => {
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

  it("loads one v2 detail and uploads exact bounded CAS bytes", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const cas = {
      hash: "d".repeat(64),
      bytes: 11,
      media_type: "text/plain",
    };
    const transport = queuedTransport(
      [response(200, storyAtHumanQaDocument), response(201, cas)],
      requests,
    );
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);

    await expect(client.getStory(roomId, storyAtHumanQaDocument.id)).resolves.toMatchObject({
      stage: "human-qa",
      scope_head_seq: 9,
    });
    await expect(
      client.uploadCas({ bodyBase64: "TTQgYXJ0aWZhY3Q=", mediaType: "text/plain" }),
    ).resolves.toEqual(cas);
    expect(requests[1]).toEqual({
      baseUrl: "http://127.0.0.1:3000",
      path: "/cas",
      method: "POST",
      body: "TTQgYXJ0aWZhY3Q=",
      bodyEncoding: "base64",
      contentType: "text/plain",
    });
  });

  it("sends exact CAS, head, transition, and Human QA decision fields", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const nextStory = { ...storyAtHumanQaDocument, scope_head_seq: 10, as_of_seq: 10 };
    const transport = queuedTransport(
      [response(201, nextStory), response(201, nextStory), response(201, nextStory)],
      requests,
    );
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
    const evidenceId = storyAtHumanQaDocument.evidence[0]!.id;
    const requestId = "019fb900-1000-7000-8000-000000000031";

    await client.attachStoryEvidence(roomId, storyAtHumanQaDocument.id, {
      requestId,
      expectedHeadSeq: 9,
      kind: "artifact",
      cas: storyAtHumanQaDocument.evidence[0]!.cas,
      note: "Focused artifact",
    });
    await client.transitionStory(roomId, storyAtHumanQaDocument.id, {
      requestId,
      expectedHeadSeq: 9,
      to: "done",
      evidence: [evidenceId],
    });
    await client.reviewStory(roomId, storyAtHumanQaDocument.id, {
      requestId,
      expectedHeadSeq: 9,
      decision: "approved",
      evidence: [evidenceId],
    });

    expect(JSON.parse(requests[0]!.body!)).toEqual({
      request_id: requestId,
      expected_head_seq: 9,
      kind: "artifact",
      cas: storyAtHumanQaDocument.evidence[0]!.cas,
      note: "Focused artifact",
    });
    expect(JSON.parse(requests[1]!.body!)).toEqual({
      request_id: requestId,
      expected_head_seq: 9,
      to: "done",
      evidence: [evidenceId],
    });
    expect(JSON.parse(requests[2]!.body!)).toEqual({
      request_id: requestId,
      expected_head_seq: 9,
      decision: "approved",
      evidence: [evidenceId],
    });
  });

  it("preserves stale-head and gate errors for precise UI recovery", async () => {
    const transport = queuedTransport(
      [
        response(409, {
          error: "stale_scope_head",
          message: "expected scope head seq is stale",
          details: { current_head_seq: 12 },
        }),
        response(403, {
          error: "gate_principal_type_forbidden",
          message: "principal type is not allowed at this gate",
        }),
      ],
      [],
    );
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:3000", () => transport);
    const input = {
      requestId: "019fb900-1000-7000-8000-000000000031",
      expectedHeadSeq: 9,
      decision: "approved" as const,
      evidence: [storyAtHumanQaDocument.evidence[0]!.id],
    };
    await expect(
      client.reviewStory(roomId, storyAtHumanQaDocument.id, input),
    ).rejects.toMatchObject({ code: "stale_scope_head", status: 409 });
    await expect(
      client.reviewStory(roomId, storyAtHumanQaDocument.id, input),
    ).rejects.toMatchObject({ code: "gate_principal_type_forbidden", status: 403 });
  });
});
