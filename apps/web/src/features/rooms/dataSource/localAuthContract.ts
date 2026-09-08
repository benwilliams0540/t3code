import * as Schema from "effect/Schema";

import { RoomsHumanRole, RoomsHumanRoom } from "./humanSharedContract";

// rooms.local-auth v1: server-owned sign-in for free self-hosted servers.
// Producer: t3rooms `2ecba24` (contracts/rooms/local-auth/v1).
export const ROOMS_LOCAL_AUTH_CONTRACT_ID = "rooms.local-auth" as const;
export const ROOMS_LOCAL_AUTH_CONTRACT_VERSION = 1 as const;
export const ROOMS_LOCAL_AUTH_SCHEMA_URI = "contracts/rooms/local-auth/v1/schema.json" as const;

export const RoomsLocalAuthContract = Schema.Struct({
  id: Schema.Literal(ROOMS_LOCAL_AUTH_CONTRACT_ID),
  version: Schema.Literal(ROOMS_LOCAL_AUTH_CONTRACT_VERSION),
  schema_uri: Schema.Literal(ROOMS_LOCAL_AUTH_SCHEMA_URI),
});

export const RoomsAuthProviderName = Schema.Literals(["clerk", "local"]);
export type RoomsAuthProviderName = typeof RoomsAuthProviderName.Type;

const RoomsLocalAuthServer = Schema.Struct({ id: Schema.String });

export const RoomsLocalAuthProvider = Schema.Struct({
  contract: RoomsLocalAuthContract,
  provider: RoomsAuthProviderName,
  server: Schema.optionalKey(Schema.NullOr(RoomsLocalAuthServer)),
  setup_required: Schema.optionalKey(Schema.Boolean),
});
export type RoomsLocalAuthProvider = typeof RoomsLocalAuthProvider.Type;

export const RoomsLocalAuthSignedIn = Schema.Struct({
  contract: RoomsLocalAuthContract,
  status: Schema.Literal("signed_in"),
  server: RoomsLocalAuthServer,
  account: Schema.Struct({
    id: Schema.String,
    username: Schema.String,
    display_name: Schema.String,
  }),
  principal: Schema.Struct({
    id: Schema.String,
    type: Schema.Literal("human"),
    display_name: Schema.NullOr(Schema.String),
  }),
  session: Schema.Struct({
    id: Schema.String,
    token: Schema.String,
    expires_at: Schema.String,
  }),
  room: Schema.optionalKey(RoomsHumanRoom),
  role: Schema.optionalKey(RoomsHumanRole),
  revoked_sessions: Schema.optionalKey(Schema.Int),
});
export type RoomsLocalAuthSignedIn = typeof RoomsLocalAuthSignedIn.Type;

export const RoomsLocalAuthSignedOut = Schema.Struct({
  contract: RoomsLocalAuthContract,
  status: Schema.Literal("signed_out"),
});
export type RoomsLocalAuthSignedOut = typeof RoomsLocalAuthSignedOut.Type;
