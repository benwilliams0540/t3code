import { DatabaseIcon, ShieldCheckIcon } from "lucide-react";

import type { RoomsWorkspaceSlotProps } from "../shell/slots";
import { projectRoomsEvidence } from "./projection";

const numberFormatter = new Intl.NumberFormat("en");

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
          First-class v2 evidence and workflow gate requirements, without synthesized feed records.
        </p>
      </header>

      {projection.items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <DatabaseIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">No evidence</h2>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {projection.items.map(({ evidence, producer, story }) => (
            <article
              className="rounded-xl border border-border bg-card p-4"
              data-evidence-id={evidence.id}
              key={evidence.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                    {evidence.kind}
                  </p>
                  <h2 className="mt-1 font-semibold text-foreground">{story.title}</h2>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                  contract record
                </span>
              </div>
              <dl className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-foreground">Producer</dt>
                  <dd>{producer.display_name}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-foreground">Bytes</dt>
                  <dd>{numberFormatter.format(evidence.cas.bytes)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-foreground">Media type</dt>
                  <dd>{evidence.cas.media_type}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-foreground">Run</dt>
                  <dd>{evidence.run_id ?? "none"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-semibold text-foreground">CAS hash</dt>
                  <dd>
                    <code className="break-all">{evidence.cas.hash}</code>
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-semibold text-foreground">Note</dt>
                  <dd>{evidence.note ?? "No note"}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}

      <section
        className="mt-5 rounded-2xl border border-border bg-card p-5"
        aria-label="Workflow gate facts"
      >
        <div className="flex items-center gap-2">
          <ShieldCheckIcon aria-hidden className="size-4" />
          <h2 className="font-semibold text-foreground">Workflow gate facts</h2>
        </div>
        <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
          {projection.gateFacts.map(({ attached, gate, stage, story }) => (
            <li className="rounded-lg border border-border p-3" key={story.id}>
              <p className="font-medium text-foreground">
                {story.title} · {stage.name}
              </p>
              <p className="mt-1">
                Evidence {gate.evidence.mode}: {gate.evidence.kinds.join(", ")} · attached{" "}
                {attached.map((record) => record.kind).join(", ") || "none"}
              </p>
              <p>
                Reviewers: {gate.reviewer.allowed_principal_types.join(", ")} · minimum{" "}
                {gate.reviewer.minimum_reviewers} · self review{" "}
                {gate.reviewer.forbid_self_review ? "forbidden" : "allowed"}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
