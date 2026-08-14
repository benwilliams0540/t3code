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
  useSyncExternalStore,
} from "react";

import {
  assertRoomsAuthenticationGeneration,
  readRoomsAuthenticationSnapshot,
  readRoomsClerkToken,
  subscribeRoomsAuthentication,
} from "~/cloud/roomsAuth";
import { resolveCloudPublicConfig } from "~/cloud/publicConfig";
import { useClientSettings } from "~/hooks/useSettings";
import { getLocalStorageItem, useLocalStorage } from "~/hooks/useLocalStorage";

import { ROOMS_SELECTED_ROOM_STORAGE_KEY } from "../model/selection";
import { selectRoomsDesktopNotifications } from "../notifications/roomsDesktopNotifications";
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
import { createRoomsHumanClient } from "./humanSharedClient";
import type {
  RoomsHumanInviteInspection,
  RoomsHumanInviteIssuance,
  RoomsHumanMembershipRedemption,
  RoomsHumanRole,
  RoomsHumanStoriesResponse,
  RoomsHumanWorkspace,
} from "./humanSharedContract";
import {
  RoomsLocalChangeLoop,
  type RoomsLocalChangeInvalidation,
  type RoomsLocalLiveUpdatesStatus,
} from "./localChangesLoop";
import type {
  RoomsLocalChannel,
  RoomsLocalCreateChannelInput,
  RoomsLocalCreateMessageInput,
  RoomsLocalFeed,
  RoomsLocalFeedPageInput,
  RoomsLocalHumanMessage,
  RoomsLocalWorkspace,
} from "./localChannelsContract";
import type {
  RoomsLocalAttachEvidenceInput,
  RoomsLocalCasTuple,
  RoomsLocalCreateStoryInput,
  RoomsLocalLinkStoryThreadInput,
  RoomsLocalReviewStoryInput,
  RoomsLocalStoriesResponse,
  RoomsLocalStory,
  RoomsLocalStoryV2,
  RoomsLocalTransitionStoryInput,
  RoomsLocalUploadCasInput,
} from "./localStoriesContract";
import {
  EMPTY_ROOMS_SELECTED_ROOM_BY_SOURCE,
  type RoomsDataSourceMode,
  RoomsDataSourceMode as RoomsDataSourceModeSchema,
  type RoomsDataSourceState,
  type RoomsHumanSourceFailure,
  type RoomsHumanSourceReady,
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
  isRoomsHumanStateCurrent,
  resolveSelectedSourceRoom,
  shouldReloadRoomsHumanSelection,
} from "./model";
import { roomsSampleDataSource } from "./sample";

type RoomsLocalSourceState = RoomsLocalSourceReady | RoomsLocalSourceFailure;
type RoomsHumanSourceState = RoomsHumanSourceReady | RoomsHumanSourceFailure;
type RoomsInteractiveStoriesResponse = RoomsLocalStoriesResponse | RoomsHumanStoriesResponse;

