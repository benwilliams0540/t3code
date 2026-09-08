import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import {
  getLocalStorageItem,
  removeLocalStorageItem,
  setLocalStorageItem,
} from "~/hooks/useLocalStorage";

import storyAtHumanQaDocument from "../dataSource/fixtures/local-stories-v2-story-at-human-qa.json";
import { RoomsLocalStoryV2 } from "../dataSource/localStoriesContract";
import {
  countNewRoomsOutputSelections,
  localStoryBlockingGroup,
  localStoryBlockingGroupLabel,
  localStoryEvidenceGate,
  localStoryNeedsCurrentHuman,
  localStoryNextAction,
  localStoryOwnerId,
  localStoryStageCounts,
  ROOMS_STORIES_VIEW_STORAGE_KEY,
  RoomsStoriesView,
} from "./presentation";

const story = Schema.decodeUnknownSync(RoomsLocalStoryV2)(storyAtHumanQaDocument);

describe("Rooms story presentation", () => {
  it("derives the durable claimant from the first stage transition", () => {
    expect(localStoryOwnerId(story)).toBe("h:019fb900-1000-7000-8000-000000000002");
    expect(localStoryOwnerId({ ...story, stage: "backlog" })).toBeNull();
  });

  it("uses the server gate at review and the pinned workflow rule before review", () => {
    expect(localStoryEvidenceGate(story)).toMatchObject({
      satisfied: true,
      missingKinds: ["screenshot"],
    });
    expect(
      localStoryEvidenceGate({ ...story, stage: "in-progress", gate: null, evidence: [] }),
    ).toMatchObject({
      satisfied: false,
      missingKinds: ["screenshot", "artifact"],
      unavailableReason: "Attach a screenshot or artifact before requesting review.",
    });
  });

  it("makes Human QA actionable only for an eligible current human", () => {
    expect(localStoryNeedsCurrentHuman(story, story.created_by)).toBe(true);
    expect(localStoryNextAction(story)).toBe("Approve and complete");
    expect(
      localStoryNeedsCurrentHuman(
        { ...story, gate: { ...story.gate!, reviewer_allowed: false } },
        story.created_by,
      ),
    ).toBe(false);
  });

  it("groups blocking separately from stage without inferring unavailable ownership", () => {
    expect(localStoryBlockingGroup(story, story.created_by)).toBe("waiting-on-you");
    expect(
      localStoryBlockingGroup(
        { ...story, gate: { ...story.gate!, reviewer_allowed: false } },
        story.created_by,
      ),
    ).toBe("waiting-on-someone-else");
    expect(localStoryBlockingGroup({ ...story, stage: "done" }, story.created_by)).toBe(
      "not-blocked",
    );
    expect(localStoryBlockingGroup(story, null)).toBe("unknown");
  });

  it("deduplicates attached and repeated output selections", () => {
    expect(countNewRoomsOutputSelections(["output-a"], ["output-a", "output-b", "output-b"])).toBe(
      1,
    );
  });

  it("persists the harmless Board/List preference with the shared UI convention", () => {
    try {
      setLocalStorageItem(ROOMS_STORIES_VIEW_STORAGE_KEY, "list", RoomsStoriesView);
      expect(getLocalStorageItem(ROOMS_STORIES_VIEW_STORAGE_KEY, RoomsStoriesView)).toBe("list");
    } finally {
      removeLocalStorageItem(ROOMS_STORIES_VIEW_STORAGE_KEY);
    }
  });

  it("recounts every stage from current server stories", () => {
    const counts = localStoryStageCounts([
      { ...story, id: "story:backlog", stage: "backlog" },
      story,
      { ...story, id: "story:done", stage: "done" },
    ]);
    expect(Object.fromEntries(counts)).toEqual({
      backlog: 1,
      "in-progress": 0,
      "human-qa": 1,
      done: 1,
    });
  });

  it("removes approved completion from Needs you and recounts Done", () => {
    const completed: typeof story = {
      ...story,
      stage: "done",
      gate: null,
      allowed_next_transitions: [],
      allowed_actions: { attach_evidence: false, review: false, complete: false },
      reviews: [
        {
          id: "019fb900-1000-7000-8000-000000000026",
          story_id: story.id,
          stage: "human-qa",
          decision: "approved" as const,
          evidence: [story.evidence[0]!.id],
          reviewed_by: "h:reviewer",
          reviewed_at: "2026-08-02T00:00:00.000Z",
          reviewed_seq: 10,
          source_event: {
            seq: 10,
            event_id: "019fb900-1000-7000-8000-000000000026",
            type: "task.reviewed" as const,
            schema: 1,
          },
        },
      ],
      completion: {
        story_id: story.id,
        evidence: [story.evidence[0]!.id],
        completed_by: "h:reviewer",
        completed_at: "2026-08-02T00:01:00.000Z",
        completed_seq: 11,
        source_event: {
          seq: 11,
          event_id: "019fb900-1000-7000-8000-000000000027",
          type: "task.completed" as const,
          schema: 2,
        },
      },
    };
    expect(completed.reviews[0]?.reviewed_by).toBe("h:reviewer");
    expect(localStoryNeedsCurrentHuman(completed, "h:reviewer")).toBe(false);
    expect(localStoryStageCounts([completed]).get("done")).toBe(1);
  });
});

describe("story blocking group", () => {
  it("agrees with mobile on who a Story is waiting for", () => {
    expect(localStoryBlockingGroup(story, story.created_by)).toBe("waiting-on-you");
    expect(
      localStoryBlockingGroup(
        { ...story, gate: { ...story.gate!, reviewer_allowed: false } },
        story.created_by,
      ),
    ).toBe("waiting-on-someone-else");
    expect(localStoryBlockingGroup({ ...story, stage: "backlog" }, "h:someone")).toBe(
      "not-blocked",
    );
    expect(localStoryBlockingGroup({ ...story, stage: "done" }, null)).toBe("not-blocked");
    expect(localStoryBlockingGroup(story, null)).toBe("unknown");
    expect(localStoryBlockingGroupLabel("waiting-on-you")).toBe("Waiting on you");
  });
});
