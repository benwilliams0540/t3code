// @effect-diagnostics globalFetch:off globalTimers:off globalDate:off - Promise adapter for the shared Promise-based Rooms conversation client.
import {
  createRoomsConversationClient,
  type RoomsConversationClient,
} from "@t3tools/client-runtime/rooms/conversation-client";
import {
  RoomsHumanFeed,
  type RoomsConversationProjection,
  type RoomsHumanFeedItem,
} from "@t3tools/client-runtime/rooms/human-wire";
import { resolveRoomsHumanRequestUrl } from "@t3tools/shared/roomsTransport";
import * as Schema from "effect/Schema";

import { createUuidV7, UUID_V7_PATTERN } from "./uuidV7.ts";

/** A Rooms failure safe to show the model: server code and message, never the token. */
export class RoomsHumanRequestError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  constructor(code: string, message: string, status: number, retryable = false) {
    super(message);
    this.name = "RoomsHumanRequestError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const RoomsSession = Schema.Struct({
  status: Schema.String,
  principal: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      type: Schema.String,
      display_name: Schema.NullOr(Schema.String),
    }),
  ),
  rooms: Schema.Array(
    Schema.Struct({ id: Schema.String, name: Schema.String, role: Schema.String }),
  ),
});
export type RoomsSession = typeof RoomsSession.Type;

const RoomsWorkspace = Schema.Struct({
  room: Schema.Struct({ id: Schema.String, name: Schema.String }),
  principal: Schema.Struct({ id: Schema.String, display_name: Schema.NullOr(Schema.String) }),
  principals: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      type: Schema.String,
      display_name: Schema.NullOr(Schema.String),
    }),
  ),
  channels: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      purpose: Schema.optional(Schema.NullOr(Schema.String)),
    }),
  ),
});
export type RoomsWorkspace = typeof RoomsWorkspace.Type;

