// @effect-diagnostics globalFetch:off nodeBuiltinImport:off - This local connector boundary uses injected Fetch and SQLite adapters.
import * as NodeSqlite from "node:sqlite";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { make as makeRoomsAgentClient, type RoomsAgentClientShape } from "@t3tools/rooms-agent-api";
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
  type OpenClawSessionBinding,
} from "./contracts.ts";
import { deriveInvocationId } from "./invocationId.ts";
import type { ResidentAgentGatewayTransport } from "./gatewayTransport.ts";
import { SqliteInvocationStore } from "./sqliteInvocationStore.ts";

export const ROOMS_INVOCATIONS_CONTRACT = {
  id: "rooms.agent-invocations",
  version: 1,
} as const;

export const ROOMS_SAFE_FAILURE_CODES = [
  "connector_cancelled",
  "connector_internal",
  "provider_rate_limited",
  "provider_request_rejected",
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
  readonly conversationId?: string;
  readonly bindingId?: string;
  readonly turnOrdinal?: number;
  readonly turnState?: "queued" | "ready" | "dispatching" | "accepted" | "uncertain" | "terminal";
  readonly runtimeRunId?: string | null;
  readonly runtimeTarget?: {
    readonly kind: "openclaw";
    readonly hostId: string;
    readonly agentId: string;
    readonly sessionKey: string;
  };
  readonly invokingThread: {
    readonly environmentId: string;
    readonly projectId: string;
    readonly threadId: string;
  } | null;
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
  readonly contract: { readonly id: "rooms.agent-invocations"; readonly version: 1 | 2 };
  readonly dispatchAllowed?: boolean;
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

export interface RoomsConversationBinding {
  readonly id: string;
  readonly conversationId: string;
  readonly roomId: string;
  readonly channelId: string;
  readonly agentPrincipalId: string;
  readonly machinePrincipalId: string;
  readonly initializationState: "initializing" | "ready" | "missing";
  readonly target: {
    readonly kind: "openclaw";
    readonly hostId: string;
    readonly agentId: string;
    readonly sessionKey: string;
  };
  readonly reference: { readonly sessionKey: string; readonly sessionId: string } | null;
}

export interface RoomsConversationClient {
  reserve(input: {
    readonly conversationId: string;
    readonly connectorId: string;
    readonly configurationEpoch: number;
    readonly hostId: string;
    readonly agentId: string;
  }): Promise<RoomsConversationBinding>;
  initialize(input: {
    readonly bindingId: string;
    readonly connectorId: string;
    readonly configurationEpoch: number;
    readonly receiptId: string;
    readonly reference: OpenClawSessionBinding;
  }): Promise<RoomsConversationBinding>;
  missing(input: {
    readonly bindingId: string;
    readonly connectorId: string;
    readonly configurationEpoch: number;
  }): Promise<void>;
  startTurn(
    input: Omit<RoomsInvocationStartInput, "environmentId" | "projectId" | "threadId"> & {
      readonly bindingId: string;
    },
  ): Promise<RoomsInvocationResponse>;
  getTurn(invocationId: string): Promise<RoomsInvocationResponse>;
  dispatch(input: {
    readonly invocationId: string;
    readonly connectorId: string;
    readonly configurationEpoch: number;
  }): Promise<RoomsInvocationResponse>;
  runtime(input: {
    readonly invocationId: string;
    readonly connectorId: string;
    readonly configurationEpoch: number;
    readonly state: "accepted" | "uncertain";
    readonly runtimeRunId: string | null;
  }): Promise<RoomsInvocationResponse>;
  finishTurn(input: RoomsInvocationFinishInput): Promise<RoomsInvocationResponse>;
  context(invocation: RoomsServerInvocation): Promise<readonly ContextCandidateMessage[]>;
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

const localHttpBaseUrl = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RoomsServerClientError({
      code: "rooms_server_configuration_invalid",
      status: 400,
      message: "Rooms server base URL is invalid.",
    });
  }
  const hostname = url.hostname.toLowerCase();
  const loopback =
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/u.test(hostname);
  if (
    url.protocol !== "http:" ||
    !loopback ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new RoomsServerClientError({
      code: "rooms_server_local_only_required",
      status: 400,
      message: "Rooms resident connector accepts only credential-free HTTP loopback origins.",
    });
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString().replace(/\/$/u, "");
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

const parseTurnState = (value: unknown): NonNullable<RoomsServerInvocation["turnState"]> => {
  if (
    !["queued", "ready", "dispatching", "accepted", "uncertain", "terminal"].includes(String(value))
  )
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: "Invalid conversation turn state.",
    });
  return value as NonNullable<RoomsServerInvocation["turnState"]>;
};
const parseConversationContract = (value: unknown): void => {
  const contract = record(value, "conversation contract");
  if (
    contract.id !== "rooms.conversations" ||
    contract.version !== 2 ||
    contract.schema_uri !== "contracts/rooms/conversations/v2/schema.json"
  )
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: "Unsupported conversation contract.",
    });
};
const parseConversationBinding = (value: unknown): RoomsConversationBinding => {
  const body = record(value, "binding response");
  parseConversationContract(body.contract);
  const binding = record(body.binding, "conversation binding");
  const target = record(binding.runtime_target, "binding target");
  if (
    target.kind !== "openclaw" ||
    !["initializing", "ready", "missing"].includes(String(binding.initialization_state))
  )
    throw new RoomsServerClientError({
      code: "rooms_runtime_unsupported",
      status: 422,
      message: "Unsupported runtime binding.",
    });
  const reference =
    binding.runtime_reference === null
      ? null
      : record(binding.runtime_reference, "binding reference");
  const parsed: RoomsConversationBinding = {
    id: textValue(binding.id, "binding ID"),
    conversationId: textValue(binding.conversation_id, "binding conversation"),
    roomId: textValue(binding.room_id, "binding room"),
    channelId: textValue(binding.channel_id, "binding channel"),
    agentPrincipalId: textValue(binding.agent_principal_id, "binding agent"),
    machinePrincipalId: textValue(binding.machine_principal_id, "binding machine"),
    initializationState:
      binding.initialization_state as RoomsConversationBinding["initializationState"],
    target: {
      kind: "openclaw",
      hostId: textValue(target.host_id, "binding host", 128),
      agentId: textValue(target.agent_id, "binding runtime agent", 128),
      sessionKey: textValue(target.session_key, "binding planned session"),
    },
    reference: reference
      ? {
          sessionKey: textValue(reference.session_key, "bound session key"),
          sessionId: textValue(reference.session_id, "bound session ID", 128),
        }
      : null,
  };
  if (
    (parsed.initializationState === "ready" && !parsed.reference) ||
    (parsed.reference && parsed.reference.sessionKey !== parsed.target.sessionKey)
  )
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: "Binding receipt does not match its reservation.",
    });
  return parsed;
};

