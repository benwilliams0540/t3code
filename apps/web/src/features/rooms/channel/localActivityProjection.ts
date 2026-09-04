import type { RoomsActivityPrincipal, RoomsProjectedActivity } from "../activity/projection";
import { projectRoomsAgentTurns } from "@t3tools/client-runtime/rooms/agent-turns";
import type { RoomsPrincipalId } from "../model/workspace";
import type { RoomsLocalFeedItem } from "../dataSource/localChannelsContract";
import type {
  RoomsHumanFeedItem,
  RoomsInteractiveWorkspace,
} from "../dataSource/humanSharedContract";

function principalId(id: string): RoomsPrincipalId | null {
  if (id.startsWith("h:") || id.startsWith("a:") || id.startsWith("m:")) {
    return id as RoomsPrincipalId;
  }
  return null;
}

/**
 * Local channels resolve identity server-side and return bare principal IDs. Only the workspace's
 * own principal can be named; every other writer stays explicitly unresolved rather than being
 * attributed to the reader.
 */
export function resolveRoomsLocalPrincipal(
  workspace: RoomsInteractiveWorkspace,
  id: string,
): RoomsActivityPrincipal {
  const known = principalId(id);
  const declared =
    "principals" in workspace
      ? workspace.principals.find((principal) => principal.id === id)
      : id === workspace.principal.id
        ? workspace.principal
        : null;
  if (known !== null && declared) {
    return {
      id: known,
      type: declared.type,
      display_name: declared.display_name ?? id,
    };
  }
  return { id, type: "unresolved", display_name: id };
}

/**
 * Projects one durable Local feed item into the shared activity shape so Sample and Local render
 * through the same component. Kinds outside `rooms.local-channels` v1 cannot appear here: the
 * server already narrows them to `unknown_schema`, which stays visible in the record register.
 */
export function projectRoomsLocalActivityItem(
  workspace: RoomsInteractiveWorkspace,
  item: RoomsLocalFeedItem,
): RoomsProjectedActivity {
  return {
    item: {
      id: item.id,
      kind: item.kind,
      occurred_at: item.occurred_at,
      summary: item.summary,
      source_event: item.source_event,
    },
    cardKind: item.kind === "human_message" ? "message" : "unknown",
    attribution: {
      mode: "explicit_principal",
      writer: resolveRoomsLocalPrincipal(workspace, item.attribution.writer_principal_id),
      actor: resolveRoomsLocalPrincipal(workspace, item.attribution.actor_principal_id),
      upstream: null,
      delegatedAgent: null,
      machine: null,
    },
    bodyMarkdown: item.kind === "human_message" ? item.payload.body_markdown : null,
    emoji: null,
    targetItemId: null,
    story: null,
    stage: null,
    thread: null,
    threadHref: null,
    status: null,
    evidence: null,
    approval: null,
    gate: null,
    unknownSchema:
      item.kind === "unknown_schema"
        ? { eventType: item.payload.event_type, eventSchema: item.payload.event_schema }
        : null,
    unavailable: null,
  };
}

export function projectRoomsLocalActivityItems(
  workspace: RoomsInteractiveWorkspace,
  items: readonly RoomsHumanFeedItem[],
  nowMs: number = Date.now(),
): readonly RoomsProjectedActivity[] {
  return projectRoomsAgentTurns(items, nowMs).map((entry) => {
    if (entry.kind === "feed_item") {
      if (entry.item.kind === "agent_invocation_update") {
        throw new Error("Agent invocation updates must be folded before activity projection.");
      }
      return projectRoomsLocalActivityItem(workspace, entry.item);
    }
    const turn = entry.turn;
    return {
      item: {
        id: turn.id,
        kind: "agent_turn",
        occurred_at: turn.startedAt,
        summary: `Agent invocation ${turn.status}`,
        source_event: turn.sourceEvent,
      },
      cardKind: "agent_turn",
      attribution: {
        mode: "explicit_principal",
        writer: resolveRoomsLocalPrincipal(workspace, turn.agentPrincipalId),
        actor: resolveRoomsLocalPrincipal(workspace, turn.agentPrincipalId),
        upstream: null,
        delegatedAgent: null,
        machine: null,
      },
      bodyMarkdown: turn.replyMarkdown,
      emoji: null,
      targetItemId: null,
      story: null,
      stage: null,
      thread: null,
      threadHref: null,
      status: turn.status,
      evidence: null,
      approval: null,
      gate: null,
      unknownSchema: null,
      unavailable: null,
      agentTurn: turn,
    } satisfies RoomsProjectedActivity;
  });
}
