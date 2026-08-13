import * as Schema from "effect/Schema";

export const ROOMS_HUMAN_CONTRACT_ID = "rooms.human-shared" as const;
export const ROOMS_HUMAN_CONTRACT_VERSION = 1 as const;
export const ROOMS_HUMAN_SCHEMA_URI = "contracts/rooms/human-shared/v1/schema.json" as const;

const RoomsHumanContract = Schema.Struct({
  id: Schema.Literal(ROOMS_HUMAN_CONTRACT_ID),
  version: Schema.Literal(ROOMS_HUMAN_CONTRACT_VERSION),
  schema_uri: Schema.Literal(ROOMS_HUMAN_SCHEMA_URI),
});

export const RoomsHumanRole = Schema.Literals(["observer", "operator", "admin"]);

export const RoomsHumanPrincipal = Schema.Struct({
  id: Schema.String,
  type: Schema.Literals(["human", "agent", "machine"]),
  display_name: Schema.NullOr(Schema.String),
  role: Schema.optionalKey(Schema.NullOr(RoomsHumanRole)),
});
export type RoomsHumanPrincipal = typeof RoomsHumanPrincipal.Type;

const RoomsHumanRoom = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  locality: Schema.Literal("shared"),
  role: Schema.optionalKey(RoomsHumanRole),
});

export const RoomsHumanSession = Schema.Struct({
  contract: RoomsHumanContract,
  status: Schema.Literals(["authenticated_nonmember", "ready"]),
  principal: Schema.NullOr(RoomsHumanPrincipal),
  rooms: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      slug: Schema.String,
      name: Schema.String,
      locality: Schema.Literal("shared"),
      role: RoomsHumanRole,
    }),
  ),
});
export type RoomsHumanSession = typeof RoomsHumanSession.Type;
export type RoomsHumanSessionRoom = RoomsHumanSession["rooms"][number];

const RoomsSourceEvent = Schema.Struct({
  seq: Schema.Int,
  event_id: Schema.String,
  type: Schema.String,
  schema: Schema.Int,
});

export const RoomsHumanChannel = Schema.Struct({
  id: Schema.String,
  room_id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
  purpose: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  source_event: RoomsSourceEvent,
});
export type RoomsHumanChannel = typeof RoomsHumanChannel.Type;

const RoomsHumanCapabilities = Schema.Struct({
  "workspace.read": Schema.Boolean,
  "channel.read": Schema.Boolean,
  "channel.create": Schema.Boolean,
  "message.create": Schema.Boolean,
  "work.read": Schema.Boolean,
  "work.create": Schema.Boolean,
  "work.link_thread": Schema.Boolean,
  "work.attach_evidence": Schema.Boolean,
  "work.review": Schema.Boolean,
  "work.complete": Schema.Boolean,
  "membership.manage": Schema.Boolean,
  "role.manage": Schema.Boolean,
});

export const RoomsHumanWorkspace = Schema.Struct({
  contract: RoomsHumanContract,
  status: Schema.Literal("ready"),
  room: RoomsHumanRoom,
  principal: Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("human"),
    display_name: Schema.NullOr(Schema.String),
    role: RoomsHumanRole,
  }),
  capabilities: RoomsHumanCapabilities,
  principals: Schema.Array(RoomsHumanPrincipal),
  channels: Schema.Array(RoomsHumanChannel),
});
export type RoomsHumanWorkspace = typeof RoomsHumanWorkspace.Type;

const RoomsFeedAttribution = Schema.Struct({
  mode: Schema.Literal("explicit_principal"),
  writer_principal_id: Schema.String,
  actor_principal_id: Schema.String,
});

export const RoomsHumanMessage = Schema.Struct({
  id: Schema.String,
  room_id: Schema.String,
  channel_id: Schema.String,
  kind: Schema.Literal("human_message"),
  occurred_at: Schema.String,
  summary: Schema.String,
  source_event: RoomsSourceEvent,
  attribution: RoomsFeedAttribution,
  payload: Schema.Struct({ body_markdown: Schema.String }),
});
export type RoomsHumanMessage = typeof RoomsHumanMessage.Type;

const RoomsUnknownFeedItem = Schema.Struct({
  id: Schema.String,
  room_id: Schema.String,
  channel_id: Schema.String,
  kind: Schema.Literal("unknown_schema"),
  occurred_at: Schema.String,
  summary: Schema.String,
  source_event: RoomsSourceEvent,
  attribution: RoomsFeedAttribution,
  payload: Schema.Struct({
    event_type: Schema.String,
    event_schema: Schema.Int,
    display: Schema.Literal("unknown_event"),
  }),
});

export const RoomsHumanFeedItem = Schema.Union([RoomsHumanMessage, RoomsUnknownFeedItem]);
export type RoomsHumanFeedItem = typeof RoomsHumanFeedItem.Type;

export const RoomsHumanFeed = Schema.Struct({
  contract: RoomsHumanContract,
  room_id: Schema.String,
  channel_id: Schema.String,
  page_info: Schema.Struct({
    after_seq: Schema.Int,
    limit: Schema.Int,
    snapshot_head_seq: Schema.Int,
    next_cursor: Schema.Int,
    has_more: Schema.Boolean,
  }),
  items: Schema.Array(RoomsHumanFeedItem),
});
export type RoomsHumanFeed = typeof RoomsHumanFeed.Type;

const RoomsHumanChangeResponseBase = {
  contract: RoomsHumanContract,
  room_id: Schema.String,
  after_seq: Schema.Int,
  head_seq: Schema.Int,
} as const;

