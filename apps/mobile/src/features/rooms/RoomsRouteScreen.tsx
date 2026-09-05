import { AuthView } from "@clerk/expo/native";
import { useAuth } from "@clerk/expo";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { uuidv7 } from "../../lib/uuid";
import {
  hasRoomsPublicConfig,
  resolveCloudPublicConfig,
  resolveRoomsClerkTokenOptions,
} from "../cloud/publicConfig";
import { WorkspaceSidebarToolbar } from "../layout/workspace-sidebar-toolbar";
import { createRoomsMobileClient, RoomsMobileClientError } from "./client";
import { setRoomsVisibleChannel, subscribeRoomsInvalidations } from "./realtimeBridge";
import { loadRoomsUnread, markRoomsChannelRead, subscribeRoomsUnread } from "./realtimePersistence";
import {
  type RoomsHumanFeed,
  type RoomsHumanSession,
  type RoomsHumanStoriesResponse,
  type RoomsHumanStory,
  type RoomsHumanStoryV2,
  type RoomsHumanWorkspace,
} from "./contract";
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
  const { getToken, isLoaded, isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const config = resolveCloudPublicConfig();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const accountIdRef = useRef(userId);
  accountIdRef.current = userId;
  const client = useMemo(() => {
    const accountId = userId;
    return createRoomsMobileClient({
      baseUrl: config.rooms.apiUrl!,
      // Clerk may return a new getToken function as auth state settles. Read
      // the latest function through a ref so that routine renders do not
      // recreate the client and retrigger the focused-screen refresh effect.
      readToken: () => getTokenRef.current(resolveRoomsClerkTokenOptions()),
      assertCurrent: () => {
        if (accountIdRef.current !== accountId) {
          throw new RoomsMobileClientError(
            "rooms_account_changed",
            "The signed-in account changed while Threadspace was loading.",
          );
        }
      },
    });
  }, [config.rooms.apiUrl, userId]);
  const [session, setSession] = useState<RoomsHumanSession | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const selectedRoomIdRef = useRef<string | null>(null);
  selectedRoomIdRef.current = selectedRoomId;
  const [workspace, setWorkspace] = useState<RoomsHumanWorkspace | null>(null);
  const workspaceRoomIdRef = useRef<string | null>(null);
  workspaceRoomIdRef.current = workspace?.room.id ?? null;
  const [storiesResponse, setStoriesResponse] = useState<RoomsHumanStoriesResponse | null>(null);
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ readonly code: string; readonly message: string } | null>(
    null,
  );
  const requestIds = useRef(new Map<string, string>());
  const loadGenerationRef = useRef(0);
  const feedLoadGenerationRef = useRef(0);

  const readRequestId = useCallback((key: string) => {
    const existing = requestIds.current.get(key);
    if (existing) return existing;
    const next = uuidv7();
    requestIds.current.set(key, next);
    return next;
  }, []);

  const loadRoom = useCallback(
    async (
      roomId: string,
      options: {
        readonly asRefresh?: boolean;
        readonly generation?: number;
        readonly throwOnError?: boolean;
      } = {},
    ) => {
      const generation = options.generation ?? ++loadGenerationRef.current;
      const asRefresh = options.asRefresh === true;
      const preserveReadyState = workspaceRoomIdRef.current === roomId;
      if (asRefresh) setRefreshing(true);
      else if (!preserveReadyState) {
        setLoading(true);
        setWorkspace(null);
        setStoriesResponse(null);
      }
      setError(null);
      try {
        const [nextWorkspace, nextStories] = await Promise.all([
          client.getWorkspace(roomId),
          client.getStories(roomId),
        ]);
        if (generation !== loadGenerationRef.current) return;
        setWorkspace(nextWorkspace);
        setStoriesResponse(nextStories);
        const currentChannelId = selectedChannelIdRef.current;
        const nextChannelId =
          requestedRoomId === roomId &&
          requestedChannelId &&
          nextWorkspace.channels.some((channel) => channel.id === requestedChannelId)
            ? requestedChannelId
            : currentChannelId &&
                nextWorkspace.channels.some((channel) => channel.id === currentChannelId)
              ? currentChannelId
              : (nextWorkspace.channels[0]?.id ?? null);
        selectedChannelIdRef.current = nextChannelId;
        setSelectedChannelId(nextChannelId);
        if (nextChannelId) setFeedLoading(true);
        setFeedRefreshKey((current) => current + 1);
      } catch (cause) {
        if (generation === loadGenerationRef.current) {
          setError(errorPresentation(cause));
          if (options.throwOnError) throw cause;
        }
      } finally {
        if (generation === loadGenerationRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [client, requestedChannelId, requestedRoomId],
  );

  const loadSession = useCallback(
    async (asRefresh = false) => {
      const generation = ++loadGenerationRef.current;
      if (asRefresh) setRefreshing(true);
      else if (!workspaceRoomIdRef.current) setLoading(true);
      setError(null);
      try {
        const nextSession = await client.getSession();
        if (generation !== loadGenerationRef.current) return;
        setSession(nextSession);
        const currentRoomId = selectedRoomIdRef.current;
        const roomId =
          requestedRoomId && nextSession.rooms.some((room) => room.id === requestedRoomId)
            ? requestedRoomId
            : currentRoomId && nextSession.rooms.some((room) => room.id === currentRoomId)
              ? currentRoomId
              : (nextSession.rooms[0]?.id ?? null);
        if (roomId !== currentRoomId) {
          feedLoadGenerationRef.current += 1;
          setChildScreen(null);
          setSelectedStoryId(null);
          selectedChannelIdRef.current = null;
          setSelectedChannelId(null);
          setFeed(null);
          setFeedLoading(false);
          setDraft("");
        }
        selectedRoomIdRef.current = roomId;
        setSelectedRoomId(roomId);
        if (roomId) {
          await loadRoom(roomId, { asRefresh, generation });
        } else if (generation === loadGenerationRef.current) {
          setWorkspace(null);
          setStoriesResponse(null);
          setSelectedStoryId(null);
          setSelectedChannelId(null);
          setFeed(null);
          setFeedLoading(false);
        }
      } catch (cause) {
        if (generation === loadGenerationRef.current) setError(errorPresentation(cause));
      } finally {
        if (generation === loadGenerationRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [client, loadRoom, requestedRoomId],
  );

  useFocusEffect(
    useCallback(() => {
      if (isLoaded && isSignedIn) void loadSession();
      return () => {
        loadGenerationRef.current += 1;
      };
    }, [isLoaded, isSignedIn, loadSession, userId]),
  );

  useEffect(
    () =>
      subscribeRoomsInvalidations((roomId) => {
        if (roomId === selectedRoomIdRef.current) {
          void loadRoom(roomId, { generation: loadGenerationRef.current });
        }
      }),
    [loadRoom],
  );

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
    if (isSignedIn) return;
    loadGenerationRef.current += 1;
    feedLoadGenerationRef.current += 1;
    requestIds.current.clear();
    selectedRoomIdRef.current = null;
    selectedChannelIdRef.current = null;
    setSession(null);
    setSelectedRoomId(null);
    setWorkspace(null);
    setStoriesResponse(null);
    setChildScreen(null);
    setSelectedStoryId(null);
    setSelectedChannelId(null);
    setFeed(null);
    setFeedLoading(false);
    setDraft("");
    setRefreshing(false);
    setError(null);
  }, [isSignedIn, userId]);

  useEffect(() => {
    if (!selectedRoomId || !selectedChannelId || childScreen !== "channel") return;
    let active = true;
    const generation = ++feedLoadGenerationRef.current;
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
  }, [childScreen, client, feedRefreshKey, selectedChannelId, selectedRoomId]);

  const replaceStory = useCallback((next: RoomsHumanStory) => {
    setStoriesResponse((current) =>
      current
        ? {
            ...current,
            stories: current.stories.map((story) => (story.id === next.id ? next : story)),
          }
        : current,
    );
  }, []);

  const transitionStory = useCallback(
    async (story: RoomsHumanStoryV2, to: string) => {
      if (!selectedRoomId || busy) return;
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
        requestIds.current.delete(key);
        if (selectedRoomIdRef.current === roomId) replaceStory(next);
      } catch (cause) {
        if (selectedRoomIdRef.current === roomId) setError(errorPresentation(cause));
      } finally {
        setBusy(false);
      }
    },
    [busy, client, readRequestId, replaceStory, selectedRoomId],
  );

  const approveAndComplete = useCallback(
    async (story: RoomsHumanStoryV2) => {
      if (!selectedRoomId || !story.gate || busy) return;
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
        requestIds.current.delete(completionKey);
        if (selectedRoomIdRef.current === roomId) replaceStory(completed);
      } catch (cause) {
        if (selectedRoomIdRef.current === roomId) setError(errorPresentation(cause));
      } finally {
        setBusy(false);
      }
    },
    [busy, client, readRequestId, replaceStory, selectedRoomId],
  );

  const sendMessage = useCallback(async () => {
    if (!selectedRoomId || !selectedChannelId || !draft.trim() || busy) return;
    const roomId = selectedRoomId;
    const channelId = selectedChannelId;
    const payload = draft.trim();
    const key = `message:${channelId}:${payload}`;
    const generation = ++feedLoadGenerationRef.current;
    setBusy(true);
    setError(null);
    try {
      await client.createMessage(roomId, channelId, readRequestId(key), payload);
      requestIds.current.delete(key);
      setDraft("");
      const nextFeed = await client.getFeed(roomId, channelId);
      if (
        generation === feedLoadGenerationRef.current &&
        selectedRoomIdRef.current === roomId &&
        selectedChannelIdRef.current === channelId
      ) {
        setFeed(nextFeed);
      }
    } catch (cause) {
      if (selectedRoomIdRef.current === roomId && selectedChannelIdRef.current === channelId) {
        setError(errorPresentation(cause));
      }
    } finally {
      if (generation === feedLoadGenerationRef.current) setFeedLoading(false);
      setBusy(false);
    }
  }, [busy, client, draft, readRequestId, selectedChannelId, selectedRoomId]);

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
          feed={feed}
          feedLoading={feedLoading}
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
              selectedChannelIdRef.current = channelId;
              setSelectedChannelId(channelId);
              setFeed(null);
              setFeedLoading(true);
              setDraft("");
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
            selectedChannelIdRef.current = channelId;
            setSelectedChannelId(channelId);
            setFeed(null);
            setFeedLoading(true);
            setDraft("");
          }}
          onSelectRoom={(roomId) => {
            if (roomId === selectedRoomIdRef.current) return;
            feedLoadGenerationRef.current += 1;
            selectedRoomIdRef.current = roomId;
            selectedChannelIdRef.current = null;
            setSelectedRoomId(roomId);
            setChildScreen(null);
            setSelectedStoryId(null);
            setSelectedChannelId(null);
            setFeed(null);
            setFeedLoading(false);
            setDraft("");
            void loadRoom(roomId);
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