const parseInvocationResponse = (value: unknown): RoomsInvocationResponse => {
  const body = record(value, "response");
  const contract = record(body.contract, "contract");
  if (
    contract.id !== ROOMS_INVOCATIONS_CONTRACT.id ||
    (contract.version !== 1 && contract.version !== 2) ||
    (contract.version === 2 &&
      contract.schema_uri !== "contracts/rooms/agent-invocations/v2/schema.json")
  ) {
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: "Rooms invocation contract version drifted.",
    });
  }
  if (body.dispatch_allowed !== undefined && typeof body.dispatch_allowed !== "boolean")
    throw new RoomsServerClientError({
      code: "rooms_server_contract_drift",
      status: 502,
      message: "Dispatch receipt is not boolean.",
    });
  const invocation = record(body.invocation, "invocation");
  const connector = record(invocation.connector, "invocation connector");
  const agent = record(invocation.agent, "invocation agent");
  const invokingThread =
    contract.version === 1 ? record(invocation.invoking_thread, "invoking thread") : null;
  const runtimeTarget =
    contract.version === 2 ? record(invocation.runtime_target, "runtime target") : null;
  if (runtimeTarget && runtimeTarget.kind !== "openclaw")
    throw new RoomsServerClientError({
      code: "rooms_runtime_unsupported",
      status: 422,
      message: "This connector cannot execute a native T3 conversation target.",
    });
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
    contract: { id: ROOMS_INVOCATIONS_CONTRACT.id, version: contract.version },
    ...(body.dispatch_allowed === undefined
      ? {}
      : { dispatchAllowed: body.dispatch_allowed === true }),
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
      invokingThread: invokingThread
        ? {
            environmentId: textValue(invokingThread.environment_id, "environment ID"),
            projectId: textValue(invokingThread.project_id, "project ID"),
            threadId: textValue(invokingThread.thread_id, "thread ID"),
          }
        : null,
      ...(runtimeTarget
        ? {
            conversationId: textValue(invocation.conversation_id, "conversation ID"),
            bindingId: textValue(invocation.binding_id, "binding ID"),
            turnOrdinal: integer(invocation.turn_ordinal, "turn ordinal", 1),
            turnState: parseTurnState(invocation.turn_state),
            runtimeRunId:
              invocation.runtime_run_id === null
                ? null
                : textValue(invocation.runtime_run_id, "runtime run ID", 128),
            runtimeTarget: {
              kind: "openclaw" as const,
              hostId: textValue(runtimeTarget.host_id, "runtime host ID", 128),
              agentId: textValue(runtimeTarget.agent_id, "runtime agent ID", 128),
              sessionKey: textValue(runtimeTarget.session_key, "runtime session key"),
            },
          }
        : {}),
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

