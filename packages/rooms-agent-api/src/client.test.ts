import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { HttpClient, type HttpClientRequest, HttpClientResponse } from "effect/unstable/http";

import { make } from "./client.ts";
import {
  readToolNames,
  roomsAgentCatalog,
  roomsAgentToolNames,
  workToolNames,
} from "./contracts.ts";

const responseFor = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "content-type": "application/json" } });

const readSuccess = {
  contract: { id: "rooms.agent-stories", version: 2 },
  tool_catalog_version: 2,
  room: { id: "room:test" },
};

const workSuccess = {
  contract: { id: "rooms.agent-work", version: 1 },
  invocation_id: "invocation:00000000-0000-7000-8000-000000000001",
  replayed: false,
};

const decodeUnknownJsonString = Schema.decodeUnknownEffect(Schema.UnknownFromJsonString);

const makeHttpLayer = (
  requests: Array<HttpClientRequest.HttpClientRequest>,
  response: (request: HttpClientRequest.HttpClientRequest) => Response,
) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => {
        requests.push(request);
        return HttpClientResponse.fromWeb(request, response(request));
      }),
    ),
  );

const runtime = (
  requests: Array<HttpClientRequest.HttpClientRequest>,
  response: (request: HttpClientRequest.HttpClientRequest) => Response,
) => Layer.merge(NodeServices.layer, makeHttpLayer(requests, response));

