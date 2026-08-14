import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { type ReactNode, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from "react-native";

import { AppText as Text, AppTextInput } from "../../components/AppText";
import { ComposerEditor } from "../../components/ComposerEditor";
import { EmptyState } from "../../components/EmptyState";
import { MarkdownContent } from "../../components/MarkdownContent";
import { SymbolView } from "../../components/AppSymbol";
import {
  isRoomsHumanStoryV2,
  type RoomsHumanFeed,
  type RoomsHumanSession,
  type RoomsHumanStory,
  type RoomsHumanStoryV2,
  type RoomsHumanStoriesResponse,
  type RoomsHumanWorkspace,
} from "./contract";
import { unreadKey } from "./realtimePersistence";
import {
  ROOMS_MOBILE_SECTIONS,
  ROOMS_STORY_BLOCKING_GROUPS,
  ROOMS_STORY_STAGE_FILTERS,
  roomsBlockingGroupLabel,
  roomsChannelLabel,
  roomsReviewEvidenceSatisfied,
  roomsStageLabel,
  roomsStoryBlockingGroup,
  roomsStoryCanApproveAndComplete,
  roomsStoryNeedsHuman,
  roomsStoryNextAction,
  roomsStoryOwnerId,
  roomsStoryUpdatedAt,
  type RoomsMobileSection,
  type RoomsStoryBlockingGroup,
  type RoomsStoryStageFilter,
} from "./presentation";

type ChildScreen = "channel" | "story" | null;

const palette = {
  dark: {
    cyan: "#68cbd0",
    green: "#78c27c",
    amber: "#efad3c",
    red: "#df7563",
    ink: "#ebe9e3",
    muted: "#8e999f",
  },
  light: {
    cyan: "#126f77",
    green: "#316d3a",
    amber: "#9a5b0d",
    red: "#a64635",
    ink: "#1e2529",
    muted: "#68747b",
  },
} as const;

const surfaceClass = "border border-[#aeb7ba] bg-[#f8f5ed] dark:border-[#303943] dark:bg-[#14181d]";
const sectionHeaderClass =
  "min-h-9 flex-row items-center border-b border-[#aeb7ba] bg-[#e8e4db] px-3 dark:border-[#303943] dark:bg-[#1a2026]";
const eyebrowClass =
  "font-mono text-[10px] font-bold tracking-[1.7px] text-[#68747b] uppercase dark:text-[#8e999f]";
const inkClass = "text-[#1e2529] dark:text-[#ebe9e3]";
const mutedClass = "text-[#68747b] dark:text-[#8e999f]";
const pageClass = "bg-[#f1eee6] dark:bg-[#0d1013]";
const chromeClass = "border-[#aeb7ba] bg-[#e8e4db]/90 dark:border-[#303943] dark:bg-[#101419]/92";

function ChromeBackdrop() {
  const isDark = useColorScheme() === "dark";
  return (
    <>
      <BlurView
        intensity={isDark ? 28 : 15}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        tint={isDark ? "dark" : "light"}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? "rgba(16,20,25,0.82)" : "rgba(232,228,219,0.82)" },
        ]}
      />
    </>
  );
}

function Plate(props: { readonly children: ReactNode; readonly className?: string }) {
  return <View className={`${surfaceClass} ${props.className ?? ""}`}>{props.children}</View>;
}

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

function initials(value: string): string {
  const parts = value.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function compactId(value: string): string {
  const normalized = value.trim().toUpperCase();
  return normalized.length > 13 ? `${normalized.slice(0, 13)}…` : normalized || "UNKNOWN";
}

function principalLabel(workspace: RoomsHumanWorkspace, principalId: string | null): string {
  if (!principalId) return "Unassigned";
  return (
    workspace.principals.find((principal) => principal.id === principalId)?.display_name ??
    principalId
  );
}

function SectionHeader(props: {
  readonly label: string;
  readonly meta?: string;
  readonly tone?: "amber" | "cyan" | "green" | "red";
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <View className={sectionHeaderClass}>
      <Text
        className={eyebrowClass}
        style={props.tone ? { color: palette[scheme][props.tone] } : undefined}
      >
        {props.label}
      </Text>
      {props.meta ? (
        <Text className={`ml-auto font-mono text-[10px] tracking-[0.8px] ${mutedClass}`}>
          {props.meta}
        </Text>
      ) : null}
    </View>
  );
}

function StatusDot(props: { readonly tone: "amber" | "cyan" | "green" | "red" }) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <View
      className="size-2 rounded-full"
      style={{ backgroundColor: palette[scheme][props.tone] }}
    />
  );
}

function ThreadspaceHeader(props: {
  readonly childScreen: ChildScreen;
  readonly section: RoomsMobileSection;
  readonly stories: readonly RoomsHumanStory[];
  readonly selectedChannelName: string | null;
  readonly selectedStory: RoomsHumanStory | null;
  readonly topInset: number;
  readonly workspace: RoomsHumanWorkspace;
  readonly onBack: () => void;
  readonly onOpenAppearance: () => void;
}) {
  const isDark = useColorScheme() === "dark";
  const roomName = props.workspace.room.name;
  const people = props.workspace.principals.filter(
    (principal) => principal.type === "human",
  ).length;
  const agents = props.workspace.principals.filter(
    (principal) => principal.type === "agent",
  ).length;
  const machines = props.workspace.principals.filter(
    (principal) => principal.type === "machine",
  ).length;
  const waiting = props.stories.filter((story) =>
    roomsStoryNeedsHuman(story, props.workspace.principal.id),
  ).length;
  const active = props.stories.filter(
    (story) => story.stage !== "backlog" && story.stage !== "done",
  ).length;
  const title =
    props.childScreen === "channel"
      ? props.selectedChannelName
        ? roomsChannelLabel(props.selectedChannelName)
        : "Channel"
      : props.childScreen === "story"
        ? "Story"
        : props.section === "room"
          ? roomName
          : props.section === "network"
            ? "People and machines"
            : props.section[0]!.toUpperCase() + props.section.slice(1);
  const subtitle =
    props.childScreen === "channel"
      ? `${props.workspace.principals.length} IDENTITIES · PRESENCE UNKNOWN`
      : props.childScreen === "story"
        ? `${props.selectedStory ? compactId(props.selectedStory.id) : "STORY"} · ${props.selectedStory ? roomsStageLabel(props.selectedStory.stage) : "DETAIL"}`
        : props.section === "room"
          ? `${people} ${people === 1 ? "PERSON" : "PEOPLE"} · ${agents} ${agents === 1 ? "AGENT" : "AGENTS"} · ${props.workspace.principal.role}`
          : props.section === "status"
            ? `${waiting} WAITING · ${active} ACTIVE · ${roomName}`
            : props.section === "stories"
              ? `${props.stories.length} TOTAL · ${waiting} WAITING ON YOU`
              : `${machines} MACHINES · ${people} PEOPLE · ${agents} AGENTS`;

  return (
    <View
      className={`relative min-h-[70px] flex-row items-center gap-3 overflow-hidden border-b px-4 pb-3 ${chromeClass}`}
      style={{ paddingTop: Math.max(props.topInset + 4, 12) }}
    >
      <ChromeBackdrop />
      {props.childScreen ? (
        <Pressable
          accessibilityLabel="Back to Threadspace"
          accessibilityRole="button"
          className="size-11 items-center justify-center border border-[#aeb7ba] bg-[#f8f5ed]/80 active:opacity-60 dark:border-[#303943] dark:bg-[#1a2026]/80"
          onPress={props.onBack}
        >
          <SymbolView
            name={{ ios: "chevron.left", android: "arrow_back" }}
            size={19}
            tintColor={isDark ? palette.dark.ink : palette.light.ink}
          />
        </Pressable>
      ) : null}
      <View className="min-w-0 flex-1">
        <Text className={`text-[18px] font-t3-bold ${inkClass}`} numberOfLines={1}>
          {title}
        </Text>
        <Text
          className={`mt-1 font-mono text-[9px] tracking-[1px] uppercase ${mutedClass}`}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="Open appearance settings"
        accessibilityRole="button"
        className="min-h-11 min-w-11 items-center justify-center border border-[#aeb7ba] bg-[#f8f5ed]/70 px-2 active:opacity-60 dark:border-[#303943] dark:bg-[#1a2026]/70"
        onPress={props.onOpenAppearance}
      >
        <Text className={`font-mono text-[10px] font-bold tracking-[0.8px] ${mutedClass}`}>
          {isDark ? "DRK" : "PPR"}
        </Text>
      </Pressable>
    </View>
  );
}