export class RoomsInvocationHttpClient implements RoomsInvocationClient, RoomsConversationClient {
  readonly #baseUrl: string;
  readonly #bearerToken: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(input: {
    readonly baseUrl: string;
    readonly bearerToken: string;
    readonly fetch?: typeof globalThis.fetch;
  }) {
    this.#baseUrl = localHttpBaseUrl(input.baseUrl);
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

  #headers(input: {
    readonly connectorId: string;
    readonly configurationEpoch: number;
  }): Record<string, string> {
    return {
      "x-rooms-connector-id": input.connectorId,
      "x-rooms-configuration-epoch": String(input.configurationEpoch),
    };
  }

  async reserve(
    input: Parameters<RoomsConversationClient["reserve"]>[0],
  ): Promise<RoomsConversationBinding> {
    return parseConversationBinding(
      await this.#requestRaw(
        `/agent/v2/conversations/${encodeURIComponent(input.conversationId)}/bindings`,
        {
          method: "POST",
          headers: this.#headers(input),
          body: JSON.stringify({
            runtime_target: { kind: "openclaw", host_id: input.hostId, agent_id: input.agentId },
          }),
        },
      ),
    );
  }
  async initialize(
    input: Parameters<RoomsConversationClient["initialize"]>[0],
  ): Promise<RoomsConversationBinding> {
    return parseConversationBinding(
      await this.#requestRaw(
        `/agent/v2/bindings/${encodeURIComponent(input.bindingId)}/initialization`,
        {
          method: "POST",
          headers: this.#headers(input),
          body: JSON.stringify({
            receipt_id: input.receiptId,
            runtime_reference: {
              session_key: input.reference.sessionKey,
              session_id: input.reference.sessionId,
            },
          }),
        },
      ),
    );
  }
  async missing(input: Parameters<RoomsConversationClient["missing"]>[0]): Promise<void> {
    await this.#requestRaw(`/agent/v2/bindings/${encodeURIComponent(input.bindingId)}/missing`, {
      method: "POST",
      headers: this.#headers(input),
      body: "{}",
    });
  }
  startTurn(
    input: Parameters<RoomsConversationClient["startTurn"]>[0],
  ): Promise<RoomsInvocationResponse> {
    return this.#request("/agent/v2/invocations", {
      method: "POST",
      headers: { ...this.#headers(input), "x-rooms-delivery-id": input.deliveryId },
      body: JSON.stringify({
        binding_id: input.bindingId,
        channel_id: input.channelId,
        context_cutoff_seq: input.contextCutoffSequence,
        source_head_seq: input.sourceHeadSequence,
      }),
    });
  }
  getTurn(invocationId: string): Promise<RoomsInvocationResponse> {
    return this.#request(`/agent/v2/invocations/${encodeURIComponent(invocationId)}`, {
      method: "GET",
    });
  }
  dispatch(
    input: Parameters<RoomsConversationClient["dispatch"]>[0],
  ): Promise<RoomsInvocationResponse> {
    return this.#request(
      `/agent/v2/invocations/${encodeURIComponent(input.invocationId)}/dispatch`,
      { method: "POST", headers: this.#headers(input), body: "{}" },
    );
  }
  runtime(
    input: Parameters<RoomsConversationClient["runtime"]>[0],
  ): Promise<RoomsInvocationResponse> {
    return this.#request(
      `/agent/v2/invocations/${encodeURIComponent(input.invocationId)}/runtime`,
      {
        method: "POST",
        headers: this.#headers(input),
        body: JSON.stringify({ state: input.state, runtime_run_id: input.runtimeRunId }),
      },
    );
  }
  finishTurn(input: RoomsInvocationFinishInput): Promise<RoomsInvocationResponse> {
    return this.#request(`/agent/v2/invocations/${encodeURIComponent(input.invocationId)}/result`, {
      method: "POST",
      headers: {
        ...this.#headers(input),
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
  async context(invocation: RoomsServerInvocation): Promise<readonly ContextCandidateMessage[]> {
    const messages: ContextCandidateMessage[] = [];
    let after = 0;
    for (;;) {
      const query = new URLSearchParams({
        context_cutoff_seq: String(invocation.context.cutoffSequence),
        source_head_seq: String(invocation.context.sourceHeadSequence),
        after_seq: String(after),
        limit: "50",
      });
      const body = record(
        await this.#requestRaw(
          `/agent/v2/conversations/${encodeURIComponent(invocation.conversationId!)}/context?${query}`,
          { method: "GET" },
        ),
        "conversation context",
      );
      parseConversationContract(body.contract);
      const conversation = record(body.conversation, "context conversation");
      const context = record(body.context, "context bounds");
      const feed = record(body.feed, "context feed");
      const page = record(feed.page_info, "context page");
      if (
        conversation.id !== invocation.conversationId ||
        conversation.room_id !== invocation.roomId ||
        conversation.channel_id !== invocation.channelId ||
        context.cutoff_seq !== invocation.context.cutoffSequence ||
        context.source_head_seq !== invocation.context.sourceHeadSequence ||
        page.snapshot_head_seq !== invocation.context.cutoffSequence ||
        !Array.isArray(feed.items)
      )
        throw new RoomsServerClientError({
          code: "rooms_server_contract_drift",
          status: 502,
          message: "Conversation context scope or bounds changed.",
        });
      for (const raw of feed.items) {
        const item = record(raw, "conversation message");
        const source = record(item.source_event, "message source");
        const payload = record(item.payload, "message payload");
        if (item.kind !== "human_message" || payload.conversation_id !== invocation.conversationId)
          continue;
        const seq = integer(source.seq, "message sequence", 1);
        if (seq <= after || seq > invocation.context.cutoffSequence)
          throw new RoomsServerClientError({
            code: "rooms_server_contract_drift",
            status: 502,
            message: "Conversation message is outside pinned context.",
          });
        messages.push({
          roomId: invocation.roomId,
          channelId: invocation.channelId,
          sourceMessageId: textValue(source.event_id, "message ID", 64),
          sequence: seq,
          authorPrincipalId: textValue(
            record(item.attribution, "message attribution").actor_principal_id,
            "message author",
            64,
          ),
          bodyMarkdown: textValue(payload.body_markdown, "message Markdown", 10000),
          occurredAt: textValue(item.occurred_at, "message instant", 64),
        });
      }
      // Keep only the context budget, while draining the pinned feed to its actual head.
      if (messages.length > 20) messages.splice(0, messages.length - 20);
      if (page.has_more === false) return messages;
      const next = integer(page.next_cursor, "context cursor", 1);
      if (next <= after || next > invocation.context.cutoffSequence)
        throw new RoomsServerClientError({
          code: "rooms_server_contract_drift",
          status: 502,
          message: "Conversation context cursor did not advance safely.",
        });
      after = next;
    }
  }

  async #request(path: string, init: RequestInit): Promise<RoomsInvocationResponse> {
    return parseInvocationResponse(await this.#requestRaw(path, init));
  }
  async #requestRaw(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
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
    return body;
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
  const baseUrl = localHttpBaseUrl(input.baseUrl);
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

const recognizedRequestRejectionCodes = new Set([
  "gateway_protocol_mismatch",
  "gateway_request_rejected",
]);

export const normalizeRoomsFailure = (result: ResidentAgentResult): RoomsSafeFailureCode => {
  if (result.status === "timed_out") return "provider_timeout";
  if (result.status === "unavailable") return "provider_unavailable";
  if (result.status === "cancelled") return "connector_cancelled";
  if (result.failure && recognizedRateLimitCodes.has(result.failure.code)) {
    return "provider_rate_limited";
  }
  if (result.failure && recognizedRequestRejectionCodes.has(result.failure.code)) {
    return "provider_request_rejected";
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
  | {
      readonly kind: "blocked";
      readonly code: "runtime_session_missing";
      readonly bindingId: string;
    }
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
  readonly #conversations: RoomsConversationClient | undefined;
  readonly #transport: ResidentAgentGatewayTransport | undefined;

  constructor(input: {
    readonly invocations: RoomsInvocationClient;
    readonly mappingStore: RoomsServerInvocationMappingStore;
    readonly connectorStore: SqliteInvocationStore;
    readonly connector: RoomsResidentAgentConnector;
    readonly roomsClientFactory: RoomsAgentClientFactory;
    readonly conversations?: RoomsConversationClient;
    readonly transport?: ResidentAgentGatewayTransport;
  }) {
    this.#invocations = input.invocations;
    this.#mappingStore = input.mappingStore;
    this.#connectorStore = input.connectorStore;
    this.#connector = input.connector;
    this.#roomsClientFactory = input.roomsClientFactory;
    this.#conversations = input.conversations;
    this.#transport = input.transport;
  }

  async handleInbound(input: {
    readonly event: InboundChannelEvent;
    readonly environmentId?: string;
    readonly projectId?: string;
    readonly threadId?: string;
    readonly sourceHeadSequence: number;
    readonly signal?: AbortSignal;
    readonly abortMode?: "cancel" | "detach";
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
    if (event.conversationId) return this.#handleConversation({ ...input, event });
    if (!input.environmentId || !input.projectId || !input.threadId)
      throw new ConnectorContractError(
        "native_target_required",
        "Legacy one-shot delivery requires its real native T3 target.",
      );
    const native = {
      environmentId: input.environmentId,
      projectId: input.projectId,
      threadId: input.threadId,
      sourceHeadSequence: input.sourceHeadSequence,
    };
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
        native,
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

  async #handleConversation(input: {
    readonly event: InboundChannelEvent;
    readonly sourceHeadSequence: number;
    readonly signal?: AbortSignal;
    readonly abortMode?: "cancel" | "detach";
  }): Promise<RoomsResidentConsumerOutcome> {
    const api = this.#conversations;
    const initialize = this.#transport?.initializeSession;
    if (!api || !initialize)
      throw new ConnectorContractError(
        "conversation_runtime_unsupported",
        "Persistent conversation execution is not configured.",
      );
    const event = input.event;
    const connectorBinding = this.#connectorStore.getBinding(event.connectorId)!;
    const scope = {
      connectorId: connectorBinding.connectorId,
      configurationEpoch: connectorBinding.configVersion,
    };
    let binding = await api.reserve({
      ...scope,
      conversationId: event.conversationId!,
      hostId: connectorBinding.openClawHostId,
      agentId: connectorBinding.openClawAgentId,
    });
    const assertBinding = (): void => {
      if (
        binding.conversationId !== event.conversationId ||
        binding.roomId !== event.roomId ||
        binding.channelId !== event.channelId ||
        binding.agentPrincipalId !== connectorBinding.agentPrincipalId ||
        binding.target.hostId !== connectorBinding.openClawHostId ||
        binding.target.agentId !== connectorBinding.openClawAgentId
      )
        throw new ConnectorContractError(
          "conversation_binding_mismatch",
          "Conversation binding differs from the authenticated connector scope.",
        );
    };
    assertBinding();
    if (binding.initializationState === "missing")
      return { kind: "blocked", code: "runtime_session_missing", bindingId: binding.id };
    if (binding.initializationState === "initializing") {
      const reference = await initialize.call(this.#transport, {
        bindingId: binding.id,
        conversationId: binding.conversationId,
        sessionKey: binding.target.sessionKey,
      });
      binding = await api.initialize({
        ...scope,
        bindingId: binding.id,
        receiptId: `rooms:initialization:${sha256Hex(binding.id)}`,
        reference,
      });
      assertBinding();
    }
    if (binding.initializationState !== "ready" || !binding.reference)
      throw new ConnectorContractError(
        "binding_not_ready",
        "Runtime initialization has no durable receipt.",
      );
    const runtimeBinding = {
      bindingId: binding.id,
      conversationId: binding.conversationId,
      ...binding.reference,
    };
    const deliveryId = deriveRoomsDeliveryId(event);
    const acknowledged = this.#mappingStore.get(deliveryId);
    let response = acknowledged
      ? await api.getTurn(acknowledged.serverInvocationId)
      : await api.startTurn({
          ...scope,
          deliveryId,
          bindingId: binding.id,
          channelId: event.channelId,
          contextCutoffSequence: event.sourceSequence,
          sourceHeadSequence: event.sourceSequence,
        });
    if (acknowledged) this.#assertAcknowledged(response.invocation, acknowledged);
    const assertTurn = (): void => {
      const turn = response.invocation;
      if (
        response.contract.version !== 2 ||
        turn.conversationId !== binding.conversationId ||
        turn.bindingId !== binding.id ||
        turn.roomId !== event.roomId ||
        turn.channelId !== event.channelId ||
        turn.agent.principalId !== binding.agentPrincipalId ||
        turn.agent.hostMachinePrincipalId !== binding.machinePrincipalId ||
        turn.connector.id !== scope.connectorId ||
        turn.connector.configurationEpoch !== scope.configurationEpoch ||
        turn.context.cutoffSequence !== event.sourceSequence ||
        turn.context.sourceHeadSequence !== event.sourceSequence ||
        canonicalJson(turn.runtimeTarget) !== canonicalJson(binding.target)
      )
        throw new ConnectorContractError(
          "conversation_turn_mismatch",
          "Durable turn differs from its delivery and runtime binding.",
        );
    };
    assertTurn();
    if (!acknowledged)
      this.#mappingStore.acknowledge(deliveryId, {
        serverInvocationId: response.invocation.id,
        ...scope,
      });
    if (response.invocation.status !== "running")
      return { kind: "server_terminal", invocation: response.invocation };
    const deferred = (uncertain = false): RoomsResidentConsumerOutcome => ({
      kind: "deferred",
      serverInvocationId: response.invocation.id,
      connector: {
        kind: uncertain ? "uncertain" : "already_running",
        invocationId: deriveInvocationId(event.connectorId, event.sourceMessageId),
      },
    });
    if (!connectorBinding.enabled && ["queued", "ready"].includes(response.invocation.turnState!))
      return this.#finish(response.invocation, deliveryId, cancelledTerminalInput());
    const cached = this.#connectorStore.getInvocation(
      deriveInvocationId(event.connectorId, event.sourceMessageId),
    );
    if (
      cached &&
      canonicalJson(cached.invocation.runtimeBinding ?? null) !== canonicalJson(runtimeBinding)
    )
      throw new ConnectorContractError(
        "runtime_binding_mismatch",
        "Cached invocation belongs to a different durable runtime binding.",
      );
    if (
      cached?.gatewayRunId &&
      response.invocation.runtimeRunId &&
      cached.gatewayRunId !== response.invocation.runtimeRunId
    )
      throw new ConnectorContractError(
        "runtime_run_mismatch",
        "Cached and durable run receipts disagree.",
      );
    if (cached?.result)
      return this.#finish(response.invocation, deliveryId, terminalInput(cached.result), {
        kind: "terminal",
        result: cached.result,
      });
    // Fetch bounded context before the side-effect claim: failed reads can retry safely.
    const context = await api.context(response.invocation);
    response = await api.dispatch({ invocationId: response.invocation.id, ...scope });
    assertTurn();
    if (response.invocation.status !== "running")
      return { kind: "server_terminal", invocation: response.invocation };
    let resumeRunId = response.invocation.runtimeRunId ?? cached?.gatewayRunId ?? undefined;
    if (!response.dispatchAllowed && !resumeRunId) {
      if (["dispatching", "uncertain"].includes(response.invocation.turnState!)) {
        await api.runtime({
          invocationId: response.invocation.id,
          ...scope,
          state: "uncertain",
          runtimeRunId: null,
        });
        return deferred(true);
      }
      return deferred();
    }
    if (
      !response.dispatchAllowed &&
      resumeRunId &&
      response.invocation.runtimeRunId !== resumeRunId
    )
      await api.runtime({
        invocationId: response.invocation.id,
        ...scope,
        state: "accepted",
        runtimeRunId: resumeRunId,
      });
    const outcome = await this.#connector.handleInbound({
      event,
      context,
      runtimeBinding,
      ...(resumeRunId ? { resumeRunId } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.abortMode ? { abortMode: input.abortMode } : {}),
      onAccepted: async (runtimeRunId) => {
        await api.runtime({
          invocationId: response.invocation.id,
          ...scope,
          state: "accepted",
          runtimeRunId,
        });
      },
    });
    if (outcome.kind === "uncertain") {
      const run =
        this.#connectorStore.getInvocation(
          deriveInvocationId(event.connectorId, event.sourceMessageId),
        )?.gatewayRunId ?? null;
      await api.runtime({
        invocationId: response.invocation.id,
        ...scope,
        state: "uncertain",
        runtimeRunId: run,
      });
      return deferred(true);
    }
    if (outcome.kind === "already_running") return deferred();
    if (outcome.kind !== "completed" && outcome.kind !== "terminal")
      throw new ConnectorContractError(
        "conversation_outcome_invalid",
        "Conversation turn did not provide an execution outcome.",
      );
    if (outcome.result.failure?.code === "gateway_session_missing")
      await api.missing({ bindingId: binding.id, ...scope });
    return this.#finish(response.invocation, deliveryId, terminalInput(outcome.result), outcome);
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
      invocation.invokingThread?.environmentId !== input.environmentId ||
      invocation.invokingThread?.projectId !== input.projectId ||
      invocation.invokingThread?.threadId !== input.threadId
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
    const finish = invocation.bindingId
      ? this.#conversations!.finishTurn.bind(this.#conversations)
      : this.#invocations.finish.bind(this.#invocations);
    const settled = await finish({
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
