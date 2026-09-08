import { projectRoomsActivityItem, type RoomsProjectedActivity } from "../activity/projection";
import type {
  RoomsAttention,
  RoomsDocument,
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
  readonly delegate: null | { readonly agent: RoomsPrincipal; readonly thread: RoomsThread };
}

export interface RoomsDashboardStageGroup {
  readonly stage: RoomsStage;
  readonly stories: readonly RoomsDashboardStory[];
}

export interface RoomsDashboardAttentionItem {
  readonly fact: RoomsAttention;
  readonly title: string;
  readonly context: string;
}

export interface RoomsDashboardActivityItem {
  readonly fact: RoomsWorkspace["dashboard"]["recent_activity"][number];
  readonly activity: RoomsProjectedActivity;
}

export interface RoomsDashboardProjection {
  readonly status: "ready";
  readonly layout: RoomsDashboardLayout;
  readonly sourceProjection: RoomsProjection;
  readonly room: RoomsRoom;
  readonly health: {
    readonly sourceCount: number;
    readonly reachableSources: number;
    readonly unknownSources: number;
    readonly unreachableSources: number;
    readonly staleMirrors: number;
    readonly unreadCount: number;
    readonly attentionCount: number;
  };
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

export type RoomsDashboardProjectionResult =
  | RoomsDashboardProjection
  | { readonly status: "error"; readonly message: string };

export interface RoomsDashboardFallback {
  readonly status: "empty" | "error";
  readonly name: RoomsStateExample["kind"];
  readonly code: string | null;
  readonly message: string;
}

function referenced<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`Decoded workspace is missing ${description}.`);
  return value;
}

function attentionPresentation(
  fact: RoomsAttention,
  workspace: RoomsWorkspace,
): RoomsDashboardAttentionItem {
  switch (fact.kind) {
    case "human_gate_pending": {
      const story = referenced(
        workspace.stories.find((candidate) => candidate.id === fact.story_id),
        `attention story ${fact.story_id}`,
      );
      const stage = referenced(
        workspace.workflows
          .flatMap((workflow) => workflow.stages)
          .find((candidate) => candidate.id === fact.stage_id),
        `attention stage ${fact.stage_id}`,
      );
      return { fact, title: story.title, context: `${stage.name} · ${fact.reason}` };
    }
    case "blocked_run": {
      const thread = referenced(
        workspace.threads.find((candidate) => candidate.id === fact.thread_id),
        `attention thread ${fact.thread_id}`,
      );
      return { fact, title: thread.title, context: `Blocked run · ${fact.reason}` };
    }
    case "stale_mirror": {
      const source = referenced(
        workspace.sources.find((candidate) => candidate.id === fact.source_id),
        `attention source ${fact.source_id}`,
      );
      return { fact, title: source.name, context: `Stale mirror · ${fact.reason}` };
    }
  }
}

export function buildRoomsDashboardProjection(
  fixture: RoomsWorkspaceReadFixture,
  room: RoomsRoom,
  workspace: RoomsWorkspace,
  layout: RoomsDashboardLayout,
): RoomsDashboardProjectionResult {
  try {
    if (workspace.room_id !== room.id)
      throw new Error(`Room ${room.id} does not own ${workspace.id}.`);
    const projectionKind = layout === "desktop" ? "desktop_board" : "mobile_vertical_stages";
    const sourceProjection = referenced(
      workspace.projections.find((projection) => projection.kind === projectionKind),
      `${projectionKind} projection`,
    );
    const stageMap = new Map(
      workspace.workflows.flatMap((workflow) => workflow.stages).map((stage) => [stage.id, stage]),
    );
    const storyMap = new Map(workspace.stories.map((story) => [story.id, story]));
    const principalMap = new Map(fixture.principals.map((principal) => [principal.id, principal]));
    const threadMap = new Map(workspace.threads.map((thread) => [thread.id, thread]));
    const document = referenced(
      workspace.documents.find(
        (candidate) => candidate.id === workspace.dashboard.vision.document_id,
      ),
      `vision document ${workspace.dashboard.vision.document_id}`,
    );
    const revision = referenced(
      document.revisions.find((candidate) => candidate.id === document.current_revision_id),
      `current vision revision ${document.current_revision_id}`,
    );
    const route = referenced(
      workspace.navigation.find((entry) => entry.key === "vision"),
      "vision navigation route",
    ).route;

    const stages = sourceProjection.stage_order.map((stageId) => {
      const stage = referenced(stageMap.get(stageId), `stage ${stageId}`);
      const group = referenced(
        sourceProjection.groups.find((candidate) => candidate.stage_id === stageId),
        `projection group ${stageId}`,
      );
      const stories = group.story_ids.map((storyId) => {
        const story = referenced(storyMap.get(storyId), `story ${storyId}`);
        const owner = referenced(principalMap.get(story.owner_id), `owner ${story.owner_id}`);
        const delegate = story.delegate
          ? {
              agent: referenced(
                principalMap.get(story.delegate.agent_id),
                `delegate ${story.delegate.agent_id}`,
              ),
              thread: referenced(
                threadMap.get(story.delegate.thread_id),
                `thread ${story.delegate.thread_id}`,
              ),
            }
          : null;
        return { story, owner, delegate };
      });
      return { stage, stories };
    });

    const feedItemMap = new Map(
      workspace.feeds.flatMap((feed) => feed.items).map((item) => [item.id, item]),
    );
    return {
      status: "ready",
      layout,
      sourceProjection,
      room,
      health: {
        sourceCount: workspace.sources.length,
        reachableSources: workspace.sources.filter(
          (source) => source.reachability.state === "reachable",
        ).length,
        unknownSources: workspace.sources.filter(
          (source) => source.reachability.state === "unknown",
        ).length,
        unreachableSources: workspace.sources.filter(
          (source) => source.reachability.state === "unreachable",
        ).length,
        staleMirrors: workspace.sources.filter((source) => source.mirror.freshness === "stale")
          .length,
        unreadCount: room.unread.count,
        attentionCount: workspace.dashboard.needs_attention.length,
      },
      vision: {
        headline: workspace.dashboard.vision.headline,
        summary: workspace.dashboard.vision.summary,
        document,
        revision,
        route,
      },
      stages,
      needsAttention: workspace.dashboard.needs_attention.map((fact) =>
        attentionPresentation(fact, workspace),
      ),
      recentActivity: workspace.dashboard.recent_activity.map((fact) => {
        const item = referenced(
          feedItemMap.get(fact.feed_item_id),
          `activity item ${fact.feed_item_id}`,
        );
        return { fact, activity: projectRoomsActivityItem(fixture, workspace, item) };
      }),
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
  switch (state.kind) {
    case "empty":
      return {
        status: "empty",
        name: state.kind,
        code: null,
        message: "No workspace items were returned for this fixture state.",
      };
    case "unauthenticated":
    case "unauthorized":
    case "stale_cursor":
    case "unsupported_contract_version":
      return {
        status: "error",
        name: state.kind,
        code: state.result.code,
        message: state.result.message,
      };
    case "authorized_workspace":
    case "reachable_but_stale":
      return null;
  }
}
