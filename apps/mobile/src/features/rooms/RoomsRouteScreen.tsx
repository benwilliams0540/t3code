import { RoomsConversations } from "@t3tools/client-runtime/rooms/conversations";
import { AuthView } from "@clerk/expo/native";
import { useAuth } from "@clerk/expo";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ActivityIndicator, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { uuidv7 } from "../../lib/uuid";
import { hasRoomsPublicConfig } from "../cloud/publicConfig";
import { WorkspaceSidebarToolbar } from "../layout/workspace-sidebar-toolbar";
import { RoomsMobileClientError } from "./client";
import { useRoomsMobileConnection } from "./RoomsRealtimeCoordinator";
import { setRoomsVisibleChannel, subscribeRoomsInvalidations } from "./realtimeBridge";
import { loadRoomsUnread, markRoomsChannelRead, subscribeRoomsUnread } from "./realtimePersistence";
import { type RoomsHumanFeed, type RoomsHumanStory, type RoomsHumanStoryV2 } from "./contract";
import { roomsApprovedEvidence, type RoomsMobileSection } from "./presentation";
import { ThreadspaceRoomsSurface } from "./ThreadspaceRoomsSurface";

function errorPresentation(cause: unknown): { readonly code: string; readonly message: string } {
  return cause instanceof RoomsMobileClientError
    ? { code: cause.code, message: cause.message }
    : { code: "rooms_unexpected", message: "Threadspace could not finish that request." };
}

export function RoomsRouteScreen() {
  if (!hasRoomsPublicConfig()) {
    return (
      <View className="flex-1 bg-screen px-5 pt-20">
        <NativeStackScreenOptions options={{ headerShown: false, title: "Threadspace" }} />
        <EmptyState
          title="Threadspace is not configured"
          detail="This build needs a private HTTPS Threadspace origin and the dedicated Clerk JWT template."
        />
      </View>
    );
  }
  return <ConfiguredRoomsRouteScreen />;
}

