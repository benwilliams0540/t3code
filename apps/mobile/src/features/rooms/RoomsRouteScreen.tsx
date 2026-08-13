import { AuthView } from "@clerk/expo/native";
import { useAuth } from "@clerk/expo";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView, useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { MarkdownContent } from "../../components/MarkdownContent";
import { SymbolView } from "../../components/AppSymbol";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { uuidv7 } from "../../lib/uuid";
import {
  hasRoomsPublicConfig,
  resolveCloudPublicConfig,
  resolveRoomsClerkTokenOptions,
} from "../cloud/publicConfig";
import { WorkspaceSidebarToolbar } from "../layout/workspace-sidebar-toolbar";
import { RoomsMobileChangeLoop } from "./changeLoop";
import { createRoomsMobileClient, RoomsMobileClientError } from "./client";
import {
  isRoomsHumanStoryV2,
  type RoomsHumanFeed,
  type RoomsHumanSession,
  type RoomsHumanSessionRoom,
  type RoomsHumanStoriesResponse,
  type RoomsHumanStory,
  type RoomsHumanStoryV2,
  type RoomsHumanWorkspace,
} from "./contract";
import {
  ROOMS_MOBILE_SECTIONS,
  roomsApprovedEvidence,
  roomsChannelLabel,
  roomsReviewEvidenceSatisfied,
  roomsStageLabel,
  roomsStoryCanApproveAndComplete,
  roomsStoryNeedsHuman,
  roomsStoryOwnerId,
  roomsStoryUpdatedAt,
  type RoomsMobileSection,
} from "./presentation";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(date);
}

function errorPresentation(cause: unknown): { readonly code: string; readonly message: string } {
  return cause instanceof RoomsMobileClientError
    ? { code: cause.code, message: cause.message }
    : { code: "rooms_unexpected", message: "Rooms could not finish that request." };
}

