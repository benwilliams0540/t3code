import {
  type InboundChannelEvent,
  assertIsoInstant,
  assertNonEmptyString,
  isRecord,
} from "@t3tools/rooms-agent-connector";
import { normalizeRoomsOrigin } from "@t3tools/shared/roomsTransport";

export const ROOMS_DELIVERIES_CONTRACT = {
  id: "rooms.agent-deliveries",
  version: 1,
  schemaUri: "contracts/rooms/agent-deliveries/v1/schema.json",
  schemaSha256: "98f507c0d67ddecda9cafdbc19d9bf8b55649583cd95576a039d9ebd4d950258",
  producerSha: "4511c58419f0dde56d3149358af91fc2871816bc",
} as const;

export interface DeliveryBinding {
  readonly roomId: string;
  readonly agentPrincipalId: string;
  readonly hostMachinePrincipalId: string;
  readonly profile: "read_write";
}

export interface AgentDelivery {
  readonly sourceMessageId: string;
  readonly sourceSequence: number;
  readonly traceId: string;
  readonly roomId: string;
  readonly channelId: string;
  readonly author: {
    readonly principalId: string;
    readonly principalType: "human" | "agent";
    readonly displayName: string | null;
  };
  readonly mentionedAgent: boolean;
  readonly occurredAt: string;
  readonly bodyMarkdown: string;
  readonly attachments: readonly [];
  readonly links: readonly [];
}

export interface AgentDeliveryPage {
  readonly binding: DeliveryBinding;
  readonly page: {
    readonly afterSeq: number;
    readonly nextCursor: number;
    readonly sourceHeadSeq: number;
    readonly hasMore: boolean;
    readonly reason: "advanced" | "timeout";
  };
  readonly deliveries: readonly AgentDelivery[];
}

export class DeliveryClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;

  constructor(input: {
    readonly code: string;
    readonly status: number;
    readonly message: string;
    readonly retryable: boolean;
  }) {
    super(input.message);
    this.name = "DeliveryClientError";
    this.code = input.code;
    this.status = input.status;
    this.retryable = input.retryable;
  }
}

const drift = (label: string): never => {
  throw new DeliveryClientError({
    code: "delivery_contract_drift",
    status: 502,
    message: `Rooms delivery ${label} is invalid.`,
    retryable: false,
  });
};

const record = (value: unknown, label: string): Readonly<Record<string, unknown>> =>
  isRecord(value) ? value : drift(label);

const exact = (
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    drift(label);
  }
};

const text = (value: unknown, label: string, max = 512): string => {
  try {
    return assertNonEmptyString(value, label, max);
  } catch {
    return drift(label);
  }
};

const identifier = (value: unknown, label: string, pattern: RegExp): string => {
  const result = text(value, label, 128);
  return pattern.test(result) ? result : drift(label);
};

const instant = (value: unknown, label: string): string => {
  try {
    return assertIsoInstant(value, label);
  } catch {
    return drift(label);
  }
};

const integer = (value: unknown, label: string, minimum: number): number => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) return drift(label);
  return Number(value);
};

const emptyArray = (value: unknown, label: string): readonly [] => {
  if (!Array.isArray(value) || value.length !== 0) return drift(label);
  return [];
};

