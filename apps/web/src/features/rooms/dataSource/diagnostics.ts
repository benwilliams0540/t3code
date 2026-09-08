import { APP_VERSION } from "~/branding";

import { ROOMS_WORKSPACE_READ_SOURCE } from "../model/source";
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
  readonly sampleBindings: RoomsProjectBindings;
  readonly lastRoomsRoute: string | null;
  readonly localApiBaseUrl: string;
}

function refsForDiagnostics(
  input: RoomsDiagnosticsInput,
): readonly { readonly environmentId: string; readonly projectId: string }[] {
  if (input.mode === "local") return input.localConfig?.projectBindings ?? [];
  const selectedId = input.selectedRoomId ?? input.selectedBySource.sample;
  return selectedId ? (input.sampleBindings[selectedId] ?? []) : [];
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
        sampleContract:
          input.mode === "sample"
            ? {
                id: ROOMS_WORKSPACE_READ_SOURCE.contractId,
                version: ROOMS_WORKSPACE_READ_SOURCE.contractVersion,
                repositorySha: ROOMS_WORKSPACE_READ_SOURCE.repositorySha,
              }
            : null,
      },
      projectRefs: refsForDiagnostics(input),
      localApiBaseUrl: input.localApiBaseUrl,
      lastRoomsRoute: input.lastRoomsRoute,
    },
    null,
    2,
  );
}