function SectionTabs(props: {
  readonly selected: RoomsMobileSection;
  readonly onSelect: (section: RoomsMobileSection) => void;
}) {
  return (
    <ScrollView
      className="h-11 max-h-11"
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="h-11 items-center gap-2"
      style={{ flexGrow: 0 }}
    >
      {ROOMS_MOBILE_SECTIONS.map((section) => (
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: props.selected === section }}
          className={
            props.selected === section
              ? "min-h-11 justify-center rounded-full bg-primary px-4"
              : "min-h-11 justify-center rounded-full border border-border bg-card px-4"
          }
          key={section}
          onPress={() => props.onSelect(section)}
        >
          <Text
            className={
              props.selected === section
                ? "text-sm font-t3-bold text-primary-foreground capitalize"
                : "text-sm font-t3-bold text-foreground capitalize"
            }
          >
            {section}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function RoomSelector(props: {
  readonly rooms: readonly RoomsHumanSessionRoom[];
  readonly selectedRoomId: string | null;
  readonly onSelect: (roomId: string) => void;
}) {
  if (props.rooms.length < 2) return null;
  return (
    <ScrollView
      className="h-10 max-h-10"
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="h-10 items-center gap-2"
      style={{ flexGrow: 0 }}
    >
      {props.rooms.map((room) => (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: props.selectedRoomId === room.id }}
          className={
            props.selectedRoomId === room.id
              ? "min-h-10 justify-center rounded-xl bg-primary px-3"
              : "min-h-10 justify-center rounded-xl bg-subtle px-3"
          }
          key={room.id}
          onPress={() => props.onSelect(room.id)}
        >
          <Text
            className={
              props.selectedRoomId === room.id
                ? "text-sm font-t3-bold text-primary-foreground"
                : "text-sm font-t3-bold text-foreground"
            }
          >
            {room.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function ChannelComposer(props: {
  readonly busy: boolean;
  readonly canCreateMessage: boolean;
  readonly channelName: string;
  readonly draft: string;
  readonly bottomInset: number;
  readonly onChangeDraft: (draft: string) => void;
  readonly onSend: () => void;
}) {
  const disabled = props.busy || !props.draft.trim() || !props.canCreateMessage;

  return (
    <View
      className="border-t border-border bg-screen px-5 pt-3"
      style={{ paddingBottom: Math.max(props.bottomInset, 12) }}
    >
      <View className="rounded-[20px] border border-border bg-card p-3">
        <TextInput
          accessibilityLabel={`Message ${roomsChannelLabel(props.channelName)}`}
          className="max-h-32 min-h-16 text-base text-foreground"
          editable={!props.busy && props.canCreateMessage}
          multiline
          onChangeText={props.onChangeDraft}
          placeholder="Write a message"
          placeholderTextColorClassName="accent-placeholder"
          textAlignVertical="top"
          value={props.draft}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          className={
            disabled
              ? "mt-2 min-h-11 items-center justify-center rounded-xl bg-subtle opacity-50"
              : "mt-2 min-h-11 items-center justify-center rounded-xl bg-primary active:opacity-70"
          }
          disabled={disabled}
          onPress={props.onSend}
        >
          <Text
            className={
              disabled
                ? "font-t3-bold text-foreground-muted"
                : "font-t3-bold text-primary-foreground"
            }
          >
            {props.busy ? "Sending…" : "Send"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function StoryRow(props: {
  readonly story: RoomsHumanStory;
  readonly workspace: RoomsHumanWorkspace;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const ownerId = roomsStoryOwnerId(props.story);
  const owner = ownerId
    ? (props.workspace.principals.find((principal) => principal.id === ownerId)?.display_name ??
      ownerId)
    : "Unassigned";
  return (
    <Pressable
      accessibilityRole="button"
      className={
        props.selected
          ? "rounded-[20px] border border-amber-500/50 bg-amber-500/10 p-4"
          : "rounded-[20px] border border-border bg-card p-4 active:opacity-70"
      }
      onPress={props.onPress}
    >
      <View className="flex-row items-start gap-3">
        <View className="mt-1.5 size-2 rounded-full bg-blue-400" />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-base font-t3-bold text-foreground">
              {props.story.title}
            </Text>
            <Text className="text-xs font-t3-bold text-foreground-muted">
              {roomsStageLabel(props.story.stage)}
            </Text>
          </View>
          <Text className="mt-2 text-sm text-foreground-muted">
            {owner} · {props.story.native_thread ? "linked thread" : "no thread"}
          </Text>
          <Text className="mt-1 text-xs text-foreground-muted">
            Updated {formatDate(roomsStoryUpdatedAt(props.story))}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function OverviewSection(props: {
  readonly stories: readonly RoomsHumanStory[];
  readonly workspace: RoomsHumanWorkspace;
  readonly onOpenStory: (storyId: string) => void;
  readonly onOpenStories: () => void;
}) {
  const needsYou = props.stories.filter((story) =>
    roomsStoryNeedsHuman(story, props.workspace.principal.id),
  );
  const active = props.stories
    .filter((story) => story.stage !== "backlog" && story.stage !== "done")
    .sort((left, right) => roomsStoryUpdatedAt(right).localeCompare(roomsStoryUpdatedAt(left)));
  const done = props.stories.filter((story) => story.stage === "done").length;
  return (
    <View className="gap-5">
      <View className="rounded-[22px] border border-amber-500/40 bg-amber-500/10 p-5">
        <View className="flex-row items-center gap-2">
          <SymbolView
            name={{ ios: "exclamationmark.circle.fill", android: "error" }}
            size={17}
            tintColor="#d97706"
          />
          <Text className="text-sm font-t3-bold tracking-wide text-amber-700 uppercase dark:text-amber-300">
            Needs you · {needsYou.length}
          </Text>
        </View>
        {needsYou.length === 0 ? (
          <Text className="mt-4 text-sm text-foreground-muted">
            Nothing currently needs your review or recovery.
          </Text>
        ) : (
          <View className="mt-3 gap-2">
            {needsYou.slice(0, 4).map((story) => (
              <Pressable
                className="rounded-xl bg-card p-3 active:opacity-70"
                key={story.id}
                onPress={() => props.onOpenStory(story.id)}
              >
                <Text className="font-t3-bold text-foreground">{story.title}</Text>
                <Text className="mt-1 text-xs text-foreground-muted">
                  {roomsStageLabel(story.stage)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      <View>
        <View className="mb-3 flex-row items-center">
          <Text className="text-sm font-t3-bold tracking-wide text-foreground-muted uppercase">
            Active work
          </Text>
          <Pressable className="ml-auto min-h-10 justify-center" onPress={props.onOpenStories}>
            <Text className="text-sm font-t3-bold text-foreground">All stories</Text>
          </Pressable>
        </View>
        <View className="gap-2">
          {active.length === 0 ? (
            <EmptyState
              variant="card"
              title="No active stories"
              detail="Claim a backlog story when work is ready to begin."
            />
          ) : (
            active
              .slice(0, 6)
              .map((story) => (
                <StoryRow
                  key={story.id}
                  onPress={() => props.onOpenStory(story.id)}
                  selected={false}
                  story={story}
                  workspace={props.workspace}
                />
              ))
          )}
        </View>
      </View>

      <View className="rounded-[22px] border border-border bg-card p-5">
        <Text className="text-sm font-t3-bold tracking-wide text-foreground-muted uppercase">
          Momentum
        </Text>
        <View className="mt-4 flex-row gap-3">
          <View className="flex-1 rounded-xl bg-subtle p-3">
            <Text className="text-2xl font-t3-bold text-foreground">{active.length}</Text>
            <Text className="text-sm text-foreground-muted">Active</Text>
          </View>
          <View className="flex-1 rounded-xl bg-subtle p-3">
            <Text className="text-2xl font-t3-bold text-foreground">{done}</Text>
            <Text className="text-sm text-foreground-muted">Done</Text>
          </View>
        </View>
      </View>

      <View className="rounded-[22px] border border-border bg-card p-5">
        <Text className="text-sm font-t3-bold tracking-wide text-foreground-muted uppercase">
          Vision
        </Text>
        <Text className="mt-3 text-base font-t3-bold text-foreground">
          Revision data unavailable
        </Text>
        <Text className="mt-2 text-sm leading-relaxed text-foreground-muted">
          The current shared contract does not expose vision revisions, provenance, or freshness to
          mobile.
        </Text>
      </View>
    </View>
  );
}

function StoryDetail(props: {
  readonly busy: boolean;
  readonly story: RoomsHumanStory;
  readonly workspace: RoomsHumanWorkspace;
  readonly onApproveAndComplete: (story: RoomsHumanStoryV2) => void;
  readonly onOpenThread: (story: RoomsHumanStory) => void;
  readonly onTransition: (story: RoomsHumanStoryV2, to: string) => void;
}) {
  if (!isRoomsHumanStoryV2(props.story)) {
    return (
      <EmptyState
        variant="card"
        title="Workflow unavailable"
        detail="This story uses the older v1 projection. Upgrade the Rooms producer to act on it from mobile."
      />
    );
  }
  const story = props.story;
  const nonTerminal = story.allowed_next_transitions.filter((transition) => !transition.terminal);
  const completionTransition = story.allowed_next_transitions.find(
    (transition) => transition.terminal && transition.to === "done",
  );
  const canApprove = roomsStoryCanApproveAndComplete(story);
  return (
    <View className="rounded-[22px] border border-border bg-card p-5">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-lg font-t3-bold text-foreground">{story.title}</Text>
        <Text className="text-xs font-t3-bold text-foreground-muted">
          {roomsStageLabel(story.stage)}
        </Text>
      </View>
      <Text className="mt-2 text-sm text-foreground-muted">
        {story.story_type} · workflow {story.workflow_version} · ledger {story.as_of_seq}
      </Text>

      {story.native_thread ? (
        <Pressable
          className="mt-4 min-h-11 items-center justify-center rounded-xl border border-border bg-subtle px-4"
          onPress={() => props.onOpenThread(story)}
        >
          <Text className="text-sm font-t3-bold text-foreground">Open linked T3 thread</Text>
        </Pressable>
      ) : null}

      <View className="mt-5 gap-2">
        <Text className="text-sm font-t3-bold text-foreground">
          Evidence · {story.evidence.length}
        </Text>
        {story.evidence.map((evidence) => (
          <View className="rounded-xl bg-subtle p-3" key={evidence.id}>
            <Text className="text-sm font-t3-bold text-foreground">
              {evidence.note ?? evidence.kind}
            </Text>
            <Text className="mt-1 text-xs text-foreground-muted">
              {evidence.kind} · {evidence.cas.bytes} bytes
            </Text>
          </View>
        ))}
        {story.evidence.length === 0 ? (
          <Text className="text-sm leading-relaxed text-foreground-muted">
            Mobile evidence upload is not available yet. Attach a screenshot or artifact from
            desktop before requesting review.
          </Text>
        ) : null}
      </View>

      <View className="mt-5 gap-2">
        {nonTerminal.map((transition) => {
          const allowed =
            transition.allowed &&
            (transition.to !== "human-qa" || roomsReviewEvidenceSatisfied(story));
          return (
            <View className="gap-1" key={`${transition.from}:${transition.to}`}>
              <Pressable
                accessibilityState={{ disabled: props.busy || !allowed }}
                className={
                  props.busy || !allowed
                    ? "min-h-12 items-center justify-center rounded-xl bg-subtle px-4 opacity-50"
                    : "min-h-12 items-center justify-center rounded-xl bg-primary px-4 active:opacity-70"
                }
                disabled={props.busy || !allowed}
                onPress={() => props.onTransition(story, transition.to)}
              >
                <Text
                  className={
                    allowed
                      ? "font-t3-bold text-primary-foreground"
                      : "font-t3-bold text-foreground-muted"
                  }
                >
                  {transition.to === "in-progress"
                    ? "Claim and start"
                    : transition.to === "human-qa"
                      ? "Request review"
                      : transition.label}
                </Text>
              </Pressable>
              {!allowed && transition.unavailable_reason ? (
                <Text className="px-1 text-xs leading-relaxed text-foreground-muted">
                  {transition.unavailable_reason}
                </Text>
              ) : null}
            </View>
          );
        })}
        {story.stage === "in-progress" && !roomsReviewEvidenceSatisfied(story) ? (
          <Text className="text-xs leading-relaxed text-foreground-muted">
            Attach qualifying evidence from desktop before requesting review.
          </Text>
        ) : null}
        {story.gate ? (
          <Pressable
            accessibilityState={{ disabled: props.busy || !canApprove }}
            className={
              props.busy || !canApprove
                ? "min-h-12 items-center justify-center rounded-xl bg-subtle px-4 opacity-50"
                : "min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-4 active:opacity-70"
            }
            disabled={props.busy || !canApprove}
            onPress={() => props.onApproveAndComplete(story)}
          >
            <Text
              className={
                canApprove ? "font-t3-bold text-white" : "font-t3-bold text-foreground-muted"
              }
            >
              {story.gate.approved_review_id ? "Complete story" : "Approve and complete"}
            </Text>
          </Pressable>
        ) : null}
        {story.gate && !canApprove ? (
          <Text className="text-xs leading-relaxed text-foreground-muted">
            {story.gate.approved_review_id
              ? (completionTransition?.unavailable_reason ??
                "The approved story is not ready for completion. Pull to refresh and try again.")
              : story.gate.evidence_satisfied
                ? "Another eligible person must review this evidence."
                : "Qualifying evidence is required before approval."}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function PeopleSection(props: { readonly workspace: RoomsHumanWorkspace }) {
  return (
    <View className="gap-5">
      {(["human", "agent", "machine"] as const).map((type) => {
        const principals = props.workspace.principals.filter(
          (principal) => principal.type === type,
        );
        return (
          <View key={type}>
            <Text className="mb-3 text-sm font-t3-bold tracking-wide text-foreground-muted uppercase">
              {type === "human" ? "People" : type === "agent" ? "Agents" : "Machines"} ·{" "}
              {principals.length}
            </Text>
            <View className="gap-2">
              {principals.map((principal) => (
                <View
                  className="rounded-[20px] border border-border bg-card p-4"
                  key={principal.id}
                >
                  <Text className="font-t3-bold text-foreground">
                    {principal.display_name ?? "Name unavailable"}
                  </Text>
                  <Text className="mt-1 text-sm text-foreground-muted">
                    {principal.type} · {principal.role ?? "no room role"}
                  </Text>
                  <Text selectable className="mt-2 text-xs text-foreground-muted">
                    {principal.id}
                  </Text>
                </View>
              ))}
              {principals.length === 0 ? (
                <Text className="text-sm text-foreground-muted">
                  No {type} principals are exposed.
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      <Text className="text-xs leading-relaxed text-foreground-muted">
        Matching display names never merge separate Rooms identities.
      </Text>
    </View>
  );
}

export function RoomsRouteScreen() {
  if (!hasRoomsPublicConfig()) {
    return (
      <View className="flex-1 bg-screen px-5 pt-20">
        <NativeStackScreenOptions options={{ title: "Rooms" }} />
        <EmptyState
          title="Rooms is not configured"
          detail="This build needs a private HTTPS Rooms origin and the dedicated Clerk JWT template."
        />
      </View>
    );
  }
  return <ConfiguredRoomsRouteScreen />;
}

function ConfiguredRoomsRouteScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const isKeyboardVisible = useKeyboardState((state) => state.isVisible);
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
            "The signed-in account changed while Rooms was loading.",
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
  const [section, setSection] = useState<RoomsMobileSection>("overview");
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const selectedChannelIdRef = useRef<string | null>(null);
  selectedChannelIdRef.current = selectedChannelId;
  const [feed, setFeed] = useState<RoomsHumanFeed | null>(null);
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
          currentChannelId &&
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
    [client],
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
          currentRoomId && nextSession.rooms.some((room) => room.id === currentRoomId)
            ? currentRoomId
            : (nextSession.rooms[0]?.id ?? null);
        if (roomId !== currentRoomId) {
          feedLoadGenerationRef.current += 1;
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
    [client, loadRoom],
  );

  const changeLoop = useMemo(
    () =>
      new RoomsMobileChangeLoop({
        client,
        onInvalidate: async ({ roomId }) => {
          await loadRoom(roomId, {
            generation: loadGenerationRef.current,
            throwOnError: true,
          });
        },
      }),
    [client, loadRoom],
  );

  useFocusEffect(
    useCallback(() => {
      if (isLoaded && isSignedIn) void loadSession();
      return () => {
        loadGenerationRef.current += 1;
      };
    }, [isLoaded, isSignedIn, loadSession, userId]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!isLoaded || !isSignedIn || !selectedRoomId) return;
      const start = () => changeLoop.start(selectedRoomId);
      if (AppState.currentState === "active") start();
      const subscription = AppState.addEventListener("change", (nextState) => {
        if (nextState === "active") start();
        else changeLoop.stop();
      });
      return () => {
        subscription.remove();
        changeLoop.stop();
      };
    }, [changeLoop, isLoaded, isSignedIn, selectedRoomId]),
  );

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
    setSelectedStoryId(null);
    setSelectedChannelId(null);
    setFeed(null);
    setFeedLoading(false);
    setDraft("");
    setRefreshing(false);
    setError(null);
  }, [isSignedIn, userId]);

  useEffect(() => {
    if (!selectedRoomId || !selectedChannelId || section !== "channels") return;
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
  }, [client, feedRefreshKey, section, selectedChannelId, selectedRoomId]);

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

  const selectedStory =
    storiesResponse?.stories.find((story) => story.id === selectedStoryId) ?? null;
  const selectedChannel =
    workspace?.channels.find((channel) => channel.id === selectedChannelId) ?? null;

  return (
    <KeyboardAvoidingView automaticOffset className="flex-1 bg-screen" behavior="padding">
      <WorkspaceSidebarToolbar />
      <NativeStackScreenOptions options={{ title: workspace?.room.name ?? "Rooms" }} />
      {!isLoaded ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !isSignedIn ? (
        <View className="flex-1 overflow-hidden bg-sheet">
          <AuthView isDismissible={false} />
        </View>
      ) : (
        <View className="flex-1">
          <ScrollView
            automaticallyAdjustsScrollIndicatorInsets={Platform.OS === "ios"}
            className="flex-1"
            contentInsetAdjustmentBehavior={Platform.OS === "ios" ? "automatic" : "never"}
            contentContainerClassName="gap-5 px-5 pt-1"
            contentContainerStyle={{
              paddingBottom:
                section === "channels" && selectedChannel ? 16 : Math.max(insets.bottom, 20) + 28,
            }}
            keyboardShouldPersistTaps="handled"
            stickyHeaderHiddenOnScroll={false}
            stickyHeaderIndices={[0]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  void loadSession(true);
                }}
              />
            }
          >
            <View className="-mx-5 gap-5 bg-screen px-5 pb-4">
              <View className="gap-2">
                <RoomSelector
                  onSelect={(roomId) => {
                    if (roomId === selectedRoomIdRef.current) return;
                    feedLoadGenerationRef.current += 1;
                    selectedRoomIdRef.current = roomId;
                    selectedChannelIdRef.current = null;
                    setSelectedRoomId(roomId);
                    setSelectedStoryId(null);
                    setSelectedChannelId(null);
                    setFeed(null);
                    setFeedLoading(false);
                    setDraft("");
                    void loadRoom(roomId);
                  }}
                  rooms={session?.rooms ?? []}
                  selectedRoomId={selectedRoomId}
                />
                <SectionTabs onSelect={setSection} selected={section} />
              </View>
              {error ? (
                <View className="rounded-[20px] border border-destructive/40 bg-destructive/10 p-4">
                  <Text className="font-t3-bold text-destructive">{error.message}</Text>
                  <Text selectable className="mt-2 text-xs text-destructive">
                    {error.code}
                  </Text>
                </View>
              ) : null}
              {workspace ? (
                <Pressable
                  accessibilityLabel="Open Rooms account"
                  className="min-h-14 flex-row items-center rounded-[18px] border border-border bg-card px-4 active:opacity-70"
                  onPress={() => navigation.navigate("SettingsSheet", { screen: "SettingsAuth" })}
                >
                  <View className="min-w-0 flex-1">
                    <Text className="font-t3-bold text-foreground">
                      {workspace.principal.display_name ?? "Current person"}
                    </Text>
                    <Text className="mt-0.5 text-xs text-foreground-muted">
                      Shared Rooms · {workspace.principal.role}
                    </Text>
                  </View>
                  <Text className="text-sm font-t3-bold text-foreground">Account</Text>
                </Pressable>
              ) : null}
              {section === "channels" && workspace ? (
                <ScrollView
                  className="h-10 max-h-10"
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="h-10 items-center gap-2"
                  style={{ flexGrow: 0 }}
                >
                  {workspace.channels.map((channel) => (
                    <Pressable
                      accessibilityLabel={`Channel ${roomsChannelLabel(channel.name)}`}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: channel.id === selectedChannelId }}
                      className={
                        channel.id === selectedChannelId
                          ? "min-h-10 justify-center rounded-xl bg-primary px-3"
                          : "min-h-10 justify-center rounded-xl bg-subtle px-3"
                      }
                      key={channel.id}
                      onPress={() => {
                        if (channel.id === selectedChannelIdRef.current) return;
                        feedLoadGenerationRef.current += 1;
                        selectedChannelIdRef.current = channel.id;
                        setSelectedChannelId(channel.id);
                        setFeed(null);
                        setFeedLoading(true);
                        setDraft("");
                      }}
                    >
                      <Text
                        className={
                          channel.id === selectedChannelId
                            ? "text-sm font-t3-bold text-primary-foreground"
                            : "text-sm font-t3-bold text-foreground"
                        }
                      >
                        {roomsChannelLabel(channel.name)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>
            {loading && !workspace ? (
              <View className="items-center gap-3 py-20">
                <ActivityIndicator />
                <Text className="text-sm text-foreground-muted">Loading Shared Rooms…</Text>
              </View>
            ) : session?.status === "authenticated_nonmember" || session?.rooms.length === 0 ? (
              <EmptyState
                title="No shared room membership"
                detail="This signed-in account is authenticated but is not a member of a shared room."
              />
            ) : workspace && storiesResponse ? (
              section === "overview" ? (
                <OverviewSection
                  onOpenStories={() => setSection("stories")}
                  onOpenStory={openStory}
                  stories={storiesResponse.stories}
                  workspace={workspace}
                />
              ) : section === "stories" ? (
                <View className="gap-3">
                  {storiesResponse.stories.length === 0 ? (
                    <EmptyState
                      title="No stories yet"
                      detail="Create the first durable story from desktop; mobile creation is not available in this initial pass."
                    />
                  ) : (
                    storiesResponse.stories.map((story) => (
                      <StoryRow
                        key={story.id}
                        onPress={() => setSelectedStoryId(story.id)}
                        selected={selectedStoryId === story.id}
                        story={story}
                        workspace={workspace}
                      />
                    ))
                  )}
                  {selectedStory ? (
                    <StoryDetail
                      busy={busy}
                      onApproveAndComplete={(story) => void approveAndComplete(story)}
                      onOpenThread={openThread}
                      onTransition={(story, to) => void transitionStory(story, to)}
                      story={selectedStory}
                      workspace={workspace}
                    />
                  ) : null}
                </View>
              ) : section === "channels" ? (
                <View className="gap-4">
                  {selectedChannel?.purpose ? (
                    <Text className="text-sm text-foreground-muted">{selectedChannel.purpose}</Text>
                  ) : null}
                  {workspace.channels.length === 0 ? (
                    <EmptyState
                      variant="card"
                      title="No channels yet"
                      detail="Create the first channel from desktop, then pull to refresh."
                    />
                  ) : feedLoading && !feed ? (
                    <View className="items-center py-10">
                      <ActivityIndicator />
                    </View>
                  ) : !feed ? (
                    <EmptyState
                      variant="card"
                      title="Channel unavailable"
                      detail="Pull to refresh and try loading this channel again."
                    />
                  ) : feed.items.length === 0 ? (
                    <EmptyState
                      variant="card"
                      title="No messages yet"
                      detail="Start the durable discussion below."
                    />
                  ) : (
                    <View className="gap-3">
                      {feed.items.map((item) => {
                        const writer = workspace.principals.find(
                          (principal) => principal.id === item.attribution.writer_principal_id,
                        );
                        return (
                          <View
                            className="rounded-[20px] border border-border bg-card p-4"
                            key={item.id}
                          >
                            <View className="flex-row items-center gap-2">
                              <Text className="flex-1 font-t3-bold text-foreground">
                                {writer?.display_name ?? item.attribution.writer_principal_id}
                              </Text>
                              <Text className="text-xs text-foreground-muted">
                                {formatDate(item.occurred_at)}
                              </Text>
                            </View>
                            {item.kind === "human_message" ? (
                              <View className="mt-2">
                                <MarkdownContent markdown={item.payload.body_markdown} />
                              </View>
                            ) : (
                              <Text
                                selectable
                                className="mt-2 text-base leading-relaxed text-foreground"
                              >
                                {item.summary}
                              </Text>
                            )}
                            {item.kind === "unknown_schema" ? (
                              <Text className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                                Unsupported {item.payload.event_type} schema{" "}
                                {item.payload.event_schema} retained.
                              </Text>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : (
                <PeopleSection workspace={workspace} />
              )
            ) : null}
          </ScrollView>
          {section === "channels" && workspace && selectedChannel ? (
            <ChannelComposer
              bottomInset={isKeyboardVisible ? 0 : insets.bottom}
              busy={busy}
              canCreateMessage={Boolean(workspace.capabilities["message.create"])}
              channelName={selectedChannel.name}
              draft={draft}
              onChangeDraft={setDraft}
              onSend={() => void sendMessage()}
            />
          ) : null}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
