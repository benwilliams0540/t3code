import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import emptyStoriesDocument from "./fixtures/local-stories-v1-empty.json";
import storyWithThreadDocument from "./fixtures/local-stories-v1-story-with-thread.json";
import { ROOMS_LOCAL_STORIES_SOURCE } from "../model/source";
import { RoomsLocalStoriesResponse, RoomsLocalStory } from "./localStoriesContract";

const decodeStories = Schema.decodeUnknownSync(RoomsLocalStoriesResponse);
const decodeStory = Schema.decodeUnknownSync(RoomsLocalStory);

describe("rooms.local-stories v1 contract fixtures", () => {
  it("pins the immutable producer and decodes a valid zero-story collection", () => {
    const response = decodeStories(emptyStoriesDocument);
    expect(ROOMS_LOCAL_STORIES_SOURCE).toEqual({
      repositorySha: "918c5b31f510fa065b246d8b9fb13c5505581838",
      contractId: "rooms.local-stories",
      contractVersion: 1,
      schemaUri: "contracts/rooms/local-stories/v1/schema.json",
    });
    expect(response.stories).toEqual([]);
    expect(response.capabilities).toEqual({
      "work.read": true,
      "work.create": true,
      "work.link_thread": true,
    });
  });

  it("decodes the producer story and exact native T3 identity without live status fields", () => {
    const story = decodeStory(storyWithThreadDocument);
    expect(story.source_event).toMatchObject({ type: "task.created", schema: 2, seq: 5 });
    expect(story.native_thread).toMatchObject({
      environment_id: "environment-local",
      project_id: "project-rooms",
      thread_id: "thread-composer-shortcuts",
      source_event: { type: "task.thread-linked", schema: 1, seq: 6 },
    });
    expect(story.native_thread).not.toHaveProperty("provider");
    expect(story.native_thread).not.toHaveProperty("status");
  });

  it("retains a source schema value for the client invariant check", () => {
    const legacy = decodeStory({
      ...storyWithThreadDocument,
      source_event: { ...storyWithThreadDocument.source_event, schema: 1 },
    });
    expect(legacy.source_event.schema).toBe(1);
  });
});
