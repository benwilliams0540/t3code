// @effect-diagnostics globalFetch:off nodeBuiltinImport:off - This local connector boundary uses injected Fetch and SQLite adapters.
import * as NodeSqlite from "node:sqlite";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { make as makeRoomsAgentClient, type RoomsAgentClientShape } from "@t3tools/rooms-agent-api";
import { normalizeRoomsOrigin } from "@t3tools/shared/roomsTransport";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FetchHttpClient } from "effect/unstable/http";

import { canonicalJson, sha256Hex } from "./canonicalJson.ts";
import { RoomsResidentAgentConnector } from "./connector.ts";
import { sanitizeInboundEvent } from "./contextEnvelope.ts";
import {
  assertNonEmptyString,
  ConnectorContractError,
  isRecord,
  type ConnectorHandlingOutcome,
  type ContextCandidateMessage,
  type InboundChannelEvent,
  type ResidentAgentResult,
} from "./contracts.ts";
import { SqliteInvocationStore } from "./sqliteInvocationStore.ts";

export const ROOMS_INVOCATIONS_CONTRACT = {
  id: "rooms.agent-invocations",
  version: 1,
} as const;

export const ROOMS_SAFE_FAILURE_CODES = [
  "connector_cancelled",
  "connector_internal",
  "provider_rate_limited",
  "provider_timeout",
  "provider_unavailable",
] as const;

export type RoomsSafeFailureCode = (typeof ROOMS_SAFE_FAILURE_CODES)[number];
export type RoomsTerminalStatus = "succeeded" | "failed";

export interface RoomsServerInvocation {
  readonly id: string;
  readonly status: "running" | RoomsTerminalStatus;
  readonly connector: {
    readonly id: string;
    readonly configurationEpoch: number;
  };
  readonly agent: {
    readonly principalId: string;
    readonly hostMachinePrincipalId: string;
  };
  readonly roomId: string;
  readonly channelId: string;
  readonly invokingThread: {
    readonly environmentId: string;
    readonly projectId: string;
    readonly threadId: string;
  };
  readonly context: {
    readonly cutoffSequence: number;
    readonly sourceHeadSequence: number;
  };
  readonly outbox: null | {
    readonly resultId: string;
    readonly receiptId: string;
    readonly terminalStatus: RoomsTerminalStatus;
    readonly safeErrorCode: RoomsSafeFailureCode | null;
    readonly replyEventSequence: number | null;
    readonly receiptEventSequence: number;
    readonly notificationSequence: number;
  };
}

export interface RoomsInvocationResponse {
  readonly contract: typeof ROOMS_INVOCATIONS_CONTRACT;
  readonly invocation: RoomsServerInvocation;
  readonly replayed?: boolean;
}

export interface RoomsInvocationStartInput {
  readonly connectorId: string;
  readonly configurationEpoch: number;
  readonly deliveryId: string;
  readonly channelId: string;
  readonly environmentId: string;
  readonly projectId: string;
  readonly threadId: string;
  readonly contextCutoffSequence: number;
  readonly sourceHeadSequence: number;
}

export interface RoomsInvocationFinishInput {
  readonly invocationId: string;
  readonly connectorId: string;
  readonly configurationEpoch: number;
  readonly resultId: string;
  readonly receiptId: string;
  readonly status: RoomsTerminalStatus;
  readonly safeErrorCode: RoomsSafeFailureCode | null;
  readonly replyMarkdown: string | null;
}

export interface RoomsInvocationClient {
  readonly start: (input: RoomsInvocationStartInput) => Promise<RoomsInvocationResponse>;
  readonly get: (invocationId: string) => Promise<RoomsInvocationResponse>;
  readonly finish: (input: RoomsInvocationFinishInput) => Promise<RoomsInvocationResponse>;
}

export class RoomsServerClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(input: {
    readonly code: string;
    readonly status: number;
    readonly message: string;
    readonly retryable?: boolean;
    readonly details?: Readonly<Record<string, unknown>>;
  }) {
    super(input.message);
    this.name = "RoomsServerClientError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable ?? false;
    this.details = input.details ?? {};
  }
}

