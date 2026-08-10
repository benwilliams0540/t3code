import {
  ArrowRightIcon,
  CircleAlertIcon,
  FileTextIcon,
  HistoryIcon,
  LayoutDashboardIcon,
} from "lucide-react";
import { useMemo } from "react";

import { Button } from "~/components/ui/button";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { formatRelativeTimeLabel } from "~/timestampFormat";

import type { RoomsSourceRoom } from "../dataSource";
import type { RoomsInteractiveWorkspace } from "../dataSource/humanSharedContract";
import type { RoomsLocalStory } from "../dataSource/localStoriesContract";
import { isRoomsLocalStoryV2 } from "../dataSource/localStoriesContract";
import type { RoomsWorkspaceNavigate } from "../shell/RoomsWorkspaceNavigation";
import {
  localStoryNeedsCurrentHuman,
  localStoryNextAction,
  localStoryOwnerId,
  localStoryStageCounts,
  localStoryStageLabel,
  localStoryUpdatedAt,
} from "../stories/presentation";
import { useRoomsStories } from "../stories/useRoomsStories";
import { useRoomProjectBindings } from "../threads/roomProjectBindings";
import { resolveLocalStoryNativeThread } from "../stories/RoomsLocalStories";
import { selectRoomsNativeThreadEntries } from "../threads/roomsNativeThreads";
import { RoomsProjectBindingMenu } from "../threads/RoomsThreadNavigation";

function principalName(workspace: RoomsInteractiveWorkspace, principalId: string): string {
  if (workspace.principal.id === principalId) {
    return workspace.principal.display_name ?? "Current person";
  }
  if ("principals" in workspace) {
    return (
      workspace.principals.find((principal) => principal.id === principalId)?.display_name ??
      principalId
    );
  }
  return principalId;
}

