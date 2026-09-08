// Shared rule for the "who is this Story waiting on" question. Web and mobile
// each derive the facts from their own Story shape, then ask this one function,
// so the two clients can never disagree about the group. Labels stay at the edge.

export type RoomsStoryStage = "backlog" | "in-progress" | "human-qa" | "done";

export const ROOMS_STORY_STAGES: readonly RoomsStoryStage[] = [
  "backlog",
  "in-progress",
  "human-qa",
  "done",
];

export function isRoomsStoryStage(value: string): value is RoomsStoryStage {
  return (ROOMS_STORY_STAGES as readonly string[]).includes(value);
}

export type RoomsStoryBlockingGroup =
  | "waiting-on-you"
  | "waiting-on-someone-else"
  | "not-blocked"
  | "unknown";

export const ROOMS_STORY_BLOCKING_GROUPS: readonly RoomsStoryBlockingGroup[] = [
  "waiting-on-you",
  "waiting-on-someone-else",
  "not-blocked",
  "unknown",
];

export interface RoomsStoryBlockingFacts {
  readonly stage: RoomsStoryStage;
  // False for pre-V2 Stories, whose workflow data cannot answer the question.
  readonly workflowKnown: boolean;
  readonly ownerPrincipalId: string | null;
  // True when the current human holds the next action (claim, review, complete).
  readonly needsCurrentHuman: boolean;
}

export function classifyRoomsStoryBlocking(
  facts: RoomsStoryBlockingFacts,
  currentPrincipalId: string | null,
): RoomsStoryBlockingGroup {
  if (facts.stage === "done") return "not-blocked";
  if (!currentPrincipalId || !facts.workflowKnown) return "unknown";
  if (facts.needsCurrentHuman) return "waiting-on-you";
  if (facts.stage === "human-qa") return "waiting-on-someone-else";
  if (facts.ownerPrincipalId === currentPrincipalId) return "waiting-on-you";
  if (facts.ownerPrincipalId) return "waiting-on-someone-else";
  return facts.stage === "backlog" ? "not-blocked" : "unknown";
}
