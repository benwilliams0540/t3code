import { GavelIcon, HistoryIcon, ShieldCheckIcon } from "lucide-react";

import type { RoomsWorkspaceSlotProps } from "../shell/slots";
import { projectRoomsAudit } from "./projection";

export function RoomsAuditDecisions(props: RoomsWorkspaceSlotProps) {
  const projection = projectRoomsAudit(props.fixture, props.workspace);
  return (
    <div
      className="min-h-full bg-background p-4 sm:p-6"
      data-rooms-project-section="audit-decisions"
    >
      <header className="mb-5 rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Project record
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Audit &amp; Decisions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ordered source events, recorded approval decisions, and declared gate policy remain
          distinct.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          className="rounded-2xl border border-border bg-card p-5"
          aria-label="Ordered source events"
        >
          <div className="flex items-center gap-2">
            <HistoryIcon aria-hidden className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Ordered source events</h2>
          </div>
          {projection.events.length === 0 ? (
            <div
              className="mt-4 rounded-xl border border-dashed border-border p-8 text-center"
              data-rooms-audit-state="empty"
            >
              <p className="text-sm text-muted-foreground">
                No source events are present in this workspace fixture.
              </p>
            </div>
          ) : (
            <ol className="mt-4 space-y-3">
              {projection.events.map(({ actor, item }) => (
                <li
                  className="rounded-xl border border-border bg-background p-4"
                  data-source-seq={item.source_event.seq}
                  key={item.source_event.event_id}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-border px-2 py-0.5 font-mono">
                      seq {item.source_event.seq}
                    </span>
                    <span>{item.source_event.type}</span>
                    <span>schema {item.source_event.schema}</span>
                    <span className="ml-auto">{item.occurred_at}</span>
                  </div>
                  <p className="mt-3 text-sm text-foreground">{item.summary}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Actor:{" "}
                    {actor ? `${actor.display_name} · ${actor.type} · ${actor.id}` : item.actor_id}
                  </p>
                  <code className="mt-2 block break-all text-[11px] text-muted-foreground">
                    {item.source_event.event_id}
                  </code>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="space-y-5">
          <section
            className="rounded-2xl border border-border bg-card p-5"
            aria-label="Recorded decisions"
          >
            <div className="flex items-center gap-2">
              <GavelIcon aria-hidden className="size-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Recorded decisions</h2>
            </div>
            {projection.decisions.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No approval.decided event is present.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {projection.decisions.map(({ actor, decision, item, scope, taskId }) => (
                  <article
                    className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3"
                    key={item.id}
                  >
                    <p className="text-xs font-semibold text-foreground">
                      seq {item.source_event.seq} · {decision ?? "decision unspecified"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>
                    <dl className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      <div>
                        <dt className="inline font-semibold text-foreground">Actor: </dt>
                        <dd className="inline">{actor?.display_name ?? item.actor_id}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-foreground">Scope: </dt>
                        <dd className="inline">{scope ?? "not supplied"}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-foreground">Story: </dt>
                        <dd className="inline break-all">{taskId ?? "not supplied"}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section
            className="rounded-2xl border border-border bg-card p-5"
            aria-label="Declared gate facts"
          >
            <div className="flex items-center gap-2">
              <ShieldCheckIcon aria-hidden className="size-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Declared gate facts</h2>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              These are workflow-definition facts, not synthetic audit events.
            </p>
            <div className="mt-3 space-y-3">
              {projection.gateFacts.map(({ stage }) => (
                <article
                  className="rounded-xl border border-border bg-background p-3"
                  key={stage.id}
                >
                  <p className="text-sm font-semibold text-foreground">{stage.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reviewers: {stage.gate?.allowed_principal_types.join(", ")} · self review{" "}
                    {stage.gate?.self_review}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Evidence: {stage.gate?.required_evidence_kinds.join(", ")}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
