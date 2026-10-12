// @effect-diagnostics globalDate:off nodeBuiltinImport:off - Disposable connector caches and deterministic runtime barriers.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { RoomsResidentAgentConnector } from "../src/connector.ts";
import type {
  ConnectorBinding,
  InboundChannelEvent,
  OpenClawSessionBinding,
  ResidentAgentInvocation,
} from "../src/contracts.ts";
import {
  GatewayTransportError,
  type GatewayInvocationOptions,
  type GatewayRunOutcome,
  type ResidentAgentGatewayTransport,
} from "../src/gatewayTransport.ts";
import {
  RoomsResidentAgentConsumer,
  RoomsServerInvocationMappingStore,
  type RoomsConversationBinding,
  type RoomsConversationClient,
  type RoomsInvocationClient,
  type RoomsInvocationFinishInput,
  type RoomsInvocationResponse,
  type RoomsServerInvocation,
} from "../src/roomsServerConsumer.ts";
import { SqliteInvocationStore } from "../src/sqliteInvocationStore.ts";

const now = Date.parse("2026-10-12T00:00:00.000Z");
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    NodeFS.rmSync(directory, { recursive: true, force: true });
});
const provision: ConnectorBinding = {
  connectorId: "connector:room",
  connectorVersion: 1,
  roomId: "room:one",
  channelId: "channel:one",
  agentPrincipalId: "a:claw",
  openClawHostId: "host:one",
  openClawAgentId: "rooms",
  enabled: true,
  configVersion: 7,
};
const event = (conversation = "a", sequence = 1): InboundChannelEvent => ({
  contract: { id: "rooms.resident-agent-inbound", version: 1 },
  connectorId: provision.connectorId,
  roomId: provision.roomId,
  channelId: provision.channelId,
  conversationId: `conversation:${conversation}`,
  sourceMessageId: `message:${conversation}:${sequence}`,
  sourceSequence: sequence,
  authorPrincipalId: "h:person",
  mentioned: true,
  bodyMarkdown: `@Claw turn${sequence}`,
  attachments: [],
  links: [],
  occurredAt: new Date(now).toISOString(),
  traceId: `trace:${sequence}`,
});
const gate = () => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

