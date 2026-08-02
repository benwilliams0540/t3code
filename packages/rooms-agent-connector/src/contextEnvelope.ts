import {
  assertExactKeys,
  assertIsoInstant,
  assertNonEmptyString,
  ConnectorContractError,
  CONTEXT_LIMITS,
  RESIDENT_AGENT_CAPABILITIES,
  RESIDENT_AGENT_CONTRACT_VERSION,
  RESIDENT_AGENT_INVOCATION_CONTRACT,
  isRecord,
  type ConnectorBinding,
  type ContextCandidateMessage,
  type InboundChannelEvent,
  type ResidentAgentContextMessage,
  type ResidentAgentInvocation,
  type SanitizedAttachmentMetadata,
  type SanitizedLinkMetadata,
} from "./contracts.ts";
import { deriveInvocationId } from "./invocationId.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MEDIA_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/;

function utf8Bytes(value: string): number {
  return encoder.encode(value).byteLength;
}

function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = encoder.encode(value);
  if (bytes.byteLength <= maxBytes) return value;
  let end = maxBytes;
  while (end > 0 && (bytes[end] ?? 0) >= 0x80 && (bytes[end] ?? 0) < 0xc0) end -= 1;
  return decoder.decode(bytes.subarray(0, end));
}

function sanitizeFilename(value: string): string {
  const basename = value.split(/[\\/]/).at(-1) ?? "attachment";
  const cleaned = [...basename]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join("")
    .trim();
  return truncateUtf8(cleaned || "attachment", 255);
}

export function sanitizeAttachment(
  attachment: SanitizedAttachmentMetadata,
): SanitizedAttachmentMetadata {
  const filename = sanitizeFilename(
    assertNonEmptyString(attachment.filename, "attachment.filename", 1_024),
  );
  const mediaType = assertNonEmptyString(
    attachment.mediaType,
    "attachment.mediaType",
    127,
  ).toLowerCase();
  if (!MEDIA_TYPE_PATTERN.test(mediaType)) {
    throw new ConnectorContractError("invalid_attachment", "Attachment media type is invalid.");
  }
  if (!Number.isSafeInteger(attachment.bytes) || attachment.bytes < 0) {
    throw new ConnectorContractError("invalid_attachment", "Attachment size is invalid.");
  }
  const sha256 = assertNonEmptyString(attachment.sha256, "attachment.sha256", 64).toLowerCase();
  if (!SHA256_PATTERN.test(sha256)) {
    throw new ConnectorContractError("invalid_attachment", "Attachment hash is invalid.");
  }
  return { filename, mediaType, bytes: attachment.bytes, sha256 };
}

export function sanitizeLink(link: SanitizedLinkMetadata): SanitizedLinkMetadata {
  const rawUrl = assertNonEmptyString(link.url, "link.url", 2_048);
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ConnectorContractError("invalid_link", "Link URL is invalid.");
  }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") {
    throw new ConnectorContractError(
      "invalid_link",
      "Only credential-free HTTPS links are allowed.",
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  const localOrLiteralHost =
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname.includes(":");
  if (localOrLiteralHost) {
    throw new ConnectorContractError(
      "invalid_link",
      "Local and literal-address link metadata is not allowed.",
    );
  }
  const sanitizedUrl = `${parsed.origin}${parsed.pathname}`;
  const label =
    link.label === undefined
      ? undefined
      : truncateUtf8(assertNonEmptyString(link.label, "link.label", 1_024).trim(), 256);
  return { url: sanitizedUrl, ...(label ? { label } : {}) };
}

function sanitizeMetadata<T>(
  values: readonly T[],
  max: number,
  sanitize: (value: T) => T,
  label: string,
): readonly T[] {
  if (!Array.isArray(values)) {
    throw new ConnectorContractError("invalid_metadata", `${label} must be an array.`);
  }
  if (values.length > max) {
    throw new ConnectorContractError(
      "context_limit_exceeded",
      `${label} exceeds the contract limit.`,
    );
  }
  return values.map(sanitize);
}

