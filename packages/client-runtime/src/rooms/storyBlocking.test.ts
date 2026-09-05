import { describe, expect, it } from "vite-plus/test";

import {
  classifyRoomsStoryBlocking,
  ROOMS_STORY_BLOCKING_GROUPS,
  type RoomsStoryBlockingFacts,
} from "./storyBlocking.ts";

const ME = "h:me";
const OTHER = "h:other";

function facts(overrides: Partial<RoomsStoryBlockingFacts> = {}): RoomsStoryBlockingFacts {
  return {
    stage: "backlog",
    workflowKnown: true,
    ownerPrincipalId: null,
    needsCurrentHuman: false,
    ...overrides,
  };
}

describe("classifyRoomsStoryBlocking", () => {
  it("treats a done Story as not blocked even without a signed-in principal", () => {
    expect(classifyRoomsStoryBlocking(facts({ stage: "done" }), null)).toBe("not-blocked");
    expect(classifyRoomsStoryBlocking(facts({ stage: "done", ownerPrincipalId: OTHER }), ME)).toBe(
      "not-blocked",
    );
  });

  it("answers unknown when the reader or the workflow is unknown", () => {
    expect(classifyRoomsStoryBlocking(facts(), null)).toBe("unknown");
    expect(classifyRoomsStoryBlocking(facts({ workflowKnown: false }), ME)).toBe("unknown");
  });

  it("puts the current human first whenever the next action is theirs", () => {
    expect(
      classifyRoomsStoryBlocking(facts({ stage: "human-qa", needsCurrentHuman: true }), ME),
    ).toBe("waiting-on-you");
    expect(
      classifyRoomsStoryBlocking(facts({ stage: "in-progress", ownerPrincipalId: ME }), ME),
    ).toBe("waiting-on-you");
  });

  it("assigns review and owned work to someone else when it is not the reader's", () => {
    expect(classifyRoomsStoryBlocking(facts({ stage: "human-qa" }), ME)).toBe(
      "waiting-on-someone-else",
    );
    expect(
      classifyRoomsStoryBlocking(facts({ stage: "in-progress", ownerPrincipalId: OTHER }), ME),
    ).toBe("waiting-on-someone-else");
  });

  it("calls an unowned backlog Story not blocked and an unowned in-progress Story unknown", () => {
    // These two rows are where web and mobile used to disagree.
    expect(classifyRoomsStoryBlocking(facts({ stage: "backlog" }), ME)).toBe("not-blocked");
    expect(classifyRoomsStoryBlocking(facts({ stage: "in-progress" }), ME)).toBe("unknown");
  });

  it("only ever returns one of the declared groups", () => {
    for (const stage of ["backlog", "in-progress", "human-qa", "done"] as const) {
      for (const owner of [null, ME, OTHER]) {
        for (const needs of [false, true]) {
          const group = classifyRoomsStoryBlocking(
            facts({ stage, ownerPrincipalId: owner, needsCurrentHuman: needs }),
            ME,
          );
          expect(ROOMS_STORY_BLOCKING_GROUPS).toContain(group);
        }
      }
    }
  });
});
