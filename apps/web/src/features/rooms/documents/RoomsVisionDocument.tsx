import {
  AlertTriangleIcon,
  Clock3Icon,
  GitCommitHorizontalIcon,
  UserRoundIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { RoomsWorkspaceSlotProps } from "../shell/slots";
import { projectRoomsVisionDocument, type RoomsRevisionProjection } from "./projection";

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}

function RevisionCard({ item }: { readonly item: RoomsRevisionProjection }) {
  const { author, isCurrent, revision } = item;
  return (
    <article
      className={`rounded-xl border p-4 ${
        isCurrent ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card"
      }`}
      data-revision-id={revision.id}
      data-revision-state={revision.state}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">
          {isCurrent ? "Current revision" : "Queued revision"}
        </p>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] ${
            revision.state === "current"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          {revision.state}
        </span>
      </div>
      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-2">
          <UserRoundIcon aria-hidden className="size-3.5" />
          {author
            ? `${author.display_name} · ${author.type}`
            : `${revision.author_id} · unknown type`}
        </p>
        <p className="flex items-center gap-2">
          <Clock3Icon aria-hidden className="size-3.5" />
          {formatDateTime(revision.created_at)} UTC
        </p>
        <p className="flex items-start gap-2">
          <GitCommitHorizontalIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <code className="break-all">{revision.source_hash}</code>
        </p>
      </div>
    </article>
  );
}

export function RoomsVisionDocument(props: RoomsWorkspaceSlotProps) {
  const projection = projectRoomsVisionDocument(props.fixture, props.workspace);
  if (!projection) {
    return (
      <div
        className="flex min-h-[22rem] items-center justify-center p-6"
        data-rooms-document-state="empty"
      >
        <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-lg font-semibold text-foreground">No vision document</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This workspace does not declare a current vision document and revision.
          </p>
        </div>
      </div>
    );
  }

  const { currentRevision, document, isStale, revisions } = projection;
  return (
    <div className="min-h-full bg-background p-4 sm:p-6" data-rooms-document-id={document.id}>
      {isStale ? (
        <div
          className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200"
          data-rooms-freshness="stale"
          role="status"
        >
          <AlertTriangleIcon aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Stale projection — regeneration required</p>
            <p className="mt-1 text-sm">
              The rendered document is pinned to {document.source.sha}, while the source head is{" "}
              {document.freshness.source_head}. Compared{" "}
              {formatDateTime(document.freshness.compared_at)} UTC.
            </p>
          </div>
        </div>
      ) : null}

      <header className="mb-5 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Project document
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">{document.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{props.workspace.vision.summary}</p>
          </div>
          <dl className="grid gap-2 text-xs text-muted-foreground">
            <div>
              <dt className="font-semibold text-foreground">Remote source</dt>
              <dd className="break-all">{document.source.remote_url}</dd>
            </div>
            <div>
              <dt className="font-semibold text-foreground">Pinned SHA</dt>
              <dd>
                <code className="break-all">{document.source.sha}</code>
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-foreground">Source head</dt>
              <dd>
                <code className="break-all">{document.source.source_head}</code>
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="min-w-0 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div
            className="prose prose-sm max-w-none text-foreground dark:prose-invert"
            data-rooms-markdown-source={currentRevision.source_hash}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {currentRevision.body_markdown}
            </ReactMarkdown>
          </div>
        </article>

        <aside aria-label="Document revisions" className="space-y-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Revisions
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Immutable source-backed document states.
            </p>
          </div>
          {revisions.map((revision) => (
            <RevisionCard item={revision} key={revision.revision.id} />
          ))}
        </aside>
      </div>
    </div>
  );
}