export function sanitizeInboundEvent(event: InboundChannelEvent): InboundChannelEvent {
  if (!isRecord(event) || !isRecord(event.contract)) {
    throw new ConnectorContractError("invalid_inbound_event", "Inbound event must be an object.");
  }
  assertExactKeys(
    event,
    [
      "contract",
      "connectorId",
      "roomId",
      "channelId",
      "sourceMessageId",
      "sourceSequence",
      "authorPrincipalId",
      "mentioned",
      "bodyMarkdown",
      "attachments",
      "links",
      "occurredAt",
      "traceId",
    ],
    "event",
  );
  assertExactKeys(event.contract, ["id", "version"], "event.contract");
  if (event.contract.id !== "rooms.resident-agent-inbound" || event.contract.version !== 1) {
    throw new ConnectorContractError(
      "unsupported_inbound_contract",
      "Unsupported inbound contract.",
    );
  }
  if (!Number.isSafeInteger(event.sourceSequence) || event.sourceSequence < 0) {
    throw new ConnectorContractError(
      "invalid_inbound_event",
      "Source sequence must be non-negative.",
    );
  }
  if (typeof event.mentioned !== "boolean") {
    throw new ConnectorContractError("invalid_inbound_event", "Mention flag must be boolean.");
  }
  if (typeof event.bodyMarkdown !== "string") {
    throw new ConnectorContractError("invalid_inbound_event", "Message body must be a string.");
  }
  if (!Array.isArray(event.attachments) || !Array.isArray(event.links)) {
    throw new ConnectorContractError(
      "invalid_inbound_event",
      "Attachment and link metadata must be arrays.",
    );
  }
  return {
    contract: { id: "rooms.resident-agent-inbound", version: 1 },
    connectorId: assertNonEmptyString(event.connectorId, "event.connectorId"),
    roomId: assertNonEmptyString(event.roomId, "event.roomId"),
    channelId: assertNonEmptyString(event.channelId, "event.channelId"),
    sourceMessageId: assertNonEmptyString(event.sourceMessageId, "event.sourceMessageId"),
    sourceSequence: event.sourceSequence,
    authorPrincipalId: assertNonEmptyString(event.authorPrincipalId, "event.authorPrincipalId"),
    mentioned: event.mentioned,
    bodyMarkdown: truncateUtf8(event.bodyMarkdown, CONTEXT_LIMITS.maxMessageBytes),
    attachments: sanitizeMetadata(
      event.attachments,
      CONTEXT_LIMITS.maxAttachmentsPerMessage,
      sanitizeAttachment,
      "event.attachments",
    ),
    links: sanitizeMetadata(
      event.links,
      CONTEXT_LIMITS.maxLinksPerMessage,
      sanitizeLink,
      "event.links",
    ),
    occurredAt: assertIsoInstant(event.occurredAt, "event.occurredAt"),
    traceId: assertNonEmptyString(event.traceId, "event.traceId", 128),
  };
}

function sanitizeCandidate(message: ContextCandidateMessage): ResidentAgentContextMessage {
  if (!Number.isSafeInteger(message.sequence) || message.sequence < 0) {
    throw new ConnectorContractError("invalid_context", "Context sequence must be non-negative.");
  }
  if (typeof message.bodyMarkdown !== "string") {
    throw new ConnectorContractError("invalid_context", "Context body must be a string.");
  }
  return {
    sourceMessageId: assertNonEmptyString(message.sourceMessageId, "context.sourceMessageId"),
    sequence: message.sequence,
    authorPrincipalId: assertNonEmptyString(message.authorPrincipalId, "context.authorPrincipalId"),
    bodyMarkdown: truncateUtf8(message.bodyMarkdown, CONTEXT_LIMITS.maxMessageBytes),
    attachments: sanitizeMetadata(
      message.attachments ?? [],
      CONTEXT_LIMITS.maxAttachmentsPerMessage,
      sanitizeAttachment,
      "context.attachments",
    ),
    links: sanitizeMetadata(
      message.links ?? [],
      CONTEXT_LIMITS.maxLinksPerMessage,
      sanitizeLink,
      "context.links",
    ),
    occurredAt: assertIsoInstant(message.occurredAt, "context.occurredAt"),
  };
}

