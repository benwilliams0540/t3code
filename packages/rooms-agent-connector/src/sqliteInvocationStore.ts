import * as NodeSqlite from "node:sqlite";

import { canonicalJson, sha256Hex } from "./canonicalJson.ts";
import {
  assertIsoInstant,
  assertNonEmptyString,
  ConnectorContractError,
  isRecord,
  parseResidentAgentResult,
  RESIDENT_AGENT_CAPABILITIES,
  type ConnectorBinding,
  type DeliveryReceipt,
  type InboundChannelEvent,
  type InvocationRecord,
  type InvocationState,
  type ResidentAgentInvocation,
  type ResidentAgentResult,
} from "./contracts.ts";
import { deriveInvocationId } from "./invocationId.ts";

interface InvocationRow {
  readonly envelope_json: string;
  readonly state: string;
  readonly attempt: number;
  readonly claim_token: string | null;
  readonly gateway_run_id: string | null;
  readonly claimed_at: string | null;
  readonly lease_expires_at: string | null;
  readonly result_json: string | null;
}

interface BindingRow {
  readonly connector_id: string;
  readonly connector_version: number;
  readonly room_id: string;
  readonly channel_id: string;
  readonly agent_principal_id: string;
  readonly openclaw_host_id: string;
  readonly openclaw_agent_id: string;
  readonly enabled: number;
  readonly config_version: number;
}

interface ReceiptRow {
  readonly invocation_id: string;
  readonly connector_id: string;
  readonly room_id: string;
  readonly channel_id: string;
  readonly in_reply_to_source_id: string;
  readonly reply_message_id: string;
  readonly attributed_agent_principal_id: string;
  readonly occurred_at: string;
  readonly trace_id: string;
}

function mapState(value: string): InvocationState {
  if (
    value === "pending" ||
    value === "running" ||
    value === "succeeded" ||
    value === "failed" ||
    value === "unavailable"
  ) {
    return value;
  }
  throw new ConnectorContractError("corrupt_store", "Stored invocation state is invalid.");
}

function mapInvocationRow(row: InvocationRow): InvocationRecord {
  const storedInvocation: unknown = JSON.parse(row.envelope_json);
  if (
    !isRecord(storedInvocation) ||
    !isRecord(storedInvocation.connector) ||
    !Number.isSafeInteger(storedInvocation.connector.configVersion) ||
    Number(storedInvocation.connector.configVersion) < 1
  ) {
    throw new ConnectorContractError(
      "corrupt_store",
      "Stored invocation is missing its configuration epoch.",
    );
  }
  return {
    invocation: storedInvocation as unknown as ResidentAgentInvocation,
    state: mapState(row.state),
    attempt: row.attempt,
    claimToken: row.claim_token,
    gatewayRunId: row.gateway_run_id,
    claimedAt: row.claimed_at,
    leaseExpiresAt: row.lease_expires_at,
    result: row.result_json === null ? null : parseResidentAgentResult(JSON.parse(row.result_json)),
  };
}

function mapBindingRow(row: BindingRow): ConnectorBinding {
  return {
    connectorId: row.connector_id,
    connectorVersion: row.connector_version,
    roomId: row.room_id,
    channelId: row.channel_id,
    agentPrincipalId: row.agent_principal_id,
    openClawHostId: row.openclaw_host_id,
    openClawAgentId: row.openclaw_agent_id,
    enabled: row.enabled === 1,
    configVersion: row.config_version,
  };
}

function receiptComparable(receipt: Omit<DeliveryReceipt, "replayed">): string {
  return canonicalJson(receipt);
}

export class SqliteInvocationStore {
  readonly #database: NodeSqlite.DatabaseSync;

  constructor(filename: string) {
    this.#database = new NodeSqlite.DatabaseSync(filename);
    this.#database.exec(
      "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    );
    try {
      this.#migrate();
    } catch (error) {
      this.#database.close();
      throw error;
    }
  }

  close(): void {
    this.#database.close();
  }

