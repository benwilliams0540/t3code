// @effect-diagnostics globalDate:off - Wall-clock access is injected for tests at this standalone adapter boundary.
import * as NodeCrypto from "node:crypto";

import { buildResidentAgentInvocation, sanitizeInboundEvent } from "./contextEnvelope.ts";
import {
  ConnectorContractError,
  RESIDENT_AGENT_CONTRACT_VERSION,
  RESIDENT_AGENT_RESULT_CONTRACT,
  type ConnectorHandlingOutcome,
  type ContextCandidateMessage,
  type InboundChannelEvent,
  type InvocationRecord,
  type ResidentAgentFailure,
  type ResidentAgentResult,
  type ResidentAgentResultStatus,
} from "./contracts.ts";
import {
  GatewayTransportError,
  type GatewayRunOutcome,
  type ResidentAgentGatewayTransport,
} from "./gatewayTransport.ts";
import { deriveInvocationId } from "./invocationId.ts";
import { SqliteInvocationStore } from "./sqliteInvocationStore.ts";

const DEFAULT_INVOCATION_TIMEOUT_MS = 120_000;
const DEFAULT_CLAIM_LEASE_MS = 150_000;

const CONNECTOR_OWNED_TRANSPORT_ERROR_CODES = new Set([
  "agent_reply_missing",
  "agent_reply_too_large",
  "agent_run_failed",
  "agent_timed_out",
  "gateway_acceptance_invalid",
  "gateway_acceptance_not_persisted",
  "gateway_authentication_failed",
  "gateway_binary_frame_rejected",
  "gateway_challenge_invalid",
  "gateway_closed",
  "gateway_connect_timeout",
  "gateway_connection_closed",
  "gateway_credential_unavailable",
  "gateway_duplicate_challenge",
  "gateway_event_before_auth",
  "gateway_features_missing",
  "gateway_frame_too_large",
  "gateway_handshake_failed",
  "gateway_invalid_frame",
  "gateway_invalid_json",
  "gateway_invalid_response",
  "gateway_method_unavailable",
  "gateway_policy_invalid",
  "gateway_protocol_mismatch",
  "gateway_request_rejected",
  "gateway_request_timeout",
  "gateway_request_too_large",
  "gateway_response_id_mismatch",
  "gateway_scope_required",
  "gateway_send_failed",
  "gateway_socket_error",
  "gateway_target_mismatch",
  "gateway_unavailable",
  "gateway_wait_invalid",
  "invalid_gateway_target",
  "invalid_gateway_url",
  "invocation_cancelled",
]);

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function failureFromTransport(error: GatewayTransportError): {
  readonly status: ResidentAgentResultStatus;
  readonly failure: ResidentAgentFailure;
} {
  const status: ResidentAgentResultStatus =
    error.kind === "timed_out"
      ? "timed_out"
      : error.kind === "cancelled"
        ? "cancelled"
        : error.kind === "unavailable"
          ? "unavailable"
          : "failed";
  if (CONNECTOR_OWNED_TRANSPORT_ERROR_CODES.has(error.code)) {
    return {
      status,
      failure: { code: error.code, safeMessage: error.message, retryable: error.retryable },
    };
  }
  if (status === "timed_out") {
    return {
      status,
      failure: {
        code: "agent_timed_out",
        safeMessage: "OpenClaw did not finish before the invocation deadline.",
        retryable: false,
      },
    };
  }
  if (status === "cancelled") {
    return {
      status,
      failure: {
        code: "invocation_cancelled",
        safeMessage: "Resident-agent invocation was cancelled.",
        retryable: false,
      },
    };
  }
  if (status === "unavailable") {
    return {
      status,
      failure: {
        code: "gateway_unavailable",
        safeMessage: "OpenClaw Gateway is unavailable.",
        retryable: true,
      },
    };
  }
  return {
    status,
    failure: {
      code: "gateway_transport_failed",
      safeMessage: "The OpenClaw Gateway request failed.",
      retryable: false,
    },
  };
}

function failureFromOutcome(outcome: GatewayRunOutcome): ResidentAgentFailure | undefined {
  if (!outcome.failure) return undefined;
  const kind =
    outcome.status === "timed_out"
      ? "timed_out"
      : outcome.status === "cancelled"
        ? "cancelled"
        : outcome.status === "unavailable"
          ? "unavailable"
          : "failed";
  return failureFromTransport(
    new GatewayTransportError({
      kind,
      code: outcome.failure.code,
      safeMessage: outcome.failure.safeMessage,
      retryable: outcome.failure.retryable,
    }),
  ).failure;
}

