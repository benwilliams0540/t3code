import type { RoomsDataSourceState, RoomsLocalWorkspaceConfig, RoomsSourceRoom } from "./model";
import { randomUUID } from "~/lib/utils";

export function createRoomsLocalWorkspaceConfig(
  createId: () => string = randomUUID,
): RoomsLocalWorkspaceConfig {
  const stableId = createId();
  return {
    version: 1,
    roomId: `room:local:${stableId}`,
    name: "Local workspace",
    slug: `local-workspace-${stableId}`,
    projectBindings: [],
  };
}

export function resolveLocalRoomsDataSourceState(
  config: RoomsLocalWorkspaceConfig | null,
): RoomsDataSourceState {
  if (config === null) {
    return {
      mode: "local",
      status: "setup-required",
      rooms: [],
      reason: "missing-local-workspace",
    };
  }

  const room: RoomsSourceRoom = {
    sourceMode: "local",
    id: config.roomId,
    slug: config.slug,
    name: config.name,
    locality: "local_only",
    membershipRole: null,
    unreadCount: null,
  };
  return { mode: "local", status: "ready", rooms: [room], config };
}
