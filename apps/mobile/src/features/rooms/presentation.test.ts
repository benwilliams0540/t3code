import { describe, expect, it } from "vite-plus/test";

import type { RoomsHumanStoryV2 } from "./contract";
import {
  roomsApprovedEvidence,
  roomsBlockingGroupLabel,
  roomsChannelLabel,
  roomsReviewEvidenceSatisfied,
  roomsStageLabel,
  roomsStoryBlockingGroup,
  roomsStoryCanApproveAndComplete,
  roomsStoryNeedsHuman,
  roomsStoryNextAction,
  roomsStoryOwnerId,
} from "./presentation";

const story: RoomsHumanStoryV2 = {
  id: "story:019fed3b-e36c-7730-aed8-4a927abc756a",
  room_id: "room:019fed3b-e36c-7730-aed8-4a927abc756b",
  title: "Review the mobile Rooms pass",
  story_type: "feature",
  workflow_version: 1,
  stage: "human-qa",
  created_by: "h:author",
  created_at: "2026-08-10T20:00:00.000Z",
  created_seq: 1,
  source_event: { seq: 1, event_id: "event-created", type: "task.created", schema: 1 },
  native_thread: null,
  scope_head_seq: 4,
  as_of_seq: 4,
  allowed_next_transitions: [
    {
      from: "human-qa",
      to: "done",
      label: "Complete",
      terminal: true,
      allowed: true,
      unavailable_reason: null,
    },
  ],
  allowed_actions: { attach_evidence: false, review: true, complete: true },
  gate: {
    from: "human-qa",
    to: "done",
    required_evidence: { mode: "any", kinds: ["screenshot", "artifact"] },
    allowed_principal_types: ["human"],
    forbid_self_review: true,
    eligible_evidence: ["evidence:one"],
    evidence_satisfied: true,
    reviewer_allowed: true,
    approved_review_id: "review:one",
    completion_ready: true,
  },
  evidence: [],
  reviews: [
    {
      id: "review:one",
      story_id: "story:019fed3b-e36c-7730-aed8-4a927abc756a",
      stage: "human-qa",
      decision: "approved",
      evidence: ["evidence:one"],
      reviewed_by: "h:reviewer",
      reviewed_at: "2026-08-10T20:10:00.000Z",
      reviewed_seq: 4,
      source_event: { seq: 4, event_id: "event-reviewed", type: "task.reviewed", schema: 1 },
    },
  ],
  completion: null,
  audit: [
    {
      actor: "h:owner",
      occurred_at: "2026-08-10T20:01:00.000Z",
      source_event: { seq: 2, event_id: "event-claimed", type: "task.stage-changed", schema: 1 },
    },
  ],
};

describe("Rooms mobile presentation", () => {
  it("renders one display hash for stored channel names", () => {
    expect(roomsChannelLabel("# infra")).toBe("# infra");
    expect(roomsChannelLabel("##general")).toBe("# general");
    expect(roomsChannelLabel("# # infra")).toBe("# infra");
    expect(roomsChannelLabel("#  ## general")).toBe("# general");
    expect(roomsChannelLabel(" vision ")).toBe("# vision");
  });

  it("derives owner and current-human attention from durable workflow facts", () => {
    expect(roomsStoryOwnerId(story)).toBe("h:owner");
    expect(
      roomsStoryNeedsHuman(
        { ...story, gate: { ...story.gate!, approved_review_id: null } },
        "h:reviewer",
      ),
    ).toBe(true);
    expect(roomsStoryNeedsHuman(story, "h:reviewer")).toBe(false);
  });

  it("binds terminal completion to the approved review evidence", () => {
    expect(roomsApprovedEvidence(story)).toEqual(["evidence:one"]);
    expect(roomsStoryCanApproveAndComplete(story)).toBe(true);
    expect(
      roomsStoryCanApproveAndComplete({
        ...story,
        gate: { ...story.gate!, completion_ready: false },
      }),
    ).toBe(false);
    expect(roomsStageLabel("human-qa")).toBe("Awaiting review");
    expect(roomsStageLabel("done")).toBe("Complete");
  });

  it("only enables combined review and completion for an eligible reviewer", () => {
    const pendingReview = {
      ...story,
      gate: { ...story.gate!, approved_review_id: null },
    };
    expect(roomsStoryCanApproveAndComplete(pendingReview)).toBe(true);
    expect(
      roomsStoryCanApproveAndComplete({
        ...pendingReview,
        gate: { ...pendingReview.gate, reviewer_allowed: false },
      }),
    ).toBe(false);
    expect(
      roomsStoryCanApproveAndComplete({
        ...pendingReview,
        gate: { ...pendingReview.gate, evidence_satisfied: false },
      }),
    ).toBe(false);
  });

  it("keeps the pinned feature workflow out of review until qualifying evidence exists", () => {
    const inProgress = { ...story, stage: "in-progress", gate: null, evidence: [] };
    expect(roomsReviewEvidenceSatisfied(inProgress)).toBe(false);
    expect(
      roomsReviewEvidenceSatisfied({
        ...inProgress,
        evidence: [
          {
            id: "evidence:screenshot",
            story_id: story.id,
            kind: "screenshot",
            cas: { hash: "a".repeat(64), bytes: 10, media_type: "image/png" },
            note: null,
            produced_by: "h:owner",
            attached_at: "2026-08-10T20:05:00.000Z",
            attached_seq: 3,
            source_event: {
              seq: 3,
              event_id: "event-evidence",
              type: "evidence.attached",
              schema: 1,
            },
          },
        ],
      }),
    ).toBe(true);
  });

  it("keeps stage and blocking as separate durable dimensions", () => {
    const pendingReview = {
      ...story,
      gate: { ...story.gate!, approved_review_id: null },
    };
    expect(roomsStoryBlockingGroup(pendingReview, "h:reviewer")).toBe("waiting-on-you");
    expect(
      roomsStoryBlockingGroup({ ...story, stage: "in-progress", gate: null }, "h:reviewer"),
    ).toBe("waiting-on-someone-else");
    expect(roomsStoryBlockingGroup({ ...story, stage: "done" }, "h:reviewer")).toBe("not-blocked");
    // Shared rule: an unowned backlog Story is not blocked (web and mobile now agree).
    expect(roomsStoryBlockingGroup({ ...story, stage: "backlog", gate: null }, "h:reviewer")).toBe(
      "not-blocked",
    );
    expect(roomsStoryBlockingGroup(story, null)).toBe("unknown");
    expect(roomsBlockingGroupLabel("unknown")).toBe("Blocking unknown");
  });

  it("puts the next supported human action ahead of decorative status", () => {
    expect(roomsStoryNextAction(story, "h:reviewer")).toBe("Complete the approved Story.");
    expect(
      roomsStoryNextAction(
        { ...story, gate: { ...story.gate!, approved_review_id: null } },
        "h:reviewer",
      ),
    ).toBe("Review the attached evidence, then approve and complete.");
    expect(
      roomsStoryNextAction(
        {
          ...story,
          stage: "in-progress",
          gate: null,
          evidence: [],
          allowed_next_transitions: [
            {
              from: "in-progress",
              to: "human-qa",
              label: "Request review",
              terminal: false,
              allowed: true,
              unavailable_reason: null,
            },
          ],
        },
        "h:owner",
      ),
    ).toBe("Attach qualifying evidence from desktop before requesting review.");
  });
});
