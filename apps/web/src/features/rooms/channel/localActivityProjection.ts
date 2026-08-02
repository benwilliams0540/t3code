import type { RoomsActivityPrincipal, RoomsProjectedActivity } from "../activity/projection";
import type { RoomsPrincipalId } from "../model/workspace";
import type { RoomsLocalFeedItem, RoomsLocalWorkspace } from "../dataSource/localChannelsContract";

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
  workspace: RoomsLocalWorkspace,
  id: string,
): RoomsActivityPrincipal {
  const known = principalId(id);
  if (known !== null && id === workspace.principal.id) {
    return {
      id: known,
      type: workspace.principal.type,
      display_name: workspace.principal.display_name,
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
  workspace: RoomsLocalWorkspace,
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
  workspace: RoomsLocalWorkspace,
  items: readonly RoomsLocalFeedItem[],
): readonly RoomsProjectedActivity[] {
  return items.map((item) => projectRoomsLocalActivityItem(workspace, item));
}
