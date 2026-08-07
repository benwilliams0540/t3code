// @effect-diagnostics globalDate:off nodeBuiltinImport:off - Fixed filesystem fixtures exercise the standalone local connector boundary.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import * as Effect from "effect/Effect";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { RoomsResidentAgentConnector } from "../src/connector.ts";
import type {
  ConnectorBinding,
  InboundChannelEvent,
  ResidentAgentResult,
} from "../src/contracts.ts";
import {
  deriveRoomsDeliveryId,
  deriveRoomsSettlementIds,
  normalizeRoomsFailure,
  ROOMS_SAFE_FAILURE_CODES,
  RoomsInvocationHttpClient,
  type RoomsInvocationClient,
  type RoomsInvocationFinishInput,
  type RoomsInvocationResponse,
  type RoomsInvocationStartInput,
  RoomsResidentAgentConsumer,
  RoomsServerClientError,
  RoomsServerInvocationMappingStore,
} from "../src/roomsServerConsumer.ts";
import { SqliteInvocationStore } from "../src/sqliteInvocationStore.ts";
import { FakeGatewayTransport } from "./fakeGatewayTransport.ts";

const temporaryDirectories: string[] = [];
const NOW = Date.parse("2026-08-03T12:00:00.000Z");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

const temporaryState = (): {
  readonly connector: string;
  readonly mappings: string;
  readonly directory: string;
} => {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "rooms-m5d-consumer-"));
  temporaryDirectories.push(directory);
  return {
    directory,
    connector: NodePath.join(directory, "connector.sqlite"),
    mappings: NodePath.join(directory, "server-mappings.sqlite"),
  };
};

const binding = (overrides: Partial<ConnectorBinding> = {}): ConnectorBinding => ({
  connectorId: "connector:openclaw-local",
  connectorVersion: 1,
  roomId: "room:019fc9d0-0000-7000-8000-000000000001",
  channelId: "channel:019fc9d0-0000-7000-8000-000000000002",
  agentPrincipalId: "a:019fc9d0-0000-7000-8000-000000000003",
  openClawHostId: "host:local",
  openClawAgentId: "rooms",
  enabled: true,
  configVersion: 7,
  ...overrides,
});

const event = (overrides: Partial<InboundChannelEvent> = {}): InboundChannelEvent => ({
  contract: { id: "rooms.resident-agent-inbound", version: 1 },
  connectorId: binding().connectorId,
  roomId: binding().roomId,
  channelId: binding().channelId,
  sourceMessageId: "event:019fc9d0-0000-7000-8000-000000000004",
  sourceSequence: 17,
  authorPrincipalId: "h:019fc9d0-0000-7000-8000-000000000005",
  mentioned: true,
  bodyMarkdown: "@Claw create a bounded follow-up.",
  attachments: [],
  links: [],
  occurredAt: "2026-08-03T11:59:59.000Z",
  traceId: "trace:m5d-17",
  ...overrides,
});

const wireInvocation = (
  input: {
    readonly status?: "running" | "succeeded" | "failed";
    readonly epoch?: number;
    readonly outbox?: Readonly<Record<string, unknown>> | null;
  } = {},
): Readonly<Record<string, unknown>> => {
  const status = input.status ?? "running";
  const outbox =
    input.outbox === undefined
      ? status === "running"
        ? null
        : {
            id: "outbox:019fc9d0-0000-7000-8000-000000000008",
            result_id: "result:m5d",
            terminal_status: status,
            safe_error_code: status === "failed" ? "connector_internal" : null,
            receipt_id: "receipt:m5d",
            result_event_seq: 18,
            reply_event_seq: status === "succeeded" ? 19 : null,
            receipt_event_seq: status === "succeeded" ? 20 : 19,
            notification_seq: status === "succeeded" ? 20 : 19,
          }
      : input.outbox;
  return {
    id: "invocation:019fc9d0-0000-7000-8000-000000000006",
    status,
    connector: { id: binding().connectorId, configuration_epoch: input.epoch ?? 7 },
    agent: {
      principal_id: binding().agentPrincipalId,
      host_machine_principal_id: "m:019fc9d0-0000-7000-8000-000000000007",
    },
    room_id: binding().roomId,
    channel_id: binding().channelId,
    invoking_thread: {
      environment_id: "environment-local",
      project_id: "project-rooms",
      thread_id: "thread-infra",
    },
    context: { cutoff_seq: 17, source_head_seq: 21 },
    started_at: "2026-08-03T12:00:00.000Z",
    terminal_at: status === "running" ? null : "2026-08-03T12:00:01.000Z",
    outbox,
  };
};

