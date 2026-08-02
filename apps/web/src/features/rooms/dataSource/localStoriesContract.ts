import * as Schema from "effect/Schema";

const RoomsLocalStorySourceEvent = Schema.Struct({
  seq: Schema.Int,
  event_id: Schema.String,
  type: Schema.Literals(["task.created", "task.thread-linked"]),
  schema: Schema.Int,
});

export const RoomsLocalNativeThread = Schema.Struct({
  room_id: Schema.String,
  story_id: Schema.String,
  environment_id: Schema.String,
  project_id: Schema.String,
  thread_id: Schema.String,
  linked_by: Schema.String,
  linked_at: Schema.String,
  linked_seq: Schema.Int,
  source_event: RoomsLocalStorySourceEvent,
});
export type RoomsLocalNativeThread = typeof RoomsLocalNativeThread.Type;

export const RoomsLocalStory = Schema.Struct({
  id: Schema.String,
  room_id: Schema.String,
  title: Schema.String,
  story_type: Schema.String,
  workflow_version: Schema.Int,
  stage: Schema.String,
  created_by: Schema.String,
  created_at: Schema.String,
  created_seq: Schema.Int,
  source_event: RoomsLocalStorySourceEvent,
  native_thread: Schema.NullOr(RoomsLocalNativeThread),
});
export type RoomsLocalStory = typeof RoomsLocalStory.Type;

export const RoomsLocalStoriesResponse = Schema.Struct({
  contract: Schema.Struct({
    id: Schema.Literal("rooms.local-stories"),
    version: Schema.Literal(1),
    schema_uri: Schema.Literal("contracts/rooms/local-stories/v1/schema.json"),
  }),
  room_id: Schema.String,
  capabilities: Schema.Struct({
    "work.read": Schema.Boolean,
    "work.create": Schema.Boolean,
    "work.link_thread": Schema.Boolean,
  }),
  stories: Schema.Array(RoomsLocalStory),
});
export type RoomsLocalStoriesResponse = typeof RoomsLocalStoriesResponse.Type;

export interface RoomsLocalCreateStoryInput {
  readonly requestId: string;
  readonly title: string;
  readonly storyType: string;
}

export interface RoomsLocalLinkStoryThreadInput {
  readonly requestId: string;
  readonly environmentId: string;
  readonly projectId: string;
  readonly threadId: string;
}
