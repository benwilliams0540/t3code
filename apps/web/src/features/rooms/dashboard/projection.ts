import type {
  RoomsDocument,
  RoomsFeedItem,
  RoomsPrincipal,
  RoomsProjection,
  RoomsRoom,
  RoomsStage,
  RoomsStateExample,
  RoomsStory,
  RoomsThread,
  RoomsWorkspace,
  RoomsWorkspaceReadFixture,
} from "../model/workspace";

export type RoomsDashboardLayout = "desktop" | "narrow";

export interface RoomsDashboardStory {
  readonly story: RoomsStory;
  readonly owner: RoomsPrincipal;
  readonly delegate: null | {
    readonly agent: RoomsPrincipal;
    readonly thread: RoomsThread;
  };
}

export interface RoomsDashboardStageGroup {
  readonly stage: RoomsStage;
  readonly stories: readonly RoomsDashboardStory[];
}

export interface RoomsDashboardAttentionItem {
  readonly story: RoomsDashboardStory;
  readonly reasons: readonly ("delegate_blocked" | "evidence_required" | "review_required")[];
}

export interface RoomsDashboardActivityItem {
  readonly item: RoomsFeedItem;
  readonly actor: RoomsPrincipal;
}

export interface RoomsDashboardProjection {
  readonly status: "ready";
  readonly layout: RoomsDashboardLayout;
  readonly sourceProjection: RoomsProjection;
  readonly room: RoomsRoom;
  readonly vision: {
    readonly headline: string;
    readonly summary: string;
    readonly document: RoomsDocument;
    readonly revision: RoomsDocument["revisions"][number];
    readonly route: string;
  };
  readonly stages: readonly RoomsDashboardStageGroup[];
  readonly needsAttention: readonly RoomsDashboardAttentionItem[];
  readonly recentActivity: readonly RoomsDashboardActivityItem[];
}

export interface RoomsDashboardProjectionError {
  readonly status: "error";
  readonly message: string;
}

export type RoomsDashboardProjectionResult =
  | RoomsDashboardProjection
  | RoomsDashboardProjectionError;

export interface RoomsDashboardFallback {
  readonly status: "empty" | "error";
  readonly name: RoomsStateExample["name"];
  readonly code: string | null;
  readonly message: string;
}

function referenced<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`Workspace fixture is missing ${description}.`);
  return value;
}

function attentionReasons(
  dashboardStory: RoomsDashboardStory,
): RoomsDashboardAttentionItem["reasons"] {
  const reasons: RoomsDashboardAttentionItem["reasons"][number][] = [];
  if (dashboardStory.story.delegate?.run_status === "blocked") reasons.push("delegate_blocked");
  if (dashboardStory.story.gate_state === "waiting_for_evidence") reasons.push("evidence_required");
  if (dashboardStory.story.gate_state === "waiting_for_review") reasons.push("review_required");
  return reasons;
}

export function buildRoomsDashboardProjection(
  fixture: RoomsWorkspaceReadFixture,
  room: RoomsRoom,
  workspace: RoomsWorkspace,
  layout: RoomsDashboardLayout,
): RoomsDashboardProjectionResult {
  try {
    if (workspace.selected_room_id !== room.id) {
      throw new Error(`Room ${room.id} does not own the selected workspace projection.`);
    }
    const projectionKind = layout === "desktop" ? "desktop_board" : "mobile_vertical_stages";
    const sourceProjection = referenced(
      workspace.projections.find((projection) => projection.kind === projectionKind),
      `${projectionKind} projection`,
    );
    const stagesById = new Map(workspace.workflow.stages.map((stage) => [stage.id, stage]));
    const storiesById = new Map(workspace.stories.map((story) => [story.id, story]));
    const principalsById = new Map(
      fixture.principals.map((principal) => [principal.id, principal]),
    );
    const threadsById = new Map(workspace.threads.map((thread) => [thread.id, thread]));
    const visionDocument = referenced(
      workspace.documents.find((document) => document.id === workspace.vision.document_id),
      `vision document ${workspace.vision.document_id}`,
    );
    const currentVisionRevision = referenced(
      visionDocument.revisions.find(
        (revision) => revision.id === visionDocument.current_revision_id,
      ),
      `current vision revision ${visionDocument.current_revision_id}`,
    );
    const visionRoute = referenced(
      workspace.project_navigation.find((entry) => entry.key === "vision"),
      "vision navigation route",
    ).route;

    const stages = sourceProjection.stage_order.map((stageId) => {
      const stage = referenced(stagesById.get(stageId), `workflow stage ${stageId}`);
      const sourceGroup = referenced(
        sourceProjection.groups.find((group) => group.stage_id === stageId),
        `projection group for ${stageId}`,
      );
      const stories = sourceGroup.story_ids.map((storyId) => {
        const story = referenced(storiesById.get(storyId), `story ${storyId}`);
        if (story.stage_id !== stage.id) {
          throw new Error(`Story ${story.id} is projected into the wrong workflow stage.`);
        }
        const owner = referenced(principalsById.get(story.owner_id), `owner ${story.owner_id}`);
        const delegate = story.delegate
          ? {
              agent: referenced(
                principalsById.get(story.delegate.agent_id),
                `delegate ${story.delegate.agent_id}`,
              ),
              thread: referenced(
                threadsById.get(story.delegate.thread_id),
                `thread ${story.delegate.thread_id}`,
              ),
            }
          : null;
        return { story, owner, delegate } satisfies RoomsDashboardStory;
      });
      return { stage, stories } satisfies RoomsDashboardStageGroup;
    });

    const dashboardStories = stages.flatMap((stage) => stage.stories);
    const needsAttention = dashboardStories.flatMap((story) => {
      const reasons = attentionReasons(story);
      return reasons.length > 0 ? [{ story, reasons }] : [];
    });
    const recentActivity = workspace.feeds
      .filter((feed) => feed.room_id === workspace.selected_room_id)
      .flatMap((feed) => feed.items)
      .toSorted((left, right) => right.source_event.seq - left.source_event.seq)
      .slice(0, 5)
      .map((item) => ({
        item,
        actor: referenced(principalsById.get(item.actor_id), `activity actor ${item.actor_id}`),
      }));

    return {
      status: "ready",
      layout,
      sourceProjection,
      room,
      vision: {
        headline: workspace.vision.headline,
        summary: workspace.vision.summary,
        document: visionDocument,
        revision: currentVisionRevision,
        route: visionRoute,
      },
      stages,
      needsAttention,
      recentActivity,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "The workspace projection is invalid.",
    };
  }
}

export function dashboardFallbackFromState(
  state: RoomsStateExample | null | undefined,
): RoomsDashboardFallback | null {
  if (!state) return null;
  const status = state.result.status;
  const items = state.result.items;
  if (status === "ok" && Array.isArray(items) && items.length === 0) {
    return {
      status: "empty",
      name: state.name,
      code: null,
      message: "No workspace items were returned for this fixture state.",
    };
  }
  if (status === "error") {
    return {
      status: "error",
      name: state.name,
      code: typeof state.result.code === "string" ? state.result.code : null,
      message:
        typeof state.result.message === "string"
          ? state.result.message
          : "The workspace fixture returned an error without a message.",
    };
  }
  return null;
}
