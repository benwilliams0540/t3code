// @effect-diagnostics globalDate:off nodeBuiltinImport:off - Fixed wall-clock and filesystem fixtures exercise the standalone adapter boundary.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import { afterEach, describe, expect, it } from "vite-plus/test";

import { canonicalJson } from "../src/canonicalJson.ts";
import { RoomsResidentAgentConnector } from "../src/connector.ts";
import { buildResidentAgentInvocation, sanitizeLink } from "../src/contextEnvelope.ts";
import {
  ConnectorContractError,
  CONTEXT_LIMITS,
  parseResidentAgentResult,
  type ConnectorBinding,
  type ContextCandidateMessage,
  type InboundChannelEvent,
} from "../src/contracts.ts";
import { deriveInvocationId } from "../src/invocationId.ts";
import { GatewayTransportError } from "../src/gatewayTransport.ts";
import { SqliteInvocationStore } from "../src/sqliteInvocationStore.ts";
import { FakeGatewayTransport } from "./fakeGatewayTransport.ts";

const NOW = Date.parse("2026-08-02T00:00:00.000Z");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

function databasePath(): string {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "rooms-agent-connector-"));
  temporaryDirectories.push(directory);
  return NodePath.join(directory, "connector.sqlite");
}

function binding(overrides: Partial<ConnectorBinding> = {}): ConnectorBinding {
  return {
    connectorId: "connector:openclaw-local",
    connectorVersion: 1,
    roomId: "room:local",
    channelId: "channel:allowed",
    agentPrincipalId: "a:claw-local",
    openClawHostId: "host:local",
    openClawAgentId: "rooms",
    enabled: true,
    configVersion: 1,
    ...overrides,
  };
}

function event(overrides: Partial<InboundChannelEvent> = {}): InboundChannelEvent {
  return {
    contract: { id: "rooms.resident-agent-inbound", version: 1 },
    connectorId: "connector:openclaw-local",
    roomId: "room:local",
    channelId: "channel:allowed",
    sourceMessageId: "message:100",
    sourceSequence: 100,
    authorPrincipalId: "h:monroe",
    mentioned: true,
    bodyMarkdown: "@Claw summarize this bounded conversation.",
    attachments: [],
    links: [],
    occurredAt: "2026-08-01T23:59:59.000Z",
    traceId: "trace:100",
    ...overrides,
  };
}

function contextMessage(overrides: Partial<ContextCandidateMessage> = {}): ContextCandidateMessage {
  return {
    roomId: "room:local",
    channelId: "channel:allowed",
    sourceMessageId: "message:99",
    sequence: 99,
    authorPrincipalId: "h:ben",
    bodyMarkdown: "Earlier bounded context.",
    occurredAt: "2026-08-01T23:59:58.000Z",
    ...overrides,
  };
}

function connector(input: {
  readonly store: SqliteInvocationStore;
  readonly transport: FakeGatewayTransport;
  readonly now?: number;
}): RoomsResidentAgentConnector {
  return new RoomsResidentAgentConnector({
    store: input.store,
    transport: input.transport,
    now: () => input.now ?? NOW,
    createClaimToken: () => "claim-token",
    invocationTimeoutMs: 60_000,
    claimLeaseMs: 10_000,
  });
}

