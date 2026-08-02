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
  return {
    status,
    failure: { code: error.code, safeMessage: error.message, retryable: error.retryable },
  };
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
      const currentBinding = this.#store.getBinding(record.invocation.connector.id);
      const effectiveOutcome: GatewayRunOutcome =
        currentBinding?.enabled === true
          ? outcome
          : {
              status: "cancelled",
              failure: {
                code: "connector_disabled",
                safeMessage: "The room connector was disabled before reply delivery.",
                retryable: false,
              },
            };
      const result = this.#resultFromOutcome(record, effectiveOutcome);
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
    return {
      contract: {
        id: RESIDENT_AGENT_RESULT_CONTRACT,
        version: RESIDENT_AGENT_CONTRACT_VERSION,
      },
      invocationId: record.invocation.invocationId,
      status: outcome.status,
      ...(outcome.replyMarkdown === undefined ? {} : { replyMarkdown: outcome.replyMarkdown }),
      ...(outcome.failure === undefined ? {} : { failure: outcome.failure }),
      completedAt: iso(this.#now()),
      adapter: {
        connectorId: record.invocation.connector.id,
        connectorVersion: record.invocation.connector.version,
        ...(outcome.agentVersion === undefined ? {} : { agentVersion: outcome.agentVersion }),
      },
    };
  }
}