describe("Rooms Agent shared client", () => {
  it("pins exactly four reads and nine work tools without privileged capabilities", () => {
    expect(readToolNames).toHaveLength(4);
    expect(workToolNames).toHaveLength(9);
    expect(roomsAgentToolNames).toHaveLength(13);
    expect(new Set(roomsAgentToolNames).size).toBe(13);
    expect(roomsAgentCatalog.absentCapabilityClasses).toEqual(
      expect.arrayContaining([
        "governance",
        "generic_channel_message",
        "connector_control",
        "native_t3_control",
        "projection_regeneration",
      ]),
    );
  });

  it.effect("permits read_only reads and keeps the bearer out of URL and response", () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = [];
    return Effect.gen(function* () {
      const client = yield* make({
        baseUrl: "http://127.0.0.1:33104",
        bearerToken: "rag1.test.super-secret",
        profile: "read_only",
      });
      const result = yield* client.invoke("rooms_story_list", {
        limit: 20,
        filters: { stage: "backlog", native_thread_linked: true },
      });
      expect(result).toEqual(readSuccess);
      const request = requests[0]!;
      expect(request.headers.authorization).toBe("Bearer rag1.test.super-secret");
      expect(request.url).not.toContain("super-secret");
      expect(request.urlParams.params).toEqual([
        ["limit", "20"],
        ["stage", "backlog"],
        ["native_thread_linked", "true"],
      ]);
      expect(result).not.toHaveProperty("bearerToken");
    }).pipe(Effect.provide(runtime(requests, () => responseFor(readSuccess))));
  });

  it.effect("refuses work locally for a read_only profile", () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = [];
    return Effect.gen(function* () {
      const client = yield* make({
        baseUrl: "http://127.0.0.1:33104",
        bearerToken: "rag1.test.secret",
        profile: "read_only",
      });
      const result = yield* Effect.result(
        client.invoke("rooms_story_create", {
          title: "Cannot mutate",
          story_type: "feature",
          link_invoking_thread: true,
        }),
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isSuccess(result)) return;
      const error = result.failure;
      expect(error.code).toBe("capability_denied");
      expect(error.status).toBe(403);
      expect(requests).toHaveLength(0);
    }).pipe(Effect.provide(runtime(requests, () => responseFor(workSuccess, 201))));
  });

  it.effect("derives a retry-stable work envelope and excludes it from the model body", () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = [];
    return Effect.gen(function* () {
      const client = yield* make({
        baseUrl: "http://localhost:33104",
        bearerToken: "rag1.test.secret",
        profile: "read_write",
        invocationId: "invocation:00000000-0000-7000-8000-000000000001",
        connectorId: "claw",
        configurationEpoch: 7,
      });
      const input = {
        story_id: "story:00000000-0000-7000-8000-000000000002",
        expected_stage: "backlog",
        lease_seconds: 600,
      };
      expect(yield* client.invoke("rooms_story_claim", input)).toEqual(workSuccess);
      expect(yield* client.invoke("rooms_story_claim", input)).toEqual(workSuccess);
      expect(requests).toHaveLength(2);
      const first = requests[0]!;
      const second = requests[1]!;
      expect(first.headers["x-rooms-invocation-id"]).toBe(
        "invocation:00000000-0000-7000-8000-000000000001",
      );
      expect(first.headers["x-rooms-connector-id"]).toBe("claw");
      expect(first.headers["x-rooms-configuration-epoch"]).toBe("7");
      expect(first.headers["x-rooms-tool-call-id"]).toBe(second.headers["x-rooms-tool-call-id"]);
      expect(first.headers["x-rooms-tool-call-id"]).toMatch(/^m5c:[0-9a-f]{64}$/u);
      const body =
        first.body._tag === "Uint8Array"
          ? yield* decodeUnknownJsonString(new TextDecoder().decode(first.body.body))
          : null;
      expect(body).toEqual({ expected_stage: "backlog", lease_seconds: 600 });
    }).pipe(Effect.provide(runtime(requests, () => responseFor(workSuccess, 201))));
  });

  it.effect("preserves server-safe structured errors without raw transport detail", () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = [];
    return Effect.gen(function* () {
      const client = yield* make({
        baseUrl: "http://127.0.0.1:33104",
        bearerToken: "rag1.test.secret",
        profile: "read_only",
      });
      const result = yield* Effect.result(client.invoke("rooms_context_get", {}));
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isSuccess(result)) return;
      const error = result.failure;
      expect(error).toMatchObject({
        _tag: "RoomsAgentToolError",
        code: "projection_stale",
        status: 409,
        message: "story projection is behind its authoritative room source",
        retryable: true,
        details: { source_head_seq: 9, projected_head_seq: 8 },
        source: "server",
      });
      expect(error).not.toHaveProperty("cause");
    }).pipe(
      Effect.provide(
        runtime(requests, () =>
          responseFor(
            {
              error: "projection_stale",
              message: "story projection is behind its authoritative room source",
              retryable: true,
              details: { source_head_seq: 9, projected_head_seq: 8 },
            },
            409,
          ),
        ),
      ),
    );
  });

  it.effect("rejects response contract version drift", () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = [];
    return Effect.gen(function* () {
      const client = yield* make({
        baseUrl: "http://127.0.0.1:33104",
        bearerToken: "rag1.test.secret",
        profile: "read_only",
      });
      const result = yield* Effect.result(client.invoke("rooms_context_get", {}));
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isSuccess(result)) return;
      const error = result.failure;
      expect(error.code).toBe("rooms_agent_contract_drift");
      expect(error.source).toBe("client");
    }).pipe(
      Effect.provide(
        runtime(requests, () =>
          responseFor({
            contract: { id: "rooms.agent-stories", version: 2 },
            tool_catalog_version: 3,
          }),
        ),
      ),
    );
  });

  it.effect("rejects non-loopback packaging before sending a request", () => {
    const requests: Array<HttpClientRequest.HttpClientRequest> = [];
    return Effect.gen(function* () {
      const client = yield* make({
        baseUrl: "https://rooms.example.test",
        bearerToken: "rag1.test.secret",
        profile: "read_only",
      });
      const result = yield* Effect.result(client.invoke("rooms_context_get", {}));
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isSuccess(result)) return;
      const error = result.failure;
      expect(error.code).toBe("rooms_agent_local_only_required");
      expect(requests).toHaveLength(0);
    }).pipe(
      Effect.provide(
        runtime(
          requests,
          vi.fn(() => responseFor(readSuccess)),
        ),
      ),
    );
  });
});
