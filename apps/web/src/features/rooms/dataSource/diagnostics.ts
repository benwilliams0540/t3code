import { APP_VERSION } from "~/branding";

import type { RoomsProjectBindings } from "../threads/roomProjectBindings";
import type {
  RoomsDataSourceMode,
  RoomsDataSourceState,
  RoomsLocalWorkspaceConfig,
  RoomsSelectedRoomBySource,
} from "./model";

interface RoomsDiagnosticsInput {
  readonly mode: RoomsDataSourceMode;
  readonly state: RoomsDataSourceState;
  readonly selectedBySource: RoomsSelectedRoomBySource;
  readonly selectedRoomId: string | null;
  readonly localConfig: RoomsLocalWorkspaceConfig | null;
  readonly roomBindings: RoomsProjectBindings;
  readonly lastRoomsRoute: string | null;
  readonly localApiBaseUrl: string;
}

function refsForDiagnostics(
  input: RoomsDiagnosticsInput,
): readonly { readonly environmentId: string; readonly projectId: string }[] {
  if (input.mode === "local") return input.localConfig?.projectBindings ?? [];
  const selectedId = input.selectedRoomId ?? input.selectedBySource.shared;
  return selectedId ? (input.roomBindings[selectedId] ?? []) : [];
}

export function buildRoomsDiagnostics(input: RoomsDiagnosticsInput): string {
  return JSON.stringify(
    {
      appVersion: APP_VERSION,
      source: {
        mode: input.mode,
        status: input.state.status,
        error: input.state.status === "ready" ? null : input.state.error,
        selectedRoomId: input.selectedRoomId,
        selections: input.selectedBySource,
        roomIds: input.state.rooms.map((room) => room.id),
      },
      projectRefs: refsForDiagnostics(input),
      localApiBaseUrl: input.localApiBaseUrl,
      lastRoomsRoute: input.lastRoomsRoute,
    },
    null,
    2,
  );
}