const roomsServerBaseUrl = (value: string): string => {
  const baseUrl = normalizeRoomsOrigin("shared", value);
  if (baseUrl === null) {
    throw new RoomsServerClientError({
      code: "rooms_server_origin_required",
      status: 400,
      message:
        "Rooms resident connector accepts only credential-free HTTPS or HTTP loopback origins.",
    });
  }
  return baseUrl;
};

const integer = (value: unknown, label: string, minimum: number): number => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: `Rooms server ${label} is invalid.`,
    });
  }
  return Number(value);
};

const record = (value: unknown, label: string): Readonly<Record<string, unknown>> => {
  if (!isRecord(value)) {
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: `Rooms server ${label} is invalid.`,
    });
  }
  return value;
};

const textValue = (value: unknown, label: string, maxLength = 512): string => {
  try {
    return assertNonEmptyString(value, label, maxLength);
  } catch {
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: `Rooms server ${label} is invalid.`,
    });
  }
};

const safeFailureCode = (value: unknown): RoomsSafeFailureCode | null => {
  if (value === null) return null;
  if ((ROOMS_SAFE_FAILURE_CODES as readonly unknown[]).includes(value)) {
    return value as RoomsSafeFailureCode;
  }
  throw new RoomsServerClientError({
    code: "rooms_server_contract_drift",
    status: 502,
    message: "Rooms server safe failure code is invalid.",
  });
};

const parseInvocationResponse = (value: unknown): RoomsInvocationResponse => {
  const body = record(value, "response");
  const contract = record(body.contract, "contract");
  if (
    contract.id !== ROOMS_INVOCATIONS_CONTRACT.id ||
    contract.version !== ROOMS_INVOCATIONS_CONTRACT.version
  ) {
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: "Rooms invocation contract version drifted.",
    });
  }
  const invocation = record(body.invocation, "invocation");
  const connector = record(invocation.connector, "invocation connector");
  const agent = record(invocation.agent, "invocation agent");
  const invokingThread = record(invocation.invoking_thread, "invoking thread");
  const context = record(invocation.context, "invocation context");
  const status = invocation.status;
  if (status !== "running" && status !== "succeeded" && status !== "failed") {
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: "Rooms server invocation status is invalid.",
    });
  }
  let outbox: RoomsServerInvocation["outbox"] = null;
  if (invocation.outbox !== null) {
    const valueOutbox = record(invocation.outbox, "invocation outbox");
    const terminalStatus = valueOutbox.terminal_status;
    if (terminalStatus !== "succeeded" && terminalStatus !== "failed") {
      throw new RoomsServerClientError({
        code: "rooms_server_contract_drift",
        status: 502,
        message: "Rooms server terminal status is invalid.",
      });
    }
    const replyEventSequence =
      valueOutbox.reply_event_seq === null
        ? null
        : integer(valueOutbox.reply_event_seq, "reply event sequence", 1);
    outbox = {
      resultId: textValue(valueOutbox.result_id, "result ID", 256),
      receiptId: textValue(valueOutbox.receipt_id, "receipt ID", 256),
      terminalStatus,
      safeErrorCode: safeFailureCode(valueOutbox.safe_error_code),
      replyEventSequence,
      receiptEventSequence: integer(valueOutbox.receipt_event_seq, "receipt event sequence", 1),
      notificationSequence: integer(valueOutbox.notification_seq, "notification sequence", 1),
    };
    if (
      outbox.terminalStatus !== status ||
      (status === "succeeded" && outbox.safeErrorCode !== null) ||
      (status === "failed" && outbox.safeErrorCode === null) ||
      outbox.receiptEventSequence !== outbox.notificationSequence
    ) {
      throw new RoomsServerClientError({
        code: "rooms_server_contract_drift",
        status: 502,
        message: "Rooms server terminal settlement is inconsistent.",
      });
    }
  }
  if ((status === "running") !== (outbox === null)) {
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: "Rooms server invocation and outbox states disagree.",
    });
  }
  if (body.replayed !== undefined && typeof body.replayed !== "boolean") {
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: "Rooms server replay marker is invalid.",
    });
  }
  return {
    contract: ROOMS_INVOCATIONS_CONTRACT,
    invocation: {
      id: textValue(invocation.id, "invocation ID", 64),
      status,
      connector: {
        id: textValue(connector.id, "connector ID", 128),
        configurationEpoch: integer(connector.configuration_epoch, "configuration epoch", 1),
      },
      agent: {
        principalId: textValue(agent.principal_id, "Agent principal ID", 64),
        hostMachinePrincipalId: textValue(
          agent.host_machine_principal_id,
          "host machine principal ID",
          64,
        ),
      },
      roomId: textValue(invocation.room_id, "room ID", 64),
      channelId: textValue(invocation.channel_id, "channel ID", 64),
      invokingThread: {
        environmentId: textValue(invokingThread.environment_id, "environment ID"),
        projectId: textValue(invokingThread.project_id, "project ID"),
        threadId: textValue(invokingThread.thread_id, "thread ID"),
      },
      context: {
        cutoffSequence: integer(context.cutoff_seq, "context cutoff sequence", 0),
        sourceHeadSequence: integer(context.source_head_seq, "source head sequence", 0),
      },
      outbox,
    },
    ...(body.replayed === undefined ? {} : { replayed: body.replayed }),
  };
};

