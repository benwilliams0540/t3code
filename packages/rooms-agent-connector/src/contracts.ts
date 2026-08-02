// @effect-diagnostics globalDate:off - This transport contract is a standalone Node boundary, not an Effect runtime.
export const RESIDENT_AGENT_INVOCATION_CONTRACT = "rooms.resident-agent-invocation" as const;
export const RESIDENT_AGENT_RESULT_CONTRACT = "rooms.resident-agent-result" as const;
export const RESIDENT_AGENT_CONTRACT_VERSION = 1 as const;

export const RESIDENT_AGENT_CAPABILITIES = ["channel.read", "message.send"] as const;
export type ResidentAgentCapability = (typeof RESIDENT_AGENT_CAPABILITIES)[number];

export const CONTEXT_LIMITS = Object.freeze({
  maxMessages: 20,
  maxMessageBytes: 4_096,
  maxTextBytes: 24_576,
  maxAttachmentsPerMessage: 8,
  maxLinksPerMessage: 8,
  maxReplyBytes: 16_384,
});

export type InvocationState = "pending" | "running" | "succeeded" | "failed" | "unavailable";

export type ResidentAgentResultStatus =
  | "completed"
  | "failed"
  | "unavailable"
  | "cancelled"
  | "timed_out";

export interface ConnectorBinding {
  readonly connectorId: string;
  readonly connectorVersion: number;
  readonly roomId: string;
  readonly channelId: string;
  readonly agentPrincipalId: string;
  readonly openClawHostId: string;
  readonly openClawAgentId: string;
  readonly enabled: boolean;
  readonly configVersion: number;
}

export interface SanitizedAttachmentMetadata {
  readonly filename: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface SanitizedLinkMetadata {
  readonly url: string;
  readonly label?: string;
}

export interface InboundChannelEvent {
  readonly contract: {
    readonly id: "rooms.resident-agent-inbound";
    readonly version: 1;
  };
  readonly connectorId: string;
  readonly roomId: string;
  readonly channelId: string;
  readonly sourceMessageId: string;
  readonly sourceSequence: number;
  readonly authorPrincipalId: string;
  readonly mentioned: boolean;
  readonly bodyMarkdown: string;
  readonly attachments: readonly SanitizedAttachmentMetadata[];
  readonly links: readonly SanitizedLinkMetadata[];
  readonly occurredAt: string;
  readonly traceId: string;
}

export interface ContextCandidateMessage {
  readonly roomId: string;
  readonly channelId: string;
  readonly sourceMessageId: string;
  readonly sequence: number;
  readonly authorPrincipalId: string;
  readonly bodyMarkdown: string;
  readonly attachments?: readonly SanitizedAttachmentMetadata[];
  readonly links?: readonly SanitizedLinkMetadata[];
  readonly occurredAt: string;
}

export interface ResidentAgentContextMessage {
  readonly sourceMessageId: string;
  readonly sequence: number;
  readonly authorPrincipalId: string;
  readonly bodyMarkdown: string;
  readonly attachments: readonly SanitizedAttachmentMetadata[];
  readonly links: readonly SanitizedLinkMetadata[];
  readonly occurredAt: string;
}

export interface ResidentAgentInvocation {
  readonly contract: {
    readonly id: typeof RESIDENT_AGENT_INVOCATION_CONTRACT;
    readonly version: typeof RESIDENT_AGENT_CONTRACT_VERSION;
  };
  readonly connector: {
    readonly id: string;
    readonly version: number;
    readonly target: {
      readonly hostId: string;
      readonly agentId: string;
    };
  };
  readonly invocationId: string;
  readonly roomId: string;
  readonly channelId: string;
  readonly sourceMention: {
    readonly sourceMessageId: string;
    readonly sourceSequence: number;
    readonly requestingHumanPrincipalId: string;
  };
  readonly context: {
    readonly messages: readonly ResidentAgentContextMessage[];
    readonly truncated: boolean;
    readonly omittedMessageCount: number;
    readonly limits: typeof CONTEXT_LIMITS;
  };
  readonly capabilities: typeof RESIDENT_AGENT_CAPABILITIES;
  readonly createdAt: string;
  readonly deadline: string;
  readonly trace: {
    readonly traceId: string;
    readonly attempt: number;
  };
}

export interface ResidentAgentFailure {
  readonly code: string;
  readonly safeMessage: string;
  readonly retryable: boolean;
}

export interface ResidentAgentResult {
  readonly contract: {
    readonly id: typeof RESIDENT_AGENT_RESULT_CONTRACT;
    readonly version: typeof RESIDENT_AGENT_CONTRACT_VERSION;
  };
  readonly invocationId: string;
  readonly status: ResidentAgentResultStatus;
  readonly replyMarkdown?: string;
  readonly failure?: ResidentAgentFailure;
  readonly completedAt: string;
  readonly adapter: {
    readonly connectorId: string;
    readonly connectorVersion: number;
    readonly agentVersion?: string;
  };
}

export interface DeliveryReceipt {
  readonly invocationId: string;
  readonly connectorId: string;
  readonly roomId: string;
  readonly channelId: string;
  readonly inReplyToSourceId: string;
  readonly replyMessageId: string;
  readonly attributedAgentPrincipalId: string;
  readonly occurredAt: string;
  readonly traceId: string;
  readonly replayed: boolean;
}

export interface InvocationRecord {
  readonly invocation: ResidentAgentInvocation;
  readonly state: InvocationState;
  readonly attempt: number;
  readonly claimToken: string | null;
  readonly gatewayRunId: string | null;
  readonly claimedAt: string | null;
  readonly leaseExpiresAt: string | null;
  readonly result: ResidentAgentResult | null;
}

export type ConnectorHandlingOutcome =
  | { readonly kind: "recorded_non_mention" }
  | { readonly kind: "ignored_non_human_author" }
  | { readonly kind: "disabled" }
  | { readonly kind: "already_running"; readonly invocationId: string }
  | { readonly kind: "terminal"; readonly result: ResidentAgentResult }
  | { readonly kind: "completed"; readonly result: ResidentAgentResult };

export class ConnectorContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ConnectorContractError";
    this.code = code;
  }
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new ConnectorContractError(
      "unexpected_contract_field",
      `${label} contains unexpected field ${unexpected[0]}.`,
    );
  }
}

