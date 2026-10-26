import type { RoomsSharedProjectsClient } from "@t3tools/client-runtime/rooms/shared-projects";
import type { RoomsConversationClient } from "@t3tools/client-runtime/rooms/conversation-client";
import { normalizeRoomsOrigin } from "@t3tools/shared/roomsTransport";
import {
  RoomsConnection,
  type RoomsConnectionIdentity,
  type RoomsConnectionRequest,
} from "@t3tools/client-runtime/rooms/connection";
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
import { useLocalStorage } from "~/hooks/useLocalStorage";

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
import { publishRoomsServerAuthentication } from "./publishServerAuthentication";
import {
  createRoomsLocalAuthClient,
  type RoomsLocalEnrollInput,
  type RoomsLocalPasswordResetInput,
  type RoomsLocalSetupInput,
  type RoomsLocalSignInInput,
} from "./localAuthClient";
import type {
  RoomsAuthProviderName,
  RoomsLocalAuthProvider,
  RoomsLocalAuthSignedIn,
} from "./localAuthContract";
import {
  ROOMS_SHARED_SERVER_STORAGE_KEY,
  resolveRoomsAuthProvider,
  resolveRoomsSharedServerBaseUrl,
  roomsDeviceLabel,
  roomsProfileAfterDiscovery,
  roomsProfileAfterSignIn,
  roomsProfileAfterSignOut,
  RoomsSharedServerProfileOrNull,
  type RoomsSharedServerProfile,
  usableRoomsSharedSession,
} from "./serverProfile";
import type {
  RoomsHumanInviteInspection,
  RoomsInteractiveFeed,
  RoomsHumanInviteIssuance,
  RoomsHumanMembershipRedemption,
  RoomsHumanRole,
  RoomsHumanStoriesResponse,
  RoomsHumanWorkspace,
  RoomsHumanSession,
  RoomsInteractiveWorkspace,
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
  normalizeRoomsDataSourceMode,
} from "./model";

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
  // Runtime server selection for the Shared source. Null means the build-time
  // configuration (managed T3 Connect) applies.
  readonly serverProfile: RoomsSharedServerProfile | null;
  readonly authProvider: RoomsAuthProviderName;
  readonly humanApiBaseUrl: string;
  readonly connectServer: (baseUrl: string) => Promise<RoomsLocalAuthProvider>;
  readonly forgetServer: () => Promise<void>;
  readonly setUpLocalServer: (input: RoomsLocalSetupInput) => Promise<RoomsLocalAuthSignedIn>;
  readonly signInLocal: (input: RoomsLocalSignInInput) => Promise<RoomsLocalAuthSignedIn>;
  readonly enrollLocal: (input: RoomsLocalEnrollInput) => Promise<RoomsLocalAuthSignedIn>;
  readonly resetLocalPassword: (
    input: RoomsLocalPasswordResetInput,
  ) => Promise<RoomsLocalAuthSignedIn>;
  readonly signOutLocal: () => Promise<void>;
  readonly connectionIdentity: string;
  readonly connectionGeneration: number;
  readonly projectsClientFor: (request: RoomsConnectionRequest) => RoomsSharedProjectsClient;
  readonly conversationClientFor: (request: RoomsConnectionRequest) => RoomsConversationClient;
  readonly captureConnection: () => RoomsConnectionRequest;
  readonly isCurrentConnection: (request: RoomsConnectionRequest) => boolean;
  readonly localFeedInvalidationGeneration: number;
  readonly localFeedRefreshGeneration: number;
  readonly localLiveUpdatesStatus: RoomsLocalLiveUpdatesStatus;
  readonly retryLocalWorkspace: () => Promise<RoomsInteractiveWorkspace | null>;
  readonly retryHumanSession: () => Promise<RoomsHumanWorkspace | null>;
  readonly createHumanRoom: (
    name: string,
    requestId: string,
  ) => Promise<RoomsHumanMembershipRedemption>;
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
  ) => Promise<RoomsInteractiveFeed>;
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
  const [serverProfile, setServerProfile] = useLocalStorage(
    ROOMS_SHARED_SERVER_STORAGE_KEY,
    null,
    RoomsSharedServerProfileOrNull,
  );
  const humanApiBaseUrl = resolveRoomsSharedServerBaseUrl(
    serverProfile,
    humanPublicConfig.roomsApiUrl,
  );
  const authProvider = resolveRoomsAuthProvider(serverProfile);
  const storedLocalSession = usableRoomsSharedSession(serverProfile);
  const storedLocalSessionToken = storedLocalSession?.token ?? null;
  const storedLocalSessionAccountId = storedLocalSession?.accountId ?? null;
  const serverProfileRef = useRef(serverProfile);
  serverProfileRef.current = serverProfile;
  // Hand the published Rooms session to whichever provider the selected server
  // uses. A stored local session is re-activated here on every launch; Clerk keeps
  // its own intent and is republished when ownership returns to it.
  useEffect(() => {
    publishRoomsServerAuthentication(
      authProvider,
      storedLocalSessionAccountId,
      storedLocalSessionToken,
    );
  }, [authProvider, storedLocalSessionAccountId, storedLocalSessionToken]);
  const [storedMode, setPersistedMode] = useLocalStorage(
    ROOMS_DATA_SOURCE_STORAGE_KEY,
    "shared",
    Schema.String,
  );
  const mode = normalizeRoomsDataSourceMode(storedMode);
  useEffect(() => {
    if (storedMode !== mode) setPersistedMode(mode);
  }, [mode, setPersistedMode, storedMode]);
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
  const configured =
    authProvider === "local"
      ? humanApiBaseUrl !== ""
      : Boolean(
          humanPublicConfig.clerkPublishableKey &&
          humanApiBaseUrl &&
          humanPublicConfig.roomsClerkJwtTemplate,
        );
  const identity = useMemo<RoomsConnectionIdentity>(
    () => ({
      source: mode,
      server: mode === "local" ? localApiBaseUrl : humanApiBaseUrl,
      accountId:
        mode === "shared" && authentication.status === "signed-in"
          ? authentication.accountId
          : null,
      authenticationGeneration: mode === "shared" ? authentication.generation : 0,
      authenticationStatus: mode === "local" ? "signed-in" : authentication.status,
      configured: mode === "local" || configured,
    }),
    [mode, localApiBaseUrl, humanApiBaseUrl, authentication, configured],
  );
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const clientRef = useRef(client);
  clientRef.current = client;
  const preferencesRef = useRef(setSelectedBySource);
  preferencesRef.current = setSelectedBySource;
  const connectionRef = useRef<RoomsConnection<
    RoomsHumanSession,
    RoomsInteractiveWorkspace
  > | null>(null);
  const liveRequestRef = useRef<RoomsConnectionRequest | null>(null);
  const liveLoopRef = useRef<RoomsLocalChangeLoop | null>(null);
  const refreshAfterChangeRef = useRef<
    (invalidation: RoomsLocalChangeInvalidation, request: RoomsConnectionRequest) => Promise<void>
  >(async () => undefined);
  const [liveUpdatesStatus, setLiveUpdatesStatus] =
    useState<RoomsLocalLiveUpdatesStatus>("connected");
  const [localFeedSync, setLocalFeedSync] = useState({
    invalidationGeneration: 0,
    refreshGeneration: 0,
  });
  const feedInvalidationGenerationRef = useRef(0);
  const humanClientForRequest = useCallback(
    (request: RoomsConnectionRequest) =>
      createRoomsHumanClient(
        request.server,
        () => readRoomsClerkToken(request.authenticationGeneration),
        undefined,
        () => {
          connectionRef.current!.assertCurrent(request, identityRef.current);
          assertRoomsAuthenticationGeneration(request.authenticationGeneration);
        },
      ),
    [],
  );
  const [connection] = useState(
    () =>
      new RoomsConnection<RoomsHumanSession, RoomsInteractiveWorkspace>({
        selected: selectedBySource,
        onSelection: (source, roomId) =>
          preferencesRef.current((current) =>
            current[source] === roomId ? current : { ...current, [source]: roomId },
          ),
        createLiveSubscription: (_roomId, request) => {
          liveRequestRef.current = request;
          // Reuse the physical web wait owner: this transport cannot abort an HTTP bridge request.
          if (!liveLoopRef.current)
            liveLoopRef.current = new RoomsLocalChangeLoop({
              client: {
                waitForChanges: (roomId, input) => {
                  const current = liveRequestRef.current!;
                  connectionRef.current!.assertCurrent(current, identityRef.current);
                  return current.source === "local"
                    ? clientRef.current.waitForChanges(roomId, input)
                    : humanClientForRequest(current).waitForChanges(roomId, input);
                },
              },
              onInvalidate: (invalidation) =>
                refreshAfterChangeRef.current(invalidation, liveRequestRef.current!),
              onStatusChange: (status) => {
                const current = liveRequestRef.current;
                if (current && connectionRef.current!.isCurrent(current))
                  setLiveUpdatesStatus(status);
              },
            });
          return liveLoopRef.current;
        },
      }),
  );
  connectionRef.current = connection;
  const projection = useSyncExternalStore(
    connection.subscribe,
    connection.getSnapshot,
    connection.getSnapshot,
  );
  const adapter = useMemo(
    () => ({
      discover: async (request: RoomsConnectionRequest) => {
        connection.assertCurrent(request, identityRef.current);
        if (request.source === "local") {
          const workspace = await client.getWorkspace();
          connection.assertCurrent(request, identityRef.current);
          return {
            session: null,
            workspace,
            rooms: [{ ...workspace.room, role: workspace.principal.role }],
          };
        }
        const session = await humanClientForRequest(request).getSession();
        return { session, rooms: session.rooms };
      },
      loadWorkspace: (roomId: string, request: RoomsConnectionRequest) =>
        request.source === "local"
          ? client.getWorkspace()
          : humanClientForRequest(request).getWorkspace(roomId),
      workspaceRoomId: (workspace: RoomsInteractiveWorkspace) => workspace.room.id,
    }),
    [client, connection, humanClientForRequest],
  );
  useEffect(() => {
    connection.configure(identity, adapter);
    connection.setActive(true);
    void connection.refresh();
    return () => connection.setActive(false);
  }, [adapter, connection, identity]);
  const projectionCurrent = connection.matches(identity);
  const projectedWorkspace =
    projectionCurrent && projection.status === "ready" ? projection.workspace : null;
  const localState: RoomsLocalSourceState =
    mode === "local" && projectedWorkspace
      ? resolveLocalRoomsDataSourceState(
          projectedWorkspace as RoomsLocalWorkspace,
          reconcileLocalWorkspaceConfig(localConfig, projectedWorkspace as RoomsLocalWorkspace),
        )
      : mode === "local" && projectionCurrent && projection.status === "error"
        ? failedLocalRoomsDataSourceState(projection.error)
        : connectingLocalRoomsDataSourceState();
  const humanState: RoomsHumanSourceState =
    mode === "shared" && projectedWorkspace && projection.session && projection.identity
      ? {
          mode: "shared",
          status: "ready",
          session: projection.session,
          workspace: projectedWorkspace as RoomsHumanWorkspace,
          rooms: projection.session.rooms.map((room) => ({
            sourceMode: "shared",
            id: room.id,
            slug: room.slug,
            name: room.name,
            locality: "shared",
            membershipRole: room.role,
            unreadCount: null,
          })),
          authenticationGeneration: projection.identity.authenticationGeneration,
          accountId: projection.identity.accountId!,
        }
      : mode === "shared" && projectionCurrent && projection.status === "error"
        ? humanFailureFor(projection.error)
        : humanFailure(
            mode === "shared" &&
              projectionCurrent &&
              projection.status !== "ready" &&
              projection.status !== "connecting"
              ? (projection.status as RoomsHumanSourceFailure["status"])
              : authentication.status === "signed-out"
                ? "signed-out"
                : "authenticating",
            null,
            projection.status === "invited"
              ? (projection.invitation as RoomsHumanInviteInspection)
              : null,
          );
  useEffect(() => {
    if (localState.status !== "ready") return;
    setLocalConfig((current) => reconcileLocalWorkspaceConfig(current, localState.workspace));
  }, [localState.status === "ready" ? localState.workspace : null, setLocalConfig]);
  const loadWorkspace = useCallback(
    (_showConnecting = false, preserveReadyState = false) =>
      connection.refresh(null, preserveReadyState),
    [connection],
  );
  const loadHumanSession = useCallback(
    async (preferredRoomId: string | null = null, preserveReadyState = false) =>
      (await connection.refresh(preferredRoomId, preserveReadyState)) as RoomsHumanWorkspace | null,
    [connection],
  );
  const refreshAfterChange = useCallback(
    async (invalidation: RoomsLocalChangeInvalidation, request: RoomsConnectionRequest) => {
      connection.assertCurrent(request, identityRef.current);
      const invalidationGeneration = ++feedInvalidationGenerationRef.current;
      setLocalFeedSync((current) => ({
        invalidationGeneration,
        refreshGeneration: current.refreshGeneration,
      }));
      const workspace = await connection.refresh(invalidation.roomId, true);
      connection.assertCurrent(request, identityRef.current);
      if (!workspace) throw sourceNotReadyError();
      if (
        request.source === "shared" &&
        !invalidation.initial &&
        invalidation.reason === "advanced"
      ) {
        try {
          const showNotification = window.desktopBridge?.showNotification;
          if (showNotification) {
            const notificationClient = humanClientForRequest(request);
            for (const channel of workspace.channels) {
              let afterSeq = invalidation.afterSeq;
              let hasMore = true;
              while (hasMore) {
                const feed = await notificationClient.getFeed(workspace.room.id, channel.id, {
                  afterSeq,
                  snapshotHeadSeq: invalidation.headSeq,
                  limit: 100,
                });
                connection.assertCurrent(request, identityRef.current);
                for (const notification of selectRoomsDesktopNotifications({
                  workspace: workspace as RoomsHumanWorkspace,
                  channel,
                  items: feed.items,
                  afterSeq: invalidation.afterSeq,
                  headSeq: invalidation.headSeq,
                })) {
                  connection.assertCurrent(request, identityRef.current);
                  await showNotification(notification);
                }
                hasMore = feed.page_info.has_more;
                if (!hasMore || feed.page_info.next_cursor <= afterSeq) break;
                afterSeq = feed.page_info.next_cursor;
              }
            }
          }
        } catch (error) {
          if (!connection.isCurrent(request)) return;
          console.warn("Could not deliver a Shared Threadspace desktop notification.", error);
        }
      }
      connection.assertCurrent(request, identityRef.current);
      setLocalFeedSync((current) =>
        current.invalidationGeneration === invalidationGeneration
          ? { ...current, refreshGeneration: invalidationGeneration }
          : current,
      );
    },
    [connection, humanClientForRequest],
  );
  refreshAfterChangeRef.current = refreshAfterChange;
  const state = mode === "local" ? localState : humanState;
  const selectedRoom = state.rooms.find((room) => room.id === projection.selectedRoomId) ?? null;

  const retryLocalWorkspace = useCallback(() => loadWorkspace(true), [loadWorkspace]);
  const retryHumanSession = useCallback(
    () => loadHumanSession(selectedBySource.shared),
    [loadHumanSession, selectedBySource.shared],
  );

  const runConnection = useCallback(
    <Value,>(operation: (request: RoomsConnectionRequest) => Promise<Value>) =>
      connection.run((request) => {
        connection.assertCurrent(request, identity);
        return operation(request).then((value) => {
          connection.assertCurrent(request, identityRef.current);
          return value;
        });
      }),
    [connection, identity],
  );

  const redeemHumanBootstrap = useCallback(
    (bootstrapToken: string) =>
      runConnection(async (request) => {
        const result = await humanClientForRequest(request).redeemBootstrap(bootstrapToken);
        connection.assertCurrent(request, identityRef.current);
        await connection.refresh(result.room.id);
        return result;
      }),
    [runConnection, humanClientForRequest, connection],
  );
  const createHumanRoom = useCallback(
    (name: string, requestId: string) =>
      runConnection(async (request) => {
        const result = await humanClientForRequest(request).createRoom({ name, requestId });
        connection.assertCurrent(request, identityRef.current);
        await connection.refresh(result.room.id);
        return result;
      }),
    [runConnection, humanClientForRequest, connection],
  );
  const inspectHumanInvite = useCallback(
    async (roomId: string, inviteToken: string) => {
      const invitation = await runConnection((request) =>
        humanClientForRequest(request).inspectInvite(roomId, inviteToken),
      );
      connection.presentInvitation(invitation);
      return invitation;
    },
    [runConnection, humanClientForRequest, connection],
  );
  const redeemHumanInvite = useCallback(
    (roomId: string, inviteToken: string) =>
      runConnection(async (request) => {
        const result = await humanClientForRequest(request).redeemInvite(roomId, inviteToken);
        connection.assertCurrent(request, identityRef.current);
        await connection.refresh(result.room.id);
        return result;
      }),
    [runConnection, humanClientForRequest, connection],
  );
  const createHumanInvite = useCallback(
    (roomId: string, role: RoomsHumanRole, requestId: string) =>
      runConnection((request) => {
        connection.readyRequest(roomId);
        return humanClientForRequest(request).createInvite(roomId, { role, requestId });
      }),
    [runConnection, humanClientForRequest, connection],
  );

  const localAuthClient = useMemo(
    () => createRoomsLocalAuthClient(humanApiBaseUrl),
    [humanApiBaseUrl],
  );

  const connectServer = useCallback(
    async (baseUrl: string) => {
      const normalized = normalizeRoomsOrigin("shared", baseUrl);
      if (normalized === null) {
        throw new RoomsLocalClientError({
          kind: "invalid_configuration",
          code: "invalid_human_api_base_url",
          message: "Use an HTTPS origin or HTTP loopback origin for the Threadspace server.",
        });
      }
      const discovered = await runConnection(() =>
        createRoomsLocalAuthClient(normalized).getAuthProvider(),
      );
      setServerProfile((current) => roomsProfileAfterDiscovery(current, normalized, discovered));
      setPersistedMode("shared");
      return discovered;
    },
    [runConnection, setPersistedMode, setServerProfile],
  );

  const commitLocalSignIn = useCallback(
    (result: RoomsLocalAuthSignedIn) => {
      setServerProfile(roomsProfileAfterSignIn(humanApiBaseUrl, result));
      setPersistedMode("shared");
      return result;
    },
    [humanApiBaseUrl, setPersistedMode, setServerProfile],
  );

  const withDeviceLabel = <T extends { readonly deviceLabel?: string }>(input: T): T => ({
    ...input,
    deviceLabel: input.deviceLabel ?? roomsDeviceLabel(),
  });

  const setUpLocalServer = useCallback(
    async (input: RoomsLocalSetupInput) =>
      commitLocalSignIn(await runConnection(() => localAuthClient.setUp(withDeviceLabel(input)))),
    [commitLocalSignIn, localAuthClient, runConnection],
  );

  const signInLocal = useCallback(
    async (input: RoomsLocalSignInInput) =>
      commitLocalSignIn(await runConnection(() => localAuthClient.signIn(withDeviceLabel(input)))),
    [commitLocalSignIn, localAuthClient, runConnection],
  );

  const enrollLocal = useCallback(
    async (input: RoomsLocalEnrollInput) =>
      commitLocalSignIn(await runConnection(() => localAuthClient.enroll(withDeviceLabel(input)))),
    [commitLocalSignIn, localAuthClient, runConnection],
  );

  const resetLocalPassword = useCallback(
    async (input: RoomsLocalPasswordResetInput) =>
      commitLocalSignIn(
        await runConnection(() => localAuthClient.resetPassword(withDeviceLabel(input))),
      ),
    [commitLocalSignIn, localAuthClient, runConnection],
  );

  // Revoke on the server when it can be reached; clear the device either way. A
  // token that could not be revoked stays valid on the server until it expires.
  const signOutLocal = useCallback(async () => {
    const request = connection.capture();
    connection.assertCurrent(request, identity);
    const profile = serverProfileRef.current;
    const session = usableRoomsSharedSession(profile);
    // Clear the captured profile immediately. The revocation uses its old origin/token,
    // and its late completion cannot clear a newly connected server's session.
    setServerProfile((current) =>
      current === profile ? roomsProfileAfterSignOut(current) : current,
    );
    if (session) {
      try {
        await createRoomsLocalAuthClient(profile!.baseUrl).signOut(session.token);
      } catch (error) {
        console.warn("Could not revoke the Threadspace session on the server.", error);
      }
    }
  }, [connection, identity, setServerProfile]);
  const forgetServer = useCallback(async () => {
    const profile = serverProfileRef.current;
    const revoke = signOutLocal();
    setServerProfile((current) =>
      current === profile || (current?.baseUrl === profile?.baseUrl && current?.session === null)
        ? null
        : current,
    );
    await revoke;
  }, [setServerProfile, signOutLocal]);
  const createLocalChannel = useCallback(
    (input: RoomsLocalCreateChannelInput) =>
      runConnection(async (request) => {
        connection.readyRequest();
        const roomId = connection.getSnapshot().selectedRoomId!;
        const result =
          request.source === "shared"
            ? await humanClientForRequest(request).createChannel(roomId, input)
            : await client.createChannel(roomId, input);
        connection.assertCurrent(request, identityRef.current);
        const workspace = await connection.refresh(roomId, true);
        if (!workspace)
          throw new RoomsLocalClientError({
            kind: "transport",
            code: "rooms_workspace_refresh_failed",
            message: "The channel was accepted, but workspace discovery could not be refreshed.",
          });
        return result;
      }),
    [runConnection, connection, humanClientForRequest, client],
  );

  const loadLocalFeed = useCallback(
    (roomId: string, channelId: string, input?: RoomsLocalFeedPageInput) =>
      runConnection<RoomsInteractiveFeed>((request) => {
        connection.readyRequest(roomId);
        return request.source === "shared"
          ? humanClientForRequest(request).getFeed(roomId, channelId, input)
          : client.getFeed(roomId, channelId, input);
      }),
    [client, connection, humanClientForRequest, runConnection],
  );

  const sendLocalMessage = useCallback(
    (roomId: string, channelId: string, input: RoomsLocalCreateMessageInput) =>
      runConnection((request) => {
        connection.readyRequest(roomId);
        return request.source === "shared"
          ? humanClientForRequest(request).createMessage(roomId, channelId, input)
          : client.createMessage(roomId, channelId, input);
      }),
    [client, connection, humanClientForRequest, runConnection],
  );

  const loadLocalStories = useCallback(
    (roomId: string) =>
      runConnection<RoomsHumanStoriesResponse | RoomsLocalStoriesResponse>((request) => {
        connection.readyRequest(roomId);
        return request.source === "shared"
          ? humanClientForRequest(request).getStories(roomId)
          : client.getStories(roomId);
      }),
    [client, connection, humanClientForRequest, runConnection],
  );

  const loadLocalStory = useCallback(
    (roomId: string, storyId: string) =>
      runConnection((request) => {
        connection.readyRequest(roomId);
        return request.source === "shared"
          ? humanClientForRequest(request).getStory(roomId, storyId)
          : client.getStory(roomId, storyId);
      }),
    [client, connection, humanClientForRequest, runConnection],
  );

  const createLocalStory = useCallback(
    (roomId: string, input: RoomsLocalCreateStoryInput) =>
      runConnection((request) => {
        connection.readyRequest(roomId);
        return request.source === "shared"
          ? humanClientForRequest(request).createStory(roomId, input)
          : client.createStory(roomId, input);
      }),
    [client, connection, humanClientForRequest, runConnection],
  );

  const linkLocalStoryThread = useCallback(
    (roomId: string, storyId: string, input: RoomsLocalLinkStoryThreadInput) =>
      runConnection((request) => {
        connection.readyRequest(roomId);
        return request.source === "shared"
          ? humanClientForRequest(request).linkStoryThread(roomId, storyId, input)
          : client.linkStoryThread(roomId, storyId, input);
      }),
    [client, connection, humanClientForRequest, runConnection],
  );

  const uploadLocalCas = useCallback(
    (input: RoomsLocalUploadCasInput) =>
      runConnection((request) => {
        connection.readyRequest();
        return request.source === "shared"
          ? humanClientForRequest(request).uploadCas(
              connection.getSnapshot().selectedRoomId!,
              input,
            )
          : client.uploadCas(input);
      }),
    [runConnection, connection, humanClientForRequest, client],
  );

  const attachLocalStoryEvidence = useCallback(
    (roomId: string, storyId: string, input: RoomsLocalAttachEvidenceInput) =>
      runConnection((request) => {
        connection.readyRequest(roomId);
        return request.source === "shared"
          ? humanClientForRequest(request).attachStoryEvidence(roomId, storyId, input)
          : client.attachStoryEvidence(roomId, storyId, input);
      }),
    [client, connection, humanClientForRequest, runConnection],
  );

  const transitionLocalStory = useCallback(
    (roomId: string, storyId: string, input: RoomsLocalTransitionStoryInput) =>
      runConnection((request) => {
        connection.readyRequest(roomId);
        return request.source === "shared"
          ? humanClientForRequest(request).transitionStory(roomId, storyId, input)
          : client.transitionStory(roomId, storyId, input);
      }),
    [client, connection, humanClientForRequest, runConnection],
  );

  const reviewLocalStory = useCallback(
    (roomId: string, storyId: string, input: RoomsLocalReviewStoryInput) =>
      runConnection((request) => {
        connection.readyRequest(roomId);
        return request.source === "shared"
          ? humanClientForRequest(request).reviewStory(roomId, storyId, input)
          : client.reviewStory(roomId, storyId, input);
      }),
    [client, connection, humanClientForRequest, runConnection],
  );

  const setMode = useCallback(
    (nextMode: RoomsDataSourceMode) => setPersistedMode(nextMode),
    [setPersistedMode],
  );

  const selectRoom = useCallback(
    (room: RoomsSourceRoom) => {
      if (room.sourceMode !== mode) return;
      void connection.selectRoom(room.id);
    },
    [connection, mode],
  );
  const captureConnection = useCallback(() => connection.capture(), [connection]);
  const isCurrentConnection = useCallback(
    (request: RoomsConnectionRequest) =>
      connection.isCurrent(request) && connection.matches(identityRef.current),
    [connection],
  );
  const conversationClientFor = useCallback(
    (request: RoomsConnectionRequest) => {
      connection.assertCurrent(request, identityRef.current);
      if (request.source !== "shared") throw sourceNotReadyError();
      return humanClientForRequest(request).conversations;
    },
    [connection, humanClientForRequest],
  );
  const projectsClientFor = useCallback(
    (request: RoomsConnectionRequest) => {
      connection.assertCurrent(request, identityRef.current);
      if (request.source !== "shared") throw sourceNotReadyError();
      return humanClientForRequest(request).projects;
    },
    [connection, humanClientForRequest],
  );
  const connectionIdentity = JSON.stringify([identity.source, identity.server, identity.accountId]);

  const value = useMemo<RoomsDataSourceContextValue>(
    () => ({
      mode,
      state,
      connectionIdentity,
      connectionGeneration: projection.identity?.generation ?? 0,
      captureConnection,
      conversationClientFor,
      projectsClientFor,
      isCurrentConnection,
      selectedRoom,
      selectedBySource,
      localConfig,
      localApiBaseUrl,
      serverProfile,
      authProvider,
      humanApiBaseUrl,
      connectServer,
      forgetServer,
      setUpLocalServer,
      signInLocal,
      enrollLocal,
      resetLocalPassword,
      signOutLocal,
      localFeedInvalidationGeneration: localFeedSync.invalidationGeneration,
      localFeedRefreshGeneration: localFeedSync.refreshGeneration,
      localLiveUpdatesStatus: liveUpdatesStatus,
      retryLocalWorkspace,
      retryHumanSession,
      redeemHumanBootstrap,
      createHumanRoom,
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
      authProvider,
      connectServer,
      createLocalChannel,
      enrollLocal,
      forgetServer,
      humanApiBaseUrl,
      loadLocalFeed,
      localApiBaseUrl,
      localConfig,
      resetLocalPassword,
      serverProfile,
      setUpLocalServer,
      signInLocal,
      signOutLocal,
      localFeedSync.invalidationGeneration,
      localFeedSync.refreshGeneration,
      liveUpdatesStatus,
      connectionIdentity,
      projection.identity?.generation,
      captureConnection,
      conversationClientFor,
      projectsClientFor,
      isCurrentConnection,
      mode,
      retryLocalWorkspace,
      retryHumanSession,
      redeemHumanBootstrap,
      createHumanRoom,
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
