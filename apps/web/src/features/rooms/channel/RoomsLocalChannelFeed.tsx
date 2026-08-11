import {
  AlertTriangleIcon,
  GitBranchIcon,
  HashIcon,
  InboxIcon,
  RefreshCwIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { shouldSubmitComposerOnEnter } from "~/composer-logic";
import { useClientSettings } from "~/hooks/useSettings";
import { useMediaQuery } from "~/hooks/useMediaQuery";

import { RoomsActivityFeed, useRoomsFeedAutoScroll } from "../activity/RoomsActivityFeed";
import { RoomsActivityRowView } from "../activity/RoomsActivityItem";
import { roomsActivityRegister } from "../activity/projection";
import { roomsChannelDisplayName } from "./channelName";
import {
  projectRoomsLocalActivityItem,
  projectRoomsLocalActivityItems,
} from "./localActivityProjection";
import { useRoomsDataSource } from "../dataSource";
import { isRoomsLocalClientError, RoomsLocalClientError } from "../dataSource/localChannelsClient";
import type {
  RoomsLocalChannel,
  RoomsLocalFeed,
  RoomsLocalFeedItem,
} from "../dataSource/localChannelsContract";
import type { RoomsInteractiveWorkspace } from "../dataSource/humanSharedContract";
import type { RoomsProjectedActivity } from "../activity/projection";
import { createLowercaseUuidV7 } from "../dataSource/uuidV7";
import {
  canSubmitStableRoomsCommand,
  finishStableRoomsSubmission,
  prepareStableRoomsCommand,
  tryStartStableRoomsSubmission,
  type StableRoomsCommand,
} from "./stableCommand";

export function mergeRoomsLocalFeedPages(pages: readonly RoomsLocalFeed[]): RoomsLocalFeed | null {
  const first = pages[0];
  if (!first) return null;
  const itemIds = new Set<string>();
  const items: RoomsLocalFeedItem[] = [];
  for (const page of pages) {
    if (
      page.room_id !== first.room_id ||
      page.channel_id !== first.channel_id ||
      page.page_info.snapshot_head_seq !== first.page_info.snapshot_head_seq
    ) {
      throw new RoomsLocalClientError({
        kind: "invalid_response",
        code: "feed_snapshot_mismatch",
        message: "The Rooms Local feed changed identity within a pinned snapshot.",
      });
    }
    for (const item of page.items) {
      if (itemIds.has(item.id)) continue;
      itemIds.add(item.id);
      items.push(item);
    }
  }
  const last = pages.at(-1)!;
  return { ...last, items };
}

export function isCurrentRoomsLocalFeedRequest(
  requestGeneration: number,
  currentGeneration: number,
): boolean {
  return requestGeneration === currentGeneration;
}

/**
 * Renders one durable Local item through the shared activity renderer. Local and Sample channels
 * differ in where their truth comes from, not in how a message reads.
 */
export function RoomsLocalFeedItemCard({
  item,
  workspace,
}: {
  item: RoomsLocalFeedItem;
  workspace: RoomsInteractiveWorkspace;
}) {
  const activity = projectRoomsLocalActivityItem(workspace, item);
  return (
    <RoomsActivityRowView
      currentPrincipalId={workspace.principal.id}
      row={{
        kind: "activity",
        key: activity.item.id,
        activity,
        register: roomsActivityRegister(activity.cardKind),
        showHeader: true,
      }}
    />
  );
}

function ChannelComposer({
  canSend,
  channel,
  onSent,
  roomId,
}: {
  readonly canSend: boolean;
  readonly channel: RoomsLocalChannel;
  readonly onSent: () => Promise<void>;
  readonly roomId: string;
}) {
  const { sendLocalMessage } = useRoomsDataSource();
  const channelComposerSendShortcut = useClientSettings(
    (settings) => settings.channelComposerSendShortcut,
  );
  const isMobileViewport = useMediaQuery("max-sm");
  const [draft, setDraft] = useState("");
  const [command, setCommand] = useState<StableRoomsCommand<string> | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (
      !canSubmitStableRoomsCommand({
        authorized: canSend,
        isPending: pendingRef.current,
        payload: draft,
      }) ||
      !tryStartStableRoomsSubmission(pendingRef)
    ) {
      return;
    }
    const next = prepareStableRoomsCommand(command, draft, createLowercaseUuidV7);
    setCommand(next);
    setPending(true);
    setError(null);
    try {
      await sendLocalMessage(roomId, channel.id, {
        requestId: next.requestId,
        bodyMarkdown: next.payload,
      });
      await onSent();
      setDraft("");
      setCommand(null);
    } catch (cause) {
      setError(
        isRoomsLocalClientError(cause)
          ? { code: cause.code, message: cause.message }
          : { code: "unexpected_message_error", message: "Could not send this message." },
      );
    } finally {
      finishStableRoomsSubmission(pendingRef);
      setPending(false);
    }
  };

  return (
    <form
      className="border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6"
      data-rooms-channel-composer=""
      onSubmit={(event) => void submit(event)}
    >
      <Textarea
        aria-label={`Message ${channel.name}`}
        disabled={pending || !canSend}
        maxLength={10_000}
        onChange={(event) => {
          setDraft(event.target.value);
          setCommand(null);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            shouldSubmitComposerOnEnter({
              ctrlKey: event.ctrlKey,
              draft,
              isComposing: event.nativeEvent.isComposing,
              isMobileViewport,
              keyCode: event.nativeEvent.keyCode,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
              shortcut: channelComposerSendShortcut,
            })
          ) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={canSend ? `Message ${channel.name}` : "Message creation is not authorized"}
        value={draft}
      />
      <div className="mt-2 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Markdown supported ·{" "}
          {channelComposerSendShortcut === "modifier_always" ||
          (channelComposerSendShortcut === "modifier_when_multiline" && draft.includes("\n"))
            ? "⌘/Ctrl Enter to send"
            : "Enter to send · Shift Enter for newline"}
        </p>
        <Button disabled={pending || !canSend || draft.trim() === ""} size="sm" type="submit">
          <SendIcon aria-hidden />
          {pending ? "Sending…" : command ? "Retry" : "Send"}
        </Button>
      </div>
      {!canSend ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          This principal does not have message.create capability.
        </p>
      ) : null}
      {error ? (
        <div
          aria-live="polite"
          className="mt-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive"
        >
          <p>{error.message}</p>
          <code className="mt-1 block text-[10px]">{error.code}</code>
        </div>
      ) : null}
    </form>
  );
}

