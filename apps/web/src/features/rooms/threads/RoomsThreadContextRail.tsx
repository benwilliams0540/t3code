import * as Schema from "effect/Schema";
import {
  ExternalLinkIcon,
  FileCheck2Icon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  ServerIcon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { Button } from "~/components/ui/button";
import { useLocalStorage } from "~/hooks/useLocalStorage";

import { useRoomsDataSource } from "../dataSource";
import { isRoomsLocalStoryV2 } from "../dataSource/localStoriesContract";
import { localStoryNextAction, localStoryOwnerId } from "../stories/presentation";
import { useRoomsStories } from "../stories/useRoomsStories";
import {
  findRoomsContextStory,
  ROOMS_CONTEXT_RAIL_OPEN_STORAGE_KEY,
  toggleRoomsContextRail,
} from "./contextRailState";

export function RoomsThreadContextRail({
  environmentId,
  projectId,
  providerInstanceId,
  roomId,
  roomSlug,
  status,
  threadId,
}: {
  readonly environmentId: string;
  readonly projectId: string;
  readonly providerInstanceId: string;
  readonly roomId: string;
  readonly roomSlug: string;
  readonly status: string;
  readonly threadId: string;
}) {
  const navigate = useNavigate();
  const { state } = useRoomsDataSource();
  const { error, loading, stories } = useRoomsStories(roomId);
  const [open, setOpen] = useLocalStorage(
    ROOMS_CONTEXT_RAIL_OPEN_STORAGE_KEY,
    true,
    Schema.Boolean,
  );
  const story = findRoomsContextStory(stories, { environmentId, projectId, threadId });
  const ownerId = story ? localStoryOwnerId(story) : null;
  const workspace = state.status === "ready" && state.mode !== "sample" ? state.workspace : null;
  const ownerName = (() => {
    if (!ownerId || !workspace) return ownerId;
    if (workspace.principal.id === ownerId)
      return workspace.principal.display_name ?? "Current person";
    if ("principals" in workspace) {
      return (
        workspace.principals.find((principal) => principal.id === ownerId)?.display_name ?? ownerId
      );
    }
    return ownerId;
  })();
  const evidence = story && isRoomsLocalStoryV2(story) ? story.evidence : [];

  if (!open) {
    return (
      <Button
        aria-label="Open Room context"
        className="absolute right-3 top-3 z-50 shadow-sm"
        onClick={() => setOpen(toggleRoomsContextRail(open))}
        size="sm"
        variant="outline"
      >
        <PanelRightOpenIcon /> Room context
      </Button>
    );
  }

  return (
    <aside
      aria-label="Room context"
      className="z-40 flex w-[21rem] shrink-0 flex-col overflow-y-auto border-l border-border bg-background p-4 max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:w-[min(21rem,calc(100%-2rem))] max-lg:shadow-2xl"
      data-rooms-thread-context="open"
    >
      <header className="flex items-center gap-2">
        <h2 className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Room context
        </h2>
        <Button
          aria-label="Close Room context"
          className="ml-auto"
          onClick={() => setOpen(toggleRoomsContextRail(open))}
          size="icon-xs"
          variant="ghost"
        >
          <PanelRightCloseIcon />
        </Button>
      </header>

      {loading && !story ? (
        <p className="mt-5 text-sm text-muted-foreground">Loading associated story…</p>
      ) : null}
      {error ? (
        <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/8 p-3 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      {!loading && !error && !story ? (
        <section className="mt-5 rounded-xl border border-dashed border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">No associated story</h3>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            This exact native environment, project, and thread identity is not linked by the current
            story records.
          </p>
        </section>
      ) : null}
      {story ? (
        <section className="mt-5 rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{story.stage.replaceAll("-", " ")}</p>
          <h3 className="mt-2 text-sm font-semibold text-foreground">{story.title}</h3>
          <p className="mt-2 text-xs text-muted-foreground">
            {ownerName ? `${ownerName} owns` : "Unassigned"} · {evidence.length} evidence
          </p>
          <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">
            {localStoryNextAction(story)}
          </p>
          <Button
            className="mt-4"
            onClick={() =>
              void navigate({
                to: "/rooms/$roomSlug/project/$projectSection",
                params: { roomSlug, projectSection: "stories" },
              })
            }
            size="sm"
            variant="outline"
          >
            Open story <ExternalLinkIcon />
          </Button>
        </section>
      ) : null}

      <section className="mt-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <FileCheck2Icon className="size-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            What this thread produced
          </h3>
        </div>
        {evidence.length > 0 ? (
          <div className="mt-3 grid gap-2">
            <p className="text-[11px] font-medium text-muted-foreground">Already attached</p>
            {evidence.map((record) => (
              <div className="rounded-lg border border-border bg-muted/15 p-3" key={record.id}>
                <p className="text-xs font-medium text-foreground">{record.note ?? record.kind}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {record.kind} · {record.cas.bytes} bytes
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            No evidence is attached to the associated story.
          </p>
        )}
        <div className="mt-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-xs font-medium text-foreground">New selections · 0</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            The native thread contract does not expose a selectable output inventory or
            output-to-CAS provenance. No output is counted or attached speculatively.
          </p>
        </div>
        <Button className="mt-3 w-full" disabled size="sm">
          Add 0 as evidence
        </Button>
      </section>

      <section className="mt-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <ServerIcon className="size-4 text-muted-foreground" />
          <h3 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Where this ran
          </h3>
        </div>
        <dl className="mt-3 grid gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Provider</dt>
            <dd className="mt-0.5 break-all text-foreground">{providerInstanceId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Status</dt>
            <dd className="mt-0.5 text-foreground">{status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Project</dt>
            <dd className="mt-0.5 break-all font-mono text-[10px] text-foreground">{projectId}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Thread</dt>
            <dd className="mt-0.5 break-all font-mono text-[10px] text-foreground">{threadId}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
