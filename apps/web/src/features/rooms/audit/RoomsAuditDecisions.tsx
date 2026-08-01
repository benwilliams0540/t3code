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
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Audit & Decisions</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          First-class decisions and workspace-local audit provenance from the v2 contract.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <GavelIcon aria-hidden className="size-4" />
            <h2 className="font-semibold text-foreground">Decisions</h2>
          </div>
          <div className="mt-4 grid gap-3">
            {projection.decisions.map(({ author, decision, story }) => (
              <article className="rounded-xl border border-border p-4" key={decision.id}>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-foreground">{decision.title}</h3>
                  <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px]">
                    {decision.status}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{decision.rationale_markdown}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Author {author.display_name} · {story?.title ?? "workspace-wide"} ·{" "}
                  {decision.occurred_at}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <HistoryIcon aria-hidden className="size-4" />
            <h2 className="font-semibold text-foreground">Audit provenance</h2>
          </div>
          <ol className="mt-4 grid gap-3">
            {projection.events.map(({ actor, audit, sourceEvent }) => (
              <li className="rounded-xl border border-border p-4" key={audit.id}>
                <p className="font-medium text-foreground">{audit.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {actor.display_name} · {audit.action} · {audit.subject.kind}:{audit.subject.id}
                </p>
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                  seq {sourceEvent.seq} · {sourceEvent.type} · schema {sourceEvent.schema} ·{" "}
                  {sourceEvent.event_id}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2">
          <ShieldCheckIcon aria-hidden className="size-4" />
          <h2 className="font-semibold text-foreground">Gate definitions</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {projection.gateFacts.map(({ stage, workflow }) => (
            <article
              className="rounded-xl border border-border p-4"
              key={`${workflow.id}-${stage.id}`}
            >
              <p className="font-medium text-foreground">
                {workflow.story_type} · {stage.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Evidence {stage.gate?.evidence.mode}: {stage.gate?.evidence.kinds.join(", ")}
              </p>
              <p className="text-xs text-muted-foreground">
                Review {stage.gate?.reviewer.allowed_principal_types.join(", ")} · minimum{" "}
                {stage.gate?.reviewer.minimum_reviewers} · self review{" "}
                {stage.gate?.reviewer.forbid_self_review ? "forbidden" : "allowed"}
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
