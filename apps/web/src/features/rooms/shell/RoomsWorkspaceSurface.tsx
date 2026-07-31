import {
  BotIcon,
  CircleUserRoundIcon,
  FileTextIcon,
  HashIcon,
  LayoutDashboardIcon,
  MonitorIcon,
  NetworkIcon,
  PanelTopIcon,
  type LucideIcon,
} from "lucide-react";

import { roomsWorkspaceFixture } from "../fixtures";
import type { RoomsPrincipal, RoomsRoom, RoomsWorkspace } from "../model/workspace";
import type { RoomsWorkspaceSurface } from "./navigation";
import { roomsWorkspaceSlots } from "./slots";

function SurfacePlaceholder({ surface }: { readonly surface: RoomsWorkspaceSurface }) {
  const copy =
    surface.kind === "dashboard"
      ? {
          title: "Dashboard",
          description: "The fixture-backed dashboard projection mounts in this slot.",
          icon: LayoutDashboardIcon,
        }
      : surface.kind === "channel"
        ? {
            title: "# " + surface.channelSlug,
            description: "Ordered messages and structured activity mount in this slot.",
            icon: HashIcon,
          }
        : {
            title: surface.projectView ? "System atlas" : "Project",
            description: "Documents, evidence, and audit projections mount in this slot.",
            icon: surface.projectView ? NetworkIcon : FileTextIcon,
          };
  const Icon = copy.icon;

  return (
    <section className="flex min-h-full items-center justify-center p-6" data-rooms-empty-slot="">
      <div className="max-w-md rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <Icon aria-hidden className="mx-auto size-6 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold text-foreground">{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
      </div>
    </section>
  );
}

function ThreadSurface({ workspace }: { readonly workspace: RoomsWorkspace }) {
  return (
    <section className="mx-auto w-full max-w-4xl p-5 sm:p-8">
      <div className="mb-5">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          Your Threads
        </p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          Detailed agent work stays in T3
        </h1>
      </div>
      <div className="grid gap-3">
        {workspace.threads.map((thread) => (
          <article className="rounded-xl border border-border bg-card p-4" key={thread.id}>
            <div className="flex flex-wrap items-center gap-2">
              <BotIcon aria-hidden className="size-4 text-muted-foreground" />
              <h2 className="font-medium text-foreground">{thread.title}</h2>
              <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                {thread.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {thread.provider} · {thread.environment.name} · as of{" "}
              {new Date(thread.as_of).toLocaleString()}
            </p>
            {thread.machine.reachable && thread.mirror.freshness === "stale" ? (
              <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                Machine reachable · mirror stale since{" "}
                {new Date(thread.mirror.last_synced_at).toLocaleString()}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function PresenceGroup({
  icon: Icon,
  ids,
  label,
}: {
  readonly icon: LucideIcon;
  readonly ids: readonly string[];
  readonly label: string;
}) {
  const principals = ids
    .map((id) => roomsWorkspaceFixture.principals.find((principal) => principal.id === id))
    .filter((principal): principal is RoomsPrincipal => principal !== undefined);
  return (
    <section>
      <h2 className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        <Icon aria-hidden className="size-4" />
        {label}
      </h2>
      <div className="mt-3 grid gap-2">
        {principals.map((principal) => (
          <div className="rounded-lg border border-border bg-card px-3 py-2" key={principal.id}>
            <p className="text-sm font-medium text-foreground">{principal.display_name}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{principal.id}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PresentSurface({ workspace }: { readonly workspace: RoomsWorkspace }) {
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-5 sm:p-8 lg:grid-cols-3">
      <PresenceGroup icon={CircleUserRoundIcon} ids={workspace.presence.human_ids} label="Humans" />
      <PresenceGroup icon={BotIcon} ids={workspace.presence.agent_ids} label="Agents" />
      <PresenceGroup icon={MonitorIcon} ids={workspace.presence.machine_ids} label="Machines" />
    </div>
  );
}

export function RoomsWorkspaceSurfaceView({
  room,
  surface,
  workspace,
}: {
  readonly room: RoomsRoom;
  readonly surface: RoomsWorkspaceSurface;
  readonly workspace: RoomsWorkspace | null;
}) {
  if (!workspace) {
    return (
      <section className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-7 text-center">
          <PanelTopIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold text-foreground">{room.name}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            This room is declared by the workspace contract, but its detailed workspace projection
            is not included in the v1 fixture.
          </p>
        </div>
      </section>
    );
  }

  if (surface.kind === "threads") return <ThreadSurface workspace={workspace} />;
  if (surface.kind === "present") return <PresentSurface workspace={workspace} />;

  const slot =
    surface.kind === "dashboard"
      ? roomsWorkspaceSlots.dashboard
      : surface.kind === "channel"
        ? roomsWorkspaceSlots.channel
        : surface.projectView === "atlas"
          ? roomsWorkspaceSlots.atlas
          : roomsWorkspaceSlots.project;
  if (!slot) return <SurfacePlaceholder surface={surface} />;
  const Slot = slot;
  return (
    <Slot fixture={roomsWorkspaceFixture} room={room} surface={surface} workspace={workspace} />
  );
}