interface RoomsDataSourceContextValue {
  readonly mode: RoomsDataSourceMode;
  readonly state: RoomsDataSourceState;
  readonly selectedRoom: RoomsSourceRoom | null;
  readonly selectedBySource: RoomsSelectedRoomBySource;
  readonly localConfig: RoomsLocalWorkspaceConfig | null;
  readonly localApiBaseUrl: string;
  readonly localFeedInvalidationGeneration: number;
  readonly localFeedRefreshGeneration: number;
  readonly localLiveUpdatesStatus: RoomsLocalLiveUpdatesStatus;
  readonly retryLocalWorkspace: () => Promise<RoomsLocalWorkspace | null>;
  readonly retryHumanSession: () => Promise<RoomsHumanWorkspace | null>;
  readonly redeemHumanBootstrap: (
    bootstrapToken: string,
  ) => Promise<RoomsHumanMembershipRedemption>;
  readonly inspectHumanInvite: (
    roomId: string,
    inviteToken: string,
  ) => Promise<RoomsHumanInviteInspection>;
  readonly redeemHumanInvite: (
    roomId: string,
    inviteToken: string,
  ) => Promise<RoomsHumanMembershipRedemption>;
  readonly createHumanInvite: (
    roomId: string,
    role: RoomsHumanRole,
    requestId: string,
  ) => Promise<RoomsLocalCommandResult<RoomsHumanInviteIssuance>>;
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
  readonly loadLocalStories: (roomId: string) => Promise<RoomsInteractiveStoriesResponse>;
  readonly loadLocalStory: (roomId: string, storyId: string) => Promise<RoomsLocalStory>;
  readonly createLocalStory: (
    roomId: string,
    input: RoomsLocalCreateStoryInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalStory>>;
  readonly linkLocalStoryThread: (
    roomId: string,
    storyId: string,
    input: RoomsLocalLinkStoryThreadInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalStory>>;
  readonly uploadLocalCas: (input: RoomsLocalUploadCasInput) => Promise<RoomsLocalCasTuple>;
  readonly attachLocalStoryEvidence: (
    roomId: string,
    storyId: string,
    input: RoomsLocalAttachEvidenceInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalStoryV2>>;
  readonly transitionLocalStory: (
    roomId: string,
    storyId: string,
    input: RoomsLocalTransitionStoryInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalStoryV2>>;
  readonly reviewLocalStory: (
    roomId: string,
    storyId: string,
    input: RoomsLocalReviewStoryInput,
  ) => Promise<RoomsLocalCommandResult<RoomsLocalStoryV2>>;
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
    console.error("Could not read the legacy Threadspace sample selection.", error);
    return null;
  }
}

function sourceNotReadyError(): RoomsLocalClientError {
  return new RoomsLocalClientError({
    kind: "transport",
    code: "rooms_source_not_ready",
    message: "The active Threadspace workspace is not ready for this account.",
  });
}

function humanFailure(
  status: RoomsHumanSourceFailure["status"],
  error: unknown = null,
  invitation: RoomsHumanInviteInspection | null = null,
): RoomsHumanSourceFailure {
  const known = error instanceof RoomsLocalClientError ? error : null;
  return {
    mode: "shared",
    status,
    rooms: [],
    invitation,
    authenticationGeneration: readRoomsAuthenticationSnapshot().generation,
    error:
      known === null
        ? null
        : { code: known.code, message: known.message, httpStatus: known.status },
  };
}

function humanFailureFor(error: unknown): RoomsHumanSourceFailure {
  if (!(error instanceof RoomsLocalClientError)) return humanFailure("error");
  if (error.status === 401) {
    return humanFailure(
      error.code.includes("expired") ? "expired" : "authorization-failure",
      error,
    );
  }
  if (error.status === 403) return humanFailure("authorization-failure", error);
  if (error.kind === "invalid_configuration") return humanFailure("invalid-configuration", error);
  return humanFailure("error", error);
}

export function RoomsDataSourceProvider({ children }: { readonly children: ReactNode }) {
  const authentication = useSyncExternalStore(
    subscribeRoomsAuthentication,
    readRoomsAuthenticationSnapshot,
    readRoomsAuthenticationSnapshot,
  );
  const humanPublicConfig = resolveCloudPublicConfig();
  const humanApiBaseUrl = humanPublicConfig.roomsApiUrl ?? "";
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
  const humanClientForGeneration = useCallback(
    (generation: number) =>
      createRoomsHumanClient(
        humanApiBaseUrl,
        () => readRoomsClerkToken(generation),
        undefined,
        () => assertRoomsAuthenticationGeneration(generation),
      ),
    [humanApiBaseUrl],
  );
  const humanClientForGenerationRef = useRef(humanClientForGeneration);
  useEffect(() => {
    humanClientForGenerationRef.current = humanClientForGeneration;
  }, [humanClientForGeneration]);
  const clientRef = useRef(client);
  const [localState, setLocalState] = useState<RoomsLocalSourceState>(
    connectingLocalRoomsDataSourceState,
  );
  const [humanState, setHumanState] = useState<RoomsHumanSourceState>(() =>
    humanFailure("authenticating"),
  );
  const [localFeedSync, setLocalFeedSync] = useState({
    invalidationGeneration: 0,
    refreshGeneration: 0,
  });
  const [localLiveUpdatesStatus, setLocalLiveUpdatesStatus] =
    useState<RoomsLocalLiveUpdatesStatus>("connected");
  const [humanLiveUpdatesStatus, setHumanLiveUpdatesStatus] =
    useState<RoomsLocalLiveUpdatesStatus>("connected");
  const localConfigRef = useRef(localConfig);
  const localStateRef = useRef(localState);
  const humanStateRef = useRef(humanState);
  const loadGenerationRef = useRef(0);
  const feedInvalidationGenerationRef = useRef(0);
  const humanLoadGenerationRef = useRef(0);
  useEffect(() => {
    clientRef.current = client;
  }, [client]);
  useEffect(() => {
    localConfigRef.current = localConfig;
  }, [localConfig]);
  useEffect(() => {
    localStateRef.current = localState;
  }, [localState]);
  useEffect(() => {
    humanStateRef.current = humanState;
  }, [humanState]);

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
    async (
      showConnecting: boolean,
      preserveReadyState = false,
    ): Promise<RoomsLocalWorkspace | null> => {
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
        if (preserveReadyState && localStateRef.current.status === "ready") return null;
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

  const loadHumanSession = useCallback(
    async (
      preferredRoomId: string | null = null,
      preserveReadyState = false,
    ): Promise<RoomsHumanWorkspace | null> => {
      const generation = ++humanLoadGenerationRef.current;
      const authGeneration = authentication.generation;
      if (
        !humanPublicConfig.clerkPublishableKey ||
        !humanPublicConfig.roomsApiUrl ||
        !humanPublicConfig.roomsClerkJwtTemplate
      ) {
        const next = humanFailure("invalid-configuration");
        humanStateRef.current = next;
        setHumanState(next);
        return null;
      }
      if (authentication.status === "authenticating") {
        const next = humanFailure("authenticating");
        humanStateRef.current = next;
        setHumanState(next);
        return null;
      }
      if (authentication.status !== "signed-in") {
        const next = humanFailure("signed-out");
        humanStateRef.current = next;
        setHumanState(next);
        return null;
      }
      if (!preserveReadyState) {
        const pending = humanFailure("authenticating");
        humanStateRef.current = pending;
        setHumanState(pending);
      }
      try {
        const requestClient = humanClientForGeneration(authGeneration);
        const session = await requestClient.getSession();
        if (
          generation !== humanLoadGenerationRef.current ||
          readRoomsAuthenticationSnapshot().generation !== authGeneration
        ) {
          return null;
        }
        if (session.status === "authenticated_nonmember" || session.rooms.length === 0) {
          const next = humanFailure("authenticated-nonmember");
          humanStateRef.current = next;
          setHumanState(next);
          return null;
        }
        const requestedRoom =
          session.rooms.find((room) => room.id === preferredRoomId) ?? session.rooms[0]!;
        const workspace = await requestClient.getWorkspace(requestedRoom.id);
        if (
          generation !== humanLoadGenerationRef.current ||
          readRoomsAuthenticationSnapshot().generation !== authGeneration
        ) {
          return null;
        }
        const rooms: readonly RoomsSourceRoom[] = session.rooms.map((room) => ({
          sourceMode: "shared",
          id: room.id,
          slug: room.slug,
          name: room.name,
          locality: "shared",
          membershipRole: room.role,
          unreadCount: null,
        }));
        const ready: RoomsHumanSourceReady = {
          mode: "shared",
          status: "ready",
          rooms,
          session,
          workspace,
          authenticationGeneration: authGeneration,
          accountId: authentication.accountId,
        };
        humanStateRef.current = ready;
        setHumanState(ready);
        setSelectedBySource((current) =>
          current.shared === workspace.room.id
            ? current
            : { ...current, shared: workspace.room.id },
        );
        return workspace;
      } catch (error) {
        if (
          generation !== humanLoadGenerationRef.current ||
          readRoomsAuthenticationSnapshot().generation !== authGeneration
        ) {
          return null;
        }
        if (preserveReadyState && humanStateRef.current.status === "ready") return null;
        const next = humanFailureFor(error);
        humanStateRef.current = next;
        setHumanState(next);
        return null;
      }
    },
    [
      authentication,
      humanClientForGeneration,
      humanPublicConfig.clerkPublishableKey,
      humanPublicConfig.roomsApiUrl,
      humanPublicConfig.roomsClerkJwtTemplate,
      setSelectedBySource,
    ],
  );
  const loadHumanSessionRef = useRef(loadHumanSession);
  useEffect(() => {
    loadHumanSessionRef.current = loadHumanSession;
  }, [loadHumanSession]);

  useEffect(() => {
    humanLoadGenerationRef.current += 1;
    setSelectedBySource((current) =>
      current.shared === null ? current : { ...current, shared: null },
    );
    const cleared =
      authentication.status === "signed-out"
        ? humanFailure("signed-out")
        : humanFailure("authenticating");
    humanStateRef.current = cleared;
    setHumanState(cleared);
    if (mode === "shared") void loadHumanSessionRef.current(null);
    return () => {
      humanLoadGenerationRef.current += 1;
    };
  }, [authentication.generation, mode, setSelectedBySource]);

  useEffect(() => {
    if (mode !== "local") return;
    void loadWorkspaceRef.current(true);
    return () => {
      loadGenerationRef.current += 1;
    };
  }, [localApiBaseUrl, mode]);

  const refreshAfterLocalChange = useCallback(
    async (_invalidation: RoomsLocalChangeInvalidation): Promise<void> => {
      const invalidationGeneration = ++feedInvalidationGenerationRef.current;
      setLocalFeedSync((current) => ({
        invalidationGeneration,
        refreshGeneration: current.refreshGeneration,
      }));
      const workspace = await loadWorkspace(false, true);
      if (!workspace) {
        throw new RoomsLocalClientError({
          kind: "transport",
          code: "local_change_reconciliation_failed",
          message: "Live Threadspace state changed, but its workspace could not be reconciled yet.",
        });
      }
      setLocalFeedSync((current) =>
        current.invalidationGeneration === invalidationGeneration
          ? { ...current, refreshGeneration: invalidationGeneration }
          : current,
      );
    },
    [loadWorkspace],
  );
  const refreshAfterLocalChangeRef = useRef(refreshAfterLocalChange);
  useEffect(() => {
    refreshAfterLocalChangeRef.current = refreshAfterLocalChange;
  }, [refreshAfterLocalChange]);
  const refreshAfterHumanChange = useCallback(
    async (invalidation: RoomsLocalChangeInvalidation): Promise<void> => {
      const invalidationGeneration = ++feedInvalidationGenerationRef.current;
      setLocalFeedSync((current) => ({
        invalidationGeneration,
        refreshGeneration: current.refreshGeneration,
      }));
      const workspace = await loadHumanSession(invalidation.roomId, true);
      if (!workspace) throw sourceNotReadyError();
      if (!invalidation.initial && invalidation.reason === "advanced") {
        try {
          const current = humanStateRef.current;
          const showNotification = window.desktopBridge?.showNotification;
          if (current.status === "ready" && showNotification) {
            const notificationClient = humanClientForGenerationRef.current(
              current.authenticationGeneration,
            );
            for (const channel of workspace.channels) {
              let afterSeq = invalidation.afterSeq;
              let hasMore = true;
              while (hasMore) {
                const feed = await notificationClient.getFeed(workspace.room.id, channel.id, {
                  afterSeq,
                  snapshotHeadSeq: invalidation.headSeq,
                  limit: 100,
                });
                for (const notification of selectRoomsDesktopNotifications({
                  workspace,
                  channel,
                  items: feed.items,
                  afterSeq: invalidation.afterSeq,
                  headSeq: invalidation.headSeq,
                })) {
                  await showNotification(notification);
                }
                hasMore = feed.page_info.has_more;
                if (!hasMore || feed.page_info.next_cursor <= afterSeq) break;
                afterSeq = feed.page_info.next_cursor;
              }
            }
          }
        } catch (error) {
          console.warn("Could not deliver a Shared Threadspace desktop notification.", error);
        }
      }
      setLocalFeedSync((current) =>
        current.invalidationGeneration === invalidationGeneration
          ? { ...current, refreshGeneration: invalidationGeneration }
          : current,
      );
    },
    [loadHumanSession],
  );
  const refreshAfterHumanChangeRef = useRef(refreshAfterHumanChange);
  useEffect(() => {
    refreshAfterHumanChangeRef.current = refreshAfterHumanChange;
  }, [refreshAfterHumanChange]);
  const localChangeLoopRef = useRef<RoomsLocalChangeLoop | null>(null);
  if (localChangeLoopRef.current === null) {
    localChangeLoopRef.current = new RoomsLocalChangeLoop({
      client: {
        waitForChanges: (roomId, input) => clientRef.current.waitForChanges(roomId, input),
      },
      onInvalidate: (invalidation) => refreshAfterLocalChangeRef.current(invalidation),
      onStatusChange: setLocalLiveUpdatesStatus,
    });
  }
  const activeLocalRoomId =
    mode === "local" && localState.status === "ready" ? localState.workspace.room.id : null;
  useEffect(() => {
    const loop = localChangeLoopRef.current!;
    if (!activeLocalRoomId) {
      loop.stop();
      return;
    }
    loop.start(activeLocalRoomId);
    return () => loop.stop();
  }, [activeLocalRoomId, localApiBaseUrl]);
  const humanChangeLoopRef = useRef<RoomsLocalChangeLoop | null>(null);
  if (humanChangeLoopRef.current === null) {
    humanChangeLoopRef.current = new RoomsLocalChangeLoop({
      client: {
        waitForChanges: (roomId, input) => {
          const current = humanStateRef.current;
          if (current.status !== "ready") throw sourceNotReadyError();
          return humanClientForGenerationRef
            .current(current.authenticationGeneration)
            .waitForChanges(roomId, input);
        },
      },
      onInvalidate: (invalidation) => refreshAfterHumanChangeRef.current(invalidation),
      onStatusChange: setHumanLiveUpdatesStatus,
    });
  }
  const activeHumanRoomId =
    mode === "shared" &&
    humanState.status === "ready" &&
    humanState.authenticationGeneration === authentication.generation &&
    authentication.status === "signed-in" &&
    humanState.accountId === authentication.accountId
      ? humanState.workspace.room.id
      : null;
  useEffect(() => {
    const loop = humanChangeLoopRef.current!;
    if (!activeHumanRoomId) {
      loop.stop();
      return;
    }
    loop.start(activeHumanRoomId);
    return () => loop.stop();
  }, [activeHumanRoomId, authentication.generation, humanApiBaseUrl]);

  const legacySampleRoomId = useMemo(readLegacySampleRoomId, []);
  const visibleHumanState: RoomsHumanSourceState = isRoomsHumanStateCurrent(humanState, {
    generation: authentication.generation,
    accountId: authentication.status === "signed-in" ? authentication.accountId : null,
  })
    ? humanState
    : humanFailure(authentication.status === "signed-out" ? "signed-out" : "authenticating");
  const state =
    mode === "sample" ? roomsSampleDataSource : mode === "local" ? localState : visibleHumanState;
  const selectedRoom = useMemo(
    () => resolveSelectedSourceRoom(state, selectedBySource, legacySampleRoomId),
    [legacySampleRoomId, selectedBySource, state],
  );

  const retryLocalWorkspace = useCallback(() => loadWorkspace(true), [loadWorkspace]);
  const retryHumanSession = useCallback(
    () => loadHumanSession(selectedBySource.shared),
    [loadHumanSession, selectedBySource.shared],
  );

  const currentHumanAccessClient = useCallback(() => {
    const current = readRoomsAuthenticationSnapshot();
    if (current.status !== "signed-in") throw sourceNotReadyError();
    return humanClientForGeneration(current.generation);
  }, [humanClientForGeneration]);

  const currentHumanReadyClient = useCallback(
    (roomId?: string) => {
      const state = humanStateRef.current;
      const authentication = readRoomsAuthenticationSnapshot();
      if (
        state.status !== "ready" ||
        authentication.status !== "signed-in" ||
        authentication.generation !== state.authenticationGeneration ||
        authentication.accountId !== state.accountId
      ) {
        throw sourceNotReadyError();
      }
      if (roomId !== undefined && roomId !== state.workspace.room.id) throw sourceNotReadyError();
      return { client: humanClientForGeneration(state.authenticationGeneration), state };
    },
    [humanClientForGeneration],
  );

  const redeemHumanBootstrap = useCallback(
    async (bootstrapToken: string) => {
      const result = await currentHumanAccessClient().redeemBootstrap(bootstrapToken);
      await loadHumanSession(result.room.id);
      return result;
    },
    [currentHumanAccessClient, loadHumanSession],
  );

  const inspectHumanInvite = useCallback(
    async (roomId: string, inviteToken: string) => {
      const invitation = await currentHumanAccessClient().inspectInvite(roomId, inviteToken);
      const invited = humanFailure("invited", null, invitation);
      humanStateRef.current = invited;
      setHumanState(invited);
      return invitation;
    },
    [currentHumanAccessClient],
  );

  const redeemHumanInvite = useCallback(
    async (roomId: string, inviteToken: string) => {
      const result = await currentHumanAccessClient().redeemInvite(roomId, inviteToken);
      await loadHumanSession(result.room.id);
      return result;
    },
    [currentHumanAccessClient, loadHumanSession],
  );

  const createHumanInvite = useCallback(
    (roomId: string, role: RoomsHumanRole, requestId: string) =>
      currentHumanReadyClient(roomId).client.createInvite(roomId, { role, requestId }),
    [currentHumanReadyClient],
  );

  const createLocalChannel = useCallback(
    async (input: RoomsLocalCreateChannelInput) => {
      if (mode === "shared") {
        const current = currentHumanReadyClient();
        const result = await current.client.createChannel(current.state.workspace.room.id, input);
        await loadHumanSession(current.state.workspace.room.id, true);
        return result;
      }
      const current = localStateRef.current;
      if (current.status !== "ready") throw sourceNotReadyError();
      const result = await client.createChannel(current.workspace.room.id, input);
      const workspace = await loadWorkspace(false, true);
      if (!workspace) {
        throw new RoomsLocalClientError({
          kind: "transport",
          code: "local_workspace_refresh_failed",
          message: "The channel was accepted, but workspace discovery could not be refreshed.",
        });
      }
      return result;
    },
    [client, currentHumanReadyClient, loadHumanSession, loadWorkspace, mode],
  );

  const loadLocalFeed = useCallback(
    (roomId: string, channelId: string, input?: RoomsLocalFeedPageInput) =>
      mode === "shared"
        ? currentHumanReadyClient(roomId).client.getFeed(roomId, channelId, input)
        : client.getFeed(roomId, channelId, input),
    [client, currentHumanReadyClient, mode],
  );

  const sendLocalMessage = useCallback(
    (roomId: string, channelId: string, input: RoomsLocalCreateMessageInput) =>
      mode === "shared"
        ? currentHumanReadyClient(roomId).client.createMessage(roomId, channelId, input)
        : client.createMessage(roomId, channelId, input),
    [client, currentHumanReadyClient, mode],
  );

  const loadLocalStories = useCallback(
    (roomId: string) =>
      mode === "shared"
        ? currentHumanReadyClient(roomId).client.getStories(roomId)
        : client.getStories(roomId),
    [client, currentHumanReadyClient, mode],
  );

  const loadLocalStory = useCallback(
    (roomId: string, storyId: string) =>
      mode === "shared"
        ? currentHumanReadyClient(roomId).client.getStory(roomId, storyId)
        : client.getStory(roomId, storyId),
    [client, currentHumanReadyClient, mode],
  );

  const createLocalStory = useCallback(
    (roomId: string, input: RoomsLocalCreateStoryInput) =>
      mode === "shared"
        ? currentHumanReadyClient(roomId).client.createStory(roomId, input)
        : client.createStory(roomId, input),
    [client, currentHumanReadyClient, mode],
  );

  const linkLocalStoryThread = useCallback(
    (roomId: string, storyId: string, input: RoomsLocalLinkStoryThreadInput) =>
      mode === "shared"
        ? currentHumanReadyClient(roomId).client.linkStoryThread(roomId, storyId, input)
        : client.linkStoryThread(roomId, storyId, input),
    [client, currentHumanReadyClient, mode],
  );

  const uploadLocalCas = useCallback(
    (input: RoomsLocalUploadCasInput) => {
      if (mode !== "shared") return client.uploadCas(input);
      const current = currentHumanReadyClient();
      return current.client.uploadCas(current.state.workspace.room.id, input);
    },
    [client, currentHumanReadyClient, mode],
  );

  const attachLocalStoryEvidence = useCallback(
    (roomId: string, storyId: string, input: RoomsLocalAttachEvidenceInput) =>
      mode === "shared"
        ? currentHumanReadyClient(roomId).client.attachStoryEvidence(roomId, storyId, input)
        : client.attachStoryEvidence(roomId, storyId, input),
    [client, currentHumanReadyClient, mode],
  );

  const transitionLocalStory = useCallback(
    (roomId: string, storyId: string, input: RoomsLocalTransitionStoryInput) =>
      mode === "shared"
        ? currentHumanReadyClient(roomId).client.transitionStory(roomId, storyId, input)
        : client.transitionStory(roomId, storyId, input),
    [client, currentHumanReadyClient, mode],
  );

  const reviewLocalStory = useCallback(
    (roomId: string, storyId: string, input: RoomsLocalReviewStoryInput) =>
      mode === "shared"
        ? currentHumanReadyClient(roomId).client.reviewStory(roomId, storyId, input)
        : client.reviewStory(roomId, storyId, input),
    [client, currentHumanReadyClient, mode],
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
      setSelectedBySource((current) =>
        current[mode] === room.id ? current : { ...current, [mode]: room.id },
      );
      if (mode === "shared") {
        const currentAuthentication = readRoomsAuthenticationSnapshot();
        if (
          shouldReloadRoomsHumanSelection(
            humanStateRef.current,
            {
              generation: currentAuthentication.generation,
              accountId:
                currentAuthentication.status === "signed-in"
                  ? currentAuthentication.accountId
                  : null,
            },
            room.id,
          )
        ) {
          void loadHumanSession(room.id);
        }
      }
    },
    [loadHumanSession, mode, setSelectedBySource, state.rooms],
  );

  const value = useMemo<RoomsDataSourceContextValue>(
    () => ({
      mode,
      state,
      selectedRoom,
      selectedBySource,
      localConfig,
      localApiBaseUrl,
      localFeedInvalidationGeneration: localFeedSync.invalidationGeneration,
      localFeedRefreshGeneration: localFeedSync.refreshGeneration,
      localLiveUpdatesStatus: mode === "shared" ? humanLiveUpdatesStatus : localLiveUpdatesStatus,
      retryLocalWorkspace,
      retryHumanSession,
      redeemHumanBootstrap,
      inspectHumanInvite,
      redeemHumanInvite,
      createHumanInvite,
      createLocalChannel,
      loadLocalFeed,
      sendLocalMessage,
      loadLocalStories,
      loadLocalStory,
      createLocalStory,
      linkLocalStoryThread,
      uploadLocalCas,
      attachLocalStoryEvidence,
      transitionLocalStory,
      reviewLocalStory,
      selectRoom,
      setLocalConfig,
      setMode,
    }),
    [
      createLocalChannel,
      loadLocalFeed,
      localApiBaseUrl,
      localConfig,
      localFeedSync.invalidationGeneration,
      localFeedSync.refreshGeneration,
      localLiveUpdatesStatus,
      humanLiveUpdatesStatus,
      mode,
      retryLocalWorkspace,
      retryHumanSession,
      redeemHumanBootstrap,
      inspectHumanInvite,
      redeemHumanInvite,
      createHumanInvite,
      selectRoom,
      selectedBySource,
      selectedRoom,
      sendLocalMessage,
      loadLocalStories,
      loadLocalStory,
      createLocalStory,
      linkLocalStoryThread,
      uploadLocalCas,
      attachLocalStoryEvidence,
      transitionLocalStory,
      reviewLocalStory,
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
