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

import type { RoomsDataSourceState, RoomsSourceRoom } from "../dataSource";
import type { RoomsPrincipal, RoomsWorkspace, RoomsWorkspaceReadFixture } from "../model/workspace";
import type { RoomsWorkspaceSurface } from "./navigation";
import type { RoomsWorkspaceNavigate } from "./RoomsWorkspaceNavigation";
import { roomsWorkspaceSlots } from "./slots";
import { RoomsNativeThreadSurface } from "../threads/RoomsNativeThreadSurface";
import { RoomsThreadsSurface } from "../threads/RoomsThreadNavigation";
import { RoomsLocalWorkspaceSurfaceView } from "./RoomsLocalWorkspaceSurface";
import { RoomsHumanWorkspaceSurfaceView } from "./RoomsHumanWorkspaceSurface";

function SurfacePlaceholder({ surface }: { readonly surface: RoomsWorkspaceSurface }) {
  const copy = (() => {
    switch (surface.kind) {
      case "dashboard":
        return {
          title: "Status",
          description: "The fixture-backed room status projection mounts in this slot.",
          icon: LayoutDashboardIcon,
        };
      case "channel":
        return {
          title: "# " + surface.channelSlug,
          description: "Ordered messages and structured activity mount in this slot.",
          icon: HashIcon,
        };
      case "project":
        return {
          title: surface.projectView ? "System atlas" : "Project",
          description: "Documents, evidence, and audit projections mount in this slot.",
          icon: surface.projectView ? NetworkIcon : FileTextIcon,
        };
      case "threads":
        return {
          title: "Your Threads",
          description: "Detailed T3 agent work mounts in this slot.",
          icon: BotIcon,
        };
      case "native-thread":
        return {
          title: "T3 Thread",
          description: "The native T3 thread mounts in this slot.",
          icon: BotIcon,
        };
      case "native-draft":
        return {
          title: "New T3 Thread",
          description: "The native T3 draft and composer mount in this slot.",
          icon: BotIcon,
        };
      case "present":
        return {
          title: "Network",
          description: "People, agents, and machines mount in this slot.",
          icon: CircleUserRoundIcon,
        };
    }
  })();
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

function PresenceGroup({
  icon: Icon,
  ids,
  label,
  principals: declaredPrincipals,
}: {
  readonly icon: LucideIcon;
  readonly ids: readonly string[];
  readonly label: string;
  readonly principals: readonly RoomsPrincipal[];
}) {
  const principals = ids
    .map((id) => declaredPrincipals.find((principal) => principal.id === id))
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

function PresentSurface({
  fixture,
  workspace,
}: {
  readonly fixture: RoomsWorkspaceReadFixture;
  readonly workspace: RoomsWorkspace;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl p-5 sm:p-8">
      <header>
        <p className="threadspace-technical font-mono text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
          Fig. 01 · Room topology · declared fixture identities
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">People and machines</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          People, agents, and machine registrations stay distinct. Matching machine names never
          collapse separate IDs. Presence here is declared fixture data, not inferred reachability.
        </p>
      </header>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <PresenceGroup
          icon={CircleUserRoundIcon}
          ids={workspace.presence.human_ids}
          label="People"
          principals={fixture.principals}
        />
        <PresenceGroup
          icon={BotIcon}
          ids={workspace.presence.agent_ids}
          label="Agents"
          principals={fixture.principals}
        />
        <PresenceGroup
          icon={MonitorIcon}
          ids={workspace.presence.machine_ids}
          label="Machines"
          principals={fixture.principals}
        />
      </div>
    </div>
  );
}

export function RoomsWorkspaceSurfaceView({
  navigate,
  room,
  sourceState,
  surface,
  workspace,
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly room: RoomsSourceRoom;
  readonly sourceState: Extract<RoomsDataSourceState, { readonly status: "ready" }>;
  readonly surface: RoomsWorkspaceSurface;
  readonly workspace: RoomsWorkspace | null;
}) {
  if (surface.kind === "native-thread" || surface.kind === "native-draft") {
    return (
      <RoomsNativeThreadSurface
        roomId={room.id}
        roomSlug={room.slug}
        sourceMode={sourceState.mode}
        surface={surface}
      />
    );
  }

  if (sourceState.mode === "local") {
    return (
      <RoomsLocalWorkspaceSurfaceView
        navigate={navigate}
        room={room}
        surface={surface}
        workspace={sourceState.workspace}
      />
    );
  }

  if (sourceState.mode === "shared") {
    return (
      <RoomsHumanWorkspaceSurfaceView
        navigate={navigate}
        room={room}
        surface={surface}
        workspace={sourceState.workspace}
      />
    );
  }

  const fixture = sourceState.fixture;
  const sampleRoom = fixture.rooms.find((candidate) => candidate.id === room.id) ?? null;
  if (!workspace || !sampleRoom) {
    return (
      <section className="flex min-h-full items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-7 text-center">
          <PanelTopIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold text-foreground">{room.name}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            This declared room is missing its required decoded v2 workspace. The contract boundary
            rejects this state before normal rendering.
          </p>
        </div>
      </section>
    );
  }

  if (surface.kind === "threads") {
    return <RoomsThreadsSurface navigate={navigate} room={room} sourceMode="sample" />;
  }
  if (surface.kind === "present") return <PresentSurface fixture={fixture} workspace={workspace} />;

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
  return <Slot fixture={fixture} room={sampleRoom} surface={surface} workspace={workspace} />;
}
