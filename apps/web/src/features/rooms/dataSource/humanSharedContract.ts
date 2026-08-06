import * as Schema from "effect/Schema";

import {
  RoomsLocalChannel,
  RoomsLocalFeedItem,
  RoomsLocalHumanMessage,
  RoomsLocalSourceEvent,
} from "./localChannelsContract";
import { RoomsLocalCasTuple, RoomsLocalStory, RoomsLocalStoryV2 } from "./localStoriesContract";

export const ROOMS_HUMAN_CONTRACT_ID = "rooms.human-shared" as const;
export const ROOMS_HUMAN_CONTRACT_VERSION = 1 as const;
export const ROOMS_HUMAN_SCHEMA_URI = "contracts/rooms/human-shared/v1/schema.json" as const;
export const ROOMS_HUMAN_SERVER_PRODUCER_SHA = "ee381424993ec4a892a9a722e44ced593b2e35e9" as const;

export const RoomsHumanContract = Schema.Struct({
  id: Schema.Literal(ROOMS_HUMAN_CONTRACT_ID),
  version: Schema.Literal(ROOMS_HUMAN_CONTRACT_VERSION),
  schema_uri: Schema.Literal(ROOMS_HUMAN_SCHEMA_URI),
});

export const RoomsHumanRole = Schema.Literals(["observer", "operator", "admin"]);
export type RoomsHumanRole = typeof RoomsHumanRole.Type;

export const RoomsHumanPrincipal = Schema.Struct({
  id: Schema.String,
  type: Schema.Literals(["human", "agent", "machine"]),
  display_name: Schema.NullOr(Schema.String),
  role: Schema.optionalKey(Schema.NullOr(RoomsHumanRole)),
});
export type RoomsHumanPrincipal = typeof RoomsHumanPrincipal.Type;

export const RoomsHumanMemberPrincipal = Schema.Struct({
  id: Schema.String,
  type: Schema.Literal("human"),
  display_name: Schema.NullOr(Schema.String),
  role: RoomsHumanRole,
});
export type RoomsHumanMemberPrincipal = typeof RoomsHumanMemberPrincipal.Type;

export const RoomsHumanRoom = Schema.Struct({
  id: Schema.String,
  slug: Schema.String,
  name: Schema.String,
  locality: Schema.Literal("shared"),
  role: Schema.optionalKey(RoomsHumanRole),
});
export type RoomsHumanRoom = typeof RoomsHumanRoom.Type;

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

export const RoomsHumanCapabilities = Schema.Struct({
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
export type RoomsHumanCapabilities = typeof RoomsHumanCapabilities.Type;

export const RoomsHumanWorkspace = Schema.Struct({
  contract: RoomsHumanContract,
  status: Schema.Literal("ready"),
  room: RoomsHumanRoom,
  principal: RoomsHumanMemberPrincipal,
  capabilities: RoomsHumanCapabilities,
  principals: Schema.Array(RoomsHumanPrincipal),
  channels: Schema.Array(RoomsLocalChannel),
});
export type RoomsHumanWorkspace = typeof RoomsHumanWorkspace.Type;

export const RoomsHumanInviteIssuance = Schema.Struct({
  contract: RoomsHumanContract,
  status: Schema.Literal("invited"),
  room_id: Schema.String,
  invite_token: Schema.String,
  role: RoomsHumanRole,
  expires_at: Schema.String,
});
export type RoomsHumanInviteIssuance = typeof RoomsHumanInviteIssuance.Type;

export const RoomsHumanInviteInspection = Schema.Struct({
  contract: RoomsHumanContract,
  status: Schema.Literal("invited"),
  room: RoomsHumanRoom,
  role: RoomsHumanRole,
  expires_at: Schema.String,
});
export type RoomsHumanInviteInspection = typeof RoomsHumanInviteInspection.Type;

export const RoomsHumanMembershipRedemption = Schema.Struct({
  contract: RoomsHumanContract,
  status: Schema.Literal("ready"),
  room: RoomsHumanRoom,
  principal: RoomsHumanMemberPrincipal,
});
export type RoomsHumanMembershipRedemption = typeof RoomsHumanMembershipRedemption.Type;

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
  items: Schema.Array(RoomsLocalFeedItem),
});
export type RoomsHumanFeed = typeof RoomsHumanFeed.Type;

export const RoomsHumanChangeResponse = Schema.Struct({
  contract: RoomsHumanContract,
  room_id: Schema.String,
  after_seq: Schema.Int,
  head_seq: Schema.Int,
  changed: Schema.Boolean,
  reason: Schema.Literals(["advanced", "timeout"]),
});
export type RoomsHumanChangeResponse = typeof RoomsHumanChangeResponse.Type;

export const RoomsHumanStoriesResponse = Schema.Struct({
  contract: RoomsHumanContract,
  room_id: Schema.String,
  capabilities: Schema.Record(Schema.String, Schema.Boolean),
  stories: Schema.Array(RoomsLocalStory),
});
export type RoomsHumanStoriesResponse = typeof RoomsHumanStoriesResponse.Type;

export const RoomsHumanErrorResponse = Schema.Struct({
  error: Schema.String,
  message: Schema.String,
});

export {
  RoomsLocalCasTuple as RoomsHumanCasTuple,
  RoomsLocalChannel as RoomsHumanChannel,
  RoomsLocalFeedItem as RoomsHumanFeedItem,
  RoomsLocalHumanMessage as RoomsHumanMessage,
  RoomsLocalSourceEvent as RoomsHumanSourceEvent,
  RoomsLocalStory as RoomsHumanStory,
  RoomsLocalStoryV2 as RoomsHumanStoryV2,
};

export type RoomsInteractiveWorkspace =
  | import("./localChannelsContract").RoomsLocalWorkspace
  | RoomsHumanWorkspace;
