import * as Schema from "effect/Schema";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useClientSettings } from "~/hooks/useSettings";
import { getLocalStorageItem, useLocalStorage } from "~/hooks/useLocalStorage";

import { ROOMS_SELECTED_ROOM_STORAGE_KEY } from "../model/selection";
import {
  connectingLocalRoomsDataSourceState,
  failedLocalRoomsDataSourceState,
  reconcileLocalWorkspaceConfig,
  resolveLocalRoomsDataSourceState,
} from "./local";
import {
  createRoomsLocalChannelsClient,
  RoomsLocalClientError,
  type RoomsLocalCommandResult,
} from "./localChannelsClient";
import type {
  RoomsLocalChannel,
  RoomsLocalCreateChannelInput,
  RoomsLocalCreateMessageInput,
  RoomsLocalFeed,
  RoomsLocalFeedPageInput,
  RoomsLocalHumanMessage,
  RoomsLocalWorkspace,
} from "./localChannelsContract";
import {
  EMPTY_ROOMS_SELECTED_ROOM_BY_SOURCE,
  type RoomsDataSourceMode,
  RoomsDataSourceMode as RoomsDataSourceModeSchema,
  type RoomsDataSourceState,
  type RoomsLocalSourceFailure,
  type RoomsLocalSourceReady,
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

type RoomsLocalSourceState = RoomsLocalSourceReady | RoomsLocalSourceFailure;

interface RoomsDataSourceContextValue {
  readonly mode: RoomsDataSourceMode;
  readonly state: RoomsDataSourceState;
  readonly selectedRoom: RoomsSourceRoom | null;
  readonly selectedBySource: RoomsSelectedRoomBySource;
  readonly localConfig: RoomsLocalWorkspaceConfig | null;
  readonly localApiBaseUrl: string;
  readonly retryLocalWorkspace: () => Promise<RoomsLocalWorkspace | null>;
  readonly createLocalChannel: (
    input: RoomsLocalCreateChannelInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalChannel>>;
  readonly loadLocalFeed: (
    roomId: string,
    channelId: string,
    input?: RoomsLocalFeedPageInput,
  ) => Promise<RoomsLocalFeed>;
  readonly sendLocalMessage: (
    roomId: string,
    channelId: string,
    input: RoomsLocalCreateMessageInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalHumanMessage>>;
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
const RoomsLocalWorkspaceConfigOrNullSchema = Schema.NullOr(RoomsLocalWorkspaceConfigSchema);

function readLegacySampleRoomId(): string | null {
  try {
    return getLocalStorageItem(ROOMS_SELECTED_ROOM_STORAGE_KEY, Schema.String);
  } catch (error) {
    console.error("Could not read the legacy Rooms sample selection.", error);
    return null;
  }
}

function sourceNotReadyError(): RoomsLocalClientError {
  return new RoomsLocalClientError({
    kind: "transport",
    code: "local_source_not_ready",
    message: "The Rooms Local workspace is not ready.",
  });
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
    RoomsLocalWorkspaceConfigOrNullSchema,
  );
  const [selectedBySource, setSelectedBySource] = useLocalStorage(
    ROOMS_SELECTED_ROOM_BY_SOURCE_STORAGE_KEY,
    EMPTY_ROOMS_SELECTED_ROOM_BY_SOURCE,
    RoomsSelectedRoomBySourceSchema,
  );
  const localApiBaseUrl = useClientSettings((settings) => settings.roomsLocalApiBaseUrl);
  const client = useMemo(() => createRoomsLocalChannelsClient(localApiBaseUrl), [localApiBaseUrl]);
  const [localState, setLocalState] = useState<RoomsLocalSourceState>(
    connectingLocalRoomsDataSourceState,
  );
  const localConfigRef = useRef(localConfig);
  const localStateRef = useRef(localState);
  const loadGenerationRef = useRef(0);
  useEffect(() => {
    localConfigRef.current = localConfig;
  }, [localConfig]);
  useEffect(() => {
    localStateRef.current = localState;
  }, [localState]);

  const commitWorkspace = useCallback(
    (workspace: RoomsLocalWorkspace): RoomsLocalSourceReady => {
      const config = reconcileLocalWorkspaceConfig(localConfigRef.current, workspace);
      localConfigRef.current = config;
      setLocalConfig((current) => {
        const next = reconcileLocalWorkspaceConfig(current, workspace);
        return next === current ? current : next;
      });
      setSelectedBySource((current) =>
        current.local === workspace.room.id ? current : { ...current, local: workspace.room.id },
      );
      const ready = resolveLocalRoomsDataSourceState(workspace, config);
      localStateRef.current = ready;
      setLocalState(ready);
      return ready;
    },
    [setLocalConfig, setSelectedBySource],
  );

  const loadWorkspace = useCallback(
    async (showConnecting: boolean): Promise<RoomsLocalWorkspace | null> => {
      const generation = ++loadGenerationRef.current;
      if (showConnecting) {
        const connecting = connectingLocalRoomsDataSourceState();
        localStateRef.current = connecting;
        setLocalState(connecting);
      }
      try {
        const workspace = await client.getWorkspace();
        if (generation !== loadGenerationRef.current) return null;
        commitWorkspace(workspace);
        return workspace;
      } catch (error) {
        if (generation !== loadGenerationRef.current) return null;
        const failed = failedLocalRoomsDataSourceState(error);
        localStateRef.current = failed;
        setLocalState(failed);
        return null;
      }
    },
    [client, commitWorkspace],
  );
  const loadWorkspaceRef = useRef(loadWorkspace);
  useEffect(() => {
    loadWorkspaceRef.current = loadWorkspace;
  }, [loadWorkspace]);

  useEffect(() => {
    if (mode !== "local") return;
    void loadWorkspaceRef.current(true);
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [localApiBaseUrl, mode]);

  const legacySampleRoomId = useMemo(readLegacySampleRoomId, []);
  const state = mode === "sample" ? roomsSampleDataSource : localState;
  const selectedRoom = useMemo(
    () => resolveSelectedSourceRoom(state, selectedBySource, legacySampleRoomId),
    [legacySampleRoomId, selectedBySource, state],
  );

  const retryLocalWorkspace = useCallback(() => loadWorkspace(true), [loadWorkspace]);

  const createLocalChannel = useCallback(
    async (input: RoomsLocalCreateChannelInput) => {
      const current = localStateRef.current;
      if (current.status !== "ready") throw sourceNotReadyError();
      const result = await client.createChannel(current.workspace.room.id, input);
      const workspace = await loadWorkspace(false);
      if (!workspace) {
        throw new RoomsLocalClientError({
          kind: "transport",
          code: "local_workspace_refresh_failed",
          message: "The channel was accepted, but workspace discovery could not be refreshed.",
        });
      }
      return result;
    },
    [client, loadWorkspace],
  );

  const loadLocalFeed = useCallback(
    (roomId: string, channelId: string, input?: RoomsLocalFeedPageInput) =>
      client.getFeed(roomId, channelId, input),
    [client],
  );

  const sendLocalMessage = useCallback(
    (roomId: string, channelId: string, input: RoomsLocalCreateMessageInput) =>
      client.createMessage(roomId, channelId, input),
    [client],
  );

  const setMode = useCallback(
    (nextMode: RoomsDataSourceMode) => setPersistedMode(nextMode),
    [setPersistedMode],
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
      localApiBaseUrl,
      retryLocalWorkspace,
      createLocalChannel,
      loadLocalFeed,
      sendLocalMessage,
      selectRoom,
      setLocalConfig,
      setMode,
    }),
    [
      createLocalChannel,
      loadLocalFeed,
      localApiBaseUrl,
      localConfig,
      mode,
      retryLocalWorkspace,
      selectRoom,
      selectedBySource,
      selectedRoom,
      sendLocalMessage,
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