class ServiceHarness implements RoomsConversationClient, RoomsInvocationClient {
  readonly bindings = new Map<string, RoomsConversationBinding>();
  readonly turns = new Map<string, RoomsServerInvocation>();
  readonly deliveries = new Map<string, string>();
  readonly replies: RoomsInvocationFinishInput[] = [];
  readonly runtimeReceipts: Parameters<RoomsConversationClient["runtime"]>[0][] = [];
  loseDispatch = false;
  loseResult = false;
  loseAcceptance = false;
  async reserve(input: Parameters<RoomsConversationClient["reserve"]>[0]) {
    let binding = this.bindings.get(input.conversationId);
    if (!binding) {
      const uuid = `019fc9d0-0000-7000-8000-${String(this.bindings.size + 1).padStart(12, "0")}`;
      binding = {
        id: `binding:${uuid}`,
        conversationId: input.conversationId,
        roomId: provision.roomId,
        channelId: provision.channelId,
        agentPrincipalId: provision.agentPrincipalId,
        machinePrincipalId: "m:host",
        initializationState: "initializing",
        target: {
          kind: "openclaw",
          hostId: input.hostId,
          agentId: input.agentId,
          sessionKey: `agent:${input.agentId}:rooms:${uuid}`,
        },
        reference: null,
      };
      this.bindings.set(input.conversationId, binding);
    }
    return binding;
  }
  async initialize(input: Parameters<RoomsConversationClient["initialize"]>[0]) {
    const binding = [...this.bindings.values()].find((binding) => binding.id === input.bindingId)!;
    expect(input.reference.sessionKey).toBe(binding.target.sessionKey);
    const ready = {
      ...binding,
      initializationState: "ready" as const,
      reference: { sessionKey: input.reference.sessionKey, sessionId: input.reference.sessionId },
    };
    this.bindings.set(binding.conversationId, ready);
    return ready;
  }
  async missing(input: Parameters<RoomsConversationClient["missing"]>[0]) {
    const binding = [...this.bindings.values()].find((binding) => binding.id === input.bindingId)!;
    this.bindings.set(binding.conversationId, { ...binding, initializationState: "missing" });
  }
  async startTurn(
    input: Parameters<RoomsConversationClient["startTurn"]>[0],
  ): Promise<RoomsInvocationResponse> {
    const replay = this.deliveries.get(input.deliveryId);
    if (replay) return this.getTurn(replay);
    const binding = [...this.bindings.values()].find((binding) => binding.id === input.bindingId)!;
    const prior = [...this.turns.values()].filter((turn) => turn.bindingId === binding.id);
    const id = `invocation:${this.turns.size + 1}`;
    const turn: RoomsServerInvocation = {
      id,
      status: "running",
      connector: { id: input.connectorId, configurationEpoch: input.configurationEpoch },
      agent: {
        principalId: binding.agentPrincipalId,
        hostMachinePrincipalId: binding.machinePrincipalId,
      },
      roomId: binding.roomId,
      channelId: binding.channelId,
      invokingThread: null,
      conversationId: binding.conversationId,
      bindingId: binding.id,
      turnOrdinal: prior.length + 1,
      turnState: prior.some((turn) => turn.status === "running") ? "queued" : "ready",
      runtimeTarget: binding.target,
      runtimeRunId: null,
      context: {
        cutoffSequence: input.contextCutoffSequence,
        sourceHeadSequence: input.sourceHeadSequence,
      },
      outbox: null,
    };
    this.turns.set(id, turn);
    this.deliveries.set(input.deliveryId, id);
    return this.getTurn(id);
  }
  async getTurn(id: string): Promise<RoomsInvocationResponse> {
    return {
      contract: { id: "rooms.agent-invocations", version: 2 },
      invocation: this.turns.get(id)!,
    };
  }
  async dispatch(
    input: Parameters<RoomsConversationClient["dispatch"]>[0],
  ): Promise<RoomsInvocationResponse> {
    const turn = this.turns.get(input.invocationId)!;
    const allowed = turn.turnState === "ready";
    if (allowed) this.turns.set(turn.id, { ...turn, turnState: "dispatching" });
    if (this.loseDispatch) {
      this.loseDispatch = false;
      throw new Error("lost dispatch response after durable claim");
    }
    return { ...(await this.getTurn(turn.id)), dispatchAllowed: allowed };
  }
  async runtime(
    input: Parameters<RoomsConversationClient["runtime"]>[0],
  ): Promise<RoomsInvocationResponse> {
    this.runtimeReceipts.push(input);
    const turn = this.turns.get(input.invocationId)!;
    this.turns.set(turn.id, {
      ...turn,
      turnState: input.state,
      runtimeRunId: input.runtimeRunId ?? turn.runtimeRunId ?? null,
    });
    if (this.loseAcceptance) {
      this.loseAcceptance = false;
      throw new Error("lost acceptance response after commit");
    }
    return this.getTurn(turn.id);
  }
  async finishTurn(input: RoomsInvocationFinishInput): Promise<RoomsInvocationResponse> {
    const turn = this.turns.get(input.invocationId)!;
    if (turn.status === "running") {
      this.replies.push(input);
      this.turns.set(turn.id, {
        ...turn,
        status: input.status,
        turnState: "terminal",
        outbox: {
          resultId: input.resultId,
          receiptId: input.receiptId,
          terminalStatus: input.status,
          safeErrorCode: input.safeErrorCode,
          replyEventSequence: input.replyMarkdown ? 20 : null,
          receiptEventSequence: 21,
          notificationSequence: 21,
        },
      });
      const next = [...this.turns.values()].find(
        (candidate) => candidate.bindingId === turn.bindingId && candidate.turnState === "queued",
      );
      if (next) this.turns.set(next.id, { ...next, turnState: "ready" });
    } else {
      expect(turn.outbox?.resultId).toBe(input.resultId);
      expect(turn.outbox?.receiptId).toBe(input.receiptId);
    }
    if (this.loseResult) {
      this.loseResult = false;
      throw new Error("lost result response after atomic settlement");
    }
    return this.getTurn(turn.id);
  }
  async context() {
    return [];
  }
  async start(): Promise<RoomsInvocationResponse> {
    throw new Error("v1 start must not be used");
  }
  get(id: string) {
    return this.getTurn(id);
  }
  finish(input: RoomsInvocationFinishInput) {
    return this.finishTurn(input);
  }
}