export const RoomsHumanChangeResponse = Schema.Union([
  Schema.Struct({
    ...RoomsHumanChangeResponseBase,
    changed: Schema.Literal(true),
    reason: Schema.Literal("advanced"),
  }),
  Schema.Struct({
    ...RoomsHumanChangeResponseBase,
    changed: Schema.Literal(false),
    reason: Schema.Literal("timeout"),
  }),
]);
export type RoomsHumanChangeResponse = typeof RoomsHumanChangeResponse.Type;

const RoomsStorySourceEvent = Schema.Struct({
  seq: Schema.Int,
  event_id: Schema.String,
  type: Schema.String,
  schema: Schema.Int,
});

const RoomsNativeThread = Schema.Struct({
  room_id: Schema.String,
  story_id: Schema.String,
  environment_id: Schema.String,
  project_id: Schema.String,
  thread_id: Schema.String,
  linked_by: Schema.String,
  linked_at: Schema.String,
  linked_seq: Schema.Int,
  source_event: RoomsStorySourceEvent,
});

const RoomsStoryBase = {
  id: Schema.String,
  room_id: Schema.String,
  title: Schema.String,
  story_type: Schema.String,
  workflow_version: Schema.Int,
  stage: Schema.String,
  created_by: Schema.String,
  created_at: Schema.String,
  created_seq: Schema.Int,
  source_event: RoomsStorySourceEvent,
  native_thread: Schema.NullOr(RoomsNativeThread),
} as const;

const RoomsStoryV1 = Schema.Struct(RoomsStoryBase);

const RoomsEvidenceKind = Schema.Literals([
  "annotation",
  "artifact",
  "command-output",
  "diff",
  "link",
  "screenshot",
  "test-run",
]);

const RoomsEvidence = Schema.Struct({
  id: Schema.String,
  story_id: Schema.String,
  kind: RoomsEvidenceKind,
  cas: Schema.Struct({
    hash: Schema.String,
    bytes: Schema.Int,
    media_type: Schema.String,
  }),
  note: Schema.NullOr(Schema.String),
  produced_by: Schema.String,
  attached_at: Schema.String,
  attached_seq: Schema.Int,
  source_event: RoomsStorySourceEvent,
});

const RoomsReview = Schema.Struct({
  id: Schema.String,
  story_id: Schema.String,
  stage: Schema.String,
  decision: Schema.Literal("approved"),
  evidence: Schema.Array(Schema.String),
  reviewed_by: Schema.String,
  reviewed_at: Schema.String,
  reviewed_seq: Schema.Int,
  source_event: RoomsStorySourceEvent,
});

const RoomsCompletion = Schema.Struct({
  story_id: Schema.String,
  evidence: Schema.Array(Schema.String),
  completed_by: Schema.String,
  completed_at: Schema.String,
  completed_seq: Schema.Int,
  source_event: RoomsStorySourceEvent,
});

const RoomsStoryGate = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  required_evidence: Schema.Struct({
    mode: Schema.Literals(["all", "any"]),
    kinds: Schema.Array(RoomsEvidenceKind),
  }),
  allowed_principal_types: Schema.Array(Schema.Literals(["human", "agent", "machine"])),
  forbid_self_review: Schema.Boolean,
  eligible_evidence: Schema.Array(Schema.String),
  evidence_satisfied: Schema.Boolean,
  reviewer_allowed: Schema.Boolean,
  approved_review_id: Schema.NullOr(Schema.String),
  completion_ready: Schema.Boolean,
});

export const RoomsHumanStoryV2 = Schema.Struct({
  ...RoomsStoryBase,
  scope_head_seq: Schema.Int,
  as_of_seq: Schema.Int,
  allowed_next_transitions: Schema.Array(
    Schema.Struct({
      from: Schema.String,
      to: Schema.String,
      label: Schema.String,
      terminal: Schema.Boolean,
      allowed: Schema.Boolean,
      unavailable_reason: Schema.NullOr(Schema.String),
    }),
  ),
  allowed_actions: Schema.Struct({
    attach_evidence: Schema.Boolean,
    review: Schema.Boolean,
    complete: Schema.Boolean,
  }),
  gate: Schema.NullOr(RoomsStoryGate),
  evidence: Schema.Array(RoomsEvidence),
  reviews: Schema.Array(RoomsReview),
  completion: Schema.NullOr(RoomsCompletion),
  audit: Schema.Array(
    Schema.Struct({
      actor: Schema.String,
      occurred_at: Schema.String,
      source_event: RoomsStorySourceEvent,
    }),
  ),
});
export type RoomsHumanStoryV2 = typeof RoomsHumanStoryV2.Type;

export const RoomsHumanStory = Schema.Union([RoomsHumanStoryV2, RoomsStoryV1]);
export type RoomsHumanStory = typeof RoomsHumanStory.Type;

export const RoomsHumanStoriesResponse = Schema.Struct({
  contract: RoomsHumanContract,
  room_id: Schema.String,
  capabilities: Schema.Record(Schema.String, Schema.Boolean),
  stories: Schema.Array(RoomsHumanStory),
});
export type RoomsHumanStoriesResponse = typeof RoomsHumanStoriesResponse.Type;

export const RoomsHumanErrorResponse = Schema.Struct({
  error: Schema.String,
  message: Schema.String,
  after_seq: Schema.optionalKey(Schema.Int),
  head_seq: Schema.optionalKey(Schema.Int),
});

export function isRoomsHumanStoryV2(story: RoomsHumanStory): story is RoomsHumanStoryV2 {
  return "scope_head_seq" in story;
}