function StatusStrip(props: { readonly attention: number; readonly storySequence: number | null }) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <View className="min-h-9 flex-row items-center gap-x-1.5 border-b border-[#aeb7ba] bg-[#e8e4db] px-4 dark:border-[#303943] dark:bg-[#101419]">
      <View className="flex-row items-center gap-1.5">
        <StatusDot tone="green" />
        <Text
          className="font-mono text-[10px] font-bold tracking-[0.6px]"
          style={{ color: palette[scheme].green }}
        >
          WORKSPACE AVAILABLE
        </Text>
      </View>
      <Text className={`font-mono text-[10px] ${mutedClass}`}>·</Text>
      <Text
        className={`min-w-0 flex-1 font-mono text-[10px] tracking-[0.3px] ${mutedClass}`}
        numberOfLines={1}
      >
        {props.storySequence === null ? "STORY SEQ UNKNOWN" : `STORY SEQ ${props.storySequence}`}
      </Text>
      <Text
        className="font-mono text-[10px] font-bold tracking-[0.5px]"
        style={{ color: palette[scheme].amber }}
      >
        {props.attention} WAITING
      </Text>
    </View>
  );
}

function NavigationRow(props: {
  readonly glyph: string;
  readonly title: string;
  readonly detail?: string;
  readonly count?: string | number;
  readonly tone?: "amber" | "cyan" | "red";
  readonly onPress: () => void;
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <Pressable
      accessibilityRole="button"
      className="min-h-[48px] flex-row items-center gap-2.5 px-4 py-2 active:bg-[#e8e4db] dark:active:bg-[#1a2026]"
      onPress={props.onPress}
    >
      <View className="w-5 items-center justify-center">
        <Text className={`font-mono text-[14px] font-bold ${mutedClass}`}>{props.glyph}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className={`text-[15px] font-t3-bold ${inkClass}`} numberOfLines={1}>
          {props.title}
        </Text>
        {props.detail ? (
          <Text
            className={`mt-0.5 font-mono text-[10px] tracking-[0.3px] ${mutedClass}`}
            numberOfLines={2}
          >
            {props.detail}
          </Text>
        ) : null}
      </View>
      {props.count !== undefined ? (
        <Text
          className={`font-mono text-[11px] font-bold ${mutedClass}`}
          style={props.tone ? { color: palette[scheme][props.tone] } : undefined}
        >
          {props.count}
        </Text>
      ) : null}
    </Pressable>
  );
}

function DrawerSection(props: { readonly children: ReactNode; readonly label: string }) {
  return (
    <View className="mb-2">
      <Text className={`${eyebrowClass} px-4 pb-1.5 pt-3`}>{props.label}</Text>
      {props.children}
    </View>
  );
}

