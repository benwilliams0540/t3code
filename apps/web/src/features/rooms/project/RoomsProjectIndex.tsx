import { BookOpenIcon, FileTextIcon, FolderOpenIcon, GitCommitHorizontalIcon } from "lucide-react";

import type { RoomsWorkspaceSlotProps } from "../shell/slots";
import { projectRoomsProjectIndex } from "./projection";

export function RoomsProjectIndex(props: RoomsWorkspaceSlotProps) {
  const projection = projectRoomsProjectIndex(props.fixture, props.workspace);
  const isEmpty = projection.documents.length === 0 && projection.navigation.length === 0;
  return (
    <div className="min-h-full bg-background p-4 sm:p-6" data-rooms-project-section="index">
      <header className="mb-5 rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {props.room.name} · project
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Project documentation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Versioned documents and the declared project navigation from this workspace fixture.
        </p>
      </header>

      {isEmpty ? (
        <div
          className="rounded-2xl border border-dashed border-border p-10 text-center"
          data-rooms-project-state="empty"
        >
          <FolderOpenIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">No project surfaces declared</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The fixture returned no project navigation or documents.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section
            className="rounded-2xl border border-border bg-card p-5"
            aria-label="Project documents"
          >
            <div className="flex items-center gap-2">
              <FileTextIcon aria-hidden className="size-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">
                Documents · {projection.documents.length}
              </h2>
            </div>
            {projection.documents.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                No versioned documents are declared.
              </p>
            ) : (
              <div className="mt-4 grid gap-3">
                {projection.documents.map(({ author, currentRevision, document }) => (
                  <article
                    className="rounded-xl border border-border bg-background p-4"
                    key={document.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-foreground">{document.title}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {currentRevision
                            ? `${currentRevision.state} · ${author?.display_name ?? currentRevision.author_id}`
                            : "Current revision is unresolved"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          document.freshness.state === "current"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {document.freshness.state}
                      </span>
                    </div>
                    <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                      <GitCommitHorizontalIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                      <code className="break-all">
                        {currentRevision?.source_hash ?? document.source.sha}
                      </code>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <nav
            className="rounded-2xl border border-border bg-card p-5"
            aria-label="Project sections"
          >
            <div className="flex items-center gap-2">
              <BookOpenIcon aria-hidden className="size-4 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Project sections</h2>
            </div>
            {projection.navigation.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">No project entries are declared.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {projection.navigation.map((item) => (
                  <li key={item.key}>
                    <a
                      className="block rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted/50"
                      href={item.route}
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
