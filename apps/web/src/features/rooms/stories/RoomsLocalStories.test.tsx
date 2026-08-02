import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import storyWithThreadDocument from "../dataSource/fixtures/local-stories-v1-story-with-thread.json";
import { RoomsLocalStory } from "../dataSource/localStoriesContract";
import type { RoomsNativeThreadEntry } from "../threads/roomsNativeThreads";
import {
  localStoryNativeThreadTarget,
  resolveLocalStoryNativeThread,
  RoomsLocalLinkedThreadStatus,
  RoomsLocalStoriesEmptyState,
} from "./RoomsLocalStories";

const story = Schema.decodeUnknownSync(RoomsLocalStory)(storyWithThreadDocument);
const matchingThread: RoomsNativeThreadEntry = {
  environmentId: EnvironmentId.make("environment-local"),
  projectId: ProjectId.make("project-rooms"),
  threadId: ThreadId.make("thread-composer-shortcuts"),
  title: "Composer shortcuts",
  projectTitle: "t3code",
  updatedAt: "2026-08-02T00:10:00.000Z",
  status: "ready",
  workingStartedAt: null,
  providerInstanceId: "codex",
};

describe("Rooms Local Stories surface", () => {
  it("shows an honest actionable zero state without Sample fixture work", () => {
    const markup = renderToStaticMarkup(<RoomsLocalStoriesEmptyState />);
    expect(markup).toContain("No Local stories yet");
    expect(markup).toContain("actual thread");
    expect(markup).not.toContain("Freeze the workspace read fixture");
  });

  it("resolves only the exact durable environment, project, and thread identity", () => {
    expect(resolveLocalStoryNativeThread(story, [matchingThread])).toBe(matchingThread);
    for (const mismatch of [
      { ...matchingThread, environmentId: EnvironmentId.make("environment-other") },
      { ...matchingThread, projectId: ProjectId.make("project-other") },
      { ...matchingThread, threadId: ThreadId.make("thread-other") },
    ]) {
      expect(resolveLocalStoryNativeThread(story, [mismatch])).toBeNull();
    }
    expect(
      resolveLocalStoryNativeThread({ ...story, native_thread: null }, [matchingThread]),
    ).toBeNull();
  });

  it("opens the resolved identity through the native Rooms route", () => {
    expect(localStoryNativeThreadTarget(matchingThread)).toEqual({
      kind: "native-thread",
      environmentId: EnvironmentId.make("environment-local"),
      threadId: ThreadId.make("thread-composer-shortcuts"),
    });
    const markup = renderToStaticMarkup(
      <RoomsLocalLinkedThreadStatus
        navigate={() => undefined}
        resolvedThread={matchingThread}
        story={story}
      />,
    );
    expect(markup).toContain("Open thread");
    expect(markup).toContain("provider codex");
    expect(markup).toContain("Resting");
  });

  it("renders an explicit stale state and never a fallback Open action", () => {
    const markup = renderToStaticMarkup(
      <RoomsLocalLinkedThreadStatus
        navigate={() => undefined}
        resolvedThread={null}
        story={story}
      />,
    );
    expect(markup).toContain("Linked thread unavailable or stale");
    expect(markup).toContain("thread-composer-shortcuts");
    expect(markup).not.toContain("Open thread");
  });
});