export const parseAgentDeliveryPage = (value: unknown): AgentDeliveryPage => {
  const root = record(value, "response");
  exact(root, ["contract", "binding", "page", "deliveries"], "response");
  const contract = record(root.contract, "contract");
  exact(contract, ["id", "version", "schema_uri"], "contract");
  if (
    contract.id !== ROOMS_DELIVERIES_CONTRACT.id ||
    contract.version !== ROOMS_DELIVERIES_CONTRACT.version ||
    contract.schema_uri !== ROOMS_DELIVERIES_CONTRACT.schemaUri
  ) {
    return drift("contract");
  }
  const bindingValue = record(root.binding, "binding");
  exact(
    bindingValue,
    ["room_id", "agent_principal_id", "host_machine_principal_id", "profile"],
    "binding",
  );
  if (bindingValue.profile !== "read_write") return drift("binding profile");
  const binding: DeliveryBinding = {
    roomId: identifier(bindingValue.room_id, "binding room ID", /^room:[0-9a-f-]{36}$/u),
    agentPrincipalId: identifier(
      bindingValue.agent_principal_id,
      "binding Agent ID",
      /^a:[0-9a-f-]{36}$/u,
    ),
    hostMachinePrincipalId: identifier(
      bindingValue.host_machine_principal_id,
      "binding machine ID",
      /^m:[0-9a-f-]{36}$/u,
    ),
    profile: "read_write",
  };
  const pageValue = record(root.page, "page");
  exact(pageValue, ["after_seq", "next_cursor", "source_head_seq", "has_more", "reason"], "page");
  const afterSeq = integer(pageValue.after_seq, "after sequence", 0);
  const nextCursor = integer(pageValue.next_cursor, "next cursor", 0);
  const sourceHeadSeq = integer(pageValue.source_head_seq, "source head", 0);
  if (
    nextCursor < afterSeq ||
    sourceHeadSeq < nextCursor ||
    typeof pageValue.has_more !== "boolean" ||
    (pageValue.reason !== "advanced" && pageValue.reason !== "timeout") ||
    pageValue.has_more !== nextCursor < sourceHeadSeq ||
    (pageValue.reason === "advanced" && nextCursor <= afterSeq) ||
    (pageValue.reason === "timeout" && nextCursor !== afterSeq)
  ) {
    return drift("page bounds");
  }
  if (!Array.isArray(root.deliveries) || root.deliveries.length > 100) {
    return drift("deliveries");
  }
  const deliveries = root.deliveries.map((item, index): AgentDelivery => {
    const delivery = record(item, `delivery ${index}`);
    exact(
      delivery,
      [
        "source_message_id",
        "source_sequence",
        "trace_id",
        "room_id",
        "channel_id",
        "author",
        "mentioned_agent",
        "occurred_at",
        "body_markdown",
        "attachments",
        "links",
      ],
      `delivery ${index}`,
    );
    const authorValue = record(delivery.author, `delivery ${index} author`);
    exact(
      authorValue,
      ["principal_id", "principal_type", "display_name"],
      `delivery ${index} author`,
    );
    if (authorValue.principal_type !== "human" && authorValue.principal_type !== "agent") {
      return drift(`delivery ${index} author type`);
    }
    if (
      authorValue.display_name !== null &&
      (typeof authorValue.display_name !== "string" ||
        authorValue.display_name.length === 0 ||
        authorValue.display_name.length > 100)
    ) {
      return drift(`delivery ${index} display name`);
    }
    if (typeof delivery.mentioned_agent !== "boolean") {
      return drift(`delivery ${index} mention flag`);
    }
    const sourceSequence = integer(delivery.source_sequence, `delivery ${index} sequence`, 1);
    const sourceMessageId = identifier(
      delivery.source_message_id,
      `delivery ${index} source ID`,
      /^[0-9a-f-]{36}$/u,
    );
    const roomId = identifier(
      delivery.room_id,
      `delivery ${index} room ID`,
      /^room:[0-9a-f-]{36}$/u,
    );
    if (
      sourceSequence <= afterSeq ||
      sourceSequence > nextCursor ||
      roomId !== binding.roomId ||
      delivery.trace_id !== `rooms-message:${sourceMessageId}`
    ) {
      return drift(`delivery ${index} source bounds`);
    }
    return {
      sourceMessageId,
      sourceSequence,
      traceId: text(delivery.trace_id, `delivery ${index} trace ID`, 128),
      roomId,
      channelId: identifier(
        delivery.channel_id,
        `delivery ${index} channel ID`,
        /^channel:[0-9a-f-]{36}$/u,
      ),
      author: {
        principalId: identifier(
          authorValue.principal_id,
          `delivery ${index} author ID`,
          authorValue.principal_type === "human" ? /^h:[0-9a-f-]{36}$/u : /^a:[0-9a-f-]{36}$/u,
        ),
        principalType: authorValue.principal_type,
        displayName: authorValue.display_name,
      },
      mentionedAgent: delivery.mentioned_agent,
      occurredAt: instant(delivery.occurred_at, `delivery ${index} occurred at`),
      bodyMarkdown: text(delivery.body_markdown, `delivery ${index} body`, 10_000),
      attachments: emptyArray(delivery.attachments, `delivery ${index} attachments`),
      links: emptyArray(delivery.links, `delivery ${index} links`),
    };
  });
  for (let index = 1; index < deliveries.length; index += 1) {
    if (deliveries[index]!.sourceSequence <= deliveries[index - 1]!.sourceSequence) {
      return drift("delivery ordering");
    }
  }
  if (
    deliveries.some(
      (delivery) => delivery.author.principalType === "agent" && delivery.mentionedAgent,
    )
  ) {
    return drift("Agent mention flag");
  }
  return {
    binding,
    page: {
      afterSeq,
      nextCursor,
      sourceHeadSeq,
      hasMore: pageValue.has_more,
      reason: pageValue.reason,
    },
    deliveries,
  };
};