function AttentionItem({
  story,
  workspace,
}: {
  readonly story: RoomsLocalStory;
  readonly workspace: RoomsInteractiveWorkspace;
}) {
  const ownerId = localStoryOwnerId(story);
  return (
    <article className="border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-amber-400" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{story.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {ownerId ? `${principalName(workspace, ownerId)} owns this. ` : "Unassigned. "}
            {localStoryNextAction(story)}
          </p>
        </div>
      </div>
    </article>
  );
}

export function RoomsInteractiveDashboard({
  navigate,
  room,
  workspace,
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly room: RoomsSourceRoom;
  readonly workspace: RoomsInteractiveWorkspace;
}) {
  const { error, loading, stories } = useRoomsStories(room.id);
  const { boundProjectRefs, boundProjects } = useRoomProjectBindings(room.id, room.sourceMode);
  const shells = useThreadShellsForProjectRefs(boundProjectRefs);
  const threads = useMemo(
    () => selectRoomsNativeThreadEntries(shells, boundProjects),
    [boundProjects, shells],
  );
  const counts = localStoryStageCounts(stories);
  const currentPrincipalId = workspace.principal.id;
  const needsYou = stories.filter((story) => {
    if (localStoryNeedsCurrentHuman(story, currentPrincipalId)) return true;
    const ownerId = localStoryOwnerId(story);
    const thread = resolveLocalStoryNativeThread(story, threads);
    return (
      ownerId === currentPrincipalId && story.native_thread !== null && thread?.status === "failed"
    );
  });
  const active = stories
    .filter((story) => story.stage !== "backlog" && story.stage !== "done")
    .sort((left, right) => localStoryUpdatedAt(right).localeCompare(localStoryUpdatedAt(left)));
  const activity = stories
    .flatMap((story) =>
      isRoomsLocalStoryV2(story) ? story.audit.map((entry) => ({ entry, story })) : [],
    )
    .sort((left, right) => right.entry.occurred_at.localeCompare(left.entry.occurred_at))
    .slice(0, 8);

  return (
    <section
      className="mx-auto w-full max-w-[1280px] p-5 sm:p-8"
      data-rooms-interactive-dashboard=""
    >
      <header className="flex flex-wrap items-start gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {room.sourceMode === "shared" ? "Shared room" : "Local workspace"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {room.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {needsYou.length} {needsYou.length === 1 ? "thing needs" : "things need"} you ·{" "}
            {counts.get("done")} done · {activity.length} recent durable events
          </p>
        </div>
        <Button
          className="ml-auto"
          onClick={() => navigate({ kind: "project", projectSection: "stories" })}
          variant="outline"
        >
          Open stories <ArrowRightIcon />
        </Button>
      </header>

      {boundProjects.length === 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-amber-800 dark:text-amber-200">
            Bind a T3 project to resolve native threads and execution status in this room.
          </p>
          <RoomsProjectBindingMenu compact={false} roomId={room.id} sourceMode={room.sourceMode} />
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/8 p-4 text-sm text-destructive">
          {error.message} <code className="text-[10px]">{error.code}</code>
        </div>
      ) : null}
      {loading && stories.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground" role="status">
          Loading dashboard…
        </p>
      ) : (
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.8fr)]">
          <div className="grid content-start gap-5">
            <section className="overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/[0.04]">
              <header className="flex items-center gap-2 border-b border-amber-500/20 px-4 py-3">
                <CircleAlertIcon className="size-4 text-amber-500" />
                <h2 className="text-xs font-semibold tracking-[0.1em] text-amber-700 uppercase dark:text-amber-300">
                  Needs you
                </h2>
                <span className="ml-auto text-xs text-amber-700 dark:text-amber-300">
                  {needsYou.length}
                </span>
              </header>
              {needsYou.length > 0 ? (
                needsYou.map((story) => (
                  <AttentionItem key={story.id} story={story} workspace={workspace} />
                ))
              ) : (
                <p className="px-4 py-5 text-sm text-muted-foreground">
                  Nothing currently requires your review or recovery.
                </p>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center">
                <h2 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  Active work
                </h2>
                <button
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => navigate({ kind: "project", projectSection: "stories" })}
                  type="button"
                >
                  All stories →
                </button>
              </div>
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {active.length > 0 ? (
                  active.map((story) => {
                    const ownerId = localStoryOwnerId(story);
                    const thread = resolveLocalStoryNativeThread(story, threads);
                    return (
                      <article
                        className="border-b border-border px-4 py-3 last:border-b-0"
                        key={story.id}
                      >
                        <div className="flex items-start gap-3">
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-400" />
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-semibold text-foreground">{story.title}</h3>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {localStoryStageLabel(story.stage)} ·{" "}
                              {ownerId ? principalName(workspace, ownerId) : "Unassigned"} ·{" "}
                              {thread
                                ? `thread ${thread.status}`
                                : story.native_thread
                                  ? "thread missing"
                                  : "no thread"}
                            </p>
                          </div>
                          <time
                            className="text-xs text-muted-foreground"
                            dateTime={localStoryUpdatedAt(story)}
                          >
                            {formatRelativeTimeLabel(localStoryUpdatedAt(story))}
                          </time>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <p className="px-4 py-5 text-sm text-muted-foreground">
                    No work is currently in progress or review.
                  </p>
                )}
              </div>
            </section>
          </div>

          <div className="grid content-start gap-5">
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <FileTextIcon className="size-4 text-muted-foreground" />
                <h2 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  Current vision
                </h2>
              </div>
              <h3 className="mt-3 font-semibold text-foreground">Revision data unavailable</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The current {room.sourceMode === "shared" ? "human-shared" : "local"} contract does
                not expose vision revisions, provenance, or freshness. Rooms will not substitute a
                bundled document for server truth.
              </p>
              <Button
                className="mt-4"
                onClick={() => navigate({ kind: "project", projectSection: "vision" })}
                size="sm"
                variant="outline"
              >
                Open vision status
              </Button>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <LayoutDashboardIcon className="size-4 text-muted-foreground" />
                <h2 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  Momentum
                </h2>
              </div>
              <dl className="mt-4 grid gap-3 text-sm">
                {(["done", "human-qa", "in-progress", "backlog"] as const).map((stage) => (
                  <div className="flex items-center" key={stage}>
                    <dt className="text-muted-foreground">{localStoryStageLabel(stage)}</dt>
                    <dd className="ml-auto font-semibold text-foreground">{counts.get(stage)}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <HistoryIcon className="size-4 text-muted-foreground" />
                <h2 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                  Recent activity
                </h2>
              </div>
              <ol className="mt-3 grid gap-3">
                {activity.length > 0 ? (
                  activity.map(({ entry, story }) => (
                    <li
                      className="border-b border-border pb-3 text-sm last:border-b-0 last:pb-0"
                      key={entry.source_event.event_id}
                    >
                      <p className="text-foreground">
                        {entry.source_event.type.replaceAll(".", " ")} · {story.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {principalName(workspace, entry.actor)} ·{" "}
                        {formatRelativeTimeLabel(entry.occurred_at)}
                      </p>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-muted-foreground">No story activity yet.</li>
                )}
              </ol>
            </section>
          </div>
        </div>
      )}
    </section>
  );
}
