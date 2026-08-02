import * as Schema from "effect/Schema";

export const RoomsLocalStoryEventType = Schema.Literals([
  "task.created",
  "task.thread-linked",
  "task.stage-changed",
  "evidence.attached",
  "task.reviewed",
  "task.completed",
]);

export const RoomsLocalStorySourceEvent = Schema.Struct({
  seq: Schema.Int,
  event_id: Schema.String,
  type: RoomsLocalStoryEventType,
  schema: Schema.Int,
});
export type RoomsLocalStorySourceEvent = typeof RoomsLocalStorySourceEvent.Type;

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

const RoomsLocalStoryBase = {
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
} as const;

export const RoomsLocalStoryV1 = Schema.Struct(RoomsLocalStoryBase);
export type RoomsLocalStoryV1 = typeof RoomsLocalStoryV1.Type;

export const RoomsLocalCasTuple = Schema.Struct({
  hash: Schema.String,
  bytes: Schema.Int,
  media_type: Schema.String,
});
export type RoomsLocalCasTuple = typeof RoomsLocalCasTuple.Type;

export const RoomsLocalEvidenceKind = Schema.Literals([
  "annotation",
  "artifact",
  "command-output",
  "diff",
  "link",
  "screenshot",
  "test-run",
]);
export type RoomsLocalEvidenceKind = typeof RoomsLocalEvidenceKind.Type;

export const RoomsLocalEvidence = Schema.Struct({
  id: Schema.String,
  story_id: Schema.String,
  kind: RoomsLocalEvidenceKind,
  cas: RoomsLocalCasTuple,
  note: Schema.NullOr(Schema.String),
  produced_by: Schema.String,
  attached_at: Schema.String,
  attached_seq: Schema.Int,
  source_event: RoomsLocalStorySourceEvent,
});
export type RoomsLocalEvidence = typeof RoomsLocalEvidence.Type;

export const RoomsLocalReview = Schema.Struct({
  id: Schema.String,
  story_id: Schema.String,
  stage: Schema.String,
  decision: Schema.Literal("approved"),
  evidence: Schema.Array(Schema.String),
  reviewed_by: Schema.String,
  reviewed_at: Schema.String,
  reviewed_seq: Schema.Int,
  source_event: RoomsLocalStorySourceEvent,
});
export type RoomsLocalReview = typeof RoomsLocalReview.Type;

export const RoomsLocalCompletion = Schema.Struct({
  story_id: Schema.String,
  evidence: Schema.Array(Schema.String),
  completed_by: Schema.String,
  completed_at: Schema.String,
  completed_seq: Schema.Int,
  source_event: RoomsLocalStorySourceEvent,
});
export type RoomsLocalCompletion = typeof RoomsLocalCompletion.Type;

export const RoomsLocalStoryTransition = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  label: Schema.String,
  terminal: Schema.Boolean,
  allowed: Schema.Boolean,
  unavailable_reason: Schema.NullOr(Schema.String),
});
export type RoomsLocalStoryTransition = typeof RoomsLocalStoryTransition.Type;

export const RoomsLocalStoryGate = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  required_evidence: Schema.Struct({
    mode: Schema.Literals(["all", "any"]),
    kinds: Schema.Array(RoomsLocalEvidenceKind),
  }),
  allowed_principal_types: Schema.Array(Schema.Literals(["human", "agent", "machine"])),
  forbid_self_review: Schema.Boolean,
  eligible_evidence: Schema.Array(Schema.String),
  evidence_satisfied: Schema.Boolean,
  reviewer_allowed: Schema.Boolean,
  approved_review_id: Schema.NullOr(Schema.String),
  completion_ready: Schema.Boolean,
});
export type RoomsLocalStoryGate = typeof RoomsLocalStoryGate.Type;

export const RoomsLocalAuditEntry = Schema.Struct({
  actor: Schema.String,
  occurred_at: Schema.String,
  source_event: RoomsLocalStorySourceEvent,
});
export type RoomsLocalAuditEntry = typeof RoomsLocalAuditEntry.Type;