export const toInboundEvent = (
  delivery: AgentDelivery,
  connectorId: string,
): InboundChannelEvent => ({
  contract: { id: "rooms.resident-agent-inbound", version: 1 },
  connectorId,
  roomId: delivery.roomId,
  channelId: delivery.channelId,
  sourceMessageId: delivery.sourceMessageId,
  sourceSequence: delivery.sourceSequence,
  authorPrincipalId: delivery.author.principalId,
  mentioned: delivery.mentionedAgent,
  bodyMarkdown: delivery.bodyMarkdown,
  attachments: delivery.attachments,
  links: delivery.links,
  occurredAt: delivery.occurredAt,
  traceId: delivery.traceId,
});

export class AgentDeliveryHttpClient {
  readonly #baseUrl: string;
  readonly #bearer: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(input: {
    readonly baseUrl: string;
    readonly bearerToken: string;
    readonly fetch?: typeof globalThis.fetch;
  }) {
    const baseUrl = normalizeRoomsOrigin("shared", input.baseUrl);
    if (baseUrl === null) {
      throw new DeliveryClientError({
        code: "delivery_origin_required",
        status: 400,
        message: "Rooms delivery accepts only credential-free HTTPS or HTTP loopback origins.",
        retryable: false,
      });
    }
    this.#baseUrl = baseUrl;
    this.#bearer = input.bearerToken;
    this.#fetch = input.fetch ?? globalThis.fetch;
  }

  async wait(
    afterSeq: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<AgentDeliveryPage> {
    const url = new URL(`${this.#baseUrl}/agent/v1/deliveries`);
    url.searchParams.set("after_seq", String(afterSeq));
    url.searchParams.set("timeout_ms", String(timeoutMs));
    let response: Response;
    try {
      response = await this.#fetch(url, {
        method: "GET",
        redirect: "error",
        headers: { accept: "application/json", authorization: `Bearer ${this.#bearer}` },
        ...(signal ? { signal } : {}),
      });
    } catch {
      if (signal?.aborted) {
        throw new DeliveryClientError({
          code: "delivery_cancelled",
          status: 499,
          message: "Rooms delivery wait was cancelled.",
          retryable: false,
        });
      }
      throw new DeliveryClientError({
        code: "delivery_unavailable",
        status: 503,
        message: "Rooms delivery feed is unavailable.",
        retryable: true,
      });
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DeliveryClientError({
        code: "delivery_response_invalid",
        status: 502,
        message: "Rooms delivery feed returned invalid JSON.",
        retryable: false,
      });
    }
    if (!response.ok) {
      const server = isRecord(body) ? body : {};
      const code = typeof server.error === "string" ? server.error : "delivery_request_failed";
      const retryable = response.status >= 500 || response.status === 401;
      throw new DeliveryClientError({
        code,
        status: response.status,
        message: "Rooms delivery feed rejected the request.",
        retryable,
      });
    }
    return parseAgentDeliveryPage(body);
  }
}
