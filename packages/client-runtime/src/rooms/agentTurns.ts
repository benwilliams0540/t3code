export const ROOMS_AGENT_DELAY_MS = 30_000;

export type RoomsAgentSafeErrorCode =
  | "connector_cancelled"
  | "connector_internal"
  | "provider_rate_limited"
  | "provider_request_rejected"
  | "provider_timeout"
  | "provider_unavailable";

export interface RoomsAgentSourceEvent {
  readonly seq: number;
  readonly event_id: string;
  readonly type: string;
  readonly schema: number;
}

export interface RoomsAgentFeedItemLike {
  readonly id: string;
  readonly kind: string;
  readonly occurred_at: string;
  readonly summary: string;
  readonly source_event: RoomsAgentSourceEvent;
  readonly attribution: {
    readonly writer_principal_id: string;
    readonly actor_principal_id: string;
  };
  readonly payload: unknown;
}

export interface RoomsAgentInvocationFeedUpdate extends RoomsAgentFeedItemLike {
  readonly kind: "agent_invocation_update";
  readonly payload: {
    readonly invocation_id: string;
    readonly triggering_message: RoomsAgentSourceEvent;
    readonly status: "running" | "succeeded" | "failed";
    readonly safe_error_code: RoomsAgentSafeErrorCode | null;
    readonly reply_source_event: RoomsAgentSourceEvent | null;
  };
}

export interface RoomsAgentTurn {
  readonly id: string;
  readonly invocationId: string;
  readonly agentPrincipalId: string;
  readonly triggeringMessage: RoomsAgentSourceEvent;
  readonly status: "running" | "delayed" | "replied" | "failed";
  readonly safeErrorCode: RoomsAgentSafeErrorCode | null;
  readonly replyMarkdown: string | null;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly sourceEvent: RoomsAgentSourceEvent;
}

export type RoomsProjectedFeedEntry<T extends RoomsAgentFeedItemLike> =
  | { readonly kind: "feed_item"; readonly item: T }
  | { readonly kind: "agent_turn"; readonly turn: RoomsAgentTurn };

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSourceEvent(value: unknown): value is RoomsAgentSourceEvent {
  return (
    isObject(value) &&
    Number.isSafeInteger(value.seq) &&
    typeof value.event_id === "string" &&
    typeof value.type === "string" &&
    Number.isSafeInteger(value.schema)
  );
}

function isAgentUpdate(item: RoomsAgentFeedItemLike): item is RoomsAgentInvocationFeedUpdate {
  if (item.kind !== "agent_invocation_update" || !isObject(item.payload)) return false;
  const payload = item.payload;
  return (
    typeof payload.invocation_id === "string" &&
    isSourceEvent(payload.triggering_message) &&
    (payload.status === "running" ||
      payload.status === "succeeded" ||
      payload.status === "failed") &&
    (payload.safe_error_code === null || typeof payload.safe_error_code === "string") &&
    (payload.reply_source_event === null || isSourceEvent(payload.reply_source_event))
  );
}

function messageMarkdown(item: RoomsAgentFeedItemLike | undefined): string | null {
  if (!item || item.kind !== "human_message" || !isObject(item.payload)) return null;
  return typeof item.payload.body_markdown === "string" ? item.payload.body_markdown : null;
}

/**
 * Folds the append-only invocation ledger into one stable conversational turn. The triggering
 * human message stays in the feed; correlated Agent reply messages are rendered by the turn.
 */
