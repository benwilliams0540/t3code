import type {
  RoomsFeedItem,
  RoomsPrincipal,
  RoomsPrincipalId,
  RoomsStage,
  RoomsStory,
  RoomsThread,
  RoomsWorkspace,
  RoomsWorkspaceReadFixture,
} from "../model/workspace";

export type RoomsActivityCardKind =
  | "message"
  | "reaction"
  | "run"
  | "story"
  | "evidence"
  | "approval";

export type RoomsPrincipalTone = "human" | "agent" | "machine" | "unknown";

export interface RoomsPrincipalPresentation {
  readonly label: "Human" | "Agent" | "Machine" | "Unknown principal";
  readonly tone: RoomsPrincipalTone;
}

export interface RoomsProjectedActivity {
  readonly item: RoomsFeedItem;
  readonly cardKind: RoomsActivityCardKind;
  readonly principal: RoomsPrincipal | null;
  readonly principalPresentation: RoomsPrincipalPresentation;
  readonly emoji: string | null;
  readonly targetItemId: string | null;
  readonly story: RoomsStory | null;
  readonly stage: RoomsStage | null;
  readonly thread: RoomsThread | null;
  readonly threadHref: string | null;
  readonly status: string | null;
  readonly evidenceKind: string | null;
  readonly evidenceHash: string | null;
  readonly decision: string | null;
  readonly decisionScope: string | null;
}

const cardKindByFixtureKind = {
  human_message: "message",
  reaction: "reaction",
  run_lifecycle: "run",
  story_lifecycle: "story",
  evidence_attached: "evidence",
  approval_decided: "approval",
} as const satisfies Record<RoomsFeedItem["kind"], RoomsActivityCardKind>;

export function principalPresentation(
  principal: Pick<RoomsPrincipal, "type"> | null,
): RoomsPrincipalPresentation {
  switch (principal?.type) {
    case "human":
      return { label: "Human", tone: "human" };
    case "agent":
      return { label: "Agent", tone: "agent" };
    case "machine":
      return { label: "Machine", tone: "machine" };
    default:
      return { label: "Unknown principal", tone: "unknown" };
  }
}

function stringField(item: RoomsFeedItem, key: string): string | null {
  const value = item.data[key];
  return typeof value === "string" ? value : null;
}

function findPrincipal(
  fixture: RoomsWorkspaceReadFixture,
  principalId: RoomsPrincipalId,
): RoomsPrincipal | null {
  return fixture.principals.find((principal) => principal.id === principalId) ?? null;
}

function findStory(workspace: RoomsWorkspace, item: RoomsFeedItem): RoomsStory | null {
  const taskId = stringField(item, "task_id");
  if (!taskId) return null;
  return workspace.stories.find((story) => story.id === taskId) ?? null;
}

function findThread(workspace: RoomsWorkspace, item: RoomsFeedItem): RoomsThread | null {
  const threadId = stringField(item, "thread_id");
  if (!threadId) return null;
  return workspace.threads.find((thread) => thread.id === threadId) ?? null;
}

export function roomsThreadHref(thread: RoomsThread): string {
  return `/${encodeURIComponent(thread.environment.id)}/${encodeURIComponent(thread.id)}`;
}

export function projectRoomsActivityItem(
  fixture: RoomsWorkspaceReadFixture,
  workspace: RoomsWorkspace,
  item: RoomsFeedItem,
): RoomsProjectedActivity {
  const principal = findPrincipal(fixture, item.actor_id);
  const story = findStory(workspace, item);
  const thread = findThread(workspace, item);
  const stage = story
    ? (workspace.workflow.stages.find((candidate) => candidate.id === story.stage_id) ?? null)
    : null;

  return {
    item,
    cardKind: cardKindByFixtureKind[item.kind],
    principal,
    principalPresentation: principalPresentation(principal),
    emoji: stringField(item, "emoji"),
    targetItemId: stringField(item, "target_item_id"),
    story,
    stage,
    thread,
    threadHref: thread ? roomsThreadHref(thread) : null,
    status: stringField(item, "status"),
    evidenceKind: stringField(item, "kind"),
    evidenceHash: (() => {
      const cas = item.data.cas;
      if (!cas || typeof cas !== "object" || !("hash" in cas)) return null;
      return typeof cas.hash === "string" ? cas.hash : null;
    })(),
    decision: stringField(item, "decision"),
    decisionScope: stringField(item, "scope"),
  };
}