class RuntimeHarness implements ResidentAgentGatewayTransport {
  readonly sessions = new Map<string, string>();
  readonly invoked: ResidentAgentInvocation[] = [];
  readonly resumed: string[] = [];
  accepted = gate();
  hold: ReturnType<typeof gate> | undefined;
  unknown = false;
  nextError: GatewayTransportError | undefined;
  async health() {
    return { available: true };
  }
  async initializeSession(input: Omit<OpenClawSessionBinding, "sessionId">) {
    const sessionId = this.sessions.get(input.sessionKey) ?? `session:${this.sessions.size + 1}`;
    this.sessions.set(input.sessionKey, sessionId);
    return { ...input, sessionId };
  }
  async invoke(
    invocation: ResidentAgentInvocation,
    options: GatewayInvocationOptions,
  ): Promise<GatewayRunOutcome> {
    this.invoked.push(invocation);
    if (this.unknown)
      throw new GatewayTransportError({
        kind: "uncertain",
        code: "gateway_acceptance_unknown",
        safeMessage: "Receipt lost.",
        retryable: false,
      });
    try {
      await options.onAccepted(`run:${invocation.invocationId}`);
    } catch {
      throw new GatewayTransportError({
        kind: "uncertain",
        code: "gateway_acceptance_not_persisted",
        safeMessage: "Acceptance receipt response lost.",
        retryable: false,
      });
    }
    this.accepted.release();
    await this.hold?.promise;
    if (this.nextError) throw this.nextError;
    return {
      status: "completed",
      replyMarkdown: `reply:${invocation.sourceMention.sourceMessageId}`,
    };
  }
  async resume(_invocation: ResidentAgentInvocation, runId: string) {
    this.resumed.push(runId);
    if (this.nextError) throw this.nextError;
    return { status: "completed" as const, replyMarkdown: "Recovered reply." };
  }
}
const make = (
  service = new ServiceHarness(),
  runtime = new RuntimeHarness(),
  directory?: string,
) => {
  const state =
    directory ?? NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "rooms-conversation-"));
  if (!directory) directories.push(state);
  const store = new SqliteInvocationStore(NodePath.join(state, "connector.sqlite"));
  store.provisionBinding(provision);
  const mappings = new RoomsServerInvocationMappingStore(NodePath.join(state, "mappings.sqlite"));
  const connector = new RoomsResidentAgentConnector({
    store,
    transport: runtime,
    now: () => now,
    claimLeaseMs: 10,
  });
  const consumer = new RoomsResidentAgentConsumer({
    connector,
    connectorStore: store,
    mappingStore: mappings,
    invocations: service,
    conversations: service,
    transport: runtime,
    roomsClientFactory: async () => {
      throw new Error("No fabricated native context");
    },
  });
  return {
    consumer,
    service,
    runtime,
    state,
    close: () => {
      store.close();
      mappings.close();
    },
  };
};
const handle = (harness: ReturnType<typeof make>, input = event()) =>
  harness.consumer.handleInbound({ event: input, sourceHeadSequence: 20 });

describe("durable conversation runtime composition", () => {
  it("continues A, isolates B and deduplicates deliveries/results without native IDs", async () => {
    const h = make();
    try {
      expect((await handle(h)).kind).toBe("settled");
      expect((await handle(h, event("a", 2))).kind).toBe("settled");
      expect((await handle(h, event("b", 3))).kind).toBe("settled");
      expect((await handle(h)).kind).toBe("server_terminal");
      expect(h.runtime.invoked).toHaveLength(3);
      expect(h.service.replies).toHaveLength(3);
      expect(h.runtime.invoked[0]?.runtimeBinding).toEqual(h.runtime.invoked[1]?.runtimeBinding);
      expect(h.runtime.invoked[2]?.runtimeBinding?.sessionId).not.toBe(
        h.runtime.invoked[0]?.runtimeBinding?.sessionId,
      );
      expect([...h.service.turns.values()].map((turn) => turn.turnOrdinal)).toEqual([1, 2, 1]);
    } finally {
      h.close();
    }
  });
  it("serializes concurrent A turns while B can run, and duplicate A creates no new work", async () => {
    const h = make();
    h.runtime.hold = gate();
    try {
      const first = handle(h);
      await h.runtime.accepted.promise;
      expect((await handle(h)).kind).toBe("deferred");
      expect((await handle(h, event("a", 2))).kind).toBe("deferred");
      const b = handle(h, event("b", 3));
      // A and B reach runtime independently; the barrier drains both deterministically.
      h.runtime.hold.release();
      await Promise.all([first, b]);
      expect((await handle(h, event("a", 2))).kind).toBe("settled");
      expect(h.runtime.invoked.map((turn) => turn.sourceMention.sourceMessageId)).toEqual([
        "message:a:1",
        "message:b:3",
        "message:a:2",
      ]);
    } finally {
      h.close();
    }
  });
  it("lost dispatch receipt blocks A without resending runtime work, while B stays independent", async () => {
    const h = make();
    h.service.loseDispatch = true;
    try {
      await expect(handle(h)).rejects.toThrow(/lost dispatch/);
      expect((await handle(h)).kind).toBe("deferred");
      expect((await handle(h, event("a", 2))).kind).toBe("deferred");
      expect((await handle(h, event("b", 3))).kind).toBe("settled");
      expect(h.runtime.invoked.map((turn) => turn.runtimeBinding?.conversationId)).toEqual([
        "conversation:b",
      ]);
      expect([...h.service.turns.values()][0]?.turnState).toBe("uncertain");
    } finally {
      h.close();
    }
  });
  it("resumes the backend run receipt after connector cache loss, without agent resend", async () => {
    const first = make();
    first.runtime.nextError = new GatewayTransportError({
      kind: "uncertain",
      code: "gateway_abort_unknown",
      safeMessage: "Abort unconfirmed.",
      retryable: false,
    });
    expect((await handle(first)).kind).toBe("deferred");
    const run = [...first.service.turns.values()][0]?.runtimeRunId;
    first.close();
    first.runtime.nextError = undefined;
    const restarted = make(first.service, first.runtime);
    try {
      expect((await handle(restarted)).kind).toBe("settled");
      expect(first.runtime.invoked).toHaveLength(1);
      expect(first.runtime.resumed).toEqual([run]);
      expect(first.runtime.sessions.size).toBe(1);
    } finally {
      restarted.close();
    }
  });
  it("retries a lost result response with stable identities and one visible reply", async () => {
    const h = make();
    h.service.loseResult = true;
    try {
      await expect(handle(h)).rejects.toThrow(/lost result/);
      expect((await handle(h)).kind).toBe("server_terminal");
      expect(h.runtime.invoked).toHaveLength(1);
      expect(h.service.replies).toHaveLength(1);
    } finally {
      h.close();
    }
  });
  it("keeps unknown acceptance and unconfirmed cancellation nonterminal", async () => {
    const h = make();
    h.runtime.unknown = true;
    try {
      expect((await handle(h)).kind).toBe("deferred");
      expect((await handle(h)).kind).toBe("deferred");
      expect((await handle(h, event("a", 2))).kind).toBe("deferred");
      expect(h.runtime.invoked).toHaveLength(1);
      expect(h.service.replies).toHaveLength(0);
    } finally {
      h.close();
    }
  });
  it("a confirmed active-turn cancellation releases the next turn and retains the binding", async () => {
    const h = make();
    h.runtime.nextError = new GatewayTransportError({
      kind: "cancelled",
      code: "invocation_cancelled",
      safeMessage: "Named run aborted.",
      retryable: false,
    });
    try {
      expect((await handle(h)).kind).toBe("settled");
      expect(h.service.replies[0]?.safeErrorCode).toBe("connector_cancelled");
      h.runtime.nextError = undefined;
      expect((await handle(h, event("a", 2))).kind).toBe("settled");
      expect(h.runtime.sessions.size).toBe(1);
    } finally {
      h.close();
    }
  });
});

