import { AlertCircleIcon, DatabaseIcon, FileWarningIcon, LinkIcon } from "lucide-react";

import type { RoomsWorkspaceSlotProps } from "../shell/slots";
import { projectRoomsEvidence } from "./projection";

const numberFormatter = new Intl.NumberFormat("en");

function shortId(value: string): string {
  return value.length > 24 ? `${value.slice(0, 18)}…${value.slice(-6)}` : value;
}

export function RoomsEvidenceList(props: RoomsWorkspaceSlotProps) {
  const projection = projectRoomsEvidence(props.fixture, props.workspace);
  return (
    <div className="min-h-full bg-background p-4 sm:p-6" data-rooms-project-section="evidence">
      <header className="mb-5 rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Project record
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Evidence</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Story references and source-event metadata are shown separately so missing fixture fields
          stay visible.
        </p>
      </header>

      {projection.items.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-border p-10 text-center"
          data-rooms-evidence-state="empty"
        >
          <DatabaseIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">No evidence references</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No story or feed event in this workspace references evidence.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {projection.items.map((item) => (
            <article
              className="rounded-xl border border-border bg-card p-4"
              data-evidence-id={item.id}
              key={item.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                    {item.fidelity === "full_metadata" ? "Source event metadata" : "Reference only"}
                  </p>
                  <code className="mt-1 block break-all text-sm text-foreground">{item.id}</code>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                    item.fidelity === "full_metadata"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {item.fidelity === "full_metadata" ? "metadata supplied" : "metadata absent"}
                </span>
              </div>

              {item.detail ? (
                <dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold text-foreground">Kind</dt>
                    <dd>{item.detail.kind}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">Bytes</dt>
                    <dd>{numberFormatter.format(item.detail.bytes)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">Media type</dt>
                    <dd>{item.detail.mediaType}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-foreground">Actor</dt>
                    <dd>{item.detail.actor?.display_name ?? item.detail.actorId}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-semibold text-foreground">CAS hash</dt>
                    <dd>
                      <code className="break-all">{item.detail.hash}</code>
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-semibold text-foreground">Source event</dt>
                    <dd>
                      seq {item.detail.sourceEvent.seq} · {item.detail.sourceEvent.type} ·{" "}
                      {item.detail.attachedAt}
                    </dd>
                  </div>
                </dl>
              ) : (
                <div className="mt-4 flex gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                  <LinkIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  The fixture supplies this attached ID, but no evidence.attached feed event with
                  CAS metadata.
                </div>
              )}

              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs font-semibold text-foreground">Referenced by</p>
                {item.stories.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {item.stories.map((story) => (
                      <li key={story.id}>
                        {story.title} · {shortId(story.id)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No story reference in this fixture.
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {projection.missingRequirements.length > 0 ? (
        <section
          className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5"
          aria-label="Missing evidence requirements"
        >
          <div className="flex items-center gap-2">
            <FileWarningIcon aria-hidden className="size-4 text-amber-700 dark:text-amber-300" />
            <h2 className="font-semibold text-foreground">Required, not attached</h2>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {projection.missingRequirements.map(({ kinds, story }) => (
              <li className="flex items-start gap-2" key={story.id}>
                <AlertCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  {story.title}: {kinds.join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
