import { describe, expect, it } from "vite-plus/test";

import * as Schema from "effect/Schema";

import storyAtHumanQaDocument from "../dataSource/fixtures/local-stories-v2-story-at-human-qa.json";
import { RoomsLocalStoryV2 } from "../dataSource/localStoriesContract";
import { findRoomsContextStory, toggleRoomsContextRail } from "./contextRailState";

const story = Schema.decodeUnknownSync(RoomsLocalStoryV2)(storyAtHumanQaDocument);

describe("Rooms thread context rail state", () => {
  it("supports closing and reopening the same native cockpit rail", () => {
    expect(toggleRoomsContextRail(true)).toBe(false);
    expect(toggleRoomsContextRail(toggleRoomsContextRail(true))).toBe(true);
  });

  it("associates only the exact durable environment, project, and thread identity", () => {
    expect(
      findRoomsContextStory([story], {
        environmentId: story.native_thread!.environment_id,
        projectId: story.native_thread!.project_id,
        threadId: story.native_thread!.thread_id,
      }),
    ).toBe(story);
    expect(
      findRoomsContextStory([story], {
        environmentId: story.native_thread!.environment_id,
        projectId: story.native_thread!.project_id,
        threadId: "another-thread",
      }),
    ).toBeNull();
  });
});