const wireResponse = (
  input: {
    readonly status?: "running" | "succeeded" | "failed";
    readonly replayed?: boolean;
    readonly epoch?: number;
  } = {},
): Readonly<Record<string, unknown>> => ({
  contract: { id: "rooms.agent-invocations", version: 1 },
  invocation: wireInvocation(input),
  ...(input.replayed === undefined ? {} : { replayed: input.replayed }),
});

class FakeRoomsInvocationClient implements RoomsInvocationClient {
  readonly order: string[];
  readonly startCalls: RoomsInvocationStartInput[] = [];
  readonly getCalls: string[] = [];
  readonly finishCalls: RoomsInvocationFinishInput[] = [];
  #response: RoomsInvocationResponse;

  constructor(order: string[]) {
    this.order = order;
    this.#response = normalizedResponse("running");
  }

  async start(input: RoomsInvocationStartInput): Promise<RoomsInvocationResponse> {
    this.order.push("start");
    this.startCalls.push(input);
    return this.#response;
  }

  async get(invocationId: string): Promise<RoomsInvocationResponse> {
    this.order.push("get");
    this.getCalls.push(invocationId);
    return this.#response;
  }

  async finish(input: RoomsInvocationFinishInput): Promise<RoomsInvocationResponse> {
    this.order.push("finish");
    this.finishCalls.push(input);
    if (this.#response.invocation.status !== "running") {
      expect(input.resultId).toBe(this.#response.invocation.outbox?.resultId);
      expect(input.receiptId).toBe(this.#response.invocation.outbox?.receiptId);
      return { ...this.#response, replayed: true };
    }
    const status = input.status;
    this.#response = {
      contract: { id: "rooms.agent-invocations", version: 1 },
      replayed: false,
      invocation: {
        ...this.#response.invocation,
        status,
        outbox: {
          resultId: input.resultId,
          receiptId: input.receiptId,
          terminalStatus: status,
          safeErrorCode: input.safeErrorCode,
          replyEventSequence: input.replyMarkdown === null ? null : 19,
          receiptEventSequence: input.replyMarkdown === null ? 19 : 20,
          notificationSequence: input.replyMarkdown === null ? 19 : 20,
        },
      },
    };
    return this.#response;
  }
}

const normalizedResponse = (
  status: "running" | "succeeded" | "failed",
): RoomsInvocationResponse => ({
  contract: { id: "rooms.agent-invocations", version: 1 },
  invocation: {
    id: "invocation:019fc9d0-0000-7000-8000-000000000006",
    status,
    connector: { id: binding().connectorId, configurationEpoch: 7 },
    agent: {
      principalId: binding().agentPrincipalId,
      hostMachinePrincipalId: "m:019fc9d0-0000-7000-8000-000000000007",
    },
    roomId: binding().roomId,
    channelId: binding().channelId,
    invokingThread: {
      environmentId: "environment-local",
      projectId: "project-rooms",
      threadId: "thread-infra",
    },
    context: { cutoffSequence: 17, sourceHeadSequence: 21 },
    outbox:
      status === "running"
        ? null
        : {
            resultId: "result:m5d",
            receiptId: "receipt:m5d",
            terminalStatus: status,
            safeErrorCode: status === "failed" ? "connector_internal" : null,
            replyEventSequence: status === "succeeded" ? 19 : null,
            receiptEventSequence: status === "succeeded" ? 20 : 19,
            notificationSequence: status === "succeeded" ? 20 : 19,
          },
  },
});

const contextResponse = (): Readonly<Record<string, unknown>> => ({
  contract: { id: "rooms.agent-work", version: 1 },
  invocation_id: normalizedResponse("running").invocation.id,
  room_id: binding().roomId,
  channel_id: binding().channelId,
  context_cutoff_seq: 17,
  source_head_seq: 21,
  messages: [
    {
      body_markdown: event().bodyMarkdown,
      attributed_to: event().authorPrincipalId,
      occurred_at: event().occurredAt,
      source_event: {
        seq: event().sourceSequence,
        event_id: event().sourceMessageId,
        type: "message.created",
        schema: 1,
      },
    },
  ],
});

const makeConsumer = (input: {
  readonly state: ReturnType<typeof temporaryState>;
  readonly order: string[];
  readonly server: FakeRoomsInvocationClient;
  readonly transport?: FakeGatewayTransport;
}): {
  readonly consumer: RoomsResidentAgentConsumer;
  readonly connectorStore: SqliteInvocationStore;
  readonly mappingStore: RoomsServerInvocationMappingStore;
  readonly transport: FakeGatewayTransport;
} => {
  const connectorStore = new SqliteInvocationStore(input.state.connector);
  connectorStore.provisionBinding(binding());
  const mappingStore = new RoomsServerInvocationMappingStore(input.state.mappings);
  const transport = input.transport ?? new FakeGatewayTransport();
  transport.invokeHook = () => {
    input.order.push("provider");
  };
  const connector = new RoomsResidentAgentConnector({
    store: connectorStore,
    transport,
    now: () => NOW,
    createClaimToken: () => "claim:m5d",
    invocationTimeoutMs: 60_000,
    claimLeaseMs: 10_000,
  });
  const consumer = new RoomsResidentAgentConsumer({
    invocations: input.server,
    mappingStore,
    connectorStore,
    connector,
    roomsClientFactory: async (factoryInput) => {
      input.order.push("context");
      expect(factoryInput).toEqual({
        serverInvocationId: normalizedResponse("running").invocation.id,
        connectorId: binding().connectorId,
        configurationEpoch: 7,
      });
      return {
        profile: "read_write",
        invoke: (tool) => {
          expect(tool).toBe("rooms_channel_context_get");
          return Effect.succeed(contextResponse());
        },
      };
    },
  });
  return { consumer, connectorStore, mappingStore, transport };
};

const handleInput = () => ({
  event: event(),
  environmentId: "environment-local",
  projectId: "project-rooms",
  threadId: "thread-infra",
  sourceHeadSequence: 21,
});

describe("Rooms invocation HTTP client", () => {
  it("sends the exact server envelope and keeps configVersion equal to configuration_epoch", async () => {
    const requests: Request[] = [];
    const client = new RoomsInvocationHttpClient({
      baseUrl: "https://rooms.example.test",
      bearerToken: "rag1.test.sentinel-secret",
      fetch: async (request, init) => {
        requests.push(request instanceof Request ? request : new Request(request, init));
        return Response.json(wireResponse({ replayed: false }), { status: 201 });
      },
    });
    await client.start({
      connectorId: binding().connectorId,
      configurationEpoch: binding().configVersion,
      deliveryId: deriveRoomsDeliveryId(event()),
      channelId: binding().channelId,
      environmentId: "environment-local",
      projectId: "project-rooms",
      threadId: "thread-infra",
      contextCutoffSequence: 17,
      sourceHeadSequence: 21,
    });
    const request = requests[0]!;
    expect(request.url).toBe("https://rooms.example.test/agent/v1/invocations");
    expect(request.redirect).toBe("error");
    expect(request.headers.get("x-rooms-configuration-epoch")).toBe("7");
    expect(request.headers.get("x-rooms-connector-id")).toBe(binding().connectorId);
    expect(request.headers.get("authorization")).toBe("Bearer rag1.test.sentinel-secret");
    expect(await request.json()).toEqual({
      channel_id: binding().channelId,
      context_cutoff_seq: 17,
      source_head_seq: 21,
    });
    expect(request.url).not.toContain("sentinel-secret");
  });

  it("preserves only structured safe server errors and rejects invalid origins", async () => {
    const client = new RoomsInvocationHttpClient({
      baseUrl: "http://localhost:33104",
      bearerToken: "rag1.test.secret",
      fetch: async () =>
        Response.json(
          {
            error: "configuration_epoch_mismatch",
            message: "connector configuration epoch is stale",
            retryable: false,
            details: {},
          },
          { status: 409 },
        ),
    });
    const failure = await client
      .get("invocation:019fc9d0-0000-7000-8000-000000000006")
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      code: "configuration_epoch_mismatch",
      status: 409,
      retryable: false,
      details: {},
    });
    expect(JSON.stringify(failure)).not.toContain("rag1.test.secret");
    for (const baseUrl of [
      "http://rooms.example.test",
      "https://user:secret@rooms.example.test",
      "https://rooms.example.test/nested",
      "https://rooms.example.test?token=secret",
      "https://rooms.example.test#fragment",
      "//rooms.example.test",
    ]) {
      expect(
        () =>
          new RoomsInvocationHttpClient({
            baseUrl,
            bearerToken: "secret",
          }),
      ).toThrow(RoomsServerClientError);
    }
  });
});

