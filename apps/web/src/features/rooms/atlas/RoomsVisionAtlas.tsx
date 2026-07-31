import {
  AlertTriangleIcon,
  BotIcon,
  FileTextIcon,
  HashIcon,
  NetworkIcon,
  ServerIcon,
  UsersIcon,
} from "lucide-react";

import type { RoomsPrincipal } from "../model/workspace";
import type { RoomsWorkspaceSlotProps } from "../shell/slots";
import { projectRoomsAtlas } from "./projection";

function PrincipalList({
  label,
  principals,
}: {
  readonly label: string;
  readonly principals: readonly RoomsPrincipal[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {label} · {principals.length}
      </p>
      <ul className="mt-2 space-y-1 text-sm text-foreground">
        {principals.map((principal) => (
          <li key={principal.id}>{principal.display_name}</li>
        ))}
      </ul>
    </div>
  );
}

export function RoomsVisionAtlas(props: RoomsWorkspaceSlotProps) {
  const projection = projectRoomsAtlas(props.fixture, props.room, props.workspace);
  if (!projection) {
    return (
      <div
        className="flex min-h-[22rem] items-center justify-center p-6"
        data-rooms-atlas-state="empty"
      >
        <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <NetworkIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-3 text-lg font-semibold text-foreground">Atlas unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This workspace does not declare an Atlas revision binding.
          </p>
        </div>
      </div>
    );
  }

  const { boundRevision, channels, document, isStale, presence, room, stages } = projection;
  return (
    <div className="min-h-full bg-background p-4 sm:p-6" data-rooms-atlas-id={document.atlas.id}>
      {isStale ? (
        <div
          className="mb-5 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200"
          data-rooms-atlas-freshness="stale"
          role="status"
        >
          <AlertTriangleIcon aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Stale Atlas projection</p>
            <p className="mt-1 text-sm">
              This diagram is bound to revision {boundRevision.id} ({boundRevision.source_hash}),
              not the queued source head. Regenerate before relying on it.
            </p>
          </div>
        </div>
      ) : null}

      <header className="mb-5 rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Generated project view
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{document.title} · Atlas</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border border-border px-2 py-1">room {room.name}</span>
          <span className="rounded-full border border-border px-2 py-1">
            revision {boundRevision.id}
          </span>
          <span className="rounded-full border border-border px-2 py-1">
            atlas {document.atlas.state}
          </span>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.55fr)]">
        <section
          className="rounded-2xl border border-border bg-card p-5"
          aria-label="Atlas relationships"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <FileTextIcon aria-hidden className="size-4 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">Document and revision</h2>
              </div>
              <p className="mt-3 text-sm text-foreground">{document.title}</p>
              <code className="mt-1 block break-all text-xs text-muted-foreground">
                {boundRevision.source_hash}
              </code>
              <p className="mt-2 text-xs text-muted-foreground">
                Atlas binding: {document.atlas.revision_id}
              </p>
            </article>

            <article className="rounded-xl border border-border bg-background p-4">
              <div className="flex items-center gap-2">
                <HashIcon aria-hidden className="size-4 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">Channels</h2>
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {channels.map((channel) => (
                  <li key={channel.id}>
                    <span className="font-medium text-foreground">{channel.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{channel.purpose}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className="rounded-xl border border-border bg-background p-4 md:col-span-2">
              <div className="flex items-center gap-2">
                <NetworkIcon aria-hidden className="size-4 text-muted-foreground" />
                <h2 className="font-semibold text-foreground">Workflow stages</h2>
              </div>
              <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {stages.map((stage, index) => (
                  <li className="rounded-lg border border-border p-3" key={stage.id}>
                    <p className="text-xs text-muted-foreground">{index + 1}</p>
                    <p className="mt-1 text-sm font-medium text-foreground">{stage.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {stage.gate
                        ? `${stage.gate.required_evidence_kinds.length} evidence kind(s)`
                        : "No gate"}
                    </p>
                  </li>
                ))}
              </ol>
            </article>
          </div>
        </section>

        <aside className="rounded-2xl border border-border bg-card p-5" aria-label="Atlas presence">
          <div className="flex items-center gap-2">
            <UsersIcon aria-hidden className="size-4 text-muted-foreground" />
            <h2 className="font-semibold text-foreground">Declared presence</h2>
          </div>
          <div className="mt-5 space-y-5">
            <div className="flex items-start gap-2">
              <UsersIcon aria-hidden className="mt-0.5 size-4 text-muted-foreground" />
              <PrincipalList label="Humans" principals={presence.humans} />
            </div>
            <div className="flex items-start gap-2">
              <BotIcon aria-hidden className="mt-0.5 size-4 text-muted-foreground" />
              <PrincipalList label="Agents" principals={presence.agents} />
            </div>
            <div className="flex items-start gap-2">
              <ServerIcon aria-hidden className="mt-0.5 size-4 text-muted-foreground" />
              <PrincipalList label="Machines" principals={presence.machines} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