describe("Rooms resident-agent connector", () => {
  it("turns one human mention into one result and one server-derived attributed receipt", async () => {
    const store = new SqliteInvocationStore(databasePath());
    store.provisionBinding(binding());
    const transport = new FakeGatewayTransport();
    const outcome = await connector({ store, transport }).handleInbound({
      event: event(),
      context: [contextMessage()],
    });

    expect(outcome).toMatchObject({ kind: "completed", result: { status: "completed" } });
    expect(transport.invocations).toHaveLength(1);
    expect(transport.invocations[0]?.capabilities).toEqual(["channel.read", "message.send"]);
    const receipt = store.recordDeliveryReceipt({
      invocationId: deriveInvocationId(binding().connectorId, event().sourceMessageId),
      replyMessageId: "message:reply-100",
      occurredAt: "2026-08-02T00:00:01.000Z",
    });
    expect(receipt).toMatchObject({
      inReplyToSourceId: "message:100",
      attributedAgentPrincipalId: "a:claw-local",
      replayed: false,
    });
    store.close();
  });

  it("persists a non-mention without invoking OpenClaw", async () => {
    const store = new SqliteInvocationStore(databasePath());
    store.provisionBinding(binding());
    const transport = new FakeGatewayTransport();
    const nonMention = event({ mentioned: false });
    await expect(
      connector({ store, transport }).handleInbound({ event: nonMention, context: [] }),
    ).resolves.toEqual({ kind: "recorded_non_mention" });
    expect(transport.invocations).toEqual([]);
    expect(store.recordInbound(nonMention).inserted).toBe(false);
    store.close();
  });

  it("deduplicates exact source delivery and rejects changed bytes", async () => {
    const store = new SqliteInvocationStore(databasePath());
    store.provisionBinding(binding());
    const transport = new FakeGatewayTransport();
    const resident = connector({ store, transport });
    await resident.handleInbound({ event: event(), context: [] });
    const replay = await resident.handleInbound({ event: event(), context: [] });
    expect(replay.kind).toBe("terminal");
    expect(transport.invocations).toHaveLength(1);
    await expect(
      resident.handleInbound({ event: event({ bodyMarkdown: "changed replay" }), context: [] }),
    ).rejects.toMatchObject({ code: "inbound_idempotency_conflict" });
    store.close();
  });

  it("blocks disabled and non-human mentions before transport invocation", async () => {
    const store = new SqliteInvocationStore(databasePath());
    store.provisionBinding(binding({ enabled: false }));
    const transport = new FakeGatewayTransport();
    const resident = connector({ store, transport });
    await expect(resident.handleInbound({ event: event(), context: [] })).resolves.toEqual({
      kind: "disabled",
    });
    store.setEnabled(binding().connectorId, true, 1);
    await expect(
      resident.handleInbound({
        event: event({ sourceMessageId: "message:agent", authorPrincipalId: "a:other" }),
        context: [],
      }),
    ).resolves.toEqual({ kind: "ignored_non_human_author" });
    expect(transport.invocations).toEqual([]);
    store.close();
  });

  it("records unavailable distinctly and never creates a reply receipt", async () => {
    const store = new SqliteInvocationStore(databasePath());
    store.provisionBinding(binding());
    const transport = new FakeGatewayTransport();
    transport.nextOutcome = {
      status: "unavailable",
      failure: {
        code: "gateway_unavailable",
        safeMessage: "Gateway unavailable.",
        retryable: true,
      },
    };
    const outcome = await connector({ store, transport }).handleInbound({
      event: event(),
      context: [],
    });
    expect(outcome).toMatchObject({ kind: "completed", result: { status: "unavailable" } });
    expect(() =>
      store.recordDeliveryReceipt({
        invocationId: deriveInvocationId(binding().connectorId, event().sourceMessageId),
        replyMessageId: "message:should-not-exist",
        occurredAt: "2026-08-02T00:00:01.000Z",
      }),
    ).toThrow("Only a succeeded reply");
    store.close();
  });

  it("cancels persisted pending work without invoking after the room is disabled", async () => {
    const store = new SqliteInvocationStore(databasePath());
    store.provisionBinding(binding());
    const source = event();
    store.recordInbound(source);
    store.getOrCreateInvocation(
      buildResidentAgentInvocation({
        binding: binding(),
        event: source,
        candidates: [],
        createdAt: "2026-08-02T00:00:00.000Z",
        deadline: "2026-08-02T00:01:00.000Z",
      }),
    );
    store.setEnabled(binding().connectorId, false, 1);
    const transport = new FakeGatewayTransport();
    const outcome = await connector({ store, transport }).handleInbound({
      event: source,
      context: [],
    });
    expect(outcome).toMatchObject({
      kind: "completed",
      result: { status: "cancelled", failure: { code: "connector_disabled" } },
    });
    expect(transport.invocations).toEqual([]);
    store.close();
  });

  it("keeps same-channel context only and truncates deterministically by UTF-8 bytes", () => {
    const source = event();
    const messages = Array.from({ length: 30 }, (_, index) =>
      contextMessage({
        sourceMessageId: `message:${index}`,
        sequence: index,
        bodyMarkdown: "🙂".repeat(2_000),
      }),
    );
    messages.push(contextMessage({ roomId: "room:other", sourceMessageId: "secret:room" }));
    messages.push(
      contextMessage({ channelId: "channel:other", sourceMessageId: "secret:channel" }),
    );
    const invocation = buildResidentAgentInvocation({
      binding: binding(),
      event: source,
      candidates: messages,
      createdAt: "2026-08-02T00:00:00.000Z",
      deadline: "2026-08-02T00:01:00.000Z",
    });
    const ids = invocation.context.messages.map((message) => message.sourceMessageId);
    expect(ids).toContain(source.sourceMessageId);
    expect(ids).not.toContain("secret:room");
    expect(ids).not.toContain("secret:channel");
    expect(invocation.context.truncated).toBe(true);
    expect(
      invocation.context.messages.reduce(
        (total, message) => total + Buffer.byteLength(message.bodyMarkdown, "utf8"),
        0,
      ),
    ).toBeLessThanOrEqual(CONTEXT_LIMITS.maxTextBytes);
    expect(canonicalJson(invocation)).toBe(
      canonicalJson(
        buildResidentAgentInvocation({
          binding: binding(),
          event: source,
          candidates: messages.toReversed(),
          createdAt: "2026-08-02T00:00:00.000Z",
          deadline: "2026-08-02T00:01:00.000Z",
        }),
      ),
    );
  });

  it("survives file reopen and resumes an accepted Gateway run without reinvoking", async () => {
    const filename = databasePath();
    const first = new SqliteInvocationStore(filename);
    first.provisionBinding(binding());
    const source = event();
    first.recordInbound(source);
    const invocation = buildResidentAgentInvocation({
      binding: binding(),
      event: source,
      candidates: [],
      createdAt: "2026-08-02T00:00:00.000Z",
      deadline: "2026-08-02T00:05:00.000Z",
    });
    first.getOrCreateInvocation(invocation);
    first.claimInvocation({
      invocationId: invocation.invocationId,
      claimToken: "first-claim",
      claimedAt: "2026-08-02T00:00:00.000Z",
      leaseExpiresAt: "2026-08-02T00:00:10.000Z",
    });
    first.recordGatewayAccepted(
      invocation.invocationId,
      "first-claim",
      "gateway-run-1",
      "2026-08-02T00:00:01.000Z",
    );
    first.close();

    const reopened = new SqliteInvocationStore(filename);
    reopened.provisionBinding(binding());
    const transport = new FakeGatewayTransport();
    const outcome = await connector({
      store: reopened,
      transport,
      now: NOW + 11_000,
    }).handleInbound({
      event: source,
      context: [],
    });
    expect(outcome).toMatchObject({ kind: "completed", result: { status: "completed" } });
    expect(transport.invocations).toEqual([]);
    expect(transport.resumed).toEqual([{ invocation, runId: "gateway-run-1" }]);
    reopened.close();
  });

  it("allows only one compare-and-set claimant across two database connections", () => {
    const filename = databasePath();
    const first = new SqliteInvocationStore(filename);
    first.provisionBinding(binding());
    const source = event();
    first.recordInbound(source);
    const invocation = buildResidentAgentInvocation({
      binding: binding(),
      event: source,
      candidates: [],
      createdAt: "2026-08-02T00:00:00.000Z",
      deadline: "2026-08-02T00:01:00.000Z",
    });
    first.getOrCreateInvocation(invocation);
    const second = new SqliteInvocationStore(filename);
    const claims = [
      first.claimInvocation({
        invocationId: invocation.invocationId,
        claimToken: "claim-a",
        claimedAt: "2026-08-02T00:00:00.000Z",
        leaseExpiresAt: "2026-08-02T00:00:10.000Z",
      }),
      second.claimInvocation({
        invocationId: invocation.invocationId,
        claimToken: "claim-b",
        claimedAt: "2026-08-02T00:00:00.000Z",
        leaseExpiresAt: "2026-08-02T00:00:10.000Z",
      }),
    ];
    expect(claims.filter(Boolean)).toHaveLength(1);
    second.close();
    first.close();
  });

  it("uses the first frozen envelope for concurrent duplicate source creation", () => {
    const filename = databasePath();
    const first = new SqliteInvocationStore(filename);
    first.provisionBinding(binding());
    const source = event();
    first.recordInbound(source);
    const second = new SqliteInvocationStore(filename);
    const firstEnvelope = buildResidentAgentInvocation({
      binding: binding(),
      event: source,
      candidates: [contextMessage({ sourceMessageId: "message:first" })],
      createdAt: "2026-08-02T00:00:00.000Z",
      deadline: "2026-08-02T00:01:00.000Z",
    });
    const racingEnvelope = buildResidentAgentInvocation({
      binding: binding(),
      event: source,
      candidates: [contextMessage({ sourceMessageId: "message:racing" })],
      createdAt: "2026-08-02T00:00:01.000Z",
      deadline: "2026-08-02T00:01:01.000Z",
    });
    expect(first.getOrCreateInvocation(firstEnvelope).inserted).toBe(true);
    const replay = second.getOrCreateInvocation(racingEnvelope);
    expect(replay.inserted).toBe(false);
    expect(replay.record.invocation).toEqual(firstEnvelope);
    second.close();
    first.close();
  });

  it("lets a running call settle but revokes its reply when the room is disabled", async () => {
    const store = new SqliteInvocationStore(databasePath());
    store.provisionBinding(binding());
    const transport = new FakeGatewayTransport();
    transport.invokeHook = () => {
      store.setEnabled(binding().connectorId, false, 1);
    };
    const outcome = await connector({ store, transport }).handleInbound({
      event: event(),
      context: [],
    });
    expect(outcome).toMatchObject({
      kind: "completed",
      result: { status: "cancelled", failure: { code: "connector_disabled" } },
    });
    expect(store.getBinding(binding().connectorId)?.enabled).toBe(false);
    expect(() =>
      store.recordDeliveryReceipt({
        invocationId: deriveInvocationId(binding().connectorId, event().sourceMessageId),
        replyMessageId: "message:disabled",
        occurredAt: "2026-08-02T00:00:01.000Z",
      }),
    ).toThrow("Only a succeeded reply");
    store.close();
  });

  it("permanently revokes an in-flight configuration epoch across disable and re-enable", async () => {
    const store = new SqliteInvocationStore(databasePath());
    store.provisionBinding(binding());
    const transport = new FakeGatewayTransport();
    let releaseRun: (() => void) | undefined;
    let markPaused: (() => void) | undefined;
    const paused = new Promise<void>((resolve) => {
      markPaused = resolve;
    });
    transport.invokeHook = async () => {
      markPaused?.();
      await new Promise<void>((resolve) => {
        releaseRun = resolve;
      });
    };
    const resident = connector({ store, transport });
    const staleRun = resident.handleInbound({ event: event(), context: [] });
    await paused;

    const disabled = store.setEnabled(binding().connectorId, false, 1);
    expect(disabled).toMatchObject({ enabled: false, configVersion: 2 });
    const reenabled = store.setEnabled(binding().connectorId, true, 2);
    expect(reenabled).toMatchObject({ enabled: true, configVersion: 3 });
    releaseRun?.();

    await expect(staleRun).resolves.toMatchObject({
      kind: "completed",
      result: {
        status: "cancelled",
        failure: { code: "connector_configuration_changed" },
      },
    });
    const staleInvocation = store.getInvocation(
      deriveInvocationId(binding().connectorId, event().sourceMessageId),
    );
    expect(staleInvocation?.invocation.connector.configVersion).toBe(1);
    expect(() =>
      store.recordDeliveryReceipt({
        invocationId: staleInvocation!.invocation.invocationId,
        replyMessageId: "message:stale-reply",
        occurredAt: "2026-08-02T00:00:01.000Z",
      }),
    ).toThrow("Only a succeeded reply");

    transport.invokeHook = undefined;
    const laterEvent = event({
      sourceMessageId: "message:101",
      sourceSequence: 101,
      traceId: "trace:101",
    });
    const currentRun = await resident.handleInbound({ event: laterEvent, context: [] });
    expect(currentRun).toMatchObject({ kind: "completed", result: { status: "completed" } });
    const currentInvocationId = deriveInvocationId(
      binding().connectorId,
      laterEvent.sourceMessageId,
    );
    expect(store.getInvocation(currentInvocationId)?.invocation.connector.configVersion).toBe(3);
    expect(
      store.recordDeliveryReceipt({
        invocationId: currentInvocationId,
        replyMessageId: "message:reply-101",
        occurredAt: "2026-08-02T00:00:02.000Z",
      }),
    ).toMatchObject({ replayed: false, inReplyToSourceId: "message:101" });
    store.close();
  });

  it("rejects receipt creation when configuration changes after successful settlement", async () => {
    const store = new SqliteInvocationStore(databasePath());
    store.provisionBinding(binding());
    const outcome = await connector({
      store,
      transport: new FakeGatewayTransport(),
    }).handleInbound({ event: event(), context: [] });
    expect(outcome).toMatchObject({ kind: "completed", result: { status: "completed" } });
    expect(store.setEnabled(binding().connectorId, true, 1)).toMatchObject({
      enabled: true,
      configVersion: 2,
    });
    expect(() =>
      store.recordDeliveryReceipt({
        invocationId: deriveInvocationId(binding().connectorId, event().sourceMessageId),
        replyMessageId: "message:stale-after-success",
        occurredAt: "2026-08-02T00:00:01.000Z",
      }),
    ).toThrow("earlier connector configuration");
    store.close();
  });

  it("scrubs untrusted transport errors before durable result storage", async () => {
    const filename = databasePath();
    const secret = "sentinel-gateway-secret another-secret-shaped-value";
    const store = new SqliteInvocationStore(filename);
    store.provisionBinding(binding());
    const transport = new FakeGatewayTransport();
    transport.nextError = new GatewayTransportError({
      kind: "failed",
      code: `${secret}-${"x".repeat(2_000)}`,
      safeMessage: secret,
      retryable: true,
    });
    const outcome = await connector({ store, transport }).handleInbound({
      event: event(),
      context: [],
    });
    expect(outcome).toMatchObject({
      kind: "completed",
      result: {
        status: "failed",
        failure: {
          code: "gateway_transport_failed",
          safeMessage: "The OpenClaw Gateway request failed.",
          retryable: false,
        },
      },
    });
    expect(canonicalJson(outcome)).not.toContain(secret);
    store.close();

    const reopened = new SqliteInvocationStore(filename);
    const invocationId = deriveInvocationId(binding().connectorId, event().sourceMessageId);
    expect(canonicalJson(reopened.getInvocation(invocationId))).not.toContain(secret);
    expect(() =>
      reopened.recordDeliveryReceipt({
        invocationId,
        replyMessageId: "message:must-not-exist",
        occurredAt: "2026-08-02T00:00:01.000Z",
      }),
    ).toThrow("Only a succeeded reply");
    reopened.close();
    expect(NodeFS.readFileSync(filename).includes(Buffer.from(secret))).toBe(false);
  });

  it("persists the connector timeout result without a reply", async () => {
    const store = new SqliteInvocationStore(databasePath());
    store.provisionBinding(binding());
    const transport = new FakeGatewayTransport();
    transport.nextError = new GatewayTransportError({
      kind: "timed_out",
      code: "gateway_request_timeout",
      safeMessage: "OpenClaw Gateway request timed out.",
      retryable: false,
    });
    const outcome = await connector({ store, transport }).handleInbound({
      event: event(),
      context: [],
    });
    expect(outcome).toMatchObject({
      kind: "completed",
      result: {
        status: "timed_out",
        failure: { code: "gateway_request_timeout", retryable: false },
      },
    });
    expect(
      store.getInvocation(deriveInvocationId(binding().connectorId, event().sourceMessageId))
        ?.result,
    ).toMatchObject({ status: "timed_out", failure: { code: "gateway_request_timeout" } });
    store.close();
  });

  it("fails closed on the prior unversioned SQLite candidate", () => {
    const filename = databasePath();
    const legacy = new NodeSqlite.DatabaseSync(filename);
    legacy.exec("CREATE TABLE connector_bindings (connector_id TEXT PRIMARY KEY)");
    legacy.close();
    expect(() => new SqliteInvocationStore(filename)).toThrow(
      "predates configuration-epoch binding",
    );
  });

  it("rejects forged actor fields and replays only an identical delivery receipt", async () => {
    const forged = {
      contract: { id: "rooms.resident-agent-result", version: 1 },
      invocationId: "invocation",
      status: "completed",
      replyMarkdown: "reply",
      completedAt: "2026-08-02T00:00:00.000Z",
      adapter: { connectorId: "connector", connectorVersion: 1 },
      actorId: "a:forged",
    };
    expect(() => parseResidentAgentResult(forged)).toThrowError(ConnectorContractError);
    expect(() =>
      parseResidentAgentResult({
        contract: { id: "rooms.resident-agent-result", version: 1 },
        invocationId: "invocation",
        status: "completed",
        completedAt: "2026-08-02T00:00:00.000Z",
        adapter: { connectorId: "connector", connectorVersion: 1 },
      }),
    ).toThrow("require one reply");
    expect(() =>
      parseResidentAgentResult({
        contract: { id: "rooms.resident-agent-result", version: 1 },
        invocationId: "invocation",
        status: "completed",
        replyMarkdown: "🙂".repeat(5_000),
        completedAt: "2026-08-02T00:00:00.000Z",
        adapter: { connectorId: "connector", connectorVersion: 1 },
      }),
    ).toThrow("UTF-8 byte limit");
    expect(() => sanitizeLink({ url: "https://127.0.0.1/private" })).toThrow(
      "Local and literal-address",
    );

    const store = new SqliteInvocationStore(databasePath());
    store.provisionBinding(binding());
    await connector({ store, transport: new FakeGatewayTransport() }).handleInbound({
      event: event(),
      context: [],
    });
    const invocationId = deriveInvocationId(binding().connectorId, event().sourceMessageId);
    const input = {
      invocationId,
      replyMessageId: "message:reply",
      occurredAt: "2026-08-02T00:00:01.000Z",
    };
    expect(store.recordDeliveryReceipt(input).replayed).toBe(false);
    expect(store.recordDeliveryReceipt(input).replayed).toBe(true);
    expect(() =>
      store.recordDeliveryReceipt({ ...input, replyMessageId: "message:different" }),
    ).toThrow("Delivery receipt already differs");
    store.close();
  });
});
