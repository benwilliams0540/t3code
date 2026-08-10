import * as Schema from "effect/Schema";

import type { RoomsLocalEvidenceKind, RoomsLocalStory } from "../dataSource/localStoriesContract";
import { isRoomsLocalStoryV2 } from "../dataSource/localStoriesContract";

export const ROOMS_STORIES_VIEW_STORAGE_KEY = "t3code:rooms-stories-view:v1";
export const RoomsStoriesView = Schema.Literals(["board", "list"]);
export type RoomsStoriesView = typeof RoomsStoriesView.Type;

export const ROOMS_STORY_STAGE_ORDER = ["backlog", "in-progress", "human-qa", "done"] as const;

export function localStoryStageLabel(stage: string): string {
  return (
    {
      backlog: "Backlog",
      "in-progress": "In progress",
      "human-qa": "Needs review",
      done: "Done",
    }[stage] ?? stage
  );
}

export interface RoomsStoryEvidenceRequirement {
  readonly mode: "all" | "any";
  readonly kinds: readonly RoomsLocalEvidenceKind[];
}

export interface RoomsStoryEvidenceGatePresentation {
  readonly requirement: RoomsStoryEvidenceRequirement | null;
  readonly satisfied: boolean;
  readonly missingKinds: readonly RoomsLocalEvidenceKind[];
  readonly unavailableReason: string | null;
}

/**
 * local-stories v2 exposes the transition actor in the audit projection, but does not duplicate it
 * as an owner field. The first stage transition in the pinned one-way workflow is the durable claim.
 */
export function localStoryOwnerId(story: RoomsLocalStory): string | null {
  if (!isRoomsLocalStoryV2(story) || story.stage === "backlog") return null;
  return (
    story.audit.find((entry) => entry.source_event.type === "task.stage-changed")?.actor ?? null
  );
}

export function localStoryUpdatedAt(story: RoomsLocalStory): string {
  if (!isRoomsLocalStoryV2(story)) return story.native_thread?.linked_at ?? story.created_at;
  return story.audit.at(-1)?.occurred_at ?? story.created_at;
}

export function localStoryReviewRequirement(
  story: RoomsLocalStory,
): RoomsStoryEvidenceRequirement | null {
  if (isRoomsLocalStoryV2(story) && story.gate) {
    return story.gate.required_evidence;
  }
  if (story.workflow_version !== 1) return null;
  if (story.story_type === "feature") {
    return { mode: "any", kinds: ["screenshot", "artifact"] };
  }
  if (story.story_type === "security") {
    return { mode: "all", kinds: ["test-run"] };
  }
  return null;
}

export function localStoryEvidenceGate(story: RoomsLocalStory): RoomsStoryEvidenceGatePresentation {
  const requirement = localStoryReviewRequirement(story);
  if (!requirement) {
    return {
      requirement: null,
      satisfied: false,
      missingKinds: [],
      unavailableReason:
        "This workflow revision does not expose a review evidence rule to the client.",
    };
  }
  if (!isRoomsLocalStoryV2(story)) {
    return {
      requirement,
      satisfied: false,
      missingKinds: requirement.kinds,
      unavailableReason: "This server returned local-stories v1 without evidence facts.",
    };
  }
  if (story.gate) {
    const observed = new Set(story.evidence.map((evidence) => evidence.kind));
    return {
      requirement,
      satisfied: story.gate.evidence_satisfied,
      missingKinds: requirement.kinds.filter((kind) => !observed.has(kind)),
      unavailableReason: story.gate.evidence_satisfied
        ? null
        : `Attach ${requirement.mode === "all" ? "all required evidence" : "a qualifying screenshot or artifact"} before approval.`,
    };
  }
  const observed = new Set(story.evidence.map((evidence) => evidence.kind));
  const missingKinds = requirement.kinds.filter((kind) => !observed.has(kind));
  const satisfied =
    requirement.mode === "all"
      ? missingKinds.length === 0
      : missingKinds.length < requirement.kinds.length;
  return {
    requirement,
    satisfied,
    missingKinds,
    unavailableReason: satisfied
      ? null
      : `Attach ${requirement.mode === "all" ? requirement.kinds.join(" and ") : "a screenshot or artifact"} before requesting review.`,
  };
}

export function localStoryNeedsCurrentHuman(
  story: RoomsLocalStory,
  currentPrincipalId: string,
): boolean {
  if (!isRoomsLocalStoryV2(story) || story.stage === "done") return false;
  if (story.stage === "human-qa") {
    return story.gate?.approved_review_id === null && story.gate.reviewer_allowed;
  }
  return localStoryOwnerId(story) === currentPrincipalId;
}

export function localStoryNextAction(story: RoomsLocalStory): string {
  if (!isRoomsLocalStoryV2(story)) return "Upgrade the Rooms producer to continue this workflow";
  if (story.stage === "backlog") return "Claim and start";
  if (story.stage === "in-progress") {
    const gate = localStoryEvidenceGate(story);
    return gate.satisfied
      ? "Request human review"
      : (gate.unavailableReason ?? "Evidence required");
  }
  if (story.stage === "human-qa") {
    if (story.gate?.approved_review_id) return "Complete the approved story";
    if (!story.gate?.evidence_satisfied)
      return story.gate ? "Qualifying evidence is required" : "Gate unavailable";
    if (!story.gate.reviewer_allowed) return "Another eligible human must review";
    return "Approve and complete";
  }
  return story.completion ? "Completed" : "No next action";
}

export function countNewRoomsOutputSelections(
  alreadyAttachedIds: readonly string[],
  selectedIds: readonly string[],
): number {
  const attached = new Set(alreadyAttachedIds);
  return new Set(selectedIds.filter((id) => !attached.has(id))).size;
}

export function localStoryStageCounts(
  stories: readonly RoomsLocalStory[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const stage of ROOMS_STORY_STAGE_ORDER) counts.set(stage, 0);
  for (const story of stories) counts.set(story.stage, (counts.get(story.stage) ?? 0) + 1);
  return counts;
}