export const RoomsLocalStoryV2 = Schema.Struct({
  ...RoomsLocalStoryBase,
  scope_head_seq: Schema.Int,
  as_of_seq: Schema.Int,
  allowed_next_transitions: Schema.Array(RoomsLocalStoryTransition),
  allowed_actions: Schema.Struct({
    attach_evidence: Schema.Boolean,
    review: Schema.Boolean,
    complete: Schema.Boolean,
  }),
  gate: Schema.NullOr(RoomsLocalStoryGate),
  evidence: Schema.Array(RoomsLocalEvidence),
  reviews: Schema.Array(RoomsLocalReview),
  completion: Schema.NullOr(RoomsLocalCompletion),
  audit: Schema.Array(RoomsLocalAuditEntry),
});
export type RoomsLocalStoryV2 = typeof RoomsLocalStoryV2.Type;

export const RoomsLocalStory = Schema.Union([RoomsLocalStoryV2, RoomsLocalStoryV1]);
export type RoomsLocalStory = typeof RoomsLocalStory.Type;

const RoomsLocalStoriesCapabilitiesV1 = Schema.Struct({
  "work.read": Schema.Boolean,
  "work.create": Schema.Boolean,
  "work.link_thread": Schema.Boolean,
});

const RoomsLocalStoriesCapabilitiesV2 = Schema.Struct({
  "work.read": Schema.Boolean,
  "work.create": Schema.Boolean,
  "work.link_thread": Schema.Boolean,
  "work.claim": Schema.Boolean,
  "work.attach_evidence": Schema.Boolean,
  "work.review": Schema.Boolean,
  "work.complete": Schema.Boolean,
});

export const RoomsLocalStoriesResponseV1 = Schema.Struct({
  contract: Schema.Struct({
    id: Schema.Literal("rooms.local-stories"),
    version: Schema.Literal(1),
    schema_uri: Schema.Literal("contracts/rooms/local-stories/v1/schema.json"),
  }),
  room_id: Schema.String,
  capabilities: RoomsLocalStoriesCapabilitiesV1,
  stories: Schema.Array(RoomsLocalStoryV1),
});
export type RoomsLocalStoriesResponseV1 = typeof RoomsLocalStoriesResponseV1.Type;

export const RoomsLocalStoriesResponseV2 = Schema.Struct({
  contract: Schema.Struct({
    id: Schema.Literal("rooms.local-stories"),
    version: Schema.Literal(2),
    schema_uri: Schema.Literal("contracts/rooms/local-stories/v2/schema.json"),
  }),
  room_id: Schema.String,
  capabilities: RoomsLocalStoriesCapabilitiesV2,
  stories: Schema.Array(RoomsLocalStoryV2),
});
export type RoomsLocalStoriesResponseV2 = typeof RoomsLocalStoriesResponseV2.Type;

export const RoomsLocalStoriesResponse = Schema.Union([
  RoomsLocalStoriesResponseV1,
  RoomsLocalStoriesResponseV2,
]);
export type RoomsLocalStoriesResponse = typeof RoomsLocalStoriesResponse.Type;

export function isRoomsLocalStoryV2(story: RoomsLocalStory): story is RoomsLocalStoryV2 {
  return "scope_head_seq" in story;
}

export function isRoomsLocalStoriesResponseV2(
  response: RoomsLocalStoriesResponse,
): response is RoomsLocalStoriesResponseV2 {
  return response.contract.version === 2;
}

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

export interface RoomsLocalUploadCasInput {
  readonly bodyBase64: string;
  readonly mediaType: string;
}

export interface RoomsLocalAttachEvidenceInput {
  readonly requestId: string;
  readonly expectedHeadSeq: number;
  readonly kind: RoomsLocalEvidenceKind;
  readonly cas: RoomsLocalCasTuple;
  readonly note: string | null;
}

export interface RoomsLocalTransitionStoryInput {
  readonly requestId: string;
  readonly expectedHeadSeq: number;
  readonly to: string;
  readonly evidence: readonly string[];
}

export interface RoomsLocalReviewStoryInput {
  readonly requestId: string;
  readonly expectedHeadSeq: number;
  readonly decision: "approved";
  readonly evidence: readonly string[];
}