describe("Rooms resident-agent server consumer", () => {
  it("starts the authoritative server invocation before context and provider, then settles once", async () => {
    const state = temporaryState();
    const order: string[] = [];
    const server = new FakeRoomsInvocationClient(order);
    const runtime = makeConsumer({ state, order, server });
    const outcome = await runtime.consumer.handleInbound(handleInput());

    expect(outcome).toMatchObject({
      kind: "settled",
      invocation: { status: "succeeded", connector: { configurationEpoch: 7 } },
    });
    expect(order).toEqual(["start", "context", "provider", "finish"]);
    expect(server.startCalls).toHaveLength(1);
    expect(server.startCalls[0]?.configurationEpoch).toBe(binding().configVersion);
    expect(server.finishCalls).toHaveLength(1);
    expect(server.finishCalls[0]).toMatchObject({
      invocationId: normalizedResponse("running").invocation.id,
      connectorId: binding().connectorId,
      configurationEpoch: binding().configVersion,
      status: "succeeded",
      safeErrorCode: null,
      replyMarkdown: "Fake reply.",
    });
    expect(runtime.transport.invocations).toHaveLength(1);

    runtime.mappingStore.close();
    runtime.connectorStore.close();
    const database = new NodeSqlite.DatabaseSync(state.connector);
    expect(
      (
        database.prepare("SELECT COUNT(*) AS count FROM delivery_receipts").get() as {
          readonly count: number;
        }
      ).count,
    ).toBe(0);
    database.close();
  });

  it("uses the acknowledged server ID after restart and never replays a terminal provider turn", async () => {
    const state = temporaryState();
    const order: string[] = [];
    const server = new FakeRoomsInvocationClient(order);
    const first = makeConsumer({ state, order, server });
    await first.consumer.handleInbound(handleInput());
    first.mappingStore.close();
    first.connectorStore.close();

    const second = makeConsumer({ state, order, server });
    const replay = await second.consumer.handleInbound(handleInput());
    expect(replay).toMatchObject({ kind: "server_terminal", invocation: { status: "succeeded" } });
    expect(order).toEqual(["start", "context", "provider", "finish", "get"]);
    expect(server.startCalls).toHaveLength(1);
    expect(server.finishCalls).toHaveLength(1);
    expect(second.transport.invocations).toHaveLength(0);
    second.mappingStore.close();
    second.connectorStore.close();
  });

  it("lets disablement and epoch change cancel acknowledged queued work before provider invocation", async () => {
    const state = temporaryState();
    const order: string[] = [];
    const server = new FakeRoomsInvocationClient(order);
    const runtime = makeConsumer({ state, order, server });
    const deliveryId = deriveRoomsDeliveryId(event());
    runtime.mappingStore.acknowledge(deliveryId, {
      serverInvocationId: normalizedResponse("running").invocation.id,
      connectorId: binding().connectorId,
      configurationEpoch: 7,
    });
    runtime.connectorStore.setEnabled(binding().connectorId, false, 7);

    const outcome = await runtime.consumer.handleInbound(handleInput());
    expect(outcome).toMatchObject({
      kind: "settled",
      invocation: {
        status: "failed",
        outbox: { safeErrorCode: "connector_cancelled" },
      },
    });
    expect(order).toEqual(["get", "finish"]);
    expect(server.finishCalls[0]).toMatchObject({
      configurationEpoch: 7,
      status: "failed",
      safeErrorCode: "connector_cancelled",
      replyMarkdown: null,
    });
    expect(runtime.transport.invocations).toEqual([]);
    runtime.mappingStore.close();
    runtime.connectorStore.close();
  });

  it("freezes the exhaustive server failure vocabulary without copying provider text", () => {
    const result = (status: ResidentAgentResult["status"], code: string): ResidentAgentResult => ({
      contract: { id: "rooms.resident-agent-result", version: 1 },
      invocationId: "local-invocation",
      status,
      failure: { code, safeMessage: "provider-secret-shaped-message", retryable: false },
      completedAt: "2026-08-03T12:00:00.000Z",
      adapter: { connectorId: binding().connectorId, connectorVersion: 1 },
    });
    const mapped = [
      normalizeRoomsFailure(result("timed_out", "gateway_request_timeout")),
      normalizeRoomsFailure(result("unavailable", "gateway_unavailable")),
      normalizeRoomsFailure(result("cancelled", "connector_disabled")),
      normalizeRoomsFailure(result("failed", "provider_rate_limited")),
      normalizeRoomsFailure(result("failed", "unknown-provider-secret")),
    ];
    expect(mapped).toEqual([
      "provider_timeout",
      "provider_unavailable",
      "connector_cancelled",
      "provider_rate_limited",
      "connector_internal",
    ]);
    expect(new Set(mapped)).toEqual(new Set(ROOMS_SAFE_FAILURE_CODES));
    expect(JSON.stringify(mapped)).not.toContain("provider-secret");
  });

  it("derives retry-stable delivery, result, and receipt identities", () => {
    const delivery = deriveRoomsDeliveryId(event());
    expect(deriveRoomsDeliveryId(event())).toBe(delivery);
    const first = deriveRoomsSettlementIds(normalizedResponse("running").invocation.id, delivery);
    const second = deriveRoomsSettlementIds(normalizedResponse("running").invocation.id, delivery);
    expect(first).toEqual(second);
    expect(first.resultId).not.toBe(first.receiptId);
    expect(first.resultId).toMatch(/^m5d:result:[0-9a-f]{64}$/u);
    expect(first.receiptId).toMatch(/^m5d:receipt:[0-9a-f]{64}$/u);
  });
});