  #migrate(): void {
    const schemaVersion = Number(
      (
        this.#database.prepare("PRAGMA user_version").get() as {
          readonly user_version: number;
        }
      ).user_version,
    );
    const existingTableCount = Number(
      (
        this.#database
          .prepare(
            "SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .get() as { readonly count: number }
      ).count,
    );
    if (schemaVersion === 0 && existingTableCount > 0) {
      throw new ConnectorContractError(
        "unsupported_store_schema",
        "Unversioned connector state predates configuration-epoch binding and must not be reused.",
      );
    }
    if (schemaVersion !== 0 && schemaVersion !== 1) {
      throw new ConnectorContractError(
        "unsupported_store_schema",
        "Connector state uses an unsupported schema version.",
      );
    }
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS connector_bindings (
        connector_id TEXT PRIMARY KEY,
        connector_version INTEGER NOT NULL CHECK (connector_version >= 1),
        room_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        agent_principal_id TEXT NOT NULL UNIQUE CHECK (agent_principal_id LIKE 'a:%'),
        openclaw_host_id TEXT NOT NULL,
        openclaw_agent_id TEXT NOT NULL,
        enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
        config_version INTEGER NOT NULL CHECK (config_version >= 1),
        UNIQUE (connector_id, room_id, channel_id)
      );

      CREATE TABLE IF NOT EXISTS inbound_events (
        connector_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        source_message_id TEXT NOT NULL,
        source_sequence INTEGER NOT NULL CHECK (source_sequence >= 0),
        author_principal_id TEXT NOT NULL,
        mentioned INTEGER NOT NULL CHECK (mentioned IN (0, 1)),
        occurred_at TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        PRIMARY KEY (connector_id, room_id, channel_id, source_message_id),
        UNIQUE (connector_id, source_message_id),
        FOREIGN KEY (connector_id, room_id, channel_id)
          REFERENCES connector_bindings(connector_id, room_id, channel_id)
      );

      CREATE TABLE IF NOT EXISTS invocations (
        invocation_id TEXT PRIMARY KEY,
        connector_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        source_message_id TEXT NOT NULL,
        envelope_json TEXT NOT NULL,
        envelope_hash TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'succeeded', 'failed', 'unavailable')),
        attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
        claim_token TEXT,
        claimed_at TEXT,
        lease_expires_at TEXT,
        gateway_run_id TEXT,
        result_json TEXT,
        result_hash TEXT,
        updated_at TEXT NOT NULL,
        UNIQUE (connector_id, source_message_id),
        FOREIGN KEY (connector_id, room_id, channel_id, source_message_id)
          REFERENCES inbound_events(connector_id, room_id, channel_id, source_message_id)
      );

      CREATE INDEX IF NOT EXISTS invocations_pending_idx ON invocations(state, updated_at);

      CREATE TABLE IF NOT EXISTS delivery_receipts (
        invocation_id TEXT PRIMARY KEY,
        connector_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        in_reply_to_source_id TEXT NOT NULL,
        reply_message_id TEXT NOT NULL UNIQUE,
        attributed_agent_principal_id TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        UNIQUE (connector_id, channel_id, in_reply_to_source_id),
        FOREIGN KEY (invocation_id) REFERENCES invocations(invocation_id),
        FOREIGN KEY (connector_id, room_id, channel_id)
          REFERENCES connector_bindings(connector_id, room_id, channel_id)
      );

      PRAGMA user_version = 1;
    `);
  }

  #transaction<T>(operation: () => T): T {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const value = operation();
      this.#database.exec("COMMIT");
      return value;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  provisionBinding(binding: ConnectorBinding): ConnectorBinding {
    assertNonEmptyString(binding.connectorId, "binding.connectorId");
    assertNonEmptyString(binding.roomId, "binding.roomId");
    assertNonEmptyString(binding.channelId, "binding.channelId");
    assertNonEmptyString(binding.agentPrincipalId, "binding.agentPrincipalId");
    assertNonEmptyString(binding.openClawHostId, "binding.openClawHostId", 128);
    assertNonEmptyString(binding.openClawAgentId, "binding.openClawAgentId", 128);
    if (!Number.isSafeInteger(binding.connectorVersion) || binding.connectorVersion < 1) {
      throw new ConnectorContractError(
        "invalid_binding",
        "Connector version must be a positive integer.",
      );
    }
    if (!Number.isSafeInteger(binding.configVersion) || binding.configVersion < 1) {
      throw new ConnectorContractError(
        "invalid_binding",
        "Configuration version must be a positive integer.",
      );
    }
    if (typeof binding.enabled !== "boolean") {
      throw new ConnectorContractError("invalid_binding", "Enabled must be boolean.");
    }
    if (!binding.agentPrincipalId.startsWith("a:")) {
      throw new ConnectorContractError(
        "invalid_agent_principal",
        "Connector binding requires an agent principal.",
      );
    }
    return this.#transaction(() => {
      const existing = this.getBinding(binding.connectorId);
      if (existing) {
        if (canonicalJson(existing) !== canonicalJson(binding)) {
          throw new ConnectorContractError(
            "binding_conflict",
            "Connector binding already exists with different content.",
          );
        }
        return existing;
      }
      this.#database
        .prepare(
          `INSERT INTO connector_bindings (
            connector_id, connector_version, room_id, channel_id, agent_principal_id,
            openclaw_host_id, openclaw_agent_id, enabled, config_version
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          binding.connectorId,
          binding.connectorVersion,
          binding.roomId,
          binding.channelId,
          binding.agentPrincipalId,
          binding.openClawHostId,
          binding.openClawAgentId,
          binding.enabled ? 1 : 0,
          binding.configVersion,
        );
      return binding;
    });
  }

  getBinding(connectorId: string): ConnectorBinding | null {
    const row = this.#database
      .prepare("SELECT * FROM connector_bindings WHERE connector_id = ?")
      .get(connectorId) as BindingRow | undefined;
    return row ? mapBindingRow(row) : null;
  }

  setEnabled(
    connectorId: string,
    enabled: boolean,
    expectedConfigVersion: number,
  ): ConnectorBinding {
    return this.#transaction(() => {
      const result = this.#database
        .prepare(
          `UPDATE connector_bindings
           SET enabled = ?, config_version = config_version + 1
           WHERE connector_id = ? AND config_version = ?`,
        )
        .run(enabled ? 1 : 0, connectorId, expectedConfigVersion);
      if (Number(result.changes) !== 1) {
        throw new ConnectorContractError(
          "binding_version_conflict",
          "Connector configuration changed concurrently.",
        );
      }
      const binding = this.getBinding(connectorId);
      if (!binding)
        throw new ConnectorContractError("binding_not_found", "Connector binding was not found.");
      return binding;
    });
  }

  recordInbound(event: InboundChannelEvent): {
    readonly inserted: boolean;
    readonly event: InboundChannelEvent;
  } {
    const payloadJson = canonicalJson(event);
    const payloadHash = sha256Hex(payloadJson);
    return this.#transaction(() => {
      const existing = this.#database
        .prepare(
          `SELECT payload_json, payload_hash FROM inbound_events
           WHERE connector_id = ? AND source_message_id = ?`,
        )
        .get(event.connectorId, event.sourceMessageId) as
        | { readonly payload_json: string; readonly payload_hash: string }
        | undefined;
      if (existing) {
        if (existing.payload_hash !== payloadHash || existing.payload_json !== payloadJson) {
          throw new ConnectorContractError(
            "inbound_idempotency_conflict",
            "Source message replay changed content.",
          );
        }
        return { inserted: false, event: JSON.parse(existing.payload_json) as InboundChannelEvent };
      }
      this.#database
        .prepare(
          `INSERT INTO inbound_events (
            connector_id, room_id, channel_id, source_message_id, source_sequence,
            author_principal_id, mentioned, occurred_at, trace_id, payload_json, payload_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          event.connectorId,
          event.roomId,
          event.channelId,
          event.sourceMessageId,
          event.sourceSequence,
          event.authorPrincipalId,
          event.mentioned ? 1 : 0,
          event.occurredAt,
          event.traceId,
          payloadJson,
          payloadHash,
        );
      return { inserted: true, event };
    });
  }

  getOrCreateInvocation(invocation: ResidentAgentInvocation): {
    readonly inserted: boolean;
    readonly record: InvocationRecord;
  } {
    const expectedInvocationId = deriveInvocationId(
      invocation.connector.id,
      invocation.sourceMention.sourceMessageId,
    );
    if (invocation.invocationId !== expectedInvocationId) {
      throw new ConnectorContractError(
        "invocation_binding_mismatch",
        "Invocation does not match its trusted connector binding.",
      );
    }
    const envelopeJson = canonicalJson(invocation);
    const envelopeHash = sha256Hex(envelopeJson);
    return this.#transaction(() => {
      const binding = this.getBinding(invocation.connector.id);
      if (
        !binding ||
        !binding.enabled ||
        invocation.connector.version !== binding.connectorVersion ||
        invocation.connector.configVersion !== binding.configVersion ||
        invocation.connector.target.hostId !== binding.openClawHostId ||
        invocation.connector.target.agentId !== binding.openClawAgentId ||
        invocation.roomId !== binding.roomId ||
        invocation.channelId !== binding.channelId ||
        canonicalJson(invocation.capabilities) !== canonicalJson(RESIDENT_AGENT_CAPABILITIES)
      ) {
        throw new ConnectorContractError(
          "invocation_binding_mismatch",
          "Invocation does not match its enabled trusted connector configuration epoch.",
        );
      }
      const existing = this.getInvocation(invocation.invocationId);
      if (existing) {
        if (
          existing.invocation.connector.id !== invocation.connector.id ||
          existing.invocation.sourceMention.sourceMessageId !==
            invocation.sourceMention.sourceMessageId
        ) {
          throw new ConnectorContractError(
            "invocation_idempotency_conflict",
            "Invocation ID is already bound to another source.",
          );
        }
        return { inserted: false, record: existing };
      }
      this.#database
        .prepare(
          `INSERT INTO invocations (
            invocation_id, connector_id, room_id, channel_id, source_message_id,
            envelope_json, envelope_hash, state, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        )
        .run(
          invocation.invocationId,
          invocation.connector.id,
          invocation.roomId,
          invocation.channelId,
          invocation.sourceMention.sourceMessageId,
          envelopeJson,
          envelopeHash,
          invocation.createdAt,
        );
      const record = this.getInvocation(invocation.invocationId);
      if (!record)
        throw new ConnectorContractError("store_write_failed", "Invocation was not persisted.");
      return { inserted: true, record };
    });
  }

  getInvocation(invocationId: string): InvocationRecord | null {
    const row = this.#database
      .prepare("SELECT * FROM invocations WHERE invocation_id = ?")
      .get(invocationId) as InvocationRow | undefined;
    return row ? mapInvocationRow(row) : null;
  }

  claimInvocation(input: {
    readonly invocationId: string;
    readonly claimToken: string;
    readonly claimedAt: string;
    readonly leaseExpiresAt: string;
  }): InvocationRecord | null {
    return this.#transaction(() => {
      const result = this.#database
        .prepare(
          `UPDATE invocations
           SET state = 'running', attempt = attempt + 1, claim_token = ?, claimed_at = ?,
               lease_expires_at = ?, updated_at = ?
           WHERE invocation_id = ? AND state = 'pending'`,
        )
        .run(
          input.claimToken,
          input.claimedAt,
          input.leaseExpiresAt,
          input.claimedAt,
          input.invocationId,
        );
      return Number(result.changes) === 1 ? this.getInvocation(input.invocationId) : null;
    });
  }

  reclaimExpiredInvocation(input: {
    readonly invocationId: string;
    readonly claimToken: string;
    readonly claimedAt: string;
    readonly leaseExpiresAt: string;
  }): InvocationRecord | null {
    return this.#transaction(() => {
      const result = this.#database
        .prepare(
          `UPDATE invocations
           SET attempt = attempt + 1, claim_token = ?, claimed_at = ?, lease_expires_at = ?, updated_at = ?
           WHERE invocation_id = ? AND state = 'running' AND lease_expires_at <= ?`,
        )
        .run(
          input.claimToken,
          input.claimedAt,
          input.leaseExpiresAt,
          input.claimedAt,
          input.invocationId,
          input.claimedAt,
        );
      return Number(result.changes) === 1 ? this.getInvocation(input.invocationId) : null;
    });
  }

  recordGatewayAccepted(
    invocationId: string,
    claimToken: string,
    runId: string,
    updatedAt: string,
  ): void {
    this.#transaction(() => {
      const existing = this.getInvocation(invocationId);
      if (!existing || existing.state !== "running") {
        throw new ConnectorContractError(
          "invalid_state_transition",
          "Only a running invocation can be accepted.",
        );
      }
      if (existing.gatewayRunId !== null && existing.gatewayRunId !== runId) {
        throw new ConnectorContractError(
          "gateway_run_conflict",
          "Invocation already has another Gateway run.",
        );
      }
      const result = this.#database
        .prepare(
          `UPDATE invocations SET gateway_run_id = ?, updated_at = ?
           WHERE invocation_id = ? AND state = 'running' AND claim_token = ?`,
        )
        .run(runId, updatedAt, invocationId, claimToken);
      if (Number(result.changes) !== 1) {
        throw new ConnectorContractError(
          "claim_lost",
          "Invocation claim no longer belongs to this worker.",
        );
      }
    });
  }

  completeInvocation(
    invocationId: string,
    claimToken: string,
    result: ResidentAgentResult,
  ): InvocationRecord {
    if (result.invocationId !== invocationId) {
      throw new ConnectorContractError(
        "result_invocation_mismatch",
        "Result invocation ID does not match.",
      );
    }
    const requestedResult = parseResidentAgentResult(result);
    return this.#transaction(() => {
      const existing = this.getInvocation(invocationId);
      if (!existing)
        throw new ConnectorContractError("invocation_not_found", "Invocation was not found.");
      const binding = this.getBinding(existing.invocation.connector.id);
      const parsed: ResidentAgentResult =
        binding?.enabled === true &&
        binding.configVersion === existing.invocation.connector.configVersion
          ? requestedResult
          : {
              contract: requestedResult.contract,
              invocationId: requestedResult.invocationId,
              status: "cancelled",
              failure:
                binding?.enabled === true
                  ? {
                      code: "connector_configuration_changed",
                      safeMessage:
                        "The room connector configuration changed before reply delivery.",
                      retryable: false,
                    }
                  : {
                      code: "connector_disabled",
                      safeMessage: "The room connector was disabled before reply delivery.",
                      retryable: false,
                    },
              completedAt: requestedResult.completedAt,
              adapter: requestedResult.adapter,
            };
      const state: InvocationState =
        parsed.status === "completed"
          ? "succeeded"
          : parsed.status === "unavailable"
            ? "unavailable"
            : "failed";
      const resultJson = canonicalJson(parsed);
      const resultHash = sha256Hex(resultJson);
      if (existing.result) {
        if (sha256Hex(canonicalJson(existing.result)) !== resultHash) {
          throw new ConnectorContractError(
            "result_idempotency_conflict",
            "Invocation already has a different result.",
          );
        }
        return existing;
      }
      const update = this.#database
        .prepare(
          `UPDATE invocations
           SET state = ?, result_json = ?, result_hash = ?, updated_at = ?
           WHERE invocation_id = ? AND state = 'running' AND claim_token = ?`,
        )
        .run(state, resultJson, resultHash, parsed.completedAt, invocationId, claimToken);
      if (Number(update.changes) !== 1) {
        throw new ConnectorContractError(
          "claim_lost",
          "Invocation claim no longer belongs to this worker.",
        );
      }
      const completed = this.getInvocation(invocationId);
      if (!completed)
        throw new ConnectorContractError("store_write_failed", "Result was not persisted.");
      return completed;
    });
  }

  recordDeliveryReceipt(input: {
    readonly invocationId: string;
    readonly replyMessageId: string;
    readonly occurredAt: string;
  }): DeliveryReceipt {
    const invocationId = assertNonEmptyString(input.invocationId, "receipt.invocationId", 64);
    const replyMessageId = assertNonEmptyString(input.replyMessageId, "receipt.replyMessageId");
    const occurredAt = assertIsoInstant(input.occurredAt, "receipt.occurredAt");
    return this.#transaction(() => {
      const invocation = this.getInvocation(invocationId);
      if (!invocation || invocation.state !== "succeeded" || !invocation.result?.replyMarkdown) {
        throw new ConnectorContractError(
          "reply_not_deliverable",
          "Only a succeeded reply may receive a receipt.",
        );
      }
      const binding = this.getBinding(invocation.invocation.connector.id);
      if (!binding)
        throw new ConnectorContractError("binding_not_found", "Connector binding was not found.");
      if (!binding.enabled) {
        throw new ConnectorContractError(
          "connector_disabled",
          "A disabled connector cannot record a reply receipt.",
        );
      }
      if (binding.configVersion !== invocation.invocation.connector.configVersion) {
        throw new ConnectorContractError(
          "connector_configuration_changed",
          "A reply from an earlier connector configuration cannot receive a receipt.",
        );
      }
      const receiptBase: Omit<DeliveryReceipt, "replayed"> = {
        invocationId,
        connectorId: binding.connectorId,
        roomId: binding.roomId,
        channelId: binding.channelId,
        inReplyToSourceId: invocation.invocation.sourceMention.sourceMessageId,
        replyMessageId,
        attributedAgentPrincipalId: binding.agentPrincipalId,
        occurredAt,
        traceId: invocation.invocation.trace.traceId,
      };
      const payloadHash = sha256Hex(receiptComparable(receiptBase));
      const existing = this.#database
        .prepare("SELECT * FROM delivery_receipts WHERE invocation_id = ?")
        .get(invocationId) as ReceiptRow | undefined;
      if (existing) {
        const existingBase: Omit<DeliveryReceipt, "replayed"> = {
          invocationId: existing.invocation_id,
          connectorId: existing.connector_id,
          roomId: existing.room_id,
          channelId: existing.channel_id,
          inReplyToSourceId: existing.in_reply_to_source_id,
          replyMessageId: existing.reply_message_id,
          attributedAgentPrincipalId: existing.attributed_agent_principal_id,
          occurredAt: existing.occurred_at,
          traceId: existing.trace_id,
        };
        if (sha256Hex(receiptComparable(existingBase)) !== payloadHash) {
          throw new ConnectorContractError(
            "delivery_idempotency_conflict",
            "Delivery receipt already differs.",
          );
        }
        return { ...existingBase, replayed: true };
      }
      this.#database
        .prepare(
          `INSERT INTO delivery_receipts (
            invocation_id, connector_id, room_id, channel_id, in_reply_to_source_id,
            reply_message_id, attributed_agent_principal_id, occurred_at, trace_id, payload_hash
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          receiptBase.invocationId,
          receiptBase.connectorId,
          receiptBase.roomId,
          receiptBase.channelId,
          receiptBase.inReplyToSourceId,
          receiptBase.replyMessageId,
          receiptBase.attributedAgentPrincipalId,
          receiptBase.occurredAt,
          receiptBase.traceId,
          payloadHash,
        );
      return { ...receiptBase, replayed: false };
    });
  }
}
