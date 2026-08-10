import { Columns3Icon, ListChecksIcon, ListIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { cn } from "~/lib/utils";

import type { RoomsStory } from "../model/workspace";
import type { RoomsWorkspaceSlotProps } from "../shell/slots";
import { ROOMS_STORIES_VIEW_STORAGE_KEY, RoomsStoriesView } from "../stories/presentation";

function StorySummary({
  onSelect,
  props,
  selected,
  story,
}: {
  readonly onSelect: () => void;
  readonly props: RoomsWorkspaceSlotProps;
  readonly selected: boolean;
  readonly story: RoomsStory;
}) {
  const owner = props.fixture.principals.find((principal) => principal.id === story.owner_id);
  const stage = props.workspace.workflows
    .flatMap((workflow) => workflow.stages)
    .find((candidate) => candidate.id === story.stage_id);
  const thread = story.delegate
    ? props.workspace.threads.find((candidate) => candidate.id === story.delegate?.thread_id)
    : null;
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/25 hover:bg-muted/25",
        selected ? "border-foreground/35 bg-muted/25" : "border-border",
      )}
      data-story-id={story.id}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-blue-400" />
        {stage?.name ?? story.stage_id}
        <span className="ml-auto">{story.story_type}</span>
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">{story.title}</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        {owner?.display_name ?? story.owner_id} owns ·{" "}
        {thread ? `thread ${story.delegate?.run_status}` : "no thread"} ·{" "}
        {story.evidence_ids.length} evidence
      </p>
      <p className="mt-3 border-t border-border/70 pt-3 text-xs font-medium text-amber-700 dark:text-amber-300">
        {story.gate_state === "waiting_for_review"
          ? "Human review required"
          : story.gate_state === "waiting_for_evidence"
            ? "Qualifying evidence required"
            : stage?.key === "done"
              ? "Completed"
              : "Open story details"}
      </p>
    </button>
  );
}

function StoryDetail({ props, story }: { props: RoomsWorkspaceSlotProps; story: RoomsStory }) {
  const owner = props.fixture.principals.find((principal) => principal.id === story.owner_id);
  const stage = props.workspace.workflows
    .flatMap((workflow) => workflow.stages)
    .find((candidate) => candidate.id === story.stage_id);
  const thread = story.delegate
    ? props.workspace.threads.find((candidate) => candidate.id === story.delegate?.thread_id)
    : null;
  return (
    <article
      className="rounded-2xl border border-border bg-card p-5"
      data-rooms-sample-story-detail=""
    >
      <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {story.story_type} · workflow {story.workflow_version}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-foreground">{story.title}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {props.workspace.workflows
          .find((workflow) => workflow.id === story.workflow_id)
          ?.stages.map((candidate) => (
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs",
                candidate.id === story.stage_id
                  ? "border-amber-500/40 bg-amber-500/10 text-foreground"
                  : "border-border text-muted-foreground",
              )}
              key={candidate.id}
            >
              {candidate.name}
            </span>
          ))}
      </div>
      <dl className="mt-5 grid gap-3 rounded-xl border border-border bg-muted/15 p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Owner</dt>
          <dd className="mt-1 font-medium text-foreground">
            {owner?.display_name ?? story.owner_id}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Current stage</dt>
          <dd className="mt-1 font-medium text-foreground">{stage?.name ?? story.stage_id}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Delegated thread</dt>
          <dd className="mt-1 font-medium text-foreground">{thread?.title ?? "Not linked"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Gate</dt>
          <dd className="mt-1 font-medium text-foreground">
            {story.gate_state.replaceAll("_", " ")}
          </dd>
        </div>
      </dl>
      <section className="mt-5 rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">Evidence</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {story.evidence_ids.length} attached · gate requires{" "}
          {stage?.gate?.evidence.kinds.join(", ") || "none"}
        </p>
      </section>
    </article>
  );
}

export function RoomsStoriesList(props: RoomsWorkspaceSlotProps) {
  const { workspace } = props;
  const [view, setView] = useLocalStorage(
    ROOMS_STORIES_VIEW_STORAGE_KEY,
    "board",
    RoomsStoriesView,
  );
  const [selectedStoryId, setSelectedStoryId] = useState(workspace.stories[0]?.id ?? null);
  useEffect(() => {
    if (!workspace.stories.some((story) => story.id === selectedStoryId)) {
      setSelectedStoryId(workspace.stories[0]?.id ?? null);
    }
  }, [selectedStoryId, workspace.stories]);
  const selectedStory = workspace.stories.find((story) => story.id === selectedStoryId) ?? null;
  const stages = workspace.workflows[0]?.stages ?? [];

  return (
    <div className="min-h-full bg-background p-4 sm:p-6" data-rooms-project-section="stories">
      <header className="mb-5 flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Stories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ownership, delegated execution, evidence, and the next human action stay visible.
          </p>
        </div>
        <div className="ml-auto inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
          <Button
            aria-pressed={view === "board"}
            onClick={() => setView("board")}
            size="sm"
            variant={view === "board" ? "secondary" : "ghost"}
          >
            <Columns3Icon /> Board
          </Button>
          <Button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            size="sm"
            variant={view === "list" ? "secondary" : "ghost"}
          >
            <ListIcon /> List
          </Button>
        </div>
      </header>
      {workspace.stories.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-border p-10 text-center"
          data-rooms-stories-state="empty"
        >
          <ListChecksIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">No stories</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This workspace has no declared project work.
          </p>
        </div>
      ) : view === "board" ? (
        <div className="overflow-x-auto pb-3" data-rooms-stories-layout="board">
          <div className="grid min-w-[64rem] grid-cols-4 items-start gap-3">
            {stages.map((stage) => (
              <section
                className="min-h-[28rem] rounded-xl border border-border bg-muted/10"
                key={stage.id}
              >
                <header className="flex items-center border-b border-border px-3 py-3">
                  <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                    {stage.name}
                  </h2>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {workspace.stories.filter((story) => story.stage_id === stage.id).length}
                  </span>
                </header>
                <div className="grid gap-2.5 p-2.5">
                  {workspace.stories
                    .filter((story) => story.stage_id === stage.id)
                    .map((story) => (
                      <StorySummary
                        key={story.id}
                        onSelect={() => {
                          setSelectedStoryId(story.id);
                          setView("list");
                        }}
                        props={props}
                        selected={story.id === selectedStoryId}
                        story={story}
                      />
                    ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="grid gap-4 min-[1000px]:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]"
          data-rooms-stories-layout="list-detail"
        >
          <div className="grid content-start gap-2.5">
            {workspace.stories.map((story) => (
              <StorySummary
                key={story.id}
                onSelect={() => setSelectedStoryId(story.id)}
                props={props}
                selected={story.id === selectedStoryId}
                story={story}
              />
            ))}
          </div>
          {selectedStory ? <StoryDetail props={props} story={selectedStory} /> : null}
        </div>
      )}
    </div>
  );
}
