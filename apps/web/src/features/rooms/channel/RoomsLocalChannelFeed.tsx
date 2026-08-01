import { AlertTriangleIcon, HashIcon, InboxIcon, RefreshCwIcon, SendIcon } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

import { useRoomsDataSource } from "../dataSource";
import { isRoomsLocalClientError, RoomsLocalClientError } from "../dataSource/localChannelsClient";
import type {
  RoomsLocalChannel,
  RoomsLocalFeed,
  RoomsLocalFeedItem,
  RoomsLocalWorkspace,
} from "../dataSource/localChannelsContract";
import { createLowercaseUuidV7 } from "../dataSource/uuidV7";
import {
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

export function RoomsLocalFeedItemCard({
  item,
  workspace,
}: {
  item: RoomsLocalFeedItem;
  workspace: RoomsLocalWorkspace;
}) {
  const displayName =
    item.attribution.writer_principal_id === workspace.principal.id
      ? workspace.principal.display_name
      : item.attribution.writer_principal_id;
  if (item.kind === "unknown_schema") {
    return (
      <article className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangleIcon aria-hidden className="size-4" />
          Unsupported channel event
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{item.summary}</p>
        <p className="mt-2 font-mono text-[10px] text-muted-foreground">
          {item.payload.event_type} schema {item.payload.event_schema} · seq {item.source_event.seq}
        </p>
      </article>
    );
  }
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-sm font-semibold text-foreground">{displayName}</p>
        <code className="text-[10px] text-muted-foreground">
          {item.attribution.writer_principal_id}
        </code>
        <span className="ml-auto text-[10px] text-muted-foreground">
          seq {item.source_event.seq}
        </span>
      </div>
      <div className="prose prose-sm mt-3 max-w-none text-foreground dark:prose-invert">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.payload.body_markdown}</ReactMarkdown>
      </div>
    </article>
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
  const [draft, setDraft] = useState("");
  const [command, setCommand] = useState<StableRoomsCommand<string> | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend || draft.trim() === "" || !tryStartStableRoomsSubmission(pendingRef)) return;
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
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={canSend ? `Message ${channel.name}` : "Message creation is not authorized"}
        value={draft}
      />
      <div className="mt-2 flex items-center gap-3">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Markdown supported · ⌘ Enter to send
        </p>
        <Button disabled={pending || !canSend || draft.trim() === ""} size="sm" type="submit">
          <SendIcon aria-hidden />
          {pending ? "Sending…" : command ? "Retry" : "Send"}
        </Button>
      </div>
      {!canSend ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          This Local principal does not have message.create capability.
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

export function RoomsLocalChannelFeed({
  channel,
  workspace,
}: {
  readonly channel: RoomsLocalChannel;
  readonly workspace: RoomsLocalWorkspace;
}) {
  const { loadLocalFeed } = useRoomsDataSource();
  const [feed, setFeed] = useState<RoomsLocalFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const loadGeneration = useRef(0);

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
        if (generation !== loadGeneration.current) return;
        setFeed(mergeRoomsLocalFeedPages(pages));
      } catch (cause) {
        if (generation !== loadGeneration.current) return;
        setError(
          isRoomsLocalClientError(cause)
            ? { code: cause.code, message: cause.message }
            : { code: "unexpected_feed_error", message: "Could not load this channel feed." },
        );
      } finally {
        if (generation === loadGeneration.current) setLoading(false);
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

  const loadMore = async () => {
    if (!feed?.page_info.has_more || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await loadLocalFeed(workspace.room.id, channel.id, {
        afterSeq: feed.page_info.next_cursor,
        limit: feed.page_info.limit,
        snapshotHeadSeq: feed.page_info.snapshot_head_seq,
      });
      setFeed(mergeRoomsLocalFeedPages([feed, next]));
    } catch (cause) {
      setError(
        isRoomsLocalClientError(cause)
          ? { code: cause.code, message: cause.message }
          : { code: "unexpected_feed_error", message: "Could not load the next feed page." },
      );
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <section
      className="flex h-full min-h-0 flex-1 flex-col"
      data-rooms-local-channel={channel.slug}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto w-full max-w-4xl p-5 sm:p-8">
          <header className="mb-5 border-b border-border pb-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/45">
                <HashIcon aria-hidden className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-foreground">{channel.name}</h1>
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
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
              <InboxIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
              <h2 className="mt-4 text-lg font-semibold text-foreground">No messages yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                This is a ready, durable channel. Start the discussion below.
              </p>
            </div>
          ) : (
            <ol aria-label={`Ordered ${channel.name} messages`} className="grid gap-3">
              {feed?.items.map((item) => (
                <li key={item.id}>
                  <RoomsLocalFeedItemCard item={item} workspace={workspace} />
                </li>
              ))}
            </ol>
          )}

          {feed?.page_info.has_more ? (
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
  readonly workspace: RoomsLocalWorkspace;
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
            This Local principal does not have channel.read capability.
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
