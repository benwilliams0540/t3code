import * as Schema from "effect/Schema";

export const RoomsLocalSourceEvent = Schema.Struct({
  seq: Schema.Int,
  event_id: Schema.String,
  type: Schema.String,
  schema: Schema.Int,
});
export type RoomsLocalSourceEvent = typeof RoomsLocalSourceEvent.Type;

export const RoomsLocalChannel = Schema.Struct({
  id: Schema.String,
  room_id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
  purpose: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  source_event: RoomsLocalSourceEvent,
});
export type RoomsLocalChannel = typeof RoomsLocalChannel.Type;

const RoomsLocalAttribution = Schema.Struct({
  mode: Schema.Literal("explicit_principal"),
  writer_principal_id: Schema.String,
  actor_principal_id: Schema.String,
});

export const RoomsLocalHumanMessage = Schema.Struct({
  id: Schema.String,
  room_id: Schema.String,
  channel_id: Schema.String,
  kind: Schema.Literal("human_message"),
  occurred_at: Schema.String,
  summary: Schema.String,
  source_event: RoomsLocalSourceEvent,
  attribution: RoomsLocalAttribution,
  payload: Schema.Struct({ body_markdown: Schema.String }),
});
export type RoomsLocalHumanMessage = typeof RoomsLocalHumanMessage.Type;

export const RoomsLocalUnknownSchemaItem = Schema.Struct({
  id: Schema.String,
  room_id: Schema.String,
  channel_id: Schema.String,
  kind: Schema.Literal("unknown_schema"),
  occurred_at: Schema.String,
  summary: Schema.String,
  source_event: RoomsLocalSourceEvent,
  attribution: RoomsLocalAttribution,
  payload: Schema.Struct({
    event_type: Schema.String,
    event_schema: Schema.Int,
    display: Schema.Literal("unknown_event"),
  }),
});
export type RoomsLocalUnknownSchemaItem = typeof RoomsLocalUnknownSchemaItem.Type;

export const RoomsLocalFeedItem = Schema.Union([
  RoomsLocalHumanMessage,
  RoomsLocalUnknownSchemaItem,
]);
export type RoomsLocalFeedItem = typeof RoomsLocalFeedItem.Type;

export const RoomsLocalFeed = Schema.Struct({
  room_id: Schema.String,
  channel_id: Schema.String,
  page_info: Schema.Struct({
    after_seq: Schema.Int,
    limit: Schema.Int,
    snapshot_head_seq: Schema.Int,
    next_cursor: Schema.Int,
    has_more: Schema.Boolean,
  }),
  items: Schema.Array(RoomsLocalFeedItem),
});
export type RoomsLocalFeed = typeof RoomsLocalFeed.Type;

export const RoomsLocalWorkspace = Schema.Struct({
  contract: Schema.Struct({
    id: Schema.Literal("rooms.local-channels"),
    version: Schema.Literal(1),
    schema_uri: Schema.Literal("contracts/rooms/local-channels/v1/schema.json"),
  }),
  status: Schema.Literal("ready"),
  room: Schema.Struct({
    id: Schema.String,
    slug: Schema.String,
    name: Schema.String,
    locality: Schema.Literal("local_only"),
  }),
  principal: Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("human"),
    display_name: Schema.String,
    role: Schema.Literals(["observer", "operator", "admin"]),
  }),
  capabilities: Schema.Struct({
    "workspace.read": Schema.Boolean,
    "channel.read": Schema.Boolean,
    "channel.create": Schema.Boolean,
    "message.create": Schema.Boolean,
  }),
  channels: Schema.Array(RoomsLocalChannel),
});
export type RoomsLocalWorkspace = typeof RoomsLocalWorkspace.Type;

export const RoomsLocalErrorResponse = Schema.Struct({
  error: Schema.String,
  message: Schema.String,
});
export type RoomsLocalErrorResponse = typeof RoomsLocalErrorResponse.Type;

export interface RoomsLocalCreateChannelInput {
  readonly requestId: string;
  readonly name: string;
  readonly purpose: string | null;
}

export interface RoomsLocalCreateMessageInput {
  readonly requestId: string;
  readonly bodyMarkdown: string;
}

export interface RoomsLocalFeedPageInput {
  readonly afterSeq?: number | undefined;
  readonly limit?: number | undefined;
  readonly snapshotHeadSeq?: number | undefined;
}