export function assertNonEmptyString(value: unknown, label: string, maxLength = 512): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new ConnectorContractError("invalid_contract", `${label} must be a bounded string.`);
  }
  return value;
}

export function assertIsoInstant(value: unknown, label: string): string {
  const text = assertNonEmptyString(value, label, 64);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== text) {
    throw new ConnectorContractError("invalid_contract", `${label} must be an ISO-8601 instant.`);
  }
  return text;
}

export function parseResidentAgentResult(value: unknown): ResidentAgentResult {
  if (!isRecord(value)) {
    throw new ConnectorContractError("invalid_result", "Result must be an object.");
  }
  assertExactKeys(
    value,
    ["contract", "invocationId", "status", "replyMarkdown", "failure", "completedAt", "adapter"],
    "result",
  );
  if (!isRecord(value.contract)) {
    throw new ConnectorContractError("invalid_result", "Result contract is required.");
  }
  assertExactKeys(value.contract, ["id", "version"], "result.contract");
  if (
    value.contract.id !== RESIDENT_AGENT_RESULT_CONTRACT ||
    value.contract.version !== RESIDENT_AGENT_CONTRACT_VERSION
  ) {
    throw new ConnectorContractError("unsupported_result_contract", "Unsupported result contract.");
  }
  const invocationId = assertNonEmptyString(value.invocationId, "result.invocationId", 64);
  const allowedStatuses: readonly ResidentAgentResultStatus[] = [
    "completed",
    "failed",
    "unavailable",
    "cancelled",
    "timed_out",
  ];
  if (!allowedStatuses.includes(value.status as ResidentAgentResultStatus)) {
    throw new ConnectorContractError("invalid_result", "Result status is invalid.");
  }
  const status = value.status as ResidentAgentResultStatus;
  const replyMarkdown =
    value.replyMarkdown === undefined
      ? undefined
      : assertNonEmptyString(
          value.replyMarkdown,
          "result.replyMarkdown",
          CONTEXT_LIMITS.maxReplyBytes,
        );
  if (
    replyMarkdown !== undefined &&
    new TextEncoder().encode(replyMarkdown).byteLength > CONTEXT_LIMITS.maxReplyBytes
  ) {
    throw new ConnectorContractError(
      "invalid_result",
      "Result reply exceeds the UTF-8 byte limit.",
    );
  }
  if (status !== "completed" && replyMarkdown !== undefined) {
    throw new ConnectorContractError(
      "invalid_result",
      "Only completed results may contain a reply.",
    );
  }
  if (status === "completed" && replyMarkdown === undefined) {
    throw new ConnectorContractError("invalid_result", "Completed results require one reply.");
  }
  if (!isRecord(value.adapter)) {
    throw new ConnectorContractError("invalid_result", "Result adapter metadata is required.");
  }
  assertExactKeys(
    value.adapter,
    ["connectorId", "connectorVersion", "agentVersion"],
    "result.adapter",
  );
  const connectorId = assertNonEmptyString(value.adapter.connectorId, "result.adapter.connectorId");
  if (
    !Number.isSafeInteger(value.adapter.connectorVersion) ||
    Number(value.adapter.connectorVersion) < 1
  ) {
    throw new ConnectorContractError(
      "invalid_result",
      "Connector version must be a positive integer.",
    );
  }
  const agentVersion =
    value.adapter.agentVersion === undefined
      ? undefined
      : assertNonEmptyString(value.adapter.agentVersion, "result.adapter.agentVersion", 128);
  let failure: ResidentAgentFailure | undefined;
  if (value.failure !== undefined) {
    if (!isRecord(value.failure)) {
      throw new ConnectorContractError("invalid_result", "Failure must be an object.");
    }
    assertExactKeys(value.failure, ["code", "safeMessage", "retryable"], "result.failure");
    if (typeof value.failure.retryable !== "boolean") {
      throw new ConnectorContractError("invalid_result", "Failure retryable must be boolean.");
    }
    failure = {
      code: assertNonEmptyString(value.failure.code, "result.failure.code", 128),
      safeMessage: assertNonEmptyString(
        value.failure.safeMessage,
        "result.failure.safeMessage",
        512,
      ),
      retryable: value.failure.retryable,
    };
  }
  if (status === "completed" && failure !== undefined) {
    throw new ConnectorContractError(
      "invalid_result",
      "Completed results cannot contain failure data.",
    );
  }
  if (status !== "completed" && failure === undefined) {
    throw new ConnectorContractError(
      "invalid_result",
      "Non-completed results require failure data.",
    );
  }
  return {
    contract: {
      id: RESIDENT_AGENT_RESULT_CONTRACT,
      version: RESIDENT_AGENT_CONTRACT_VERSION,
    },
    invocationId,
    status,
    ...(replyMarkdown === undefined ? {} : { replyMarkdown }),
    ...(failure === undefined ? {} : { failure }),
    completedAt: assertIsoInstant(value.completedAt, "result.completedAt"),
    adapter: {
      connectorId,
      connectorVersion: Number(value.adapter.connectorVersion),
      ...(agentVersion === undefined ? {} : { agentVersion }),
    },
  };
}