const parseServerError = (status: number, value: unknown): RoomsServerClientError => {
  if (!isRecord(value)) {
    return new RoomsServerClientError({
      code: "rooms_server_error_invalid",
      status: 502,
      message: "Rooms server returned an invalid structured error.",
    });
  }
  const details = isRecord(value.details) ? value.details : {};
  if (
    typeof value.error !== "string" ||
    typeof value.message !== "string" ||
    typeof value.retryable !== "boolean"
  ) {
    return new RoomsServerClientError({
      code: "rooms_server_error_invalid",
      status: 502,
      message: "Rooms server returned an invalid structured error.",
    });
  }
  return new RoomsServerClientError({
    code: value.error,
    status,
    message: value.message,
    retryable: value.retryable,
    details,
  });
};

export class RoomsInvocationHttpClient implements RoomsInvocationClient {
  readonly #baseUrl: string;
  readonly #bearerToken: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(input: {
    readonly baseUrl: string;
    readonly bearerToken: string;
    readonly fetch?: typeof globalThis.fetch;
  }) {
    this.#baseUrl = roomsServerBaseUrl(input.baseUrl);
    this.#bearerToken = assertNonEmptyString(input.bearerToken, "Rooms bearer token", 4096);
    this.#fetch = input.fetch ?? globalThis.fetch;
  }

  start(input: RoomsInvocationStartInput): Promise<RoomsInvocationResponse> {
    return this.#request("/agent/v1/invocations", {
      method: "POST",
      headers: {
        "x-rooms-connector-id": input.connectorId,
        "x-rooms-configuration-epoch": String(input.configurationEpoch),
        "x-rooms-delivery-id": input.deliveryId,
        "x-rooms-environment-id": input.environmentId,
        "x-rooms-project-id": input.projectId,
        "x-rooms-thread-id": input.threadId,
      },
      body: JSON.stringify({
        channel_id: input.channelId,
        context_cutoff_seq: input.contextCutoffSequence,
        source_head_seq: input.sourceHeadSequence,
      }),
    });
  }

  get(invocationId: string): Promise<RoomsInvocationResponse> {
    return this.#request(`/agent/v1/invocations/${encodeURIComponent(invocationId)}`, {
      method: "GET",
    });
  }

  finish(input: RoomsInvocationFinishInput): Promise<RoomsInvocationResponse> {
    return this.#request(`/agent/v1/invocations/${encodeURIComponent(input.invocationId)}/result`, {
      method: "POST",
      headers: {
        "x-rooms-connector-id": input.connectorId,
        "x-rooms-configuration-epoch": String(input.configurationEpoch),
        "x-rooms-result-id": input.resultId,
        "x-rooms-receipt-id": input.receiptId,
      },
      body: JSON.stringify({
        status: input.status,
        safe_error_code: input.safeErrorCode,
        reply_markdown: input.replyMarkdown,
      }),
    });
  }

  async #request(path: string, init: RequestInit): Promise<RoomsInvocationResponse> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        redirect: "error",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.#bearerToken}`,
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...init.headers,
        },
      });
    } catch {
      throw new RoomsServerClientError({
        code: "rooms_server_unavailable",
        status: 503,
        message: "Rooms server request failed.",
        retryable: true,
      });
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new RoomsServerClientError({
        code: "rooms_server_response_invalid",
        status: 502,
        message: "Rooms server returned invalid JSON.",
      });
    }
    if (!response.ok) throw parseServerError(response.status, body);
    return parseInvocationResponse(body);
  }
}

