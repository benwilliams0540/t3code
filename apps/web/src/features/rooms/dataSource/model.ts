import * as Schema from "effect/Schema";

import type { RoomsWorkspaceReadFixture } from "../model/workspace";

export const ROOMS_DATA_SOURCE_STORAGE_KEY = "t3code:rooms-data-source:v1";
export const ROOMS_LOCAL_WORKSPACE_STORAGE_KEY = "t3code:rooms-local-workspace:v1";
export const ROOMS_SELECTED_ROOM_BY_SOURCE_STORAGE_KEY = "t3code:rooms-selected-room-by-source:v1";

export const RoomsDataSourceMode = Schema.Literals(["sample", "local"]);
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
});
export type RoomsSelectedRoomBySource = typeof RoomsSelectedRoomBySource.Type;

export const EMPTY_ROOMS_SELECTED_ROOM_BY_SOURCE: RoomsSelectedRoomBySource = Object.freeze({
  sample: null,
  local: null,
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
}

export interface RoomsLocalSourceSetupRequired {
  readonly mode: "local";
  readonly status: "setup-required";
  readonly rooms: readonly [];
  readonly reason: "missing-local-workspace";
}

export interface RoomsSourceUnavailable {
  readonly mode: RoomsDataSourceMode;
  readonly status: "unavailable";
  readonly rooms: readonly [];
  readonly reason: string;
}

export type RoomsDataSourceState =
  | RoomsSampleSourceReady
  | RoomsLocalSourceReady
  | RoomsLocalSourceSetupRequired
  | RoomsSourceUnavailable;

export function resolveSelectedSourceRoom(
  state: RoomsDataSourceState,
  selectedBySource: RoomsSelectedRoomBySource,
  legacySampleRoomId: string | null,
): RoomsSourceRoom | null {
  if (state.status !== "ready") return null;
  const requestedId =
    state.mode === "sample"
      ? (selectedBySource.sample ?? legacySampleRoomId)
      : selectedBySource.local;
  return state.rooms.find((room) => room.id === requestedId) ?? state.rooms[0] ?? null;
}

export function findSourceRoomBySlug(
  state: RoomsDataSourceState,
  roomSlug: string,
): RoomsSourceRoom | null {
  if (state.status !== "ready") return null;
  return state.rooms.find((room) => room.slug === roomSlug) ?? null;
}