export function projectRoomsAgentTurns<T extends RoomsAgentFeedItemLike>(
  items: readonly T[],
  nowMs: number = Date.now(),
  delayMs: number = ROOMS_AGENT_DELAY_MS,
): readonly RoomsProjectedFeedEntry<T>[] {
  const updatesByInvocation = new Map<string, RoomsAgentInvocationFeedUpdate[]>();
  const messagesByEventId = new Map<string, T>();
  for (const item of items) {
    if (isAgentUpdate(item)) {
      const updates = updatesByInvocation.get(item.payload.invocation_id) ?? [];
      updates.push(item);
      updatesByInvocation.set(item.payload.invocation_id, updates);
    } else if (item.kind === "human_message") {
      messagesByEventId.set(item.source_event.event_id, item);
    }
  }

  const replyEventIds = new Set<string>();
  const turnsByFirstItemId = new Map<string, RoomsAgentTurn>();
  for (const [invocationId, unordered] of updatesByInvocation) {
    const updates = [...unordered].sort(
      (left, right) => left.source_event.seq - right.source_event.seq,
    );
    const first = updates[0]!;
    const latest = updates.at(-1)!;
    const replyRef = updates
      .toReversed()
      .find((update) => update.payload.reply_source_event !== null)?.payload.reply_source_event;
    const reply = replyRef ? messagesByEventId.get(replyRef.event_id) : undefined;
    if (replyRef && reply) replyEventIds.add(replyRef.event_id);

    const startedMs = Date.parse(first.occurred_at);
    const replyMarkdown = messageMarkdown(reply);
    const status =
      latest.payload.status === "failed"
        ? "failed"
        : replyMarkdown !== null
          ? "replied"
          : Number.isFinite(startedMs) && nowMs - startedMs >= delayMs
            ? "delayed"
            : "running";
    turnsByFirstItemId.set(first.id, {
      id: `agent-turn:${invocationId}`,
      invocationId,
      agentPrincipalId: first.attribution.writer_principal_id,
      triggeringMessage: first.payload.triggering_message,
      status,
      safeErrorCode: status === "failed" ? latest.payload.safe_error_code : null,
      replyMarkdown,
      startedAt: first.occurred_at,
      updatedAt: latest.occurred_at,
      sourceEvent: first.source_event,
    });
  }

  const result: RoomsProjectedFeedEntry<T>[] = [];
  for (const item of items) {
    if (replyEventIds.has(item.source_event.event_id)) continue;
    const turn = turnsByFirstItemId.get(item.id);
    if (turn) result.push({ kind: "agent_turn", turn });
    else if (!isAgentUpdate(item)) result.push({ kind: "feed_item", item });
  }
  return result;
}

export function roomsAgentTurnCopy(
  turn: RoomsAgentTurn,
  displayName: string,
): { readonly title: string | null; readonly detail: string | null } {
  switch (turn.status) {
    case "running":
      return { title: `${displayName} is working…`, detail: null };
    case "delayed":
      return { title: "Taking longer than expected", detail: `${displayName} is still working.` };
    case "replied":
      return { title: null, detail: null };
    case "failed":
      return {
        title: `${displayName} couldn’t respond`,
        detail: safeErrorDetail(turn.safeErrorCode),
      };
  }
}

function safeErrorDetail(code: RoomsAgentSafeErrorCode | null): string {
  switch (code) {
    case "connector_cancelled":
      return "The connector stopped before the Agent could reply.";
    case "provider_rate_limited":
      return "OpenClaw is rate limited. Try again later.";
    case "provider_request_rejected":
      return "OpenClaw rejected this request.";
    case "provider_timeout":
      return "OpenClaw did not finish in time.";
    case "provider_unavailable":
      return "OpenClaw is unavailable.";
    case "connector_internal":
    case null:
      return "The connector could not complete this request.";
  }
}

export function roomsAgentTurnAnnouncement(turn: RoomsAgentTurn, displayName: string): string {
  const copy = roomsAgentTurnCopy(turn, displayName);
  if (turn.status === "replied") return `${displayName} replied.`;
  return [copy.title, copy.detail].filter((part) => part !== null).join(" ");
}

export function nextRoomsAgentTurnTransitionAt(
  turns: readonly RoomsAgentTurn[],
  delayMs: number = ROOMS_AGENT_DELAY_MS,
): number | null {
  const pending = turns
    .filter((turn) => turn.status === "running")
    .map((turn) => Date.parse(turn.startedAt) + delayMs)
    .filter(Number.isFinite);
  return pending.length === 0 ? null : Math.min(...pending);
}