function RoomRail(props: {
  readonly rooms: RoomsHumanSession["rooms"];
  readonly selectedRoomId: string | null;
  readonly selectedAttention: number;
  readonly onSelectRoom: (roomId: string) => void;
}) {
  const isDark = useColorScheme() === "dark";
  return (
    <View className="w-[62px] border-r border-[#aeb7ba] bg-[#e8e4db] dark:border-[#303943] dark:bg-[#101419]">
      <View className="items-center border-b border-[#aeb7ba] py-2 dark:border-[#303943]">
        <Image
          accessibilityLabel="Threadspace"
          accessibilityIgnoresInvertColors
          source={
            isDark
              ? require("./assets/threadspace-dark.png")
              : require("./assets/threadspace-paper.png")
          }
          style={{ width: 44, height: 44, borderRadius: 10 }}
        />
      </View>
      <ScrollView
        contentContainerClassName="items-center gap-2 py-2"
        showsVerticalScrollIndicator={false}
      >
        {props.rooms.map((room) => {
          const selected = room.id === props.selectedRoomId;
          return (
            <Pressable
              accessibilityLabel={`Open ${room.name}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={
                selected
                  ? "relative size-12 items-center justify-center border border-[#7e8a8f] bg-[#f8f5ed] dark:border-[#3a4650] dark:bg-[#1a2026]"
                  : "relative size-12 items-center justify-center border border-[#aeb7ba] bg-transparent dark:border-[#303943]"
              }
              key={room.id}
              onPress={() => props.onSelectRoom(room.id)}
            >
              {selected ? (
                <View className="absolute -left-[4px] bottom-2 top-2 w-[3px] bg-[#1e2529] dark:bg-[#ebe9e3]" />
              ) : null}
              <Text
                className={`font-mono text-[10px] font-bold ${selected ? inkClass : mutedClass}`}
              >
                {initials(room.name).slice(0, 3)}
              </Text>
              {selected && props.selectedAttention > 0 ? (
                <View
                  className="absolute -right-1 -top-1 size-2 rounded-full"
                  style={{ backgroundColor: isDark ? palette.dark.amber : palette.light.amber }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function RoomIdentityFooter(props: {
  readonly workspace: RoomsHumanWorkspace;
  readonly onOpenAccount: () => void;
}) {
  const isDark = useColorScheme() === "dark";
  const name = props.workspace.principal.display_name ?? "Name unavailable";
  return (
    <View className="min-h-[62px] flex-row items-center gap-2 border-t border-[#aeb7ba] bg-[#e8e4db] px-3 dark:border-[#303943] dark:bg-[#101419]">
      <View className="size-9 items-center justify-center border border-[#aeb7ba] bg-[#f8f5ed] dark:border-[#303943] dark:bg-[#1a2026]">
        <Text className={`font-mono text-[9px] font-bold ${inkClass}`}>{initials(name)}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <Text className={`text-[14px] font-t3-bold ${inkClass}`} numberOfLines={1}>
          {name}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1.5">
          <StatusDot tone="green" />
          <Text className="font-mono text-[9px] font-bold tracking-[0.9px] text-[#316d3a] uppercase dark:text-[#78c27c]">
            Identity loaded · {props.workspace.principal.role}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel="Open Threadspace account settings"
        accessibilityRole="button"
        className="size-11 items-center justify-center"
        onPress={props.onOpenAccount}
      >
        <SymbolView
          name="gearshape"
          size={15}
          tintColor={isDark ? palette.dark.muted : palette.light.muted}
          type="monochrome"
        />
      </Pressable>
    </View>
  );
}

function RoomDestination(props: {
  readonly session: RoomsHumanSession;
  readonly workspace: RoomsHumanWorkspace;
  readonly stories: readonly RoomsHumanStory[];
  readonly unread: Readonly<Record<string, number>>;
  readonly selectedRoomId: string | null;
  readonly refreshing: boolean;
  readonly onSelectRoom: (roomId: string) => void;
  readonly onOpenChannel: (channelId: string) => void;
  readonly onOpenStory: (storyId: string) => void;
  readonly onOpenThread: (story: RoomsHumanStory) => void;
  readonly onOpenAccount: () => void;
  readonly onRefresh: () => void;
  readonly onSelectSection: (section: RoomsMobileSection) => void;
}) {
  const isDark = useColorScheme() === "dark";
  const [query, setQuery] = useState("");
  const linkedStories = props.stories.filter((story) => story.native_thread !== null);
  const attention = props.stories.filter((story) =>
    roomsStoryNeedsHuman(story, props.workspace.principal.id),
  ).length;
  const unreadTotal = props.workspace.channels.reduce(
    (total, channel) => total + (props.unread[unreadKey(channel.room_id, channel.id)] ?? 0),
    0,
  );
  const storySequence = props.stories.reduce(
    (head, story) => Math.max(head, story.source_event.seq),
    0,
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleChannels = normalizedQuery
    ? props.workspace.channels.filter((channel) =>
        `${channel.name} ${channel.purpose ?? ""}`.toLocaleLowerCase().includes(normalizedQuery),
      )
    : props.workspace.channels;
  const visibleThreads = normalizedQuery
    ? linkedStories.filter((story) => story.title.toLocaleLowerCase().includes(normalizedQuery))
    : linkedStories;

  return (
    <View className={`flex-1 flex-row ${pageClass}`}>
      <RoomRail
        onSelectRoom={props.onSelectRoom}
        rooms={props.session.rooms}
        selectedAttention={attention}
        selectedRoomId={props.selectedRoomId}
      />
      <View className="min-w-0 flex-1">
        <StatusStrip attention={attention} storySequence={storySequence || null} />
        <View className="px-4 py-3">
          <View className="relative min-h-10 justify-center border border-[#aeb7ba] bg-[#f8f5ed] pl-10 pr-3 dark:border-[#303943] dark:bg-[#1a2026]">
            <View className="absolute left-3">
              <SymbolView
                name="magnifyingglass"
                size={14}
                tintColor={isDark ? palette.dark.muted : palette.light.muted}
                type="monochrome"
              />
            </View>
            <AppTextInput
              accessibilityLabel="Search this room"
              autoCapitalize="none"
              className="min-h-10 border-0 bg-transparent p-0 font-mono text-[11px] tracking-[1px] uppercase"
              onChangeText={setQuery}
              placeholder="SEARCH THIS ROOM"
              value={query}
            />
          </View>
        </View>
        <ScrollView
          className="flex-1"
          contentContainerClassName="pb-3"
          refreshControl={
            <RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh} />
          }
        >
          <DrawerSection label={`Channels · ${unreadTotal} unread local`}>
            {visibleChannels.length === 0 ? (
              <Text className={`px-4 py-3 text-[13px] ${mutedClass}`}>
                {props.workspace.channels.length === 0
                  ? "No channels are exposed by this room."
                  : "No channels match this search."}
              </Text>
            ) : (
              visibleChannels.map((channel) => {
                const count = props.unread[unreadKey(channel.room_id, channel.id)] ?? 0;
                return (
                  <NavigationRow
                    count={count || undefined}
                    detail={channel.purpose ?? undefined}
                    glyph="#"
                    key={channel.id}
                    onPress={() => props.onOpenChannel(channel.id)}
                    title={channel.name.replace(/^(?:#+\s*)+/u, "") || "Unnamed channel"}
                    tone={count ? "amber" : undefined}
                  />
                );
              })
            )}
          </DrawerSection>

          <DrawerSection label="Linked native T3 threads">
            {visibleThreads.length === 0 ? (
              <Text className={`px-4 py-3 text-[13px] ${mutedClass}`}>
                {linkedStories.length === 0
                  ? "No Stories expose linked native work."
                  : "No linked threads match this search."}
              </Text>
            ) : (
              visibleThreads.map((story) => (
                <NavigationRow
                  detail={roomsStageLabel(story.stage)}
                  glyph="▣"
                  key={story.id}
                  onPress={() => props.onOpenThread(story)}
                  title={story.title}
                  tone="cyan"
                />
              ))
            )}
          </DrawerSection>

          <DrawerSection label="Project">
            <NavigationRow
              count={attention || undefined}
              glyph="▥"
              onPress={() => props.onSelectSection("status")}
              title="Status"
              tone={attention ? "amber" : undefined}
            />
            <NavigationRow
              count={props.stories.length}
              glyph="▦"
              onPress={() => props.onSelectSection("stories")}
              title="Stories"
            />
          </DrawerSection>

          <DrawerSection label="Network">
            <NavigationRow
              count={props.workspace.principals.length}
              glyph="⌘"
              onPress={() => props.onSelectSection("network")}
              title="People and machines"
            />
          </DrawerSection>
        </ScrollView>
        <RoomIdentityFooter onOpenAccount={props.onOpenAccount} workspace={props.workspace} />
      </View>
    </View>
  );
}

function StatusLine(props: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly tone?: "amber" | "cyan" | "green" | "red";
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return (
    <View className="min-h-[58px] flex-row items-start gap-3 border-t border-[#d4d6d2] px-3 py-2.5 first:border-t-0 dark:border-[#252d35]">
      <Text className={`${eyebrowClass} w-[92px] pt-0.5`}>{props.label}</Text>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          {props.tone ? <StatusDot tone={props.tone} /> : null}
          <Text
            className={`font-mono text-[11px] font-bold tracking-[0.5px] uppercase ${inkClass}`}
            style={props.tone ? { color: palette[scheme][props.tone] } : undefined}
          >
            {props.value}
          </Text>
        </View>
        <Text className={`mt-1 text-[11px] leading-4 ${mutedClass}`}>{props.detail}</Text>
      </View>
    </View>
  );
}

function StorySummaryRow(props: {
  readonly story: RoomsHumanStory;
  readonly workspace: RoomsHumanWorkspace;
  readonly onPress: () => void;
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const needsYou = roomsStoryNeedsHuman(props.story, props.workspace.principal.id);
  return (
    <Pressable
      accessibilityRole="button"
      className="border-t border-[#d4d6d2] px-3 py-3 first:border-t-0 active:bg-[#eeece5] dark:border-[#222a31] dark:active:bg-[#192028]"
      onPress={props.onPress}
    >
      <View className="flex-row items-start gap-2">
        <View className="min-w-0 flex-1">
          <Text
            className="font-mono text-[10px] font-bold tracking-[0.7px] uppercase"
            style={{ color: needsYou ? palette[scheme].amber : palette[scheme].cyan }}
          >
            {roomsStageLabel(props.story.stage)}
          </Text>
          <Text className={`mt-1 text-[15px] font-t3-bold leading-5 ${inkClass}`}>
            {props.story.title}
          </Text>
          <Text className={`mt-1 text-[13px] leading-[18px] ${mutedClass}`}>
            {roomsStoryNextAction(props.story, props.workspace.principal.id)}
          </Text>
          <Text className={`mt-2 font-mono text-[10px] tracking-[0.4px] ${mutedClass}`}>
            {principalLabel(props.workspace, roomsStoryOwnerId(props.story))} · Updated{" "}
            {formatDate(roomsStoryUpdatedAt(props.story))}
          </Text>
        </View>
        <Text className={`font-mono text-[10px] font-bold ${mutedClass}`}>OPEN</Text>
      </View>
    </Pressable>
  );
}

function StatusDestination(props: {
  readonly workspace: RoomsHumanWorkspace;
  readonly stories: readonly RoomsHumanStory[];
  readonly unread: Readonly<Record<string, number>>;
  readonly onOpenStory: (storyId: string) => void;
  readonly onOpenChannel: (channelId: string) => void;
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const attention = props.stories.filter((story) =>
    roomsStoryNeedsHuman(story, props.workspace.principal.id),
  );
  const active = props.stories
    .filter((story) => story.stage !== "backlog" && story.stage !== "done")
    .sort((left, right) => roomsStoryUpdatedAt(right).localeCompare(roomsStoryUpdatedAt(left)));
  const maxStoryHead = props.stories.reduce(
    (head, story) => (isRoomsHumanStoryV2(story) ? Math.max(head, story.as_of_seq) : head),
    0,
  );
  const unreadTotal = props.workspace.channels.reduce(
    (total, channel) => total + (props.unread[unreadKey(channel.room_id, channel.id)] ?? 0),
    0,
  );
  const storySequence = props.stories.reduce(
    (head, story) => Math.max(head, story.source_event.seq),
    0,
  );

  return (
    <View className="px-4 pb-8 pt-3">
      <Text className={eyebrowClass}>Fig. 1 — room status</Text>
      <Text className={`mt-2 text-[13px] leading-5 ${mutedClass}`}>
        What loaded, what needs attention, and what the current contract cannot prove.
      </Text>

      <Plate className="mt-4">
        <SectionHeader
          label="Current status"
          meta={storySequence ? `Story seq ${storySequence}` : "Sequence unknown"}
        />
        <StatusLine
          detail="The authenticated workspace request completed. Ongoing reachability is not exposed."
          label="Workspace"
          tone="green"
          value="Available"
        />
        <StatusLine
          detail={
            maxStoryHead
              ? `Latest loaded v2 projection sequence ${maxStoryHead}.`
              : "No v2 projection head is available."
          }
          label="Stories"
          value={`${props.stories.length} loaded`}
        />
        <StatusLine
          detail="Presence, heartbeat, and runtime health are absent from the mobile contract."
          label="Agents"
          tone="amber"
          value="Health unknown"
        />
        <StatusLine
          detail="Derived only from supported review gates and durable Story ownership."
          label="Awaiting you"
          tone={attention.length ? "amber" : "green"}
          value={`${attention.length} ${attention.length === 1 ? "item" : "items"}`}
        />
      </Plate>

      <View className="mb-2 mt-5 flex-row items-center">
        <Text
          className={eyebrowClass}
          style={attention.length ? { color: palette[scheme].amber } : undefined}
        >
          Waiting on you
        </Text>
        <Text className={`ml-auto font-mono text-[9px] uppercase ${mutedClass}`}>
          {attention.length} supported {attention.length === 1 ? "action" : "actions"}
        </Text>
      </View>
      <Plate>
        {attention.length === 0 ? (
          <View className="p-3">
            <Text className={`text-[13px] leading-5 ${mutedClass}`}>
              No Story currently exposes a supported action for this person.
            </Text>
          </View>
        ) : (
          attention.map((story) => (
            <StorySummaryRow
              key={story.id}
              onPress={() => props.onOpenStory(story.id)}
              story={story}
              workspace={props.workspace}
            />
          ))
        )}
      </Plate>

      <View className="mb-2 mt-5 flex-row items-center">
        <Text className={eyebrowClass}>Active work</Text>
        <Text className={`ml-auto font-mono text-[9px] uppercase ${mutedClass}`}>
          {active.length} open
        </Text>
      </View>
      <Plate>
        {active.length === 0 ? (
          <View className="p-3">
            <Text className={`text-[13px] ${mutedClass}`}>
              No active Story projections are loaded.
            </Text>
          </View>
        ) : (
          active
            .slice(0, 8)
            .map((story) => (
              <StorySummaryRow
                key={story.id}
                onPress={() => props.onOpenStory(story.id)}
                story={story}
                workspace={props.workspace}
              />
            ))
        )}
      </Plate>

      <Plate className="mt-5">
        <SectionHeader label="Available activity" meta={`${unreadTotal} device unread`} />
        {props.workspace.channels.length === 0 ? (
          <View className="p-4">
            <Text className={`text-sm ${mutedClass}`}>
              No channel activity surface is available.
            </Text>
          </View>
        ) : (
          props.workspace.channels.map((channel) => (
            <NavigationRow
              count={props.unread[unreadKey(channel.room_id, channel.id)] || undefined}
              detail={channel.purpose ?? "Purpose unavailable"}
              glyph="#"
              key={channel.id}
              onPress={() => props.onOpenChannel(channel.id)}
              title={roomsChannelLabel(channel.name)}
              tone="cyan"
            />
          ))
        )}
      </Plate>

      <Text className={`mt-4 font-mono text-[10px] leading-4 ${mutedClass}`}>
        VISION UNAVAILABLE · The shared mobile contract exposes no vision text, revision, or
        freshness.
      </Text>
    </View>
  );
}

function StageFilter(props: {
  readonly stories: readonly RoomsHumanStory[];
  readonly selected: RoomsStoryStageFilter;
  readonly onSelect: (filter: RoomsStoryStageFilter) => void;
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const filters = ROOMS_STORY_STAGE_FILTERS.filter(
    (filter): filter is Exclude<RoomsStoryStageFilter, "all"> => filter !== "all",
  );
  return (
    <View className={`relative overflow-hidden border-b px-4 pb-2 pt-2 ${chromeClass}`}>
      <ChromeBackdrop />
      <Text className={`${eyebrowClass} mb-2`}>Stage</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 pb-1"
      >
        {filters.map((filter) => {
          const selected = filter === props.selected;
          const count = props.stories.filter((story) => story.stage === filter).length;
          const tone =
            filter === "human-qa"
              ? palette[scheme].amber
              : filter === "done"
                ? palette[scheme].green
                : filter === "in-progress"
                  ? palette[scheme].cyan
                  : palette[scheme].muted;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              className={
                selected
                  ? "min-h-10 min-w-[128px] flex-row items-center gap-2 border border-[#7e8a8f] bg-[#f8f5ed]/70 px-3 dark:border-[#3a4650] dark:bg-[#1a2026]/80"
                  : "min-h-10 min-w-[128px] flex-row items-center gap-2 border border-[#aeb7ba] px-3 dark:border-[#303943]"
              }
              key={filter}
              onPress={() => props.onSelect(filter)}
            >
              <View className="size-1.5 rounded-full" style={{ backgroundColor: tone }} />
              <Text
                className={`min-w-0 flex-1 font-mono text-[10px] font-bold tracking-[1px] uppercase ${selected ? inkClass : mutedClass}`}
                numberOfLines={1}
              >
                {roomsStageLabel(filter)}
              </Text>
              <Text className={`font-mono text-[10px] ${mutedClass}`}>{count}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function StoryLaneCard(props: {
  readonly story: RoomsHumanStory;
  readonly workspace: RoomsHumanWorkspace;
  readonly onPress: () => void;
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const needsYou = roomsStoryNeedsHuman(props.story, props.workspace.principal.id);
  return (
    <Pressable
      accessibilityRole="button"
      className="border bg-[#f8f5ed] p-3 active:opacity-70 dark:bg-[#14181d]"
      onPress={props.onPress}
      style={{
        borderColor: needsYou ? palette[scheme].amber : scheme === "dark" ? "#303943" : "#aeb7ba",
      }}
    >
      <View className="flex-row items-center gap-2">
        <Text className={`min-w-0 flex-1 font-mono text-[10px] tracking-[0.8px] ${mutedClass}`}>
          {compactId(props.story.id)}
        </Text>
        <Text className={`font-mono text-[10px] ${mutedClass}`}>
          {formatDate(roomsStoryUpdatedAt(props.story))}
        </Text>
      </View>
      <Text className={`mt-2 text-[15px] font-t3-bold leading-5 ${inkClass}`}>
        {props.story.title}
      </Text>
      <View className="mt-2 flex-row items-center">
        <View
          className="size-1.5 rounded-full"
          style={{ backgroundColor: needsYou ? palette[scheme].amber : palette[scheme].muted }}
        />
        <Text
          className={`ml-2 min-w-0 flex-1 font-mono text-[9px] font-bold tracking-[1px] uppercase ${mutedClass}`}
          numberOfLines={1}
        >
          {roomsStageLabel(props.story.stage)}
        </Text>
        <Text className={`font-mono text-[9px] uppercase ${mutedClass}`}>
          {principalLabel(props.workspace, roomsStoryOwnerId(props.story))}
        </Text>
      </View>
      <View className="mt-2 border-t border-[#d4d6d2] pt-2 dark:border-[#252d35]">
        <Text
          className="text-[12px] leading-[17px]"
          style={{ color: needsYou ? palette[scheme].amber : palette[scheme].muted }}
        >
          {roomsStoryNextAction(props.story, props.workspace.principal.id)}
        </Text>
      </View>
    </Pressable>
  );
}

function StoriesDestination(props: {
  readonly workspace: RoomsHumanWorkspace;
  readonly stories: readonly RoomsHumanStory[];
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly onOpenStory: (storyId: string) => void;
}) {
  const [stage, setStage] = useState<RoomsStoryStageFilter>("in-progress");
  const [expanded, setExpanded] = useState<Readonly<Record<RoomsStoryBlockingGroup, boolean>>>({
    you: true,
    other: true,
    none: true,
    unknown: true,
  });
  const groups = ROOMS_STORY_BLOCKING_GROUPS.filter(
    (group) =>
      group !== "unknown" ||
      props.stories.some(
        (story) => roomsStoryBlockingGroup(story, props.workspace.principal.id) === "unknown",
      ),
  );

  return (
    <View className="flex-1">
      <StageFilter onSelect={setStage} selected={stage} stories={props.stories} />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-8 pt-4"
        refreshControl={
          <RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh} />
        }
      >
        {groups.map((group) => {
          const laneStories = props.stories.filter(
            (story) => roomsStoryBlockingGroup(story, props.workspace.principal.id) === group,
          );
          const stories = laneStories.filter((story) => story.stage === stage);
          const isExpanded = expanded[group];
          const needsYou = group === "you";
          return (
            <View className="mb-5" key={group}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                className="min-h-9 flex-row items-center"
                onPress={() => setExpanded((current) => ({ ...current, [group]: !current[group] }))}
              >
                <Text
                  className={`${eyebrowClass} ${needsYou ? "text-[#9a5b0d] dark:text-[#efad3c]" : ""}`}
                >
                  {isExpanded ? "⌄" : "›"} {roomsBlockingGroupLabel(group)}
                </Text>
                {needsYou && laneStories.length > 0 ? (
                  <View className="ml-2 border border-[#c5a066] bg-[#9a5b0d]/10 px-2 py-1 dark:border-[#5d4824] dark:bg-[#efad3c]/10">
                    <Text className="font-mono text-[9px] font-bold tracking-[0.8px] text-[#9a5b0d] uppercase dark:text-[#efad3c]">
                      {laneStories.length} waiting
                    </Text>
                  </View>
                ) : null}
                <Text className={`ml-auto font-mono text-[9px] uppercase ${mutedClass}`}>
                  {laneStories.length} in lane
                </Text>
              </Pressable>
              {isExpanded ? (
                stories.length ? (
                  <View className="gap-2">
                    {stories.map((story) => (
                      <StoryLaneCard
                        key={story.id}
                        onPress={() => props.onOpenStory(story.id)}
                        story={story}
                        workspace={props.workspace}
                      />
                    ))}
                  </View>
                ) : (
                  <View className="border border-dashed border-[#aeb7ba] p-4 dark:border-[#303943]">
                    <Text
                      className={`text-center font-mono text-[10px] tracking-[1px] uppercase ${mutedClass}`}
                    >
                      Nothing in this stage
                    </Text>
                  </View>
                )
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function NetworkDestination(props: { readonly workspace: RoomsHumanWorkspace }) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const types = ["machine", "human", "agent"] as const;
  const captions = {
    machine: "HOSTING AND HEARTBEAT UNKNOWN",
    human: "ROOM ROLE KNOWN · PRESENCE UNKNOWN",
    agent: "DURABLE IDENTITY · RUNTIME UNKNOWN",
  } as const;
  return (
    <View className="px-4 pb-8 pt-3">
      <Text className={eyebrowClass}>Fig. 1 — room topology</Text>
      <Text className={`mt-2 text-[13px] leading-5 ${mutedClass}`}>
        Who is declared in this room, what role is known, and which runtime facts remain unresolved.
      </Text>

      <Plate className="mt-4 p-3">
        <Text className={eyebrowClass}>This room</Text>
        <Text
          className={`mt-2 font-mono text-[15px] font-bold tracking-[0.8px] uppercase ${inkClass}`}
        >
          {props.workspace.room.name}
        </Text>
        <Text className={`mt-2 font-mono text-[10px] tracking-[0.8px] uppercase ${mutedClass}`}>
          Shared · {props.workspace.principals.length} declared identities · live topology unknown
        </Text>
      </Plate>

      {types.map((type) => {
        const principals = props.workspace.principals.filter(
          (principal) => principal.type === type,
        );
        return (
          <View className="mt-5" key={type}>
            <View className="mb-2 flex-row items-center">
              <Text className={eyebrowClass}>
                {type === "human" ? "People" : type === "agent" ? "Agents" : "Machines"}
              </Text>
              <Text className={`ml-auto font-mono text-[9px] tracking-[0.6px] ${mutedClass}`}>
                {captions[type]}
              </Text>
            </View>
            {principals.length === 0 ? (
              <View className="border border-dashed border-[#aeb7ba] p-4 dark:border-[#303943]">
                <Text className={`text-center text-[13px] ${mutedClass}`}>
                  No {type} principals are exposed.
                </Text>
              </View>
            ) : (
              <View className="gap-2">
                {principals.map((principal) => {
                  const label = principal.display_name ?? "Name unavailable";
                  return (
                    <View className="relative pl-12" key={principal.id}>
                      <View
                        className="absolute left-0 top-4 h-px w-9"
                        style={{ backgroundColor: palette[scheme].muted }}
                      />
                      <View
                        className="absolute left-0 top-[13px] size-1.5 rounded-full"
                        style={{ backgroundColor: palette[scheme].muted }}
                      />
                      <Plate className="p-3">
                        <View className="flex-row items-center gap-2">
                          <Text
                            className={`min-w-0 flex-1 font-mono text-[13px] font-bold tracking-[0.7px] ${inkClass}`}
                            numberOfLines={1}
                          >
                            {label}
                          </Text>
                          <Text
                            className="font-mono text-[9px] font-bold tracking-[0.7px] uppercase"
                            style={{ color: palette[scheme].amber }}
                          >
                            State unknown
                          </Text>
                        </View>
                        <Text selectable className={`mt-1 font-mono text-[10px] ${mutedClass}`}>
                          {principal.id}
                        </Text>
                        <Text className={`mt-2 text-[12px] leading-[17px] ${mutedClass}`}>
                          {principal.type === "human"
                            ? `${principal.role ?? "No room role exposed"}. The contract does not expose presence.`
                            : principal.type === "agent"
                              ? "The principal is durable; permissions, process state, and host are not exposed."
                              : "The machine identity is durable; hostname, heartbeat, and hosted work are not exposed."}
                        </Text>
                      </Plate>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      <Text className={`mt-5 font-mono text-[10px] leading-4 ${mutedClass}`}>
        Matching display names never merge separate Threadspace identities.
      </Text>
    </View>
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
  const isDark = useColorScheme() === "dark";
  const disabled = props.busy || !props.draft.trim() || !props.canCreateMessage;
  return (
    <View
      className={`relative flex-row items-end gap-2 overflow-hidden border-t px-3 pt-2 ${chromeClass}`}
      style={{ paddingBottom: Math.max(props.bottomInset, 8) }}
    >
      <ChromeBackdrop />
      <View className="min-h-11 min-w-0 flex-1 flex-row items-center border border-[#aeb7ba] bg-[#f8f5ed]/80 px-3 dark:border-[#303943] dark:bg-[#14181d]/80">
        <Text className={`mr-2 font-mono text-[16px] ${mutedClass}`}>#</Text>
        <ComposerEditor
          editable={!props.busy && props.canCreateMessage}
          multiline
          onChangeText={props.onChangeDraft}
          onSubmit={props.onSend}
          placeholder={`Message ${roomsChannelLabel(props.channelName)}`}
          scrollEnabled
          style={{ minHeight: 36, maxHeight: 88, flex: 1 }}
          value={props.draft}
        />
      </View>
      <Pressable
        accessibilityLabel={`Send message to ${roomsChannelLabel(props.channelName)}`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className="size-11 items-center justify-center border border-[#7e8a8f] bg-[#f8f5ed]/70 active:opacity-60 dark:border-[#3a4650] dark:bg-[#1a2026]/80"
        disabled={disabled}
        onPress={props.onSend}
        style={{ opacity: disabled ? 0.4 : 1 }}
      >
        {props.busy ? (
          <ActivityIndicator size="small" />
        ) : (
          <SymbolView
            name={{ ios: "arrow.up", android: "arrow_upward" }}
            size={18}
            tintColor={isDark ? palette.dark.cyan : palette.light.cyan}
          />
        )}
      </Pressable>
    </View>
  );
}

function ChannelDestination(props: {
  readonly workspace: RoomsHumanWorkspace;
  readonly channelId: string | null;
  readonly feed: RoomsHumanFeed | null;
  readonly feedLoading: boolean;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
}) {
  const channel =
    props.workspace.channels.find((candidate) => candidate.id === props.channelId) ?? null;
  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-5 pt-2"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh} />
        }
      >
        {props.workspace.channels.length === 0 ? (
          <EmptyState
            variant="card"
            title="No channels yet"
            detail="Create the first channel from desktop, then pull to refresh."
          />
        ) : props.feedLoading && !props.feed ? (
          <View className="items-center py-12">
            <ActivityIndicator />
          </View>
        ) : !props.feed ? (
          <EmptyState
            variant="card"
            title="Channel unavailable"
            detail="Pull to refresh and try loading this channel again."
          />
        ) : props.feed.items.length === 0 ? (
          <EmptyState
            variant="card"
            title="No messages yet"
            detail={channel?.purpose ?? "Start the durable discussion below."}
          />
        ) : (
          props.feed.items.map((item) => {
            const writer = props.workspace.principals.find(
              (principal) => principal.id === item.attribution.writer_principal_id,
            );
            const writerName = writer?.display_name ?? item.attribution.writer_principal_id;
            const isAgent = writer?.type === "agent";
            if (item.kind === "unknown_schema") {
              return (
                <View
                  className="my-2 border-l-2 border-[#126f77] bg-[#126f77]/5 px-3 py-2 dark:border-[#68cbd0] dark:bg-[#68cbd0]/5"
                  key={item.id}
                >
                  <View className="flex-row items-start gap-3">
                    <Text className="font-mono text-[10px] font-bold tracking-[1px] text-[#126f77] uppercase dark:text-[#68cbd0]">
                      Event
                    </Text>
                    <Text
                      className={`min-w-0 flex-1 font-mono text-[10px] leading-4 ${mutedClass}`}
                    >
                      {item.summary}
                    </Text>
                  </View>
                  <Text className="mt-1 font-mono text-[9px] text-[#9a5b0d] dark:text-[#efad3c]">
                    Unsupported {item.payload.event_type} schema {item.payload.event_schema}{" "}
                    retained without inference.
                  </Text>
                </View>
              );
            }
            return (
              <View className="flex-row gap-3 px-1 py-3" key={item.id}>
                <View
                  className={
                    isAgent
                      ? "size-9 items-center justify-center border border-[#8db6b9] bg-[#126f77]/10 dark:border-[#3b5c61] dark:bg-[#68cbd0]/10"
                      : "size-9 items-center justify-center border border-[#aeb7ba] bg-[#e8e4db] dark:border-[#303943] dark:bg-[#1a2026]"
                  }
                >
                  <Text
                    className={`font-mono text-[10px] font-bold ${isAgent ? "text-[#126f77] dark:text-[#68cbd0]" : inkClass}`}
                  >
                    {initials(writerName)}
                  </Text>
                </View>
                <View className="min-w-0 flex-1">
                  <View className="flex-row flex-wrap items-baseline gap-x-2 gap-y-1">
                    <Text className={`text-[15px] font-t3-bold ${inkClass}`}>{writerName}</Text>
                    {writer ? (
                      isAgent ? (
                        <View className="border border-[#8db6b9] bg-[#126f77]/5 px-1.5 py-0.5 dark:border-[#3b5c61] dark:bg-[#68cbd0]/5">
                          <Text className="font-mono text-[9px] tracking-[0.8px] text-[#126f77] uppercase dark:text-[#68cbd0]">
                            Agent
                          </Text>
                        </View>
                      ) : null
                    ) : null}
                    <Text className={`font-mono text-[9px] ${mutedClass}`}>
                      {formatDate(item.occurred_at)}
                    </Text>
                  </View>
                  <View className="mt-2">
                    <MarkdownContent markdown={item.payload.body_markdown} />
                  </View>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

function RoomContextSheet(props: {
  readonly story: RoomsHumanStory;
  readonly workspace: RoomsHumanWorkspace;
  readonly visible: boolean;
  readonly bottomInset: number;
  readonly onClose: () => void;
  readonly onOpenThread: () => void;
}) {
  return (
    <Modal animationType="slide" onRequestClose={props.onClose} transparent visible={props.visible}>
      <Pressable className="flex-1 justify-end bg-black/45" onPress={props.onClose}>
        <Pressable
          className="max-h-[82%] border-t border-[#8db6b9] bg-[#e6e3db] px-3 pt-2 dark:border-[#3b5c61] dark:bg-[#101419]"
          onPress={(event) => event.stopPropagation()}
          style={{ paddingBottom: Math.max(props.bottomInset, 12) }}
        >
          <View className="mx-auto mb-2 h-1 w-11 rounded-full bg-[#aeb7ba] dark:bg-[#323b45]" />
          <View className="flex-row items-center">
            <Text className={`flex-1 font-mono text-[11px] font-bold tracking-[0.8px] ${inkClass}`}>
              ROOM CONTEXT
            </Text>
            <Pressable
              accessibilityLabel="Close Room Context"
              className="size-11 items-center justify-center"
              onPress={props.onClose}
            >
              <Text className={`text-2xl ${inkClass}`}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="gap-3 pb-2">
            <View className="border border-[#c5a066] bg-[#9a5b0d]/10 p-3 dark:border-[#5d4824] dark:bg-[#efad3c]/10">
              <Text className="font-mono text-[10px] font-bold tracking-[1px] text-[#9a5b0d] uppercase dark:text-[#efad3c]">
                Next human action
              </Text>
              <Text className={`mt-2 text-[15px] font-t3-bold leading-5 ${inkClass}`}>
                {roomsStoryNextAction(props.story, props.workspace.principal.id)}
              </Text>
            </View>
            <View className={`${surfaceClass} p-3`}>
              <Text className={eyebrowClass}>Why this thread exists</Text>
              <Text className={`mt-2 text-[15px] font-t3-bold ${inkClass}`}>
                {props.story.title}
              </Text>
              <Text className={`mt-2 font-mono text-[10px] uppercase ${mutedClass}`}>
                {roomsStageLabel(props.story.stage)} · Owner{" "}
                {principalLabel(props.workspace, roomsStoryOwnerId(props.story))}
              </Text>
            </View>
            <View className={`${surfaceClass} p-3`}>
              <Text className={eyebrowClass}>Linked execution</Text>
              {props.story.native_thread ? (
                <>
                  <Text className={`mt-2 text-[14px] font-t3-bold ${inkClass}`}>
                    Native T3 thread available
                  </Text>
                  <Text selectable className={`mt-2 font-mono text-[10px] leading-4 ${mutedClass}`}>
                    environment {props.story.native_thread.environment_id}
                    {"\n"}project {props.story.native_thread.project_id}
                    {"\n"}thread {props.story.native_thread.thread_id}
                  </Text>
                </>
              ) : (
                <Text className={`mt-2 text-[13px] ${mutedClass}`}>
                  No native thread is linked.
                </Text>
              )}
            </View>
            {props.story.native_thread ? (
              <Pressable
                className="min-h-12 justify-center border border-[#8db6b9] bg-[#126f77]/10 px-3 active:opacity-60 dark:border-[#3b5c61] dark:bg-[#68cbd0]/10"
                onPress={props.onOpenThread}
              >
                <Text className="font-mono text-[11px] font-bold text-[#126f77] dark:text-[#68cbd0]">
                  OPEN NATIVE T3 THREAD
                </Text>
                <Text className={`mt-1 font-mono text-[9px] uppercase ${mutedClass}`}>
                  Existing transcript, tools, editor, and composer
                </Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function StoryStageTrack(props: { readonly stage: string }) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const stages = ROOMS_STORY_STAGE_FILTERS.filter(
    (stage): stage is Exclude<RoomsStoryStageFilter, "all"> => stage !== "all",
  );
  return (
    <View className="mt-3 border border-[#aeb7ba] dark:border-[#303943]">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {stages.map((stage) => {
          const current = stage === props.stage;
          const tone =
            stage === "human-qa"
              ? palette[scheme].amber
              : stage === "done"
                ? palette[scheme].green
                : stage === "in-progress"
                  ? palette[scheme].cyan
                  : palette[scheme].muted;
          return (
            <View
              className={
                current
                  ? "min-h-10 min-w-[116px] flex-row items-center gap-2 border-r border-[#aeb7ba] bg-[#e8e4db] px-3 dark:border-[#303943] dark:bg-[#1a2026]"
                  : "min-h-10 min-w-[116px] flex-row items-center gap-2 border-r border-[#aeb7ba] px-3 dark:border-[#303943]"
              }
              key={stage}
            >
              <View
                className="size-1.5 rounded-full"
                style={{ backgroundColor: current ? tone : palette[scheme].muted }}
              />
              <Text
                className={`font-mono text-[9px] font-bold tracking-[0.8px] uppercase ${current ? inkClass : mutedClass}`}
                numberOfLines={1}
              >
                {roomsStageLabel(stage)}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function StoryDetailDestination(props: {
  readonly story: RoomsHumanStory;
  readonly workspace: RoomsHumanWorkspace;
  readonly busy: boolean;
  readonly bottomInset: number;
  readonly refreshing: boolean;
  readonly onApproveAndComplete: (story: RoomsHumanStoryV2) => void;
  readonly onOpenThread: (story: RoomsHumanStory) => void;
  readonly onRefresh: () => void;
  readonly onTransition: (story: RoomsHumanStoryV2, to: string) => void;
}) {
  const [contextOpen, setContextOpen] = useState(false);
  if (!isRoomsHumanStoryV2(props.story)) {
    return (
      <View className="p-3">
        <EmptyState
          variant="card"
          title="Workflow unavailable"
          detail="This Story uses the older v1 projection. Open desktop to inspect it; mobile will not invent actions."
        />
      </View>
    );
  }
  const story = props.story;
  const canApprove = roomsStoryCanApproveAndComplete(story);
  const nonTerminal = story.allowed_next_transitions.filter((transition) => !transition.terminal);
  const completionTransition = story.allowed_next_transitions.find(
    (transition) => transition.terminal && transition.to === "done",
  );
  const owner = principalLabel(props.workspace, roomsStoryOwnerId(story));
  const heroTone = story.stage === "done" ? "green" : story.stage === "human-qa" ? "amber" : "cyan";

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pb-8 pt-3"
        refreshControl={
          <RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh} />
        }
      >
        <Text className={`font-mono text-[10px] tracking-[0.8px] uppercase ${mutedClass}`}>
          {compactId(story.id)}
        </Text>
        <Text className={`mt-2 text-[20px] font-t3-bold leading-7 ${inkClass}`}>{story.title}</Text>
        <StoryStageTrack stage={story.stage} />

        <Plate className="mt-4">
          <SectionHeader label="Next action" tone={heroTone} />
          <View className="p-3">
            <Text className={`text-[16px] font-t3-bold leading-5 ${inkClass}`}>
              {roomsStoryNextAction(story, props.workspace.principal.id)}
            </Text>
            <Text className={`mt-2 text-[12px] leading-[18px] ${mutedClass}`}>
              Only transitions and review gates exposed by the current Story projection appear here.
            </Text>
            <View className="mt-3 items-start gap-2">
              {story.gate ? (
                <Pressable
                  accessibilityState={{ disabled: props.busy || !canApprove }}
                  className="min-h-12 items-center justify-center border border-[#7e8a8f] bg-[#e8e4db] px-4 dark:border-[#3a4650] dark:bg-[#1a2026]"
                  disabled={props.busy || !canApprove}
                  onPress={() => props.onApproveAndComplete(story)}
                  style={{ opacity: props.busy || !canApprove ? 0.35 : 1 }}
                >
                  <Text className={`font-mono text-[10px] font-bold tracking-[0.8px] ${inkClass}`}>
                    {story.gate.approved_review_id ? "COMPLETE STORY" : "APPROVE + COMPLETE"}
                  </Text>
                </Pressable>
              ) : null}
              {nonTerminal.map((transition) => {
                const allowed =
                  transition.allowed &&
                  (transition.to !== "human-qa" || roomsReviewEvidenceSatisfied(story));
                return (
                  <View className="gap-1" key={`${transition.from}:${transition.to}`}>
                    <Pressable
                      accessibilityState={{ disabled: props.busy || !allowed }}
                      className="min-h-12 items-center justify-center border border-[#7e8a8f] bg-[#e8e4db] px-4 dark:border-[#3a4650] dark:bg-[#1a2026]"
                      disabled={props.busy || !allowed}
                      onPress={() => props.onTransition(story, transition.to)}
                      style={{ opacity: props.busy || !allowed ? 0.4 : 1 }}
                    >
                      <Text
                        className={`font-mono text-[10px] font-bold tracking-[0.8px] ${inkClass}`}
                      >
                        {transition.to === "in-progress"
                          ? story.stage === "human-qa"
                            ? "SEND BACK"
                            : "CLAIM + START"
                          : transition.to === "human-qa"
                            ? "REQUEST REVIEW"
                            : transition.label.toUpperCase()}
                      </Text>
                    </Pressable>
                    {!allowed && transition.unavailable_reason ? (
                      <Text className={`px-1 text-[11px] leading-4 ${mutedClass}`}>
                        {transition.unavailable_reason}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              {story.gate && !canApprove ? (
                <Text className={`text-[11px] leading-4 ${mutedClass}`}>
                  {story.gate.approved_review_id
                    ? (completionTransition?.unavailable_reason ??
                      "The approved Story is not ready for completion.")
                    : story.gate.evidence_satisfied
                      ? "Another eligible person must review this evidence."
                      : "Qualifying evidence is required before approval."}
                </Text>
              ) : null}
            </View>
          </View>
        </Plate>

        <Plate className="mt-4">
          <SectionHeader
            label="Execution"
            meta={story.native_thread ? "Linked native thread" : "No thread yet"}
          />
          <View className="p-3">
            <Text className={`text-[15px] font-t3-bold ${inkClass}`}>
              {story.native_thread ? "Native T3 work is linked" : "No native T3 thread is linked"}
            </Text>
            <Text className={`mt-2 text-[12px] leading-[18px] ${mutedClass}`}>
              {story.native_thread
                ? "The transcript, tools, editor, and composer remain in the native T3 thread."
                : "Threadspace will keep the Story state honest until linked execution exists."}
            </Text>
          </View>
          {story.native_thread ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-12 justify-center border-t border-[#8db6b9] bg-[#126f77]/5 px-3 active:opacity-60 dark:border-[#3b5c61] dark:bg-[#68cbd0]/5"
              onPress={() => props.onOpenThread(story)}
            >
              <Text className="font-mono text-[10px] font-bold tracking-[0.8px] text-[#126f77] dark:text-[#68cbd0]">
                OPEN LINKED NATIVE T3 THREAD
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            className="min-h-12 justify-center border-t border-[#d4d6d2] px-3 active:opacity-60 dark:border-[#252d35]"
            onPress={() => setContextOpen(true)}
          >
            <Text className={`font-mono text-[10px] font-bold tracking-[0.8px] ${inkClass}`}>
              ROOM CONTEXT
            </Text>
            <Text className={`mt-1 font-mono text-[9px] uppercase ${mutedClass}`}>
              Story ownership, room identity, and linked execution
            </Text>
          </Pressable>
        </Plate>

        <Plate className="mt-4">
          <SectionHeader
            label="Evidence"
            meta={
              story.evidence.length
                ? `${story.evidence.length} attached`
                : "Needs screenshot or file"
            }
          />
          {story.evidence.length === 0 ? (
            <View className="p-3">
              <Text className={`text-[15px] font-t3-bold ${inkClass}`}>Nothing attached yet</Text>
              <Text className={`text-[13px] leading-5 ${mutedClass}`}>
                Mobile evidence upload is unavailable. Attach qualifying evidence from desktop.
              </Text>
            </View>
          ) : (
            story.evidence.map((evidence) => (
              <View
                className="border-t border-[#d4d6d2] p-3 first:border-t-0 dark:border-[#222a31]"
                key={evidence.id}
              >
                <Text className={`text-[14px] font-t3-bold ${inkClass}`}>
                  {evidence.note ?? evidence.kind}
                </Text>
                <Text className={`mt-1 font-mono text-[10px] uppercase ${mutedClass}`}>
                  {evidence.kind} · {evidence.cas.bytes} bytes ·{" "}
                  {principalLabel(props.workspace, evidence.produced_by)}
                </Text>
              </View>
            ))
          )}
        </Plate>

        <Plate className="mt-4">
          <SectionHeader label="Ownership + review" />
          <View className="flex-row">
            <View className="w-1/2 border-r border-[#d4d6d2] p-3 dark:border-[#222a31]">
              <Text className={eyebrowClass}>Owner</Text>
              <Text className={`mt-2 text-[14px] font-t3-bold ${inkClass}`}>{owner}</Text>
            </View>
            <View className="w-1/2 p-3">
              <Text className={eyebrowClass}>Your review</Text>
              <Text className={`mt-2 text-[14px] font-t3-bold ${inkClass}`}>
                {story.gate?.reviewer_allowed ? "Eligible" : "Not eligible or unavailable"}
              </Text>
            </View>
          </View>
        </Plate>

        <Plate className="mt-4">
          <SectionHeader label="Relevant history" meta={`${story.audit.length} events`} />
          {story.audit.length === 0 ? (
            <View className="p-3">
              <Text className={`text-[13px] ${mutedClass}`}>No audit events are exposed.</Text>
            </View>
          ) : (
            story.audit
              .toReversed()
              .slice(0, 12)
              .map((entry) => (
                <View
                  className="border-t border-[#d4d6d2] p-3 first:border-t-0 dark:border-[#222a31]"
                  key={entry.source_event.event_id}
                >
                  <Text className={`text-[13px] font-t3-bold ${inkClass}`}>
                    {entry.source_event.type}
                  </Text>
                  <Text className={`mt-1 font-mono text-[10px] ${mutedClass}`}>
                    {formatDate(entry.occurred_at)} · {principalLabel(props.workspace, entry.actor)}
                  </Text>
                </View>
              ))
          )}
        </Plate>
      </ScrollView>
      <RoomContextSheet
        bottomInset={props.bottomInset}
        onClose={() => setContextOpen(false)}
        onOpenThread={() => {
          setContextOpen(false);
          props.onOpenThread(story);
        }}
        story={story}
        visible={contextOpen}
        workspace={props.workspace}
      />
    </>
  );
}

function PrimaryNavigation(props: {
  readonly attention: number;
  readonly unread: number;
  readonly selected: RoomsMobileSection;
  readonly bottomInset: number;
  readonly onSelect: (section: RoomsMobileSection) => void;
}) {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const iconNames = {
    status: { ios: "chart.bar.xaxis", android: "monitoring" },
    stories: { ios: "square.grid.2x2", android: "grid_view" },
    network: { ios: "point.3.connected.trianglepath.dotted", android: "hub" },
  } as const;
  return (
    <View
      accessibilityRole="tablist"
      className={`relative flex-row overflow-hidden border-t ${chromeClass}`}
      style={{ paddingBottom: Math.max(props.bottomInset, 8) }}
    >
      <ChromeBackdrop />
      {ROOMS_MOBILE_SECTIONS.map((section) => {
        const selected = props.selected === section;
        const badge =
          section === "room" ? props.unread : section === "status" ? props.attention : 0;
        const iconColor = selected ? palette[scheme].ink : palette[scheme].muted;
        return (
          <Pressable
            accessibilityLabel={`${section}${badge ? `, ${badge} items` : ""}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            className="relative min-h-[58px] flex-1 items-center justify-center gap-1"
            key={section}
            onPress={() => props.onSelect(section)}
          >
            <View
              className="absolute top-0 h-0.5 w-8"
              style={{ backgroundColor: selected ? palette[scheme].ink : "transparent" }}
            />
            <View className="h-6 min-w-7 items-center justify-center">
              {section === "room" ? (
                <Text className="font-mono text-[22px] leading-6" style={{ color: iconColor }}>
                  #
                </Text>
              ) : (
                <SymbolView
                  fallback={
                    <Text className="font-mono text-[16px]" style={{ color: iconColor }}>
                      {section === "status" ? "▥" : section === "stories" ? "▦" : "⌘"}
                    </Text>
                  }
                  name={iconNames[section]}
                  size={19}
                  tintColor={iconColor}
                  type="monochrome"
                />
              )}
            </View>
            <Text
              className={`font-mono text-[9px] font-bold tracking-[0.6px] uppercase ${selected ? inkClass : mutedClass}`}
            >
              {section}
            </Text>
            {badge > 0 ? (
              <View
                className="absolute left-1/2 top-2 size-2 translate-x-2 rounded-full"
                style={{
                  backgroundColor:
                    section === "status" ? palette[scheme].amber : palette[scheme].cyan,
                }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export interface ThreadspaceRoomsSurfaceProps {
  readonly session: RoomsHumanSession;
  readonly workspace: RoomsHumanWorkspace;
  readonly storiesResponse: RoomsHumanStoriesResponse;
  readonly section: RoomsMobileSection;
  readonly childScreen: ChildScreen;
  readonly selectedRoomId: string | null;
  readonly selectedStoryId: string | null;
  readonly selectedChannelId: string | null;
  readonly feed: RoomsHumanFeed | null;
  readonly unread: Readonly<Record<string, number>>;
  readonly feedLoading: boolean;
  readonly refreshing: boolean;
  readonly busy: boolean;
  readonly draft: string;
  readonly error: { readonly code: string; readonly message: string } | null;
  readonly bottomInset: number;
  readonly topInset: number;
  readonly onRefresh: () => void;
  readonly onOpenAccount: () => void;
  readonly onOpenAppearance: () => void;
  readonly onBack: () => void;
  readonly onSelectRoom: (roomId: string) => void;
  readonly onSelectSection: (section: RoomsMobileSection) => void;
  readonly onOpenStory: (storyId: string) => void;
  readonly onOpenChannel: (channelId: string) => void;
  readonly onSelectChannel: (channelId: string) => void;
  readonly onChangeDraft: (draft: string) => void;
  readonly onSend: () => void;
  readonly onApproveAndComplete: (story: RoomsHumanStoryV2) => void;
  readonly onTransition: (story: RoomsHumanStoryV2, to: string) => void;
  readonly onOpenThread: (story: RoomsHumanStory) => void;
}

export function ThreadspaceRoomsSurface(props: ThreadspaceRoomsSurfaceProps) {
  const selectedStory =
    props.storiesResponse.stories.find((story) => story.id === props.selectedStoryId) ?? null;
  const selectedChannel =
    props.workspace.channels.find((channel) => channel.id === props.selectedChannelId) ?? null;
  const attention = props.storiesResponse.stories.filter((story) =>
    roomsStoryNeedsHuman(story, props.workspace.principal.id),
  ).length;
  const unreadTotal = props.workspace.channels.reduce(
    (total, channel) => total + (props.unread[unreadKey(channel.room_id, channel.id)] ?? 0),
    0,
  );
  const refreshControl = (
    <RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh} />
  );

  return (
    <View className={`flex-1 ${pageClass}`}>
      <ThreadspaceHeader
        childScreen={props.childScreen}
        onBack={props.onBack}
        onOpenAppearance={props.onOpenAppearance}
        section={props.section}
        selectedChannelName={selectedChannel?.name ?? null}
        selectedStory={selectedStory}
        stories={props.storiesResponse.stories}
        topInset={props.topInset}
        workspace={props.workspace}
      />
      {props.error ? (
        <View className="mx-3 mt-3 border border-[#c9a39c] bg-[#a64635]/10 p-3 dark:border-[#603933] dark:bg-[#df7563]/10">
          <Text className="font-t3-bold text-[#a64635] dark:text-[#df7563]">
            {props.error.message}
          </Text>
          <Text
            selectable
            className="mt-1 font-mono text-[10px] text-[#a64635] dark:text-[#df7563]"
          >
            {props.error.code}
          </Text>
        </View>
      ) : null}
      <View className="flex-1">
        {props.childScreen === "channel" ? (
          <ChannelDestination
            channelId={props.selectedChannelId}
            feed={props.feed}
            feedLoading={props.feedLoading}
            onRefresh={props.onRefresh}
            refreshing={props.refreshing}
            workspace={props.workspace}
          />
        ) : props.childScreen === "story" && selectedStory ? (
          <StoryDetailDestination
            bottomInset={props.bottomInset}
            busy={props.busy}
            onApproveAndComplete={props.onApproveAndComplete}
            onRefresh={props.onRefresh}
            onOpenThread={props.onOpenThread}
            onTransition={props.onTransition}
            refreshing={props.refreshing}
            story={selectedStory}
            workspace={props.workspace}
          />
        ) : props.section === "stories" ? (
          <StoriesDestination
            onRefresh={props.onRefresh}
            onOpenStory={props.onOpenStory}
            refreshing={props.refreshing}
            stories={props.storiesResponse.stories}
            workspace={props.workspace}
          />
        ) : props.section === "room" ? (
          <RoomDestination
            onOpenAccount={props.onOpenAccount}
            onOpenChannel={props.onOpenChannel}
            onOpenStory={props.onOpenStory}
            onOpenThread={props.onOpenThread}
            onRefresh={props.onRefresh}
            onSelectRoom={props.onSelectRoom}
            onSelectSection={props.onSelectSection}
            refreshing={props.refreshing}
            selectedRoomId={props.selectedRoomId}
            session={props.session}
            stories={props.storiesResponse.stories}
            unread={props.unread}
            workspace={props.workspace}
          />
        ) : (
          <ScrollView
            automaticallyAdjustsScrollIndicatorInsets={false}
            className="flex-1"
            contentInsetAdjustmentBehavior="never"
            refreshControl={refreshControl}
          >
            {props.section === "status" ? (
              <StatusDestination
                onOpenChannel={props.onOpenChannel}
                onOpenStory={props.onOpenStory}
                stories={props.storiesResponse.stories}
                unread={props.unread}
                workspace={props.workspace}
              />
            ) : props.section === "network" ? (
              <NetworkDestination workspace={props.workspace} />
            ) : null}
          </ScrollView>
        )}
      </View>
      {props.childScreen === "channel" && selectedChannel ? (
        <ChannelComposer
          bottomInset={0}
          busy={props.busy}
          canCreateMessage={Boolean(props.workspace.capabilities["message.create"])}
          channelName={selectedChannel.name}
          draft={props.draft}
          onChangeDraft={props.onChangeDraft}
          onSend={props.onSend}
        />
      ) : null}
      <PrimaryNavigation
        attention={attention}
        bottomInset={props.bottomInset}
        onSelect={props.onSelectSection}
        selected={props.section}
        unread={unreadTotal}
      />
    </View>
  );
}