function ConfiguredRoomsRouteScreen() {
  const route = useRoute();
  const routeParams = route.params as
    | { readonly roomId?: string; readonly channelId?: string }
    | undefined;
  const requestedRoomId = routeParams?.roomId ?? null;
  const requestedChannelId = routeParams?.channelId ?? null;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isLoaded, isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const { connection, clientFor, identity, snapshot } = useRoomsMobileConnection();
  const session = connection.matches(identity) ? snapshot.session : null;
  const selectedRoomId = connection.matches(identity) ? snapshot.selectedRoomId : null;
  const workspace = connection.matches(identity) ? (snapshot.workspace?.workspace ?? null) : null;
  const storiesResponse = connection.matches(identity)
    ? (snapshot.workspace?.stories ?? null)
    : null;
  const selectedRoomIdRef = useRef(selectedRoomId);
  selectedRoomIdRef.current = selectedRoomId;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const conversations = useMemo(
    () =>
      new RoomsConversations({
        clientFor: (request) => clientFor(request).conversations,
        isCurrent: (request) =>
          connection.isCurrent(request) && connection.matches(identityRef.current),
        createRequestId: uuidv7,
      }),
    [connection, clientFor],
  );
  const conversation = useSyncExternalStore(conversations.subscribe, conversations.getSnapshot);
  const identityKey = JSON.stringify([identity.server, identity.accountId, selectedRoomId]);
  const client = useMemo(() => {
    // Each operation captures the current owner generation, while this rendered
    // callback remains tied to its account/server. A late token cannot retarget it.
    const scoped = () => {
      const request = connection.accessRequest();
      connection.assertCurrent(request, identity);
      return clientFor(request);
    };
    return {
      getFeed: (roomId: string, channelId: string) => scoped().getFeed(roomId, channelId),
      createMessage: (roomId: string, channelId: string, requestId: string, body: string) =>
        scoped().createMessage(roomId, channelId, requestId, body),
      transitionStory: (...args: Parameters<ReturnType<typeof clientFor>["transitionStory"]>) =>
        scoped().transitionStory(...args),
      reviewStory: (...args: Parameters<ReturnType<typeof clientFor>["reviewStory"]>) =>
        scoped().reviewStory(...args),
    };
  }, [connection, clientFor, identity.server, identity.accountId, identity.authenticationStatus]);
  const [section, setSection] = useState<RoomsMobileSection>("room");
  const [childScreen, setChildScreen] = useState<"channel" | "story" | null>(
    requestedChannelId ? "channel" : null,
  );
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const selectedChannelIdRef = useRef<string | null>(null);
  selectedChannelIdRef.current = selectedChannelId;
  const [feed, setFeed] = useState<RoomsHumanFeed | null>(null);
  const [unread, setUnread] = useState<Readonly<Record<string, number>>>({});
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [draft, setDraft] = useState("");
  const loading = snapshot.status === "connecting" || snapshot.status === "authenticating";
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ readonly code: string; readonly message: string } | null>(
    null,
  );
  const requestIds = useRef(new Map<string, string>());
  const feedLoadGenerationRef = useRef(0);
  const commandGenerationRef = useRef(0);

  const readRequestId = useCallback((key: string) => {
    const existing = requestIds.current.get(key);
    if (existing) return existing;
    const next = uuidv7();
    requestIds.current.set(key, next);
    return next;
  }, []);

  const loadRoom = useCallback(
    async (roomId: string) => {
      const request = connection.capture();
      try {
        await connection.loadWorkspace(roomId);
      } catch (cause) {
        if (connection.isCurrent(request)) setError(errorPresentation(cause));
      }
    },
    [connection],
  );

  const loadSession = useCallback(
    async (asRefresh = false) => {
      const request = connection.capture();
      if (asRefresh) setRefreshing(true);
      setError(null);
      try {
        const current = connection.getSnapshot();
        if (asRefresh || current.status !== "ready")
          await connection.refresh(requestedRoomId, asRefresh);
        else if (
          requestedRoomId &&
          current.rooms.some((room) => room.id === requestedRoomId) &&
          current.selectedRoomId !== requestedRoomId
        ) {
          await connection.selectRoom(requestedRoomId);
          return;
        }
        if (!connection.isCurrent(request)) return;
        const roomId = connection.getSnapshot().selectedRoomId;
        if (roomId) await connection.loadWorkspace(roomId);
      } catch (cause) {
        if (connection.isCurrent(request)) setError(errorPresentation(cause));
      } finally {
        if (connection.isCurrent(request)) setRefreshing(false);
      }
    },
    [connection, requestedRoomId],
  );

  useFocusEffect(
    useCallback(() => {
      if (isLoaded && isSignedIn && snapshot.status === "ready") void loadSession();
    }, [isLoaded, isSignedIn, loadSession, userId, snapshot.status]),
  );

  useEffect(
    () =>
      subscribeRoomsInvalidations((roomId) => {
        if (roomId === selectedRoomIdRef.current) void loadRoom(roomId);
      }),
    [loadRoom],
  );

  useEffect(() => {
    if (!workspace) return;
    const current = selectedChannelIdRef.current;
    const next =
      requestedRoomId === workspace.room.id &&
      requestedChannelId &&
      workspace.channels.some((channel) => channel.id === requestedChannelId)
        ? requestedChannelId
        : current && workspace.channels.some((channel) => channel.id === current)
          ? current
          : (workspace.channels[0]?.id ?? null);
    selectedChannelIdRef.current = next;
    setSelectedChannelId(next);
    setFeedRefreshKey((value) => value + 1);
  }, [workspace, requestedRoomId, requestedChannelId]);

  useEffect(() => {
    const refresh = () => void loadRoomsUnread().then(setUnread);
    refresh();
    return subscribeRoomsUnread(refresh);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (childScreen !== "channel" || !selectedRoomId || !selectedChannelId) {
        setRoomsVisibleChannel(null);
        return;
      }
      setRoomsVisibleChannel({ roomId: selectedRoomId, channelId: selectedChannelId });
      void markRoomsChannelRead(selectedRoomId, selectedChannelId);
      return () => setRoomsVisibleChannel(null);
    }, [childScreen, selectedChannelId, selectedRoomId]),
  );

  useEffect(() => {
    if (requestedChannelId) {
      setSection("room");
      setChildScreen("channel");
    }
  }, [requestedChannelId]);

  useEffect(() => {
    feedLoadGenerationRef.current += 1;
    commandGenerationRef.current += 1;
    requestIds.current.clear();
    selectedChannelIdRef.current = null;
    setChildScreen(requestedChannelId ? "channel" : null);
    setSelectedStoryId(null);
    setSelectedChannelId(null);
    setFeed(null);
    setFeedLoading(false);
    setDraft("");
    setBusy(false);
    setRefreshing(false);
    setError(null);
  }, [identityKey]);

  const hasConversations = workspace?.capabilities["channel.read"] === true;
  useEffect(() => {
    if (!hasConversations || !selectedRoomId || !selectedChannelId) return;
    conversations.configure(selectedRoomId, selectedChannelId, connection.capture());
    return () => conversations.stop();
  }, [
    conversations,
    connection,
    hasConversations,
    selectedRoomId,
    selectedChannelId,
    snapshot.identity?.generation,
  ]);

  useEffect(() => {
    if (!selectedRoomId || !selectedChannelId || childScreen !== "channel") return;
    let active = true;
    const generation = ++feedLoadGenerationRef.current;
    if (hasConversations) void conversations.refresh();
    if (conversation.selectedId) return;
    setFeedLoading(true);
    void client
      .getFeed(selectedRoomId, selectedChannelId)
      .then((next) => {
        if (active && generation === feedLoadGenerationRef.current) setFeed(next);
      })
      .catch((cause) => {
        if (active && generation === feedLoadGenerationRef.current) {
          setError(errorPresentation(cause));
        }
      })
      .finally(() => {
        if (active && generation === feedLoadGenerationRef.current) setFeedLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    childScreen,
    client,
    feedRefreshKey,
    selectedChannelId,
    selectedRoomId,
    conversation.selectedId,
    conversations,
    hasConversations,
  ]);

  const replaceStory = useCallback(
    (next: RoomsHumanStory) => {
      const request = connection.capture();
      connection.updateWorkspace(request, (current) => ({
        ...current,
        stories: {
          ...current.stories,
          stories: current.stories.stories.map((story) => (story.id === next.id ? next : story)),
        },
      }));
    },
    [connection],
  );

  const transitionStory = useCallback(
    async (story: RoomsHumanStoryV2, to: string) => {
      if (!selectedRoomId || busy) return;
      const request = connection.readyRequest(selectedRoomId);
      const roomId = selectedRoomId;
      const key = `transition:${story.id}:${to}:${story.scope_head_seq}`;
      setBusy(true);
      setError(null);
      try {
        const next = await client.transitionStory(roomId, story.id, {
          requestId: readRequestId(key),
          expectedHeadSeq: story.scope_head_seq,
          to,
          evidence: [],
        });
        connection.assertCurrent(request);
        requestIds.current.delete(key);
        if (selectedRoomIdRef.current === roomId) replaceStory(next);
      } catch (cause) {
        if (connection.isCurrent(request) && selectedRoomIdRef.current === roomId)
          setError(errorPresentation(cause));
      } finally {
        if (connection.isCurrent(request)) setBusy(false);
      }
    },
    [busy, client, connection, readRequestId, replaceStory, selectedRoomId],
  );

  const approveAndComplete = useCallback(
    async (story: RoomsHumanStoryV2) => {
      if (!selectedRoomId || !story.gate || busy) return;
      const request = connection.readyRequest(selectedRoomId);
      const roomId = selectedRoomId;
      setBusy(true);
      setError(null);
      try {
        let approved = story;
        if (!story.gate.approved_review_id) {
          const reviewKey = `review:${story.id}:${story.scope_head_seq}`;
          approved = await client.reviewStory(roomId, story.id, {
            requestId: readRequestId(reviewKey),
            expectedHeadSeq: story.scope_head_seq,
            evidence: story.gate.eligible_evidence,
          });
          connection.assertCurrent(request);
          requestIds.current.delete(reviewKey);
          if (selectedRoomIdRef.current === roomId) replaceStory(approved);
        }
        const completion = approved.allowed_next_transitions.find(
          (candidate) => candidate.terminal && candidate.to === "done" && candidate.allowed,
        );
        if (!completion) {
          throw new RoomsMobileClientError(
            "rooms_completion_unavailable",
            "The approved story is not ready for completion. Refresh and try again.",
          );
        }
        const completionKey = `transition:${approved.id}:done:${approved.scope_head_seq}`;
        const completed = await client.transitionStory(roomId, approved.id, {
          requestId: readRequestId(completionKey),
          expectedHeadSeq: approved.scope_head_seq,
          to: "done",
          evidence: roomsApprovedEvidence(approved),
        });
        connection.assertCurrent(request);
        requestIds.current.delete(completionKey);
        if (selectedRoomIdRef.current === roomId) replaceStory(completed);
      } catch (cause) {
        if (connection.isCurrent(request) && selectedRoomIdRef.current === roomId)
          setError(errorPresentation(cause));
      } finally {
        if (connection.isCurrent(request)) setBusy(false);
      }
    },
    [busy, client, connection, readRequestId, replaceStory, selectedRoomId],
  );

  const sendMessage = useCallback(async () => {
    if (!selectedRoomId || !selectedChannelId || !draft.trim() || busy) return;
    const request = connection.readyRequest(selectedRoomId);
    const roomId = selectedRoomId;
    const channelId = selectedChannelId;
    const payload = draft.trim();
    const conversationId = conversation.selectedId;
    const key = `message:${channelId}:${conversationId ?? "channel"}:${payload}`;
    const generation = ++feedLoadGenerationRef.current;
    const commandGeneration = commandGenerationRef.current;
    setBusy(true);
    setError(null);
    try {
      if (conversationId) await conversations.send(payload);
      else await client.createMessage(roomId, channelId, readRequestId(key), payload);
      connection.assertCurrent(request);
      if (
        commandGeneration !== commandGenerationRef.current ||
        conversations.getSnapshot().selectedId !== conversationId
      )
        return;
      requestIds.current.delete(key);
      setDraft("");
      if (conversationId) return;
      const nextFeed = await client.getFeed(roomId, channelId);
      if (
        generation === feedLoadGenerationRef.current &&
        commandGeneration === commandGenerationRef.current &&
        selectedRoomIdRef.current === roomId &&
        selectedChannelIdRef.current === channelId
      ) {
        setFeed(nextFeed);
      }
    } catch (cause) {
      if (
        connection.isCurrent(request) &&
        commandGeneration === commandGenerationRef.current &&
        selectedRoomIdRef.current === roomId &&
        selectedChannelIdRef.current === channelId
      ) {
        setError(errorPresentation(cause));
      }
    } finally {
      if (generation === feedLoadGenerationRef.current) setFeedLoading(false);
      if (connection.isCurrent(request) && commandGeneration === commandGenerationRef.current)
        setBusy(false);
    }
  }, [
    busy,
    client,
    connection,
    conversation.selectedId,
    conversations,
    draft,
    readRequestId,
    selectedChannelId,
    selectedRoomId,
  ]);

  const openStory = useCallback((storyId: string) => {
    setSelectedStoryId(storyId);
    setSection("stories");
    setChildScreen("story");
  }, []);

  const openThread = useCallback(
    (story: RoomsHumanStory) => {
      if (!story.native_thread) return;
      navigation.navigate("Thread", {
        environmentId: EnvironmentId.make(story.native_thread.environment_id),
        threadId: ThreadId.make(story.native_thread.thread_id),
      });
    },
    [navigation],
  );

  return (
    <KeyboardAvoidingView automaticOffset className="flex-1 bg-screen" behavior="padding">
      <WorkspaceSidebarToolbar />
      <NativeStackScreenOptions options={{ headerShown: false, title: "Threadspace" }} />
      {!isLoaded ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !isSignedIn ? (
        <View className="flex-1 overflow-hidden bg-sheet">
          <AuthView isDismissible={false} />
        </View>
      ) : loading && !workspace ? (
        <View className="flex-1 items-center justify-center gap-3 bg-[#efede6] dark:bg-[#0d1013]">
          <ActivityIndicator />
          <Text className="text-sm text-foreground-muted">Loading Shared Threadspace…</Text>
        </View>
      ) : session?.status === "authenticated_nonmember" || session?.rooms.length === 0 ? (
        <View className="flex-1 justify-center bg-[#efede6] px-5 dark:bg-[#0d1013]">
          <EmptyState
            title="No shared room membership"
            detail="This signed-in account is authenticated but is not a member of a shared room."
          />
        </View>
      ) : session && workspace && storiesResponse ? (
        <ThreadspaceRoomsSurface
          bottomInset={insets.bottom}
          busy={busy}
          childScreen={childScreen}
          draft={draft}
          error={error}
          feed={conversation.selectedId ? conversation.feed : feed}
          feedLoading={conversation.selectedId ? conversation.loading : feedLoading}
          conversation={
            hasConversations && conversation.capabilities
              ? {
                  choices: conversation.conversations,
                  selectedId: conversation.selectedId,
                  projection: conversation.projection,
                  pending: conversation.pending,
                  error: conversation.error instanceof Error ? conversation.error.message : null,
                  canCreate: conversation.capabilities["conversations.create"],
                  canMessage: conversation.capabilities["conversations.message"],
                  onSelect: (id) => {
                    feedLoadGenerationRef.current += 1;
                    commandGenerationRef.current += 1;
                    setDraft("");
                    setBusy(false);
                    void conversations.select(id);
                  },
                  onCreate: (title) => conversations.create(title).then(() => undefined),
                }
              : undefined
          }
          onApproveAndComplete={(story) => void approveAndComplete(story)}
          onBack={() => {
            setChildScreen(null);
            setSelectedStoryId(null);
          }}
          onChangeDraft={setDraft}
          onOpenAccount={() => navigation.navigate("SettingsSheet", { screen: "SettingsAuth" })}
          onOpenAppearance={() =>
            navigation.navigate("SettingsSheet", { screen: "SettingsAppearance" })
          }
          onOpenChannel={(channelId) => {
            if (channelId !== selectedChannelIdRef.current) {
              feedLoadGenerationRef.current += 1;
              commandGenerationRef.current += 1;
              selectedChannelIdRef.current = channelId;
              setSelectedChannelId(channelId);
              setFeed(null);
              setFeedLoading(true);
              setDraft("");
              setBusy(false);
            }
            setSection("room");
            setChildScreen("channel");
          }}
          onOpenStory={openStory}
          onOpenThread={openThread}
          onRefresh={() => void loadSession(true)}
          onSelectChannel={(channelId) => {
            if (channelId === selectedChannelIdRef.current) return;
            feedLoadGenerationRef.current += 1;
            commandGenerationRef.current += 1;
            selectedChannelIdRef.current = channelId;
            setSelectedChannelId(channelId);
            setFeed(null);
            setFeedLoading(true);
            setDraft("");
            setBusy(false);
          }}
          onSelectRoom={(roomId) => {
            if (roomId === selectedRoomIdRef.current) return;
            feedLoadGenerationRef.current += 1;
            commandGenerationRef.current += 1;
            selectedChannelIdRef.current = null;
            setChildScreen(null);
            setSelectedStoryId(null);
            setSelectedChannelId(null);
            setFeed(null);
            setFeedLoading(false);
            setDraft("");
            void connection.selectRoom(roomId).catch((cause) => setError(errorPresentation(cause)));
          }}
          onSelectSection={(nextSection) => {
            setChildScreen(null);
            setSelectedStoryId(null);
            setSection(nextSection);
          }}
          onSend={() => void sendMessage()}
          onTransition={(story, to) => void transitionStory(story, to)}
          refreshing={refreshing}
          section={section}
          selectedChannelId={selectedChannelId}
          selectedRoomId={selectedRoomId}
          selectedStoryId={selectedStoryId}
          session={session}
          storiesResponse={storiesResponse}
          topInset={insets.top}
          unread={unread}
          workspace={workspace}
        />
      ) : (
        <View className="flex-1 items-center justify-center bg-[#efede6] px-5 dark:bg-[#0d1013]">
          <Text className="text-sm text-foreground-muted">Threadspace data is unavailable.</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