export interface RoomsServerInvocationMapping {
  readonly serverInvocationId: string;
  readonly connectorId: string;
  readonly configurationEpoch: number;
}

interface MappingRow {
  readonly server_invocation_id: string;
  readonly connector_id: string;
  readonly configuration_epoch: number;
}

export class RoomsServerInvocationMappingStore {
  readonly #database: NodeSqlite.DatabaseSync;

  constructor(filename: string) {
    this.#database = new NodeSqlite.DatabaseSync(filename);
    this.#database.exec(
      "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;",
    );
    const version = Number(
      (this.#database.prepare("PRAGMA user_version").get() as { readonly user_version: number })
        .user_version,
    );
    const tables = Number(
      (
        this.#database
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .get() as { readonly count: number }
      ).count,
    );
    if ((version === 0 && tables > 0) || (version !== 0 && version !== 1)) {
      this.#database.close();
      throw new ConnectorContractError(
        "unsupported_server_mapping_schema",
        "Rooms server invocation mapping state uses an unsupported schema.",
      );
    }
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS server_invocation_mappings (
        delivery_digest TEXT PRIMARY KEY,
        server_invocation_id TEXT NOT NULL UNIQUE,
        connector_id TEXT NOT NULL,
        configuration_epoch INTEGER NOT NULL CHECK (configuration_epoch >= 1)
      );
      PRAGMA user_version = 1;
    `);
  }

  close(): void {
    this.#database.close();
  }

  get(deliveryId: string): RoomsServerInvocationMapping | null {
    const row = this.#database
      .prepare(
        `SELECT server_invocation_id, connector_id, configuration_epoch
         FROM server_invocation_mappings WHERE delivery_digest = ?`,
      )
      .get(sha256Hex(deliveryId)) as MappingRow | undefined;
    return row
      ? {
          serverInvocationId: row.server_invocation_id,
          connectorId: row.connector_id,
          configurationEpoch: row.configuration_epoch,
        }
      : null;
  }

  acknowledge(
    deliveryId: string,
    mapping: RoomsServerInvocationMapping,
  ): RoomsServerInvocationMapping {
    const digest = sha256Hex(deliveryId);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.get(deliveryId);
      if (existing) {
        if (canonicalJson(existing) !== canonicalJson(mapping)) {
          throw new ConnectorContractError(
            "server_invocation_mapping_conflict",
            "Stable delivery is already acknowledged by another Rooms invocation.",
          );
        }
        this.#database.exec("COMMIT");
        return existing;
      }
      this.#database
        .prepare(
          `INSERT INTO server_invocation_mappings (
            delivery_digest, server_invocation_id, connector_id, configuration_epoch
          ) VALUES (?, ?, ?, ?)`,
        )
        .run(digest, mapping.serverInvocationId, mapping.connectorId, mapping.configurationEpoch);
      this.#database.exec("COMMIT");
      return mapping;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      if (error instanceof ConnectorContractError) throw error;
      throw new ConnectorContractError(
        "server_invocation_mapping_write_failed",
        "Rooms server invocation mapping could not be persisted safely.",
      );
    }
  }
}

export interface RoomsAgentClientFactoryInput {
  readonly serverInvocationId: string;
  readonly connectorId: string;
  readonly configurationEpoch: number;
}

export type RoomsAgentClientFactory = (
  input: RoomsAgentClientFactoryInput,
) => Promise<RoomsAgentClientShape>;

const RoomsAgentClientRuntime = Layer.merge(NodeServices.layer, FetchHttpClient.layer);

export const makeRoomsAgentClientFactory = (input: {
  readonly baseUrl: string;
  readonly bearerToken: string;
}): RoomsAgentClientFactory => {
  const baseUrl = roomsServerBaseUrl(input.baseUrl);
  const bearerToken = assertNonEmptyString(input.bearerToken, "Rooms bearer token", 4096);
  return (invocation) =>
    Effect.runPromise(
      makeRoomsAgentClient({
        baseUrl,
        bearerToken,
        profile: "read_write",
        invocationId: invocation.serverInvocationId,
        connectorId: invocation.connectorId,
        configurationEpoch: invocation.configurationEpoch,
      }).pipe(Effect.provide(RoomsAgentClientRuntime)),
    );
};

const stableIdentity = (role: "delivery" | "result" | "receipt", value: unknown): string =>
  `m5d:${role}:${sha256Hex(canonicalJson(value))}`;

export const deriveRoomsDeliveryId = (event: InboundChannelEvent): string =>
  stableIdentity("delivery", {
    connectorId: event.connectorId,
    roomId: event.roomId,
    channelId: event.channelId,
    sourceMessageId: event.sourceMessageId,
  });

export const deriveRoomsSettlementIds = (
  serverInvocationId: string,
  deliveryId: string,
): { readonly resultId: string; readonly receiptId: string } => ({
  resultId: stableIdentity("result", { serverInvocationId, deliveryId }),
  receiptId: stableIdentity("receipt", { serverInvocationId, deliveryId }),
});

const recognizedRateLimitCodes = new Set([
  "agent_rate_limited",
  "gateway_rate_limited",
  "provider_rate_limited",
  "rate_limited",
]);

export const normalizeRoomsFailure = (result: ResidentAgentResult): RoomsSafeFailureCode => {
  if (result.status === "timed_out") return "provider_timeout";
  if (result.status === "unavailable") return "provider_unavailable";
  if (result.status === "cancelled") return "connector_cancelled";
  if (result.failure && recognizedRateLimitCodes.has(result.failure.code)) {
    return "provider_rate_limited";
  }
  return "connector_internal";
};

const terminalInput = (
  result: ResidentAgentResult,
): Pick<RoomsInvocationFinishInput, "status" | "safeErrorCode" | "replyMarkdown"> =>
  result.status === "completed"
    ? { status: "succeeded", safeErrorCode: null, replyMarkdown: result.replyMarkdown ?? null }
    : { status: "failed", safeErrorCode: normalizeRoomsFailure(result), replyMarkdown: null };

const cancelledTerminalInput = (): Pick<
  RoomsInvocationFinishInput,
  "status" | "safeErrorCode" | "replyMarkdown"
> => ({
  status: "failed",
  safeErrorCode: "connector_cancelled",
  replyMarkdown: null,
});

const internalTerminalInput = (): Pick<
  RoomsInvocationFinishInput,
  "status" | "safeErrorCode" | "replyMarkdown"
> => ({
  status: "failed",
  safeErrorCode: "connector_internal",
  replyMarkdown: null,
});

const candidateMessages = (
  value: unknown,
  expected: RoomsServerInvocation,
): readonly ContextCandidateMessage[] => {
  const body = record(value, "channel context response");
  const contract = record(body.contract, "channel context contract");
  if (
    contract.id !== "rooms.agent-work" ||
    contract.version !== 1 ||
    body.invocation_id !== expected.id ||
    body.room_id !== expected.roomId ||
    body.channel_id !== expected.channelId ||
    body.context_cutoff_seq !== expected.context.cutoffSequence ||
    body.source_head_seq !== expected.context.sourceHeadSequence ||
    !Array.isArray(body.messages)
  ) {
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: "Rooms bounded channel context does not match its server invocation.",
    });
  }
  return body.messages.map((item, index) => {
    const message = record(item, `channel context message ${index}`);
    const sourceEvent = record(message.source_event, `channel context source event ${index}`);
    return {
      roomId: expected.roomId,
      channelId: expected.channelId,
      sourceMessageId: textValue(sourceEvent.event_id, "source event ID", 64),
      sequence: integer(sourceEvent.seq, "source event sequence", 1),
      authorPrincipalId: textValue(message.attributed_to, "message attribution", 64),
      bodyMarkdown: textValue(message.body_markdown, "message Markdown", 2_000),
      occurredAt: textValue(message.occurred_at, "message occurrence time", 64),
    };
  });
};

export type RoomsResidentConsumerOutcome =
  | { readonly kind: "ignored"; readonly connector: ConnectorHandlingOutcome }
  | { readonly kind: "server_terminal"; readonly invocation: RoomsServerInvocation }
  | {
      readonly kind: "deferred";
      readonly serverInvocationId: string;
      readonly connector: ConnectorHandlingOutcome;
    }
  | {
      readonly kind: "settled";
      readonly invocation: RoomsServerInvocation;
      readonly connector?: ConnectorHandlingOutcome;
    };

export class RoomsResidentAgentConsumer {
  readonly #invocations: RoomsInvocationClient;
  readonly #mappingStore: RoomsServerInvocationMappingStore;
  readonly #connectorStore: SqliteInvocationStore;
  readonly #connector: RoomsResidentAgentConnector;
  readonly #roomsClientFactory: RoomsAgentClientFactory;

  constructor(input: {
    readonly invocations: RoomsInvocationClient;
    readonly mappingStore: RoomsServerInvocationMappingStore;
    readonly connectorStore: SqliteInvocationStore;
    readonly connector: RoomsResidentAgentConnector;
    readonly roomsClientFactory: RoomsAgentClientFactory;
  }) {
    this.#invocations = input.invocations;
    this.#mappingStore = input.mappingStore;
    this.#connectorStore = input.connectorStore;
    this.#connector = input.connector;
    this.#roomsClientFactory = input.roomsClientFactory;
  }

  async handleInbound(input: {
    readonly event: InboundChannelEvent;
    readonly environmentId: string;
    readonly projectId: string;
    readonly threadId: string;
    readonly sourceHeadSequence: number;
    readonly signal?: AbortSignal;
  }): Promise<RoomsResidentConsumerOutcome> {
    const event = sanitizeInboundEvent(input.event);
    const binding = this.#connectorStore.getBinding(event.connectorId);
    if (!binding) {
      throw new ConnectorContractError("binding_not_found", "Connector binding was not found.");
    }
    if (!event.mentioned || !event.authorPrincipalId.startsWith("h:")) {
      return {
        kind: "ignored",
        connector: await this.#connector.handleInbound({ event, context: [] }),
      };
    }
    const deliveryId = deriveRoomsDeliveryId(event);
    let response: RoomsInvocationResponse;
    const acknowledged = this.#mappingStore.get(deliveryId);
    if (acknowledged) {
      response = await this.#invocations.get(acknowledged.serverInvocationId);
      this.#assertAcknowledged(response.invocation, acknowledged);
    } else {
      if (!binding.enabled) {
        return {
          kind: "ignored",
          connector: await this.#connector.handleInbound({ event, context: [] }),
        };
      }
      response = await this.#invocations.start({
        connectorId: binding.connectorId,
        configurationEpoch: binding.configVersion,
        deliveryId,
        channelId: event.channelId,
        environmentId: input.environmentId,
        projectId: input.projectId,
        threadId: input.threadId,
        contextCutoffSequence: event.sourceSequence,
        sourceHeadSequence: input.sourceHeadSequence,
      });
      this.#assertStart(
        response.invocation,
        binding.connectorId,
        binding.configVersion,
        event,
        input,
      );
      this.#mappingStore.acknowledge(deliveryId, {
        serverInvocationId: response.invocation.id,
        connectorId: response.invocation.connector.id,
        configurationEpoch: response.invocation.connector.configurationEpoch,
      });
    }
    if (response.invocation.status !== "running") {
      return { kind: "server_terminal", invocation: response.invocation };
    }
    const currentBinding = this.#connectorStore.getBinding(event.connectorId);
    if (
      !currentBinding ||
      !currentBinding.enabled ||
      currentBinding.configVersion !== response.invocation.connector.configurationEpoch
    ) {
      return this.#finish(response.invocation, deliveryId, cancelledTerminalInput());
    }
    let context: readonly ContextCandidateMessage[];
    try {
      const roomsClient = await this.#roomsClientFactory({
        serverInvocationId: response.invocation.id,
        connectorId: response.invocation.connector.id,
        configurationEpoch: response.invocation.connector.configurationEpoch,
      });
      context = candidateMessages(
        await Effect.runPromise(roomsClient.invoke("rooms_channel_context_get", { limit: 20 })),
        response.invocation,
      );
    } catch {
      return this.#finish(response.invocation, deliveryId, internalTerminalInput());
    }
    let connectorOutcome: ConnectorHandlingOutcome;
    try {
      connectorOutcome = await this.#connector.handleInbound({
        event,
        context,
        ...(input.signal ? { signal: input.signal } : {}),
      });
    } catch {
      return this.#finish(response.invocation, deliveryId, internalTerminalInput());
    }
    if (connectorOutcome.kind === "already_running") {
      return {
        kind: "deferred",
        serverInvocationId: response.invocation.id,
        connector: connectorOutcome,
      };
    }
    if (connectorOutcome.kind !== "completed" && connectorOutcome.kind !== "terminal") {
      return this.#finish(response.invocation, deliveryId, internalTerminalInput());
    }
    return this.#finish(
      response.invocation,
      deliveryId,
      terminalInput(connectorOutcome.result),
      connectorOutcome,
    );
  }

  #assertAcknowledged(
    invocation: RoomsServerInvocation,
    mapping: RoomsServerInvocationMapping,
  ): void {
    if (
      invocation.id !== mapping.serverInvocationId ||
      invocation.connector.id !== mapping.connectorId ||
      invocation.connector.configurationEpoch !== mapping.configurationEpoch
    ) {
      throw new ConnectorContractError(
        "server_invocation_mapping_conflict",
        "Rooms server invocation no longer matches its acknowledged delivery mapping.",
      );
    }
  }

  #assertStart(
    invocation: RoomsServerInvocation,
    connectorId: string,
    configurationEpoch: number,
    event: InboundChannelEvent,
    input: {
      readonly environmentId: string;
      readonly projectId: string;
      readonly threadId: string;
      readonly sourceHeadSequence: number;
    },
  ): void {
    if (
      invocation.connector.id !== connectorId ||
      invocation.connector.configurationEpoch !== configurationEpoch ||
      invocation.roomId !== event.roomId ||
      invocation.channelId !== event.channelId ||
      invocation.context.cutoffSequence !== event.sourceSequence ||
      invocation.context.sourceHeadSequence !== input.sourceHeadSequence ||
      invocation.invokingThread.environmentId !== input.environmentId ||
      invocation.invokingThread.projectId !== input.projectId ||
      invocation.invokingThread.threadId !== input.threadId
    ) {
      throw new ConnectorContractError(
        "server_invocation_binding_mismatch",
        "Rooms server invocation does not match the trusted connector delivery.",
      );
    }
  }

  async #finish(
    invocation: RoomsServerInvocation,
    deliveryId: string,
    terminal: Pick<RoomsInvocationFinishInput, "status" | "safeErrorCode" | "replyMarkdown">,
    connector?: ConnectorHandlingOutcome,
  ): Promise<RoomsResidentConsumerOutcome> {
    const ids = deriveRoomsSettlementIds(invocation.id, deliveryId);
    const settled = await this.#invocations.finish({
      invocationId: invocation.id,
      connectorId: invocation.connector.id,
      configurationEpoch: invocation.connector.configurationEpoch,
      resultId: ids.resultId,
      receiptId: ids.receiptId,
      ...terminal,
    });
    if (settled.invocation.status === "running" || settled.invocation.outbox === null) {
      throw new ConnectorContractError(
        "server_settlement_invalid",
        "Rooms server did not return an authoritative terminal settlement.",
      );
    }
    if (
      settled.invocation.id !== invocation.id ||
      settled.invocation.connector.id !== invocation.connector.id ||
      settled.invocation.connector.configurationEpoch !== invocation.connector.configurationEpoch ||
      settled.invocation.outbox.resultId !== ids.resultId ||
      settled.invocation.outbox.receiptId !== ids.receiptId ||
      settled.invocation.outbox.terminalStatus !== terminal.status ||
      settled.invocation.outbox.safeErrorCode !== terminal.safeErrorCode
    ) {
      throw new ConnectorContractError(
        "server_settlement_conflict",
        "Rooms server terminal settlement differs from the stable connector result.",
      );
    }
    return {
      kind: "settled",
      invocation: settled.invocation,
      ...(connector === undefined ? {} : { connector }),
    };
  }
}