function SelectedMessageStoryPanel({
  activity,
  canCreateStory,
  onDismiss,
  roomId,
}: {
  readonly activity: RoomsProjectedActivity;
  readonly canCreateStory: boolean;
  readonly onDismiss: () => void;
  readonly roomId: string;
}) {
  const { createLocalStory } = useRoomsDataSource();
  const [title, setTitle] = useState(activity.item.summary.slice(0, 200));
  const [command, setCommand] = useState<StableRoomsCommand<string> | null>(null);
  const [pending, setPending] = useState(false);
  const [createdStoryId, setCreatedStoryId] = useState<string | null>(null);
  const [error, setError] = useState<{ readonly code: string; readonly message: string } | null>(
    null,
  );

  useEffect(() => {
    setTitle(activity.item.summary.slice(0, 200));
    setCommand(null);
    setCreatedStoryId(null);
    setError(null);
  }, [activity.item.id, activity.item.summary]);

  const createUnlinkedStory = async () => {
    if (!canCreateStory || title.trim() === "" || pending) return;
    setPending(true);
    setError(null);
    try {
      const next = prepareStableRoomsCommand(command, title, createLowercaseUuidV7);
      setCommand(next);
      const result = await createLocalStory(roomId, {
        requestId: next.requestId,
        title: next.payload,
        storyType: "feature",
      });
      setCommand(null);
      setCreatedStoryId(result.value.id);
    } catch (cause) {
      setError(
        isRoomsLocalClientError(cause)
          ? { code: cause.code, message: cause.message }
          : { code: "unexpected_story_error", message: "Could not create the story." },
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <aside
      className="border-t border-border bg-muted/15 px-4 py-3 sm:px-6"
      data-rooms-selected-message={activity.item.id}
    >
      <div className="mx-auto max-w-4xl rounded-xl border border-amber-500/30 bg-card p-4">
        <div className="flex items-start gap-3">
          <GitBranchIcon className="mt-0.5 size-4 text-amber-500" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Shape a story from this message
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Message-to-story linkage is not exposed by the current server contract. You can
                  use the message as a title, but the resulting story will be explicitly unlinked.
                </p>
              </div>
              <Button
                aria-label="Clear selected message"
                className="ml-auto"
                onClick={onDismiss}
                size="icon-xs"
                variant="ghost"
              >
                <XIcon />
              </Button>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                aria-label="Story title"
                disabled={pending || createdStoryId !== null}
                maxLength={200}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setCommand(null);
                  setError(null);
                }}
                value={title}
              />
              <Button
                disabled={
                  !canCreateStory || pending || createdStoryId !== null || title.trim() === ""
                }
                onClick={() => void createUnlinkedStory()}
                variant="outline"
              >
                {pending ? "Creating…" : createdStoryId ? "Story created" : "Create without link"}
              </Button>
            </div>
            {createdStoryId ? (
              <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                Created {createdStoryId}. The source message was not linked.
              </p>
            ) : null}
            {!canCreateStory ? (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                This principal does not have work.create capability.
              </p>
            ) : null}
            {error ? (
              <p className="mt-2 text-xs text-destructive">
                {error.message} <code>{error.code}</code>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function RoomsLocalChannelFeed({
  channel,
  workspace,
}: {
  readonly channel: RoomsLocalChannel;
  readonly workspace: RoomsInteractiveWorkspace;
}) {
  const { loadLocalFeed, localFeedInvalidationGeneration, localFeedRefreshGeneration } =
    useRoomsDataSource();
  const [feed, setFeed] = useState<RoomsLocalFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedInvalidated, setFeedInvalidated] = useState(false);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const loadGeneration = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activities = useMemo(
    () => projectRoomsLocalActivityItems(workspace, feed?.items ?? []),
    [feed?.items, workspace],
  );
  const selectedActivity =
    activities.find((activity) => activity.item.id === selectedActivityId) ?? null;
  useRoomsFeedAutoScroll(scrollRef, activities.length);

  const reload = useCallback(
    async (loadCompleteSnapshot = false) => {
      const generation = ++loadGeneration.current;
      setLoading(true);
      setError(null);
      try {
        const pages: RoomsLocalFeed[] = [
          await loadLocalFeed(workspace.room.id, channel.id, { limit: 100 }),
        ];
        if (loadCompleteSnapshot) {
          while (pages.at(-1)?.page_info.has_more) {
            const previous = pages.at(-1)!;
            pages.push(
              await loadLocalFeed(workspace.room.id, channel.id, {
                afterSeq: previous.page_info.next_cursor,
                limit: 100,
                snapshotHeadSeq: pages[0]!.page_info.snapshot_head_seq,
              }),
            );
          }
        }
        if (!isCurrentRoomsLocalFeedRequest(generation, loadGeneration.current)) return;
        setFeed(mergeRoomsLocalFeedPages(pages));
        setFeedInvalidated(false);
      } catch (cause) {
        if (!isCurrentRoomsLocalFeedRequest(generation, loadGeneration.current)) return;
        setError(
          isRoomsLocalClientError(cause)
            ? { code: cause.code, message: cause.message }
            : { code: "unexpected_feed_error", message: "Could not load this channel feed." },
        );
      } finally {
        if (isCurrentRoomsLocalFeedRequest(generation, loadGeneration.current)) setLoading(false);
      }
    },
    [channel.id, loadLocalFeed, workspace.room.id],
  );

  useEffect(() => {
    void reload();
    return () => {
      loadGeneration.current += 1;
    };
  }, [reload]);

  useEffect(() => {
    if (localFeedInvalidationGeneration === 0) return;
    loadGeneration.current += 1;
    setLoadingMore(false);
    setFeedInvalidated(true);
  }, [localFeedInvalidationGeneration]);

  useEffect(() => {
    if (localFeedRefreshGeneration === 0) return;
    void reload();
  }, [localFeedRefreshGeneration, reload]);

  const loadMore = async () => {
    if (!feed?.page_info.has_more || feedInvalidated || loadingMore) return;
    const generation = loadGeneration.current;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await loadLocalFeed(workspace.room.id, channel.id, {
        afterSeq: feed.page_info.next_cursor,
        limit: feed.page_info.limit,
        snapshotHeadSeq: feed.page_info.snapshot_head_seq,
      });
      if (!isCurrentRoomsLocalFeedRequest(generation, loadGeneration.current)) return;
      setFeed(mergeRoomsLocalFeedPages([feed, next]));
    } catch (cause) {
      if (!isCurrentRoomsLocalFeedRequest(generation, loadGeneration.current)) return;
      setError(
        isRoomsLocalClientError(cause)
          ? { code: cause.code, message: cause.message }
          : { code: "unexpected_feed_error", message: "Could not load the next feed page." },
      );
    } finally {
      if (isCurrentRoomsLocalFeedRequest(generation, loadGeneration.current)) {
        setLoadingMore(false);
      }
    }
  };

  return (
    <section
      className="flex h-full min-h-0 flex-1 flex-col"
      data-rooms-local-channel={channel.slug}
    >
      <div className="min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
        <main className="mx-auto flex min-h-full w-full max-w-4xl flex-col p-5 sm:p-8">
          <header className="mb-5 border-b border-border pb-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/45">
                <HashIcon aria-hidden className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-foreground">
                  {roomsChannelDisplayName(channel.name)}
                </h1>
                {channel.purpose ? (
                  <p className="mt-1 text-sm text-muted-foreground">{channel.purpose}</p>
                ) : null}
              </div>
            </div>
          </header>

          {loading && feed === null ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <RefreshCwIcon
                aria-hidden
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Loading channel feed…
            </div>
          ) : error && feed === null ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/8 p-6">
              <AlertTriangleIcon aria-hidden className="size-5 text-destructive" />
              <h2 className="mt-3 font-semibold text-foreground">Could not load this channel</h2>
              <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
              <code className="mt-2 block text-[10px] text-muted-foreground">{error.code}</code>
              <Button className="mt-4" onClick={() => void reload()} size="sm" variant="outline">
                Retry
              </Button>
            </div>
          ) : feed?.items.length === 0 ? (
            <div className="mt-auto rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
              <InboxIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-semibold text-foreground">No messages yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This is a ready, durable channel. Start the discussion below.
              </p>
            </div>
          ) : (
            <div className="mt-auto">
              <RoomsActivityFeed
                activities={activities}
                currentPrincipalId={workspace.principal.id}
                label={`Ordered ${roomsChannelDisplayName(channel.name)} messages`}
                onActivitySelect={(activity) => setSelectedActivityId(activity.item.id)}
                selectedActivityId={selectedActivityId}
              />
            </div>
          )}

          {feed?.page_info.has_more && !feedInvalidated ? (
            <div className="mt-5 flex justify-center">
              <Button disabled={loadingMore} onClick={() => void loadMore()} variant="outline">
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
          {error && feed !== null ? (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive">
              {error.message} <code className="text-[10px]">{error.code}</code>
            </div>
          ) : null}
        </main>
      </div>
      {selectedActivity ? (
        <SelectedMessageStoryPanel
          activity={selectedActivity}
          canCreateStory={
            "work.create" in workspace.capabilities && workspace.capabilities["work.create"]
          }
          onDismiss={() => setSelectedActivityId(null)}
          roomId={workspace.room.id}
        />
      ) : null}
      <ChannelComposer
        canSend={workspace.capabilities["message.create"]}
        channel={channel}
        onSent={() => reload(true)}
        roomId={workspace.room.id}
      />
    </section>
  );
}

export function RoomsLocalChannelSurface({
  channelSlug,
  workspace,
}: {
  readonly channelSlug: string;
  readonly workspace: RoomsInteractiveWorkspace;
}) {
  const channel = workspace.channels.find((candidate) => candidate.slug === channelSlug);
  const { retryLocalWorkspace } = useRoomsDataSource();
  if (!workspace.capabilities["channel.read"]) {
    return (
      <section className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-7 text-center">
          <AlertTriangleIcon
            aria-hidden
            className="mx-auto size-6 text-amber-600 dark:text-amber-400"
          />
          <h1 className="mt-4 text-lg font-semibold text-foreground">Channel access unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This principal does not have channel.read capability.
          </p>
          <code className="mt-2 block text-[10px] text-muted-foreground">capability_denied</code>
        </div>
      </section>
    );
  }
  if (!channel) {
    return (
      <section className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-7 text-center">
          <AlertTriangleIcon
            aria-hidden
            className="mx-auto size-6 text-amber-600 dark:text-amber-400"
          />
          <h1 className="mt-4 text-lg font-semibold text-foreground">Channel not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            # {channelSlug} is not declared in the server workspace.
          </p>
          <Button className="mt-4" onClick={() => void retryLocalWorkspace()} variant="outline">
            Refresh workspace
          </Button>
        </div>
      </section>
    );
  }
  return <RoomsLocalChannelFeed channel={channel} workspace={workspace} />;
}