export function buildResidentAgentInvocation(input: {
  readonly binding: ConnectorBinding;
  readonly event: InboundChannelEvent;
  readonly candidates: readonly ContextCandidateMessage[];
  readonly createdAt: string;
  readonly deadline: string;
  readonly attempt?: number;
}): ResidentAgentInvocation {
  const event = sanitizeInboundEvent(input.event);
  if (
    event.connectorId !== input.binding.connectorId ||
    event.roomId !== input.binding.roomId ||
    event.channelId !== input.binding.channelId
  ) {
    throw new ConnectorContractError(
      "binding_scope_mismatch",
      "Inbound event is outside the connector binding.",
    );
  }
  if (!event.mentioned) {
    throw new ConnectorContractError(
      "mention_required",
      "Invocation requires a structured mention.",
    );
  }
  if (!event.authorPrincipalId.startsWith("h:")) {
    throw new ConnectorContractError(
      "human_author_required",
      "Only a human-authored mention may invoke the connector.",
    );
  }
  const bySourceId = new Map<string, ResidentAgentContextMessage>();
  for (const candidate of input.candidates) {
    if (
      candidate.roomId !== input.binding.roomId ||
      candidate.channelId !== input.binding.channelId ||
      candidate.sequence > event.sourceSequence
    ) {
      continue;
    }
    bySourceId.set(candidate.sourceMessageId, sanitizeCandidate(candidate));
  }
  bySourceId.set(event.sourceMessageId, {
    sourceMessageId: event.sourceMessageId,
    sequence: event.sourceSequence,
    authorPrincipalId: event.authorPrincipalId,
    bodyMarkdown: event.bodyMarkdown,
    attachments: event.attachments,
    links: event.links,
    occurredAt: event.occurredAt,
  });
  const ordered = [...bySourceId.values()].sort(
    (left, right) =>
      left.sequence - right.sequence || left.sourceMessageId.localeCompare(right.sourceMessageId),
  );
  const sourceMessage = bySourceId.get(event.sourceMessageId);
  if (!sourceMessage) {
    throw new ConnectorContractError("source_context_missing", "Source mention is missing.");
  }
  const selected = [
    ...ordered
      .filter((message) => message.sourceMessageId !== event.sourceMessageId)
      .slice(-(CONTEXT_LIMITS.maxMessages - 1)),
    sourceMessage,
  ].sort(
    (left, right) =>
      left.sequence - right.sequence || left.sourceMessageId.localeCompare(right.sourceMessageId),
  );
  let totalBytes = selected.reduce((total, message) => total + utf8Bytes(message.bodyMarkdown), 0);
  while (selected.length > 1 && totalBytes > CONTEXT_LIMITS.maxTextBytes) {
    const removableIndex = selected.findIndex(
      (message) => message.sourceMessageId !== event.sourceMessageId,
    );
    if (removableIndex < 0) break;
    const [removed] = selected.splice(removableIndex, 1);
    if (removed) totalBytes -= utf8Bytes(removed.bodyMarkdown);
  }
  const sourceIndex = selected.findIndex(
    (message) => message.sourceMessageId === event.sourceMessageId,
  );
  if (sourceIndex < 0) {
    throw new ConnectorContractError(
      "source_context_missing",
      "Bounded context dropped the source mention.",
    );
  }
  const omittedMessageCount = ordered.length - selected.length;
  const createdAt = assertIsoInstant(input.createdAt, "invocation.createdAt");
  const deadline = assertIsoInstant(input.deadline, "invocation.deadline");
  if (Date.parse(deadline) <= Date.parse(createdAt)) {
    throw new ConnectorContractError(
      "invalid_deadline",
      "Invocation deadline must follow creation time.",
    );
  }
  return {
    contract: {
      id: RESIDENT_AGENT_INVOCATION_CONTRACT,
      version: RESIDENT_AGENT_CONTRACT_VERSION,
    },
    connector: {
      id: input.binding.connectorId,
      version: input.binding.connectorVersion,
      target: {
        hostId: input.binding.openClawHostId,
        agentId: input.binding.openClawAgentId,
      },
    },
    invocationId: deriveInvocationId(input.binding.connectorId, event.sourceMessageId),
    roomId: input.binding.roomId,
    channelId: input.binding.channelId,
    sourceMention: {
      sourceMessageId: event.sourceMessageId,
      sourceSequence: event.sourceSequence,
      requestingHumanPrincipalId: event.authorPrincipalId,
    },
    context: {
      messages: selected,
      truncated: omittedMessageCount > 0,
      omittedMessageCount,
      limits: CONTEXT_LIMITS,
    },
    capabilities: RESIDENT_AGENT_CAPABILITIES,
    createdAt,
    deadline,
    trace: { traceId: event.traceId, attempt: input.attempt ?? 1 },
  };
}
