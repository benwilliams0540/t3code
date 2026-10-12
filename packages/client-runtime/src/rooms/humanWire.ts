import * as Schema from "effect/Schema";

export const RoomsSourceEvent = Schema.Struct({
  seq: Schema.Int,
  event_id: Schema.String,
  type: Schema.String,
  schema: Schema.Int,
});
const attribution = Schema.Struct({
  mode: Schema.Literal("explicit_principal"),
  writer_principal_id: Schema.String,
  actor_principal_id: Schema.String,
});
const item = {
  id: Schema.String,
  room_id: Schema.String,
  channel_id: Schema.String,
  occurred_at: Schema.String,
  summary: Schema.String,
  source_event: RoomsSourceEvent,
  attribution,
};
export const RoomsHumanMessage = Schema.Struct({
  ...item,
  kind: Schema.Literal("human_message"),
  payload: Schema.Struct({
    body_markdown: Schema.String,
    conversation_id: Schema.optionalKey(Schema.String),
  }),
});
export type RoomsHumanMessage = typeof RoomsHumanMessage.Type;
const safeError = Schema.Literals([
  "connector_cancelled",
  "connector_internal",
  "provider_rate_limited",
  "provider_request_rejected",
  "provider_timeout",
  "provider_unavailable",
]);
export const RoomsHumanAgentInvocationUpdate = Schema.Struct({
  ...item,
  kind: Schema.Literal("agent_invocation_update"),
  payload: Schema.Struct({
    invocation_id: Schema.String,
    triggering_message: RoomsSourceEvent,
    status: Schema.Literals(["running", "succeeded", "failed"]),
    safe_error_code: Schema.NullOr(safeError),
    reply_source_event: Schema.NullOr(RoomsSourceEvent),
    conversation_id: Schema.optionalKey(Schema.String),
    binding_id: Schema.optionalKey(Schema.String),
    turn_ordinal: Schema.optionalKey(Schema.Int),
  }),
});
export type RoomsHumanAgentInvocationUpdate = typeof RoomsHumanAgentInvocationUpdate.Type;
const unknownItem = Schema.Struct({
  ...item,
  kind: Schema.Literal("unknown_schema"),
  payload: Schema.Struct({
    event_type: Schema.String,
    event_schema: Schema.Int,
    display: Schema.Literal("unknown_event"),
  }),
});
export const RoomsHumanFeedItem = Schema.Union([
  RoomsHumanMessage,
  RoomsHumanAgentInvocationUpdate,
  unknownItem,
]);
export type RoomsHumanFeedItem = typeof RoomsHumanFeedItem.Type;
export const RoomsHumanFeedContract = Schema.Struct({
  id: Schema.Literal("rooms.human-shared"),
  version: Schema.Literal(2),
  schema_uri: Schema.Literal("contracts/rooms/human-shared/v2/schema.json"),
});
export const RoomsHumanFeed = Schema.Struct({
  contract: RoomsHumanFeedContract,
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

export const RoomsConversationContract = Schema.Struct({
  id: Schema.Literal("rooms.conversations"),
  version: Schema.Literal(2),
  schema_uri: Schema.Literal("contracts/rooms/conversations/v2/schema.json"),
});
export const RoomsConversation = Schema.Struct({
  id: Schema.String,
  room_id: Schema.String,
  channel_id: Schema.String,
  title: Schema.String,
  created_by: Schema.String,
  created_at: Schema.String,
  status: Schema.Literal("active"),
});
export type RoomsConversation = typeof RoomsConversation.Type;
export const RoomsConversationBinding = Schema.Struct({
  id: Schema.String,
  conversation_id: Schema.String,
  room_id: Schema.String,
  channel_id: Schema.String,
  agent_principal_id: Schema.String,
  machine_principal_id: Schema.String,
  // The backend owns runtime meaning and lifecycle; human clients preserve opaque references.
  runtime_target: Schema.Unknown,
  runtime_reference: Schema.Unknown,
  initialization_state: Schema.Literals(["initializing", "ready", "missing"]),
  created_at: Schema.String,
});
export const RoomsConversationTurn = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["running", "succeeded", "failed"]),
  connector: Schema.Struct({ id: Schema.String, configuration_epoch: Schema.Int }),
  agent: Schema.Struct({ principal_id: Schema.String, host_machine_principal_id: Schema.String }),
  room_id: Schema.String,
  channel_id: Schema.String,
  conversation_id: Schema.NullOr(Schema.String),
  binding_id: Schema.NullOr(Schema.String),
  turn_ordinal: Schema.NullOr(Schema.Int),
  turn_state: Schema.Literals([
    "queued",
    "ready",
    "dispatching",
    "accepted",
    "uncertain",
    "terminal",
    "legacy",
  ]),
  runtime_target: Schema.Unknown,
  runtime_run_id: Schema.NullOr(Schema.String),
  context: Schema.Struct({ cutoff_seq: Schema.Int, source_head_seq: Schema.Int }),
  started_at: Schema.String,
  terminal_at: Schema.NullOr(Schema.String),
  outbox: Schema.Unknown,
});
export const RoomsConversationProjection = Schema.Struct({
  contract: RoomsConversationContract,
  conversation: RoomsConversation,
  bindings: Schema.Array(RoomsConversationBinding),
  invocations: Schema.Array(RoomsConversationTurn),
});
export type RoomsConversationProjection = typeof RoomsConversationProjection.Type;
export const RoomsConversationCapabilities = Schema.Struct({
  "conversations.read": Schema.Boolean,
  "conversations.create": Schema.Boolean,
  "conversations.message": Schema.Boolean,
});
export type RoomsConversationCapabilities = typeof RoomsConversationCapabilities.Type;
export const RoomsConversationList = Schema.Struct({
  capabilities: RoomsConversationCapabilities,
  contract: RoomsConversationContract,
  room_id: Schema.String,
  channel_id: Schema.String,
  conversations: Schema.Array(RoomsConversation),
});
export type RoomsConversationList = typeof RoomsConversationList.Type;
export const RoomsConversationCreated = Schema.Struct({
  contract: RoomsConversationContract,
  conversation: RoomsConversation,
  source_event: RoomsSourceEvent,
  replayed: Schema.Boolean,
});
export const RoomsConversationMessage = Schema.Struct({
  contract: RoomsConversationContract,
  conversation: RoomsConversation,
  item: RoomsHumanMessage,
  source_event: RoomsSourceEvent,
  replayed: Schema.Boolean,
});
export type RoomsConversationCreated = typeof RoomsConversationCreated.Type;
export type RoomsConversationMessage = typeof RoomsConversationMessage.Type;
