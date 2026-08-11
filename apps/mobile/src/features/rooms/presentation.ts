import type { RoomsHumanStory, RoomsHumanStoryV2 } from "./contract";
import { isRoomsHumanStoryV2 } from "./contract";

export const ROOMS_MOBILE_SECTIONS = ["overview", "stories", "channels", "people"] as const;
export type RoomsMobileSection = (typeof ROOMS_MOBILE_SECTIONS)[number];

export function roomsChannelLabel(name: string): string {
  const label = name.trim().replace(/^(?:#+\s*)+/u, "");
  return label ? `# ${label}` : "#";
}

export function roomsStageLabel(stage: string): string {
  return (
    {
      backlog: "Backlog",
      "in-progress": "In progress",
      "human-qa": "Needs review",
      done: "Done",
    }[stage] ?? stage
  );
}

export function roomsStoryOwnerId(story: RoomsHumanStory): string | null {
  if (!isRoomsHumanStoryV2(story) || story.stage === "backlog") return null;
  return (
    story.audit.find((entry) => entry.source_event.type === "task.stage-changed")?.actor ?? null
  );
}

export function roomsStoryNeedsHuman(story: RoomsHumanStory, principalId: string): boolean {
  if (!isRoomsHumanStoryV2(story) || story.stage === "done") return false;
  if (story.stage === "human-qa") {
    return Boolean(
      story.gate && story.gate.approved_review_id === null && story.gate.reviewer_allowed,
    );
  }
  return roomsStoryOwnerId(story) === principalId;
}

export function roomsStoryUpdatedAt(story: RoomsHumanStory): string {
  return isRoomsHumanStoryV2(story)
    ? (story.audit.at(-1)?.occurred_at ?? story.created_at)
    : (story.native_thread?.linked_at ?? story.created_at);
}

export function roomsApprovedEvidence(story: RoomsHumanStoryV2): readonly string[] {
  const approvedId = story.gate?.approved_review_id;
  return approvedId
    ? (story.reviews.find((review) => review.id === approvedId)?.evidence ?? [])
    : [];
}

export function roomsStoryCanApproveAndComplete(story: RoomsHumanStoryV2): boolean {
  if (!story.gate) return false;
  if (story.gate.approved_review_id) {
    return Boolean(
      story.gate.completion_ready &&
      story.allowed_next_transitions.some(
        (transition) => transition.terminal && transition.to === "done" && transition.allowed,
      ),
    );
  }
  return Boolean(
    story.allowed_actions.review && story.gate.evidence_satisfied && story.gate.reviewer_allowed,
  );
}

export function roomsReviewEvidenceSatisfied(story: RoomsHumanStoryV2): boolean {
  if (story.gate) return story.gate.evidence_satisfied;
  if (story.workflow_version !== 1) return false;
  const kinds = new Set(story.evidence.map((evidence) => evidence.kind));
  if (story.story_type === "feature") {
    return kinds.has("screenshot") || kinds.has("artifact");
  }
  if (story.story_type === "security") return kinds.has("test-run");
  return false;
}