it("redelivery after global head advances and local cache loss adopts the original turn", async () => {
  const first = make();
  first.runtime.nextError = new GatewayTransportError({
    kind: "uncertain",
    code: "gateway_run_detached",
    safeMessage: "Host stopped waiting.",
    retryable: false,
  });
  expect((await handle(first)).kind).toBe("deferred");
  const original = [...first.service.turns.values()][0]!;
  expect(original.context).toEqual({ cutoffSequence: 1, sourceHeadSequence: 1 });
  first.close();
  first.runtime.nextError = undefined;
  const restarted = make(first.service, first.runtime);
  try {
    expect(
      (await restarted.consumer.handleInbound({ event: event(), sourceHeadSequence: 500 })).kind,
    ).toBe("settled");
    expect([...first.service.turns.values()]).toHaveLength(1);
    expect(first.runtime.invoked).toHaveLength(1);
    expect(first.runtime.resumed).toEqual([original.runtimeRunId]);
    expect([...first.service.turns.values()][0]?.turnOrdinal).toBe(1);
  } finally {
    restarted.close();
  }
});

it("lost accepted receipt response is resumed from backend after local cache loss", async () => {
  const first = make();
  first.service.loseAcceptance = true;
  expect((await handle(first)).kind).toBe("deferred");
  const original = [...first.service.turns.values()][0]!;
  first.close();
  const restarted = make(first.service, first.runtime);
  try {
    expect((await handle(restarted)).kind).toBe("settled");
    expect(first.runtime.invoked).toHaveLength(1);
    expect(first.runtime.resumed).toEqual([original.runtimeRunId]);
    expect(first.service.replies).toHaveLength(1);
  } finally {
    restarted.close();
  }
});

it("a missing A session is explicitly blocked without stopping unrelated B", async () => {
  const h = make();
  try {
    const a = await h.service.reserve({
      conversationId: "conversation:a",
      connectorId: provision.connectorId,
      configurationEpoch: 7,
      hostId: provision.openClawHostId,
      agentId: provision.openClawAgentId,
    });
    h.service.bindings.set(a.conversationId, { ...a, initializationState: "missing" });
    expect(await handle(h)).toEqual({
      kind: "blocked",
      code: "runtime_session_missing",
      bindingId: a.id,
    });
    expect((await handle(h, event("b", 2))).kind).toBe("settled");
    expect(h.runtime.invoked).toHaveLength(1);
    expect(h.runtime.invoked[0]?.runtimeBinding?.conversationId).toBe("conversation:b");
    expect(h.runtime.sessions.size).toBe(1);
  } finally {
    h.close();
  }
});
