import * as Schema from "effect/Schema";
import { createContext, type ReactNode, useCallback, useContext, useMemo } from "react";

import { getLocalStorageItem, useLocalStorage } from "~/hooks/useLocalStorage";

import { ROOMS_SELECTED_ROOM_STORAGE_KEY } from "../model/selection";
import { createRoomsLocalWorkspaceConfig, resolveLocalRoomsDataSourceState } from "./local";
import {
  EMPTY_ROOMS_SELECTED_ROOM_BY_SOURCE,
  type RoomsDataSourceMode,
  RoomsDataSourceMode as RoomsDataSourceModeSchema,
  type RoomsDataSourceState,
  type RoomsLocalWorkspaceConfig,
  RoomsLocalWorkspaceConfig as RoomsLocalWorkspaceConfigSchema,
  type RoomsSelectedRoomBySource,
  RoomsSelectedRoomBySource as RoomsSelectedRoomBySourceSchema,
  type RoomsSourceRoom,
  ROOMS_DATA_SOURCE_STORAGE_KEY,
  ROOMS_LOCAL_WORKSPACE_STORAGE_KEY,
  ROOMS_SELECTED_ROOM_BY_SOURCE_STORAGE_KEY,
  resolveSelectedSourceRoom,
} from "./model";
import { roomsSampleDataSource } from "./sample";

interface RoomsDataSourceContextValue {
  readonly mode: RoomsDataSourceMode;
  readonly state: RoomsDataSourceState;
  readonly selectedRoom: RoomsSourceRoom | null;
  readonly selectedBySource: RoomsSelectedRoomBySource;
  readonly localConfig: RoomsLocalWorkspaceConfig | null;
  readonly initializeLocalWorkspace: () => void;
  readonly selectRoom: (room: RoomsSourceRoom) => void;
  readonly setLocalConfig: (
    value:
      | RoomsLocalWorkspaceConfig
      | null
      | ((current: RoomsLocalWorkspaceConfig | null) => RoomsLocalWorkspaceConfig | null),
  ) => void;
  readonly setMode: (mode: RoomsDataSourceMode) => void;
}

const RoomsDataSourceContext = createContext<RoomsDataSourceContextValue | null>(null);

function readLegacySampleRoomId(): string | null {
  try {
    return getLocalStorageItem(ROOMS_SELECTED_ROOM_STORAGE_KEY, Schema.String);
  } catch (error) {
    console.error("Could not read the legacy Rooms sample selection.", error);
    return null;
  }
}

export function RoomsDataSourceProvider({ children }: { readonly children: ReactNode }) {
  const [mode, setPersistedMode] = useLocalStorage(
    ROOMS_DATA_SOURCE_STORAGE_KEY,
    "sample" as const,
    RoomsDataSourceModeSchema,
  );
  const [localConfig, setLocalConfig] = useLocalStorage(
    ROOMS_LOCAL_WORKSPACE_STORAGE_KEY,
    null,
    Schema.NullOr(RoomsLocalWorkspaceConfigSchema),
  );
  const [selectedBySource, setSelectedBySource] = useLocalStorage(
    ROOMS_SELECTED_ROOM_BY_SOURCE_STORAGE_KEY,
    EMPTY_ROOMS_SELECTED_ROOM_BY_SOURCE,
    RoomsSelectedRoomBySourceSchema,
  );
  const legacySampleRoomId = useMemo(readLegacySampleRoomId, []);
  const state = useMemo(
    () =>
      mode === "sample" ? roomsSampleDataSource : resolveLocalRoomsDataSourceState(localConfig),
    [localConfig, mode],
  );
  const selectedRoom = useMemo(
    () => resolveSelectedSourceRoom(state, selectedBySource, legacySampleRoomId),
    [legacySampleRoomId, selectedBySource, state],
  );

  const initializeLocalWorkspace = useCallback(() => {
    if (localConfig !== null) return;
    const created = createRoomsLocalWorkspaceConfig();
    setLocalConfig(created);
    setSelectedBySource((current) => ({ ...current, local: created.roomId }));
  }, [localConfig, setLocalConfig, setSelectedBySource]);

  const setMode = useCallback(
    (nextMode: RoomsDataSourceMode) => {
      if (nextMode === "local" && localConfig === null) {
        const created = createRoomsLocalWorkspaceConfig();
        setLocalConfig(created);
        setSelectedBySource((current) => ({ ...current, local: created.roomId }));
      }
      setPersistedMode(nextMode);
    },
    [localConfig, setLocalConfig, setPersistedMode, setSelectedBySource],
  );

  const selectRoom = useCallback(
    (room: RoomsSourceRoom) => {
      if (room.sourceMode !== mode || !state.rooms.some((candidate) => candidate.id === room.id)) {
        return;
      }
      setSelectedBySource((current) => ({ ...current, [mode]: room.id }));
    },
    [mode, setSelectedBySource, state.rooms],
  );

  const value = useMemo<RoomsDataSourceContextValue>(
    () => ({
      mode,
      state,
      selectedRoom,
      selectedBySource,
      localConfig,
      initializeLocalWorkspace,
      selectRoom,
      setLocalConfig,
      setMode,
    }),
    [
      initializeLocalWorkspace,
      localConfig,
      mode,
      selectRoom,
      selectedBySource,
      selectedRoom,
      setLocalConfig,
      setMode,
      state,
    ],
  );

  return <RoomsDataSourceContext value={value}>{children}</RoomsDataSourceContext>;
}

export function useRoomsDataSource(): RoomsDataSourceContextValue {
  const context = useContext(RoomsDataSourceContext);
  if (!context) throw new Error("useRoomsDataSource must be used within RoomsDataSourceProvider.");
  return context;
}
