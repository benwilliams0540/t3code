import type { RoomsLocalWorkspace } from "./localChannelsContract";
import { isRoomsLocalClientError } from "./localChannelsClient";
import type {
  RoomsLocalSourceFailure,
  RoomsLocalSourceFailureStatus,
  RoomsLocalSourceReady,
  RoomsLocalWorkspaceConfig,
  RoomsSourceRoom,
} from "./model";

export function reconcileLocalWorkspaceConfig(
  current: RoomsLocalWorkspaceConfig | null,
  workspace: RoomsLocalWorkspace,
): RoomsLocalWorkspaceConfig {
  if (
    current?.roomId === workspace.room.id &&
    current.name === workspace.room.name &&
    current.slug === workspace.room.slug
  ) {
    return current;
  }
  return {
    version: 1,
    roomId: workspace.room.id,
    name: workspace.room.name,
    slug: workspace.room.slug,
    projectBindings: current?.projectBindings ?? [],
  };
}

export function resolveLocalRoomsDataSourceState(
  workspace: RoomsLocalWorkspace,
  config: RoomsLocalWorkspaceConfig,
): RoomsLocalSourceReady {
  const room: RoomsSourceRoom = {
    sourceMode: "local",
    id: workspace.room.id,
    slug: workspace.room.slug,
    name: workspace.room.name,
    locality: workspace.room.locality,
    membershipRole: workspace.principal.role,
    unreadCount: null,
  };
  return {
    mode: "local",
    status: "ready",
    rooms: [room],
    config,
    workspace,
    channelState: workspace.channels.length === 0 ? "empty" : "populated",
  };
}

export function connectingLocalRoomsDataSourceState(): RoomsLocalSourceFailure {
  return { mode: "local", status: "connecting", rooms: [], error: null };
}

const ERROR_STATUS_BY_CODE: Readonly<Record<string, RoomsLocalSourceFailureStatus>> = {
  local_session_disabled: "disabled",
  local_session_unavailable: "unavailable-outside-development",
  local_workspace_uninitialized: "uninitialized",
  local_workspace_invalid: "invalid-bootstrap",
  room_membership_required: "authorization-failure",
  capability_denied: "authorization-failure",
  caller_identity_forbidden: "authorization-failure",
};

export function failedLocalRoomsDataSourceState(error: unknown): RoomsLocalSourceFailure {
  if (isRoomsLocalClientError(error)) {
    const status =
      error.kind === "invalid_configuration"
        ? "invalid-configuration"
        : (ERROR_STATUS_BY_CODE[error.code] ?? "error");
    return {
      mode: "local",
      status,
      rooms: [],
      error: { code: error.code, message: error.message, httpStatus: error.status },
    };
  }
  return {
    mode: "local",
    status: "error",
    rooms: [],
    error: {
      code: "unexpected_local_source_error",
      message: error instanceof Error ? error.message : "Threadspace Local failed unexpectedly.",
      httpStatus: null,
    },
  };
}