export class RoomsResidentAgentConnector {
  readonly #store: SqliteInvocationStore;
  readonly #transport: ResidentAgentGatewayTransport;
  readonly #now: () => number;
  readonly #createClaimToken: () => string;
  readonly #invocationTimeoutMs: number;
  readonly #claimLeaseMs: number;

  constructor(input: {
    readonly store: SqliteInvocationStore;
    readonly transport: ResidentAgentGatewayTransport;
    readonly now?: () => number;
    readonly createClaimToken?: () => string;
    readonly invocationTimeoutMs?: number;
    readonly claimLeaseMs?: number;
  }) {
    this.#store = input.store;
    this.#transport = input.transport;
    this.#now = input.now ?? (() => Date.now());
    this.#createClaimToken =
      input.createClaimToken ?? (() => NodeCrypto.randomBytes(16).toString("hex"));
    this.#invocationTimeoutMs = input.invocationTimeoutMs ?? DEFAULT_INVOCATION_TIMEOUT_MS;
    this.#claimLeaseMs = input.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS;
  }

  async handleInbound(input: {
    readonly event: InboundChannelEvent;
    readonly context: readonly ContextCandidateMessage[];
    readonly signal?: AbortSignal;
  }): Promise<ConnectorHandlingOutcome> {
    const event = sanitizeInboundEvent(input.event);
    const binding = this.#store.getBinding(event.connectorId);
    if (!binding)
      throw new ConnectorContractError("binding_not_found", "Connector binding was not found.");
    if (event.roomId !== binding.roomId || event.channelId !== binding.channelId) {
      throw new ConnectorContractError(
        "binding_scope_mismatch",
        "Inbound event is outside the connector binding.",
      );
    }
    this.#store.recordInbound(event);
    if (!event.mentioned) return { kind: "recorded_non_mention" };
    if (!event.authorPrincipalId.startsWith("h:")) return { kind: "ignored_non_human_author" };

    const invocationId = deriveInvocationId(binding.connectorId, event.sourceMessageId);
    let record = this.#store.getInvocation(invocationId);
    if (!record) {
      if (!binding.enabled) return { kind: "disabled" };
      const now = this.#now();
      const invocation = buildResidentAgentInvocation({
        binding,
        event,
        candidates: input.context,
        createdAt: iso(now),
        deadline: iso(now + this.#invocationTimeoutMs),
      });
      record = this.#store.getOrCreateInvocation(invocation).record;
    }

    if (record.result) return { kind: "terminal", result: record.result };
    if (!binding.enabled) return this.#settleDisabled(record);
    if (record.state === "running") {
      const leaseExpiresAt =
        record.leaseExpiresAt === null
          ? Number.POSITIVE_INFINITY
          : Date.parse(record.leaseExpiresAt);
      if (leaseExpiresAt > this.#now()) {
        return { kind: "already_running", invocationId: record.invocation.invocationId };
      }
      const reclaimed = this.#claim(record.invocation.invocationId, true);
      if (!reclaimed)
        return { kind: "already_running", invocationId: record.invocation.invocationId };
      if (!reclaimed.gatewayRunId) {
        const result = this.#resultFromOutcome(reclaimed, {
          status: "unavailable",
          failure: {
            code: "gateway_acceptance_unknown",
            safeMessage: "The prior Gateway acceptance could not be recovered safely.",
            retryable: false,
          },
        });
        const completed = this.#store.completeInvocation(
          reclaimed.invocation.invocationId,
          this.#requiredClaimToken(reclaimed),
          result,
        );
        return { kind: "completed", result: completed.result! };
      }
      return this.#runClaimed(reclaimed, input.signal, reclaimed.gatewayRunId);
    }
    if (record.state !== "pending") {
      throw new ConnectorContractError(
        "corrupt_store",
        "Terminal invocation is missing its result.",
      );
    }
    const claimed = this.#claim(record.invocation.invocationId, false);
    if (!claimed) return { kind: "already_running", invocationId: record.invocation.invocationId };
    return this.#runClaimed(claimed, input.signal);
  }

  #claim(invocationId: string, reclaim: boolean): InvocationRecord | null {
    const now = this.#now();
    const input = {
      invocationId,
      claimToken: this.#createClaimToken(),
      claimedAt: iso(now),
      leaseExpiresAt: iso(now + this.#claimLeaseMs),
    };
    return reclaim
      ? this.#store.reclaimExpiredInvocation(input)
      : this.#store.claimInvocation(input);
  }

  #requiredClaimToken(record: InvocationRecord): string {
    if (!record.claimToken)
      throw new ConnectorContractError("claim_lost", "Invocation claim token is unavailable.");
    return record.claimToken;
  }

  #settleDisabled(record: InvocationRecord): ConnectorHandlingOutcome {
    let claimed: InvocationRecord | null;
    if (record.state === "pending") {
      claimed = this.#claim(record.invocation.invocationId, false);
    } else if (record.state === "running") {
      const leaseExpiresAt =
        record.leaseExpiresAt === null
          ? Number.POSITIVE_INFINITY
          : Date.parse(record.leaseExpiresAt);
      if (leaseExpiresAt > this.#now()) {
        return { kind: "already_running", invocationId: record.invocation.invocationId };
      }
      claimed = this.#claim(record.invocation.invocationId, true);
    } else {
      throw new ConnectorContractError(
        "corrupt_store",
        "Terminal invocation is missing its result.",
      );
    }
    if (!claimed) {
      return { kind: "already_running", invocationId: record.invocation.invocationId };
    }
    const result = this.#resultFromOutcome(claimed, {
      status: "cancelled",
      failure: {
        code: "connector_disabled",
        safeMessage: "The room connector was disabled before reply delivery.",
        retryable: false,
      },
    });
    const completed = this.#store.completeInvocation(
      claimed.invocation.invocationId,
      this.#requiredClaimToken(claimed),
      result,
    );
    return { kind: "completed", result: completed.result! };
  }

  async #runClaimed(
    record: InvocationRecord,
    signal?: AbortSignal,
    resumeRunId?: string,
  ): Promise<ConnectorHandlingOutcome> {
    const claimToken = this.#requiredClaimToken(record);
    try {
      const outcome = resumeRunId
        ? await this.#transport.resume(
            record.invocation,
            resumeRunId,
            signal ? { signal } : undefined,
          )
        : await this.#transport.invoke(record.invocation, {
            ...(signal ? { signal } : {}),
            onAccepted: (runId) =>
              this.#store.recordGatewayAccepted(
                record.invocation.invocationId,
                claimToken,
                runId,
                iso(this.#now()),
              ),
          });
      const result = this.#resultFromOutcome(record, outcome);
      const completed = this.#store.completeInvocation(
        record.invocation.invocationId,
        claimToken,
        result,
      );
      return { kind: "completed", result: completed.result! };
    } catch (error) {
      const transportError =
        error instanceof GatewayTransportError
          ? error
          : new GatewayTransportError({
              kind: "failed",
              code: "gateway_transport_failed",
              safeMessage: "The OpenClaw Gateway request failed.",
              retryable: false,
              cause: error,
            });
      const result = this.#resultFromOutcome(record, failureFromTransport(transportError));
      const completed = this.#store.completeInvocation(
        record.invocation.invocationId,
        claimToken,
        result,
      );
      return { kind: "completed", result: completed.result! };
    }
  }

  #resultFromOutcome(record: InvocationRecord, outcome: GatewayRunOutcome): ResidentAgentResult {
    const failure = failureFromOutcome(outcome);
    return {
      contract: {
        id: RESIDENT_AGENT_RESULT_CONTRACT,
        version: RESIDENT_AGENT_CONTRACT_VERSION,
      },
      invocationId: record.invocation.invocationId,
      status: outcome.status,
      ...(outcome.replyMarkdown === undefined ? {} : { replyMarkdown: outcome.replyMarkdown }),
      ...(failure === undefined ? {} : { failure }),
      completedAt: iso(this.#now()),
      adapter: {
        connectorId: record.invocation.connector.id,
        connectorVersion: record.invocation.connector.version,
        ...(outcome.agentVersion === undefined ? {} : { agentVersion: outcome.agentVersion }),
      },
    };
  }
}
