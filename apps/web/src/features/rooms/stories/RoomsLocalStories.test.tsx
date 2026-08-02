import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import storyWithThreadDocument from "../dataSource/fixtures/local-stories-v1-story-with-thread.json";
import storyAtHumanQaDocument from "../dataSource/fixtures/local-stories-v2-story-at-human-qa.json";
import { RoomsLocalStory, RoomsLocalStoryV2 } from "../dataSource/localStoriesContract";
import type { RoomsNativeThreadEntry } from "../threads/roomsNativeThreads";
import {
  localStoryNativeThreadTarget,
  localStoryCompletionEvidence,
  localStoryStageLabel,
  encodeRoomsLocalEvidenceFile,
  resolveLocalStoryNativeThread,
  RoomsLocalLinkedThreadStatus,
  RoomsLocalStoryGateStatus,
  RoomsLocalStoriesEmptyState,
} from "./RoomsLocalStories";

const story = Schema.decodeUnknownSync(RoomsLocalStory)(storyWithThreadDocument);
const humanQaStory = Schema.decodeUnknownSync(RoomsLocalStoryV2)(storyAtHumanQaDocument);
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

  it("renders the explicit persisted Human QA action from the v2 gate", () => {
    const markup = renderToStaticMarkup(
      <RoomsLocalStoryGateStatus
        onApprove={() => undefined}
        pending={false}
        story={humanQaStory}
      />,
    );
    expect(markup).toContain("Human QA decision");
    expect(markup).toContain("Approve Human QA");
    expect(markup).toContain("Approval records your durable human decision");
    expect(markup).not.toContain("Request changes");
    expect(localStoryStageLabel("human-qa")).toBe("Human QA");
  });

  it("binds terminal completion to the exact approved review evidence", () => {
    expect(localStoryCompletionEvidence(humanQaStory)).toEqual([]);
    const evidence = [humanQaStory.evidence[0]!.id];
    const approved = {
      ...humanQaStory,
      gate: { ...humanQaStory.gate!, approved_review_id: "019fb900-1000-7000-8000-000000000026" },
      reviews: [
        {
          id: "019fb900-1000-7000-8000-000000000026",
          story_id: humanQaStory.id,
          stage: "human-qa",
          decision: "approved" as const,
          evidence,
          reviewed_by: humanQaStory.created_by,
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
    };
    expect(localStoryCompletionEvidence(approved)).toEqual(evidence);
  });

  it("encodes one bounded evidence artifact exactly and rejects empty bytes", async () => {
    await expect(
      encodeRoomsLocalEvidenceFile(new Blob(["M4 artifact"], { type: "text/plain" })),
    ).resolves.toEqual({ bodyBase64: "TTQgYXJ0aWZhY3Q=", mediaType: "text/plain" });
    await expect(encodeRoomsLocalEvidenceFile(new Blob([]))).rejects.toThrow("non-empty");
  });
});
