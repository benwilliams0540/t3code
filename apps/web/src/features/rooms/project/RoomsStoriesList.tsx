import { ListChecksIcon } from "lucide-react";

import type { RoomsWorkspaceSlotProps } from "../shell/slots";

export function RoomsStoriesList(props: RoomsWorkspaceSlotProps) {
  const { fixture, workspace } = props;
  return (
    <div className="min-h-full bg-background p-4 sm:p-6" data-rooms-project-section="stories">
      <header className="mb-5 rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Project record
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Stories</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Workflow-backed work projected from the workspace fixture.
        </p>
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
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {workspace.stories.map((story) => {
            const owner = fixture.principals.find((principal) => principal.id === story.owner_id);
            const stage = workspace.workflows
              .flatMap((workflow) => workflow.stages)
              .find((candidate) => candidate.id === story.stage_id);
            return (
              <article className="rounded-xl border border-border bg-card p-4" key={story.id}>
                <div className="flex flex-wrap gap-1.5">
                  {story.labels.map((label) => (
                    <span
                      className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                      key={label}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <h2 className="mt-3 font-semibold text-foreground">{story.title}</h2>
                <dl className="mt-3 grid gap-1 text-xs text-muted-foreground">
                  <div>
                    <dt className="inline font-semibold text-foreground">Stage: </dt>
                    <dd className="inline">{stage?.name ?? story.stage_id}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-foreground">Owner: </dt>
                    <dd className="inline">{owner?.display_name ?? story.owner_id}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-foreground">Gate: </dt>
                    <dd className="inline">{story.gate_state.replaceAll("_", " ")}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-foreground">Evidence: </dt>
                    <dd className="inline">
                      {story.evidence_ids.length} attached · gate requires{" "}
                      {stage?.gate?.evidence.kinds.join(", ") || "none"}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
