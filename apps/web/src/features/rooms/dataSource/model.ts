import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

import type { RoomsWorkspaceReadFixture } from "../model/workspace";
import type { RoomsLocalWorkspace } from "./localChannelsContract";
import type {
  RoomsHumanInviteInspection,
  RoomsHumanSession,
  RoomsHumanWorkspace,
} from "./humanSharedContract";

export const ROOMS_DATA_SOURCE_STORAGE_KEY = "t3code:rooms-data-source:v1";
export const ROOMS_LOCAL_WORKSPACE_STORAGE_KEY = "t3code:rooms-local-workspace:v1";
export const ROOMS_SELECTED_ROOM_BY_SOURCE_STORAGE_KEY = "t3code:rooms-selected-room-by-source:v1";

export const RoomsDataSourceMode = Schema.Literals(["sample", "local", "shared"]);
export type RoomsDataSourceMode = typeof RoomsDataSourceMode.Type;

export const PersistedRoomsProjectRef = Schema.Struct({
  environmentId: Schema.String,
  projectId: Schema.String,
});
export type PersistedRoomsProjectRef = typeof PersistedRoomsProjectRef.Type;

export const RoomsLocalWorkspaceConfig = Schema.Struct({
  version: Schema.Literal(1),
  roomId: Schema.String,
  name: Schema.String,
  slug: Schema.String,
  projectBindings: Schema.Array(PersistedRoomsProjectRef),
});
export type RoomsLocalWorkspaceConfig = typeof RoomsLocalWorkspaceConfig.Type;

export const RoomsSelectedRoomBySource = Schema.Struct({
  sample: Schema.NullOr(Schema.String),
  local: Schema.NullOr(Schema.String),
  shared: Schema.NullOr(Schema.String).pipe(Schema.withDecodingDefaultKey(Effect.succeed(null))),
});
export type RoomsSelectedRoomBySource = typeof RoomsSelectedRoomBySource.Type;

export const EMPTY_ROOMS_SELECTED_ROOM_BY_SOURCE: RoomsSelectedRoomBySource = Object.freeze({
  sample: null,
  local: null,
  shared: null,
});

export interface RoomsSourceRoom {
  readonly sourceMode: RoomsDataSourceMode;
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly locality: "local_only" | "shared";
  readonly membershipRole: "observer" | "operator" | "admin" | null;
  readonly unreadCount: number | null;
}

export interface RoomsSampleSourceReady {
  readonly mode: "sample";
  readonly status: "ready";
  readonly rooms: readonly RoomsSourceRoom[];
  readonly fixture: RoomsWorkspaceReadFixture;
}

export interface RoomsLocalSourceReady {
  readonly mode: "local";
  readonly status: "ready";
  readonly rooms: readonly [RoomsSourceRoom];
  readonly config: RoomsLocalWorkspaceConfig;
  readonly workspace: RoomsLocalWorkspace;
  readonly channelState: "empty" | "populated";
}

export interface RoomsHumanSourceReady {
  readonly mode: "shared";
  readonly status: "ready";
  readonly rooms: readonly RoomsSourceRoom[];
  readonly session: RoomsHumanSession;
  readonly workspace: RoomsHumanWorkspace;
  readonly authenticationGeneration: number;
  readonly accountId: string;
}

export type RoomsHumanSourceFailureStatus =
  | "authenticating"
  | "signed-out"
  | "authenticated-nonmember"
  | "invited"
  | "expired"
  | "authorization-failure"
  | "invalid-configuration"
  | "error";

export interface RoomsHumanSourceFailure {
  readonly mode: "shared";
  readonly status: RoomsHumanSourceFailureStatus;
  readonly rooms: readonly [];
  readonly invitation: RoomsHumanInviteInspection | null;
  readonly authenticationGeneration: number;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly httpStatus: number | null;
  } | null;
}

export type RoomsLocalSourceFailureStatus =
  | "connecting"
  | "disabled"
  | "uninitialized"
  | "unavailable-outside-development"
  | "invalid-bootstrap"
  | "authorization-failure"
  | "invalid-configuration"
  | "error";

export interface RoomsLocalSourceFailure {
  readonly mode: "local";
  readonly status: RoomsLocalSourceFailureStatus;
  readonly rooms: readonly [];
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly httpStatus: number | null;
  } | null;
}

export type RoomsDataSourceState =
  | RoomsSampleSourceReady
  | RoomsLocalSourceReady
  | RoomsLocalSourceFailure
  | RoomsHumanSourceReady
  | RoomsHumanSourceFailure;

export function isRoomsHumanStateCurrent(
  state: RoomsHumanSourceState,
  authentication: { readonly generation: number; readonly accountId: string | null },
): boolean {
  if (state.authenticationGeneration !== authentication.generation) return false;
  return state.status !== "ready" || state.accountId === authentication.accountId;
}

export type RoomsHumanSourceState = RoomsHumanSourceReady | RoomsHumanSourceFailure;

export function resolveSelectedSourceRoom(
  state: RoomsDataSourceState,
  selectedBySource: RoomsSelectedRoomBySource,
  legacySampleRoomId: string | null,
): RoomsSourceRoom | null {
  if (state.status !== "ready") return null;
  const requestedId =
    state.mode === "sample"
      ? (selectedBySource.sample ?? legacySampleRoomId)
      : state.mode === "local"
        ? selectedBySource.local
        : selectedBySource.shared;
  return state.rooms.find((room) => room.id === requestedId) ?? state.rooms[0] ?? null;
}

export function findSourceRoomBySlug(
  state: RoomsDataSourceState,
  roomSlug: string,
): RoomsSourceRoom | null {
  if (state.status !== "ready") return null;
  return state.rooms.find((room) => room.slug === roomSlug) ?? null;
}