const ErrorBody = Schema.Struct({ error: Schema.String, message: Schema.optional(Schema.String) });
const decodeErrorBody = Schema.decodeUnknownOption(ErrorBody);

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export interface RoomsHumanClientOptions {
  readonly baseUrl: string;
  readonly token: string;
  readonly fetch?: Fetch;
  readonly newRequestId?: () => string;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

/** One turn of an agent on a posted message, as the human feed reports it. */
export interface AgentTurnOutcome {
  readonly state: "replied" | "failed" | "running" | "no_turn_yet";
  readonly invocation_id: string | null;
  readonly turn_state: string | null;
  readonly safe_error_code: string | null;
  readonly reply: {
    readonly seq: number;
    readonly author: string;
    readonly body_markdown: string;
  } | null;
}

export interface SimplifiedItem {
  readonly seq: number;
  readonly occurred_at: string;
  readonly kind: string;
  readonly author_principal_id: string;
  readonly author: string;
  readonly body_markdown?: string;
  readonly invocation?: {
    readonly id: string;
    readonly status: string;
    readonly triggering_seq: number;
    readonly reply_seq: number | null;
    readonly safe_error_code: string | null;
  };
}

export function simplifyItem(
  item: RoomsHumanFeedItem,
  names: ReadonlyMap<string, string>,
): SimplifiedItem {
  const actor = item.attribution.actor_principal_id;
  const base = {
    seq: item.source_event.seq,
    occurred_at: item.occurred_at,
    kind: item.kind,
    author_principal_id: actor,
    author: names.get(actor) ?? actor,
  };
  if (item.kind === "human_message") return { ...base, body_markdown: item.payload.body_markdown };
  if (item.kind === "agent_invocation_update")
    return {
      ...base,
      invocation: {
        id: item.payload.invocation_id,
        status: item.payload.status,
        triggering_seq: item.payload.triggering_message.seq,
        reply_seq: item.payload.reply_source_event?.seq ?? null,
        safe_error_code: item.payload.safe_error_code,
      },
    };
  return base;
}

/**
 * Reduces feed items after a posted message to the agent's turn on it. The last
 * update for the newest invocation triggered by that message wins.
 */
export function agentTurnOutcome(
  messageSeq: number,
  items: readonly RoomsHumanFeedItem[],
  projection: RoomsConversationProjection | null,
  names: ReadonlyMap<string, string>,
): AgentTurnOutcome {
  let update: Extract<RoomsHumanFeedItem, { kind: "agent_invocation_update" }> | null = null;
  for (const item of items) {
    if (
      item.kind === "agent_invocation_update" &&
      item.payload.triggering_message.seq === messageSeq
    )
      update = item;
  }
  const turn =
    projection?.invocations.findLast((candidate) => candidate.context.cutoff_seq === messageSeq) ??
    null;
  const invocationId = update?.payload.invocation_id ?? turn?.id ?? null;
  const turnState = turn?.turn_state ?? null;
  if (!update && !turn)
    return {
      state: "no_turn_yet",
      invocation_id: null,
      turn_state: null,
      safe_error_code: null,
      reply: null,
    };
  const status = update?.payload.status ?? turn?.status ?? "running";
  if (status === "succeeded") {
    // The success update can land before the one naming the reply; the turn's
    // outbox records the reply seq once the result is durable.
    const replySeq = update?.payload.reply_source_event?.seq ?? outboxReplySeq(turn?.outbox);
    const replyItem = items.find(
      (item) => item.kind === "human_message" && item.source_event.seq === replySeq,
    );
    const reply =
      replyItem && replyItem.kind === "human_message"
        ? {
            seq: replyItem.source_event.seq,
            author:
              names.get(replyItem.attribution.actor_principal_id) ??
              replyItem.attribution.actor_principal_id,
            body_markdown: replyItem.payload.body_markdown,
          }
        : null;
    // A success whose reply is not yet visible, or whose turn is not terminal, is still settling.
    if (reply === null && (replySeq !== undefined || turnState !== "terminal"))
      return {
        state: "running",
        invocation_id: invocationId,
        turn_state: turnState,
        safe_error_code: null,
        reply: null,
      };
    return {
      state: "replied",
      invocation_id: invocationId,
      turn_state: turnState,
      safe_error_code: null,
      reply,
    };
  }
  if (status === "failed")
    return {
      state: "failed",
      invocation_id: invocationId,
      turn_state: turnState,
      safe_error_code: update?.payload.safe_error_code ?? null,
      reply: null,
    };
  return {
    state: "running",
    invocation_id: invocationId,
    turn_state: turnState,
    safe_error_code: null,
    reply: null,
  };
}

function outboxReplySeq(outbox: unknown): number | undefined {
  if (typeof outbox !== "object" || outbox === null) return undefined;
  const value = (outbox as { readonly reply_event_seq?: unknown }).reply_event_seq;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

const FEED_PAGE = 100;
const MAX_PAGES = 20;

export function createRoomsHumanClient(options: RoomsHumanClientOptions) {
  const doFetch: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const newRequestId = options.newRequestId ?? (() => createUuidV7());
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;

  async function request<T>(
    path: string,
    method: "GET" | "POST",
    decode: (input: unknown) => T,
    body?: Readonly<Record<string, unknown>>,
  ): Promise<T> {
    // The shared transport policy pins the origin and the exact Human route list.
    const url = resolveRoomsHumanRequestUrl({
      baseUrl: options.baseUrl,
      path,
      method,
      bearer: options.token,
    });
    let response: Response;
    try {
      response = await doFetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: "error",
      });
    } catch {
      throw new RoomsHumanRequestError(
        "rooms_unreachable",
        "The Rooms server could not be reached.",
        503,
        true,
      );
    }
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text === "" ? null : JSON.parse(text);
    } catch {
      json = null;
    }
    if (!response.ok) {
      const parsed = decodeErrorBody(json);
      const code = parsed._tag === "Some" ? parsed.value.error : `http_${response.status}`;
      const message =
        parsed._tag === "Some" && parsed.value.message
          ? parsed.value.message
          : "Rooms request failed.";
      throw new RoomsHumanRequestError(code, message, response.status, response.status >= 500);
    }
    try {
      return decode(json);
    } catch {
      throw new RoomsHumanRequestError(
        "rooms_response_unexpected",
        "The Rooms server answered with an unexpected shape.",
        502,
      );
    }
  }

  const conversations: RoomsConversationClient = createRoomsConversationClient(request);
  const requestId = (value: string | undefined) => {
    if (value === undefined) return newRequestId();
    if (!UUID_V7_PATTERN.test(value))
      throw new RoomsHumanRequestError(
        "request_id_invalid",
        "request_id must be a lowercase UUIDv7.",
        400,
      );
    return value;
  };

  const session = () =>
    request("/rooms/human/v1/session", "GET", Schema.decodeUnknownSync(RoomsSession));
  const workspace = (room: string) =>
    request(
      `/rooms/human/v1/rooms/${encodeURIComponent(room)}/workspace`,
      "GET",
      Schema.decodeUnknownSync(RoomsWorkspace),
    );
  const names = async (room: string) => {
    const result = await workspace(room);
    return new Map(
      result.principals.map(
        (principal) => [principal.id, principal.display_name ?? principal.id] as const,
      ),
    );
  };

  /** Every conversation item after `afterSeq`, following cursors up to a fixed bound. */
  const conversationItems = async (room: string, channel: string, id: string, afterSeq: number) => {
    const items: RoomsHumanFeedItem[] = [];
    let cursor = afterSeq;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await conversations.feed(room, channel, id, {
        afterSeq: cursor,
        limit: FEED_PAGE,
      });
      items.push(...result.items);
      if (!result.page_info.has_more) break;
      cursor = result.page_info.next_cursor;
    }
    return items;
  };

  return {
    session,
    workspace,
    names,
    listConversations: (room: string, channel: string) => conversations.list(room, channel),
    startConversation: async (room: string, channel: string, title: string, id?: string) =>
      conversations.create(room, channel, requestId(id), title),
    sendMessage: async (
      room: string,
      channel: string,
      conversation: string,
      body: string,
      id?: string,
    ) => conversations.send(room, channel, conversation, requestId(id), body),
    readConversation: async (
      room: string,
      channel: string,
      id: string,
      afterSeq = 0,
      limit = 50,
    ) => {
      const [projection, feed, directory] = await Promise.all([
        conversations.read(room, channel, id),
        conversations.feed(room, channel, id, { afterSeq, limit }),
        names(room),
      ]);
      return { projection, feed, names: directory };
    },
    readChannel: async (room: string, channel: string, afterSeq = 0, limit = 50) => {
      const query = new URLSearchParams({ after_seq: String(afterSeq), limit: String(limit) });
      const [feed, directory] = await Promise.all([
        request(
          `/rooms/human/v2/rooms/${encodeURIComponent(room)}/channels/${encodeURIComponent(channel)}/feed?${query}`,
          "GET",
          Schema.decodeUnknownSync(RoomsHumanFeed),
        ),
        names(room),
      ]);
      return { feed, names: directory };
    },
    /** Polls until the agent's turn on `messageSeq` settles or the timeout passes. */
    waitForReply: async (
      room: string,
      channel: string,
      id: string,
      messageSeq: number,
      timeoutMs: number,
      pollMs = 2_000,
    ): Promise<AgentTurnOutcome & { readonly waited_ms: number }> => {
      const started = now();
      const directory = await names(room);
      for (;;) {
        const [projection, items] = await Promise.all([
          conversations.read(room, channel, id),
          conversationItems(room, channel, id, messageSeq),
        ]);
        const outcome = agentTurnOutcome(messageSeq, items, projection, directory);
        const waited = now() - started;
        if (
          outcome.state === "replied" ||
          outcome.state === "failed" ||
          waited + pollMs > timeoutMs
        )
          return { ...outcome, waited_ms: waited };
        await sleep(pollMs);
      }
    },
  };
}

export type RoomsHumanClient = ReturnType<typeof createRoomsHumanClient>;
