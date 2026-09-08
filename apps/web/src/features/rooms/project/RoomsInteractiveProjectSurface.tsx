import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  DatabaseIcon,
  FileCheck2Icon,
  FileTextIcon,
  GavelIcon,
  HistoryIcon,
} from "lucide-react";

import type { RoomsInteractiveWorkspace } from "../dataSource/humanSharedContract";
import { isRoomsLocalStoryV2 } from "../dataSource/localStoriesContract";
import type { RoomsSourceRoom } from "../dataSource";
import type { RoomsWorkspaceSurface } from "../shell/navigation";
import { useRoomsStories } from "../stories/useRoomsStories";

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

function SurfaceState({
  description,
  title,
}: {
  readonly description: string;
  readonly title: string;
}) {
  return (
    <section className="flex min-h-[28rem] items-center justify-center p-6">
      <div className="max-w-lg rounded-2xl border border-dashed border-border bg-muted/15 p-8 text-center">
        <AlertTriangleIcon className="mx-auto size-6 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}

export function RoomsInteractiveProjectSurface({
  room,
  surface,
  workspace,
}: {
  readonly room: RoomsSourceRoom;
  readonly surface: Extract<RoomsWorkspaceSurface, { readonly kind: "project" }>;
  readonly workspace: RoomsInteractiveWorkspace;
}) {
  const { error, loading, stories } = useRoomsStories(room.id);
  if (surface.projectSection === "vision") {
    return (
      <div className="mx-auto w-full max-w-5xl p-5 sm:p-8" data-rooms-vision-state="unavailable">
        <header>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Project vision
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Vision</h1>
        </header>
        <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-6">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <FileTextIcon className="size-5" />
            <h2 className="font-semibold">Current revision unavailable</h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            The {workspace.contract.id} v{workspace.contract.version} contract does not expose a
            vision document, revision history, source provenance, or freshness comparison. This
            route stays honest instead of presenting the bundled Sample vision as shared project
            truth.
          </p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Current revision</dt>
              <dd className="mt-1 font-medium">Unavailable</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Provenance</dt>
              <dd className="mt-1 font-medium">Not in contract</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Freshness</dt>
              <dd className="mt-1 font-medium">Cannot be determined</dd>
            </div>
          </dl>
        </div>
      </div>
    );
  }
  if (error)
    return (
      <SurfaceState
        description={`${error.message} (${error.code})`}
        title="Project record unavailable"
      />
    );
  if (loading && stories.length === 0)
    return (
      <SurfaceState description="Reading current story records…" title="Loading project record" />
    );

  const v2Stories = stories.filter(isRoomsLocalStoryV2);
  if (surface.projectSection === "evidence") {
    const evidence = v2Stories.flatMap((story) =>
      story.evidence.map((record) => ({ record, story })),
    );
    return (
      <div className="mx-auto w-full max-w-6xl p-5 sm:p-8" data-rooms-project-section="evidence">
        <header>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Project record
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Evidence</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Actual evidence records returned by the current story routes.
          </p>
        </header>
        {evidence.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
            <DatabaseIcon className="mx-auto size-6 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">No evidence yet</h2>
          </div>
        ) : (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {evidence.map(({ record, story }) => (
              <article className="rounded-xl border border-border bg-card p-4" key={record.id}>
                <div className="flex items-start gap-3">
                  <FileCheck2Icon className="mt-0.5 size-4 text-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      {record.kind}
                    </p>
                    <h2 className="mt-1 font-semibold text-foreground">
                      {record.note ?? story.title}
                    </h2>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {story.title} · {principalName(workspace, record.produced_by)} ·{" "}
                      {new Date(record.attached_at).toLocaleString()}
                    </p>
                    <details className="mt-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Technical details</summary>
                      <code className="mt-2 block break-all">
                        sha256:{record.cas.hash} · {record.cas.bytes} bytes ·{" "}
                        {record.cas.media_type}
                      </code>
                    </details>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }
  if (surface.projectSection === "audit-decisions") {
    const reviews = v2Stories.flatMap((story) =>
      story.reviews.map((review) => ({ review, story })),
    );
    const completions = v2Stories.flatMap((story) =>
      story.completion ? [{ completion: story.completion, story }] : [],
    );
    const audit = v2Stories
      .flatMap((story) => story.audit.map((entry) => ({ entry, story })))
      .sort((left, right) => right.entry.occurred_at.localeCompare(left.entry.occurred_at));
    return (
      <div
        className="mx-auto w-full max-w-6xl p-5 sm:p-8"
        data-rooms-project-section="audit-decisions"
      >
        <header>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Project record
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Decisions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Persisted reviews and completion decisions, with audit facts under progressive
            disclosure.
          </p>
        </header>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <GavelIcon className="size-4" />
              <h2 className="font-semibold">Human decisions</h2>
            </div>
            <div className="mt-4 grid gap-3">
              {reviews.map(({ review, story }) => (
                <article className="rounded-xl border border-border p-4" key={review.id}>
                  <div className="flex items-center gap-2">
                    <CheckCircle2Icon className="size-4 text-emerald-500" />
                    <h3 className="font-medium">{story.title}</h3>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Approved by {principalName(workspace, review.reviewed_by)} with{" "}
                    {review.evidence.length} evidence{" "}
                    {review.evidence.length === 1 ? "record" : "records"}.
                  </p>
                  <time
                    className="mt-2 block text-xs text-muted-foreground"
                    dateTime={review.reviewed_at}
                  >
                    {new Date(review.reviewed_at).toLocaleString()}
                  </time>
                </article>
              ))}
              {completions.map(({ completion, story }) => (
                <article
                  className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-4"
                  key={`${story.id}:completion`}
                >
                  <h3 className="font-medium">{story.title} completed</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Completed by {principalName(workspace, completion.completed_by)} with the
                    approved evidence set.
                  </p>
                </article>
              ))}
              {reviews.length === 0 && completions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No review or completion decisions yet.
                </p>
              ) : null}
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2">
              <HistoryIcon className="size-4" />
              <h2 className="font-semibold">Audit activity</h2>
            </div>
            <ol className="mt-4 grid gap-3">
              {audit.slice(0, 24).map(({ entry, story }) => (
                <li
                  className="border-b border-border pb-3 text-sm last:border-b-0"
                  key={entry.source_event.event_id}
                >
                  <p className="text-foreground">
                    {entry.source_event.type} · {story.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {principalName(workspace, entry.actor)} · seq {entry.source_event.seq} ·{" "}
                    {new Date(entry.occurred_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    );
  }
  return (
    <SurfaceState
      description="This project route is not supported by the current interactive workspace."
      title="Project view unavailable"
    />
  );
}
