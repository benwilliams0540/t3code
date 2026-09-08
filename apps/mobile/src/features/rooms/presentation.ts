import {
  classifyRoomsStoryBlocking,
  isRoomsStoryStage,
  ROOMS_STORY_BLOCKING_GROUPS,
  type RoomsStoryBlockingGroup,
} from "@t3tools/client-runtime/rooms";
import type { RoomsHumanStory, RoomsHumanStoryV2 } from "./contract";
import { isRoomsHumanStoryV2 } from "./contract";

export const ROOMS_MOBILE_SECTIONS = ["room", "status", "stories", "network"] as const;
export type RoomsMobileSection = (typeof ROOMS_MOBILE_SECTIONS)[number];

export const ROOMS_STORY_STAGE_FILTERS = [
  "all",
  "backlog",
  "in-progress",
  "human-qa",
  "done",
] as const;
export type RoomsStoryStageFilter = (typeof ROOMS_STORY_STAGE_FILTERS)[number];

export { ROOMS_STORY_BLOCKING_GROUPS, type RoomsStoryBlockingGroup };

export function roomsChannelLabel(name: string): string {
  const label = name.trim().replace(/^(?:#+\s*)+/u, "");
  return label ? `# ${label}` : "#";
}

export function roomsStageLabel(stage: string): string {
  return (
    {
      backlog: "Backlog",
      "in-progress": "In progress",
      "human-qa": "Awaiting review",
      done: "Complete",
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

// Derives the facts from the mobile Story shape and defers to the rule shared with web.
export function roomsStoryBlockingGroup(
  story: RoomsHumanStory,
  principalId: string | null,
): RoomsStoryBlockingGroup {
  // A stage outside the shared workflow means the rule cannot answer; report unknown.
  if (!isRoomsStoryStage(story.stage)) return "unknown";
  return classifyRoomsStoryBlocking(
    {
      stage: story.stage,
      workflowKnown: isRoomsHumanStoryV2(story),
      ownerPrincipalId: roomsStoryOwnerId(story),
      needsCurrentHuman: principalId !== null && roomsStoryNeedsHuman(story, principalId),
    },
    principalId,
  );
}

export function roomsBlockingGroupLabel(group: RoomsStoryBlockingGroup): string {
  return {
    "waiting-on-you": "Waiting on you",
    "waiting-on-someone-else": "Waiting on someone else",
    "not-blocked": "Not blocked",
    unknown: "Blocking unknown",
  }[group];
}

export function roomsStoryNextAction(story: RoomsHumanStory, principalId: string): string {
  if (!isRoomsHumanStoryV2(story)) return "Open on desktop to inspect this older workflow.";
  if (story.stage === "done") return "No human action is currently required.";
  if (story.stage === "human-qa" && story.gate) {
    if (story.gate.approved_review_id) {
      return roomsStoryCanApproveAndComplete(story)
        ? "Complete the approved Story."
        : "Wait for the approved Story to become completion-ready.";
    }
    if (!story.gate.evidence_satisfied) return "Attach qualifying evidence from desktop.";
    if (!story.gate.reviewer_allowed) return "Wait for another eligible person to review.";
    return "Review the attached evidence, then approve and complete.";
  }
  const allowedTransition = story.allowed_next_transitions.find(
    (transition) => transition.allowed && !transition.terminal,
  );
  if (story.stage === "in-progress" && !roomsReviewEvidenceSatisfied(story)) {
    return "Attach qualifying evidence from desktop before requesting review.";
  }
  if (allowedTransition) {
    if (allowedTransition.to === "in-progress") return "Claim and start this Story.";
    if (allowedTransition.to === "human-qa") return "Request human review.";
    return allowedTransition.label;
  }
  const ownerId = roomsStoryOwnerId(story);
  if (ownerId && ownerId !== principalId) return "Waiting on the current owner.";
  return "No supported next action is currently exposed.";
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
