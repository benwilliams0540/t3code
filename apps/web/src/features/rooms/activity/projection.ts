import type {
  RoomsEvidence,
  RoomsFeedItem,
  RoomsPrincipal,
  RoomsStage,
  RoomsStory,
  RoomsThread,
  RoomsUpstreamAttribution,
  RoomsWorkspace,
  RoomsWorkspaceReadFixture,
} from "../model/workspace";
import { assertNever } from "../model/workspace";

export type RoomsActivityCardKind =
  | "message"
  | "reaction"
  | "run"
  | "story"
  | "evidence"
  | "approval"
  | "gate"
  | "unknown"
  | "unavailable";

export type RoomsPrincipalTone = "human" | "agent" | "machine" | "unknown";

export interface RoomsPrincipalPresentation {
  readonly label: "Human" | "Agent" | "Machine" | "Unknown principal";
  readonly tone: RoomsPrincipalTone;
}

export interface RoomsProjectedAttribution {
  readonly mode: "explicit_principal" | "mirrored_source";
  readonly writer: RoomsPrincipal;
  readonly actor: RoomsPrincipal | null;
  readonly upstream: RoomsUpstreamAttribution | null;
  readonly delegatedAgent: RoomsPrincipal | null;
  readonly machine: RoomsPrincipal | null;
}

export interface RoomsProjectedActivity {
  readonly item: RoomsFeedItem;
  readonly cardKind: RoomsActivityCardKind;
  readonly attribution: RoomsProjectedAttribution;
  readonly bodyMarkdown: string | null;
  readonly emoji: string | null;
  readonly targetItemId: string | null;
  readonly story: RoomsStory | null;
  readonly stage: RoomsStage | null;
  readonly thread: RoomsThread | null;
  readonly threadHref: string | null;
  readonly status: string | null;
  readonly evidence: RoomsEvidence | null;
  readonly approval: {
    readonly id: string;
    readonly state: string;
    readonly scope: string;
  } | null;
  readonly gate: {
    readonly state: string;
    readonly requiredEvidenceCount: number;
    readonly reviewerCount: number;
  } | null;
  readonly unknownSchema: { readonly eventType: string; readonly eventSchema: number } | null;
  readonly unavailable: {
    readonly resourceKind: string;
    readonly reason: string;
    readonly retryable: boolean;
  } | null;
}

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

function cardKind(item: RoomsFeedItem): RoomsActivityCardKind {
  switch (item.kind) {
    case "human_message":
      return "message";
    case "reaction":
      return "reaction";
    case "run_lifecycle":
      return "run";
    case "story_lifecycle":
      return "story";
    case "evidence_attached":
      return "evidence";
    case "approval_requested":
    case "approval_decided":
      return "approval";
    case "human_gate":
      return "gate";
    case "unknown_schema":
      return "unknown";
    case "unavailable":
      return "unavailable";
    default:
      return assertNever(item);
  }
}

function storyId(item: RoomsFeedItem): string | null {
  switch (item.kind) {
    case "story_lifecycle":
    case "evidence_attached":
    case "approval_requested":
    case "approval_decided":
    case "human_gate":
      return item.payload.story_id;
    case "human_message":
    case "reaction":
    case "run_lifecycle":
    case "unknown_schema":
    case "unavailable":
      return null;
    default:
      return assertNever(item);
  }
}

export function roomsThreadHref(thread: RoomsThread): string {
  return `/${encodeURIComponent(thread.environment_id)}/${encodeURIComponent(thread.id)}`;
}

export function projectRoomsActivityItem(
  fixture: RoomsWorkspaceReadFixture,
  workspace: RoomsWorkspace,
  item: RoomsFeedItem,
): RoomsProjectedActivity {
  const principals = new Map(fixture.principals.map((principal) => [principal.id, principal]));
  const writer = principals.get(item.attribution.writer_principal_id);
  if (!writer)
    throw new Error(
      `Decoded attribution writer ${item.attribution.writer_principal_id} is missing.`,
    );
  const actor =
    item.attribution.mode === "explicit_principal"
      ? (principals.get(item.attribution.actor_principal_id) ?? null)
      : null;
  const upstream = item.attribution.mode === "mirrored_source" ? item.attribution.upstream : null;
  const referencedStoryId = storyId(item);
  const story = referencedStoryId
    ? (workspace.stories.find((candidate) => candidate.id === referencedStoryId) ?? null)
    : null;
  const thread =
    item.kind === "run_lifecycle"
      ? (workspace.threads.find((candidate) => candidate.id === item.payload.thread_id) ?? null)
      : null;
  const stageId = item.kind === "human_gate" ? item.payload.stage_id : story?.stage_id;
  const stage = stageId
    ? (workspace.workflows
        .flatMap((workflow) => workflow.stages)
        .find((candidate) => candidate.id === stageId) ?? null)
    : null;
  const evidence =
    item.kind === "evidence_attached"
      ? (workspace.evidence.find((record) => record.id === item.payload.evidence_id) ?? null)
      : null;

  return {
    item,
    cardKind: cardKind(item),
    attribution: {
      mode: item.attribution.mode,
      writer,
      actor,
      upstream,
      delegatedAgent: thread ? (principals.get(thread.delegated_agent_id) ?? null) : null,
      machine: thread ? (principals.get(thread.machine_id) ?? null) : null,
    },
    bodyMarkdown: item.kind === "human_message" ? item.payload.body_markdown : null,
    emoji: item.kind === "reaction" ? item.payload.emoji : null,
    targetItemId: item.kind === "reaction" ? item.payload.target_feed_item_id : null,
    story,
    stage,
    thread,
    threadHref: thread ? roomsThreadHref(thread) : null,
    status: item.kind === "run_lifecycle" ? item.payload.status : null,
    evidence,
    approval:
      item.kind === "approval_requested" || item.kind === "approval_decided"
        ? { id: item.payload.approval_id, state: item.payload.state, scope: item.payload.scope }
        : null,
    gate:
      item.kind === "human_gate"
        ? {
            state: item.payload.state,
            requiredEvidenceCount: item.payload.required_evidence_ids.length,
            reviewerCount: item.payload.reviewer_ids.length,
          }
        : null,
    unknownSchema:
      item.kind === "unknown_schema"
        ? { eventType: item.payload.event_type, eventSchema: item.payload.event_schema }
        : null,
    unavailable:
      item.kind === "unavailable"
        ? {
            resourceKind: item.payload.resource_kind,
            reason: item.payload.reason,
            retryable: item.payload.retryable,
          }
        : null,
  };
}
