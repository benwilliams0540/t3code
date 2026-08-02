import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import emptyStoriesDocument from "./fixtures/local-stories-v1-empty.json";
import storyWithThreadDocument from "./fixtures/local-stories-v1-story-with-thread.json";
import emptyStoriesV2Document from "./fixtures/local-stories-v2-empty.json";
import storyAtHumanQaDocument from "./fixtures/local-stories-v2-story-at-human-qa.json";
import { ROOMS_LOCAL_STORIES_SOURCE } from "../model/source";
import { RoomsLocalStoriesResponse, RoomsLocalStory } from "./localStoriesContract";

const decodeStories = Schema.decodeUnknownSync(RoomsLocalStoriesResponse);
const decodeStory = Schema.decodeUnknownSync(RoomsLocalStory);

describe("rooms.local-stories v1/v2 contract fixtures", () => {
  it("retains v1 decoding while pinning the immutable v2 producer", () => {
    const response = decodeStories(emptyStoriesDocument);
    expect(ROOMS_LOCAL_STORIES_SOURCE).toEqual({
      repositorySha: "67b20ef49cb9584af60f6c4e810659b7c77ce286",
      contractId: "rooms.local-stories",
      contractVersion: 2,
      schemaUri: "contracts/rooms/local-stories/v2/schema.json",
    });
    expect(response.stories).toEqual([]);
    expect(response.capabilities).toEqual({
      "work.read": true,
      "work.create": true,
      "work.link_thread": true,
    });
  });

  it("decodes the v2 collection and Human QA projection", () => {
    const response = decodeStories(emptyStoriesV2Document);
    const story = decodeStory(storyAtHumanQaDocument);
    expect(response.contract.version).toBe(2);
    if (response.contract.version !== 2) throw new Error("Expected the v2 fixture.");
    expect(response.capabilities).toMatchObject({
      "work.attach_evidence": true,
      "work.review": true,
      "work.complete": true,
    });
    expect(story).toMatchObject({
      stage: "human-qa",
      scope_head_seq: 9,
      allowed_actions: { attach_evidence: true, review: true, complete: false },
      gate: { reviewer_allowed: true, completion_ready: false },
      evidence: [{ kind: "artifact", attached_seq: 8 }],
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
