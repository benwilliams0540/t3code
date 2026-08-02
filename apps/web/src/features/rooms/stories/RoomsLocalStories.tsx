import {
  AlertTriangleIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  LinkIcon,
  PlusIcon,
  RefreshCwIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { formatRelativeTimeLabel } from "~/timestampFormat";

import { useRoomsDataSource } from "../dataSource";
import { isRoomsLocalClientError } from "../dataSource/localChannelsClient";
import type {
  RoomsLocalStoriesResponse,
  RoomsLocalStory,
} from "../dataSource/localStoriesContract";
import { createLowercaseUuidV7 } from "../dataSource/uuidV7";
import {
  finishStableRoomsSubmission,
  prepareStableRoomsCommand,
  tryStartStableRoomsSubmission,
  type StableRoomsCommand,
} from "../channel/stableCommand";
import type { RoomsWorkspaceNavigate } from "../shell/RoomsWorkspaceNavigation";
import { RoomsThreadStatus } from "../threads/RoomsThreadNavigation";
import { useRoomProjectBindings } from "../threads/roomProjectBindings";
import {
  selectRoomsNativeThreadEntries,
  type RoomsNativeThreadEntry,
} from "../threads/roomsNativeThreads";

interface LocalStoryError {
  readonly code: string;
  readonly message: string;
}

function localStoryError(
  cause: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): LocalStoryError {
  return isRoomsLocalClientError(cause)
    ? { code: cause.code, message: cause.message }
    : { code: fallbackCode, message: fallbackMessage };
}

export function resolveLocalStoryNativeThread(
  story: RoomsLocalStory,
  threads: readonly RoomsNativeThreadEntry[],
): RoomsNativeThreadEntry | null {
  const linked = story.native_thread;
  if (!linked) return null;
  return (
    threads.find(
      (thread) =>
        thread.environmentId === linked.environment_id &&
        thread.projectId === linked.project_id &&
        thread.threadId === linked.thread_id,
    ) ?? null
  );
}

export function localStoryNativeThreadTarget(thread: RoomsNativeThreadEntry) {
  return {
    kind: "native-thread" as const,
    environmentId: thread.environmentId,
    threadId: thread.threadId,
  };
}

export function RoomsLocalLinkedThreadStatus({
  navigate,
  resolvedThread,
  story,
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly resolvedThread: RoomsNativeThreadEntry | null;
  readonly story: RoomsLocalStory;
}) {
  if (!story.native_thread) return null;
  if (!resolvedThread) {
    return (
      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200">
        <p className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangleIcon className="size-4" />
          Linked thread unavailable or stale
        </p>
        <code className="mt-2 block break-all text-[10px]">
          {story.native_thread.environment_id}/{story.native_thread.project_id}/
          {story.native_thread.thread_id}
        </code>
        <p className="mt-2 text-xs">
          This durable association does not currently resolve to an actual thread shell in a bound
          project. No fallback thread was opened.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{resolvedThread.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {resolvedThread.projectTitle} · provider {resolvedThread.providerInstanceId}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {resolvedThread.status === "ready" ? (
              <span data-rooms-story-thread-status="ready">Resting</span>
            ) : (
              <RoomsThreadStatus thread={resolvedThread} />
            )}
            <span>as of {formatRelativeTimeLabel(resolvedThread.updatedAt)}</span>
          </div>
        </div>
        <Button
          onClick={() => navigate(localStoryNativeThreadTarget(resolvedThread))}
          size="sm"
          variant="outline"
        >
          <ExternalLinkIcon />
          Open thread
        </Button>
      </div>
    </div>
  );
}

export function RoomsLocalStoriesEmptyState() {
  return (
    <div
      className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center"
      data-rooms-local-stories-empty=""
    >
      <GitBranchIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
      <h2 className="mt-4 text-base font-semibold text-foreground">No Local stories yet</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Create the first durable story, then associate it with one actual thread from a bound T3
        project.
      </p>
    </div>
  );
}

function RoomsCreateStoryDialog({
  authorized,
  onCreated,
  onOpenChange,
  open,
  roomId,
}: {
  readonly authorized: boolean;
  readonly onCreated: (story: RoomsLocalStory) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly roomId: string;
}) {
  const { createLocalStory } = useRoomsDataSource();
  const [title, setTitle] = useState("");
  const [command, setCommand] = useState<StableRoomsCommand<string> | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<LocalStoryError | null>(null);

  const reset = () => {
    setTitle("");
    setCommand(null);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!authorized || title.trim() === "" || !tryStartStableRoomsSubmission(pendingRef)) return;
    const next = prepareStableRoomsCommand(command, title, createLowercaseUuidV7);
    setCommand(next);
    setPending(true);
    setError(null);
    try {
      const result = await createLocalStory(roomId, {
        requestId: next.requestId,
        title: next.payload,
        storyType: "feature",
      });
      reset();
      onOpenChange(false);
      onCreated(result.value);
    } catch (cause) {
      setError(localStoryError(cause, "unexpected_story_error", "Could not create the story."));
    } finally {
      finishStableRoomsSubmission(pendingRef);
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && pending) return;
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogPopup className="max-w-md" showCloseButton={!pending}>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Create Local story</DialogTitle>
            <DialogDescription>
              Add one server-owned story at the initial backlog stage. You can link a native T3
              thread afterward.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="rooms-story-title">Title</Label>
              <Input
                autoFocus
                disabled={pending}
                id="rooms-story-title"
                maxLength={200}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setCommand(null);
                  setError(null);
                }}
                placeholder="Finish configurable composer send shortcuts"
                value={title}
              />
              <p className="text-xs text-muted-foreground">Type: feature · Workflow revision 1</p>
            </div>
            {error ? <RoomsLocalStoryError error={error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={!authorized || pending || title.trim() === ""} type="submit">
              {pending ? "Creating…" : command ? "Retry creation" : "Create story"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function RoomsLocalStoryError({ error }: { readonly error: LocalStoryError }) {
  return (
    <div
      aria-live="polite"
      className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive"
    >
      <p>{error.message}</p>
      <code className="mt-1 block text-[10px]">{error.code}</code>
    </div>
  );
}

function nativeThreadKey(thread: RoomsNativeThreadEntry): string {
  return JSON.stringify([thread.environmentId, thread.projectId, thread.threadId]);
}

function RoomsLocalStoryCard({
  canLink,
  navigate,
  onUpdated,
  roomId,
  story,
  threads,
}: {
  readonly canLink: boolean;
  readonly navigate: RoomsWorkspaceNavigate;
  readonly onUpdated: (story: RoomsLocalStory) => void;
  readonly roomId: string;
  readonly story: RoomsLocalStory;
  readonly threads: readonly RoomsNativeThreadEntry[];
}) {
  const { linkLocalStoryThread } = useRoomsDataSource();
  const resolvedThread = resolveLocalStoryNativeThread(story, threads);
  const [selectedKey, setSelectedKey] = useState("");
  const [command, setCommand] = useState<StableRoomsCommand<RoomsNativeThreadEntry> | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<LocalStoryError | null>(null);

  const link = async () => {
    const selected = threads.find((thread) => nativeThreadKey(thread) === selectedKey);
    if (!selected || !canLink || !tryStartStableRoomsSubmission(pendingRef)) return;
    const next = prepareStableRoomsCommand(command, selected, createLowercaseUuidV7);
    setCommand(next);
    setPending(true);
    setError(null);
    try {
      const result = await linkLocalStoryThread(roomId, story.id, {
        requestId: next.requestId,
        environmentId: next.payload.environmentId,
        projectId: next.payload.projectId,
        threadId: next.payload.threadId,
      });
      setCommand(null);
      onUpdated(result.value);
    } catch (cause) {
      setError(localStoryError(cause, "unexpected_link_error", "Could not link the T3 thread."));
    } finally {
      finishStableRoomsSubmission(pendingRef);
      setPending(false);
    }
  };

  return (
    <article
      className="rounded-2xl border border-border bg-card p-5"
      data-rooms-story-id={story.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {story.story_type} · workflow {story.workflow_version}
          </p>
          <h2 className="mt-1 text-base font-semibold text-foreground">{story.title}</h2>
        </div>
        <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground">
          {story.stage}
        </span>
      </div>

      {story.native_thread ? (
        <RoomsLocalLinkedThreadStatus
          navigate={navigate}
          resolvedThread={resolvedThread}
          story={story}
        />
      ) : (
        <div className="mt-5 grid gap-3 rounded-xl border border-dashed border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`rooms-story-thread-${story.id}`}>Actual bound T3 thread</Label>
            <select
              className="h-9 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground disabled:opacity-64"
              disabled={pending || threads.length === 0}
              id={`rooms-story-thread-${story.id}`}
              onChange={(event) => {
                setSelectedKey(event.target.value);
                setCommand(null);
                setError(null);
              }}
              value={selectedKey}
            >
              <option value="">Choose one actual thread</option>
              {threads.map((thread) => (
                <option key={nativeThreadKey(thread)} value={nativeThreadKey(thread)}>
                  {thread.title} · {thread.projectTitle}
                </option>
              ))}
            </select>
            {threads.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Bind a local T3 project with an active thread before linking.
              </p>
            ) : null}
          </div>
          <Button disabled={!canLink || pending || selectedKey === ""} onClick={() => void link()}>
            <LinkIcon />
            {pending ? "Linking…" : command ? "Retry link" : "Link thread"}
          </Button>
          {error ? (
            <div className="sm:col-span-2">
              <RoomsLocalStoryError error={error} />
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function RoomsLocalStoriesSurface({
  navigate,
  roomId,
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly roomId: string;
}) {
  const { loadLocalStories, localFeedRefreshGeneration } = useRoomsDataSource();
  const { boundProjectRefs, boundProjects } = useRoomProjectBindings(roomId, "local");
  const shells = useThreadShellsForProjectRefs(boundProjectRefs);
  const threads = useMemo(
    () => selectRoomsNativeThreadEntries(shells, boundProjects),
    [boundProjects, shells],
  );
  const [response, setResponse] = useState<RoomsLocalStoriesResponse | null>(null);
  const [error, setError] = useState<LocalStoryError | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const loadGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadLocalStories(roomId);
      if (generation === loadGeneration.current) setResponse(next);
    } catch (cause) {
      if (generation === loadGeneration.current) {
        setError(localStoryError(cause, "unexpected_story_load_error", "Could not load stories."));
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [loadLocalStories, roomId]);

  useEffect(() => {
    void refresh();
    return () => {
      loadGeneration.current += 1;
    };
  }, [localFeedRefreshGeneration, refresh]);

  const acceptStory = (story: RoomsLocalStory) => {
    setResponse((current) => {
      if (!current) return current;
      const stories = current.stories.some((candidate) => candidate.id === story.id)
        ? current.stories.map((candidate) => (candidate.id === story.id ? story : candidate))
        : [...current.stories, story];
      return { ...current, stories };
    });
    void refresh();
  };

  return (
    <section className="mx-auto w-full max-w-5xl p-5 sm:p-8" data-rooms-local-stories="">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Local durable work
          </p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">Stories</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Rooms owns story stage and association. T3 remains the source of live thread, provider,
            and execution status.
          </p>
        </div>
        <div className="flex gap-2">
          <Button disabled={loading} onClick={() => void refresh()} size="sm" variant="outline">
            <RefreshCwIcon />
            Refresh
          </Button>
          <Button
            disabled={!response?.capabilities["work.create"]}
            onClick={() => setCreateOpen(true)}
            size="sm"
          >
            <PlusIcon />
            Create story
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-6">
          <RoomsLocalStoryError error={error} />
        </div>
      ) : null}
      {loading && !response ? (
        <p className="mt-8 text-sm text-muted-foreground" role="status">
          Loading Local stories…
        </p>
      ) : response?.stories.length === 0 ? (
        <div className="mt-8">
          <RoomsLocalStoriesEmptyState />
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {response?.stories.map((story) => (
            <RoomsLocalStoryCard
              canLink={response.capabilities["work.link_thread"]}
              key={story.id}
              navigate={navigate}
              onUpdated={acceptStory}
              roomId={roomId}
              story={story}
              threads={threads}
            />
          ))}
        </div>
      )}

      <RoomsCreateStoryDialog
        authorized={response?.capabilities["work.create"] ?? false}
        onCreated={acceptStory}
        onOpenChange={setCreateOpen}
        open={createOpen}
        roomId={roomId}
      />
    </section>
  );
}
