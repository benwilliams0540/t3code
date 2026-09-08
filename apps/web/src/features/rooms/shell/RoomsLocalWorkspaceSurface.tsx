import { CircleUserRoundIcon, FileTextIcon } from "lucide-react";

import type { RoomsSourceRoom } from "../dataSource";
import { RoomsLocalChannelSurface } from "../channel/RoomsLocalChannelFeed";
import type { RoomsLocalWorkspace } from "../dataSource/localChannelsContract";
import { RoomsThreadsSurface } from "../threads/RoomsThreadNavigation";
import { RoomsLocalStoriesSurface } from "../stories/RoomsLocalStories";
import { RoomsInteractiveDashboard } from "../dashboard/RoomsInteractiveDashboard";
import { RoomsInteractiveProjectSurface } from "../project/RoomsInteractiveProjectSurface";
import { RoomsInteractivePresent } from "./RoomsInteractivePresent";
import type { RoomsWorkspaceSurface } from "./navigation";
import type { RoomsWorkspaceNavigate } from "./RoomsWorkspaceNavigation";

type LocalUnavailableSurface = Extract<
  RoomsWorkspaceSurface,
  { readonly kind: "project" | "present" }
>;

export function localUnavailableSurfaceCopy(surface: LocalUnavailableSurface): {
  readonly title: string;
  readonly description: string;
} {
  if (surface.kind === "present") {
    return {
      title: "Present",
      description: "No presence information is available locally.",
    };
  }
  if (surface.projectSection === "vision") {
    return { title: "Vision", description: "No vision revisions yet." };
  }
  if (surface.projectSection === "evidence") {
    return { title: "Evidence", description: "No evidence yet." };
  }
  if (surface.projectSection === "audit-decisions") {
    return {
      title: "Audit & Decisions",
      description: "No local audit or decision records yet.",
    };
  }
  return {
    title: "Project",
    description: "This project view isn’t available from local T3 state yet.",
  };
}

export function RoomsLocalUnavailableSurface({
  surface,
}: {
  readonly surface: LocalUnavailableSurface;
}) {
  const copy = localUnavailableSurfaceCopy(surface);
  const Icon = surface.kind === "present" ? CircleUserRoundIcon : FileTextIcon;
  return (
    <section
      className="flex min-h-full items-center justify-center p-6"
      data-rooms-local-empty={surface.kind}
    >
      <div className="max-w-md rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <Icon aria-hidden className="mx-auto size-6 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold text-foreground">{copy.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
      </div>
    </section>
  );
}

function RoomsLocalDashboard({
  navigate,
  room,
  workspace,
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly room: RoomsSourceRoom;
  readonly workspace: RoomsLocalWorkspace;
}) {
  return <RoomsInteractiveDashboard navigate={navigate} room={room} workspace={workspace} />;
}

export function RoomsLocalWorkspaceSurfaceView({
  navigate,
  room,
  surface,
  workspace,
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly room: RoomsSourceRoom;
  readonly surface: Exclude<
    RoomsWorkspaceSurface,
    { readonly kind: "native-thread" | "native-draft" }
  >;
  readonly workspace: RoomsLocalWorkspace;
}) {
  if (surface.kind === "dashboard") {
    return <RoomsLocalDashboard navigate={navigate} room={room} workspace={workspace} />;
  }
  if (surface.kind === "channel") {
    return <RoomsLocalChannelSurface channelSlug={surface.channelSlug} workspace={workspace} />;
  }
  if (surface.kind === "threads") {
    return <RoomsThreadsSurface navigate={navigate} room={room} sourceMode="local" />;
  }
  if (surface.kind === "project" && surface.projectSection === "stories") {
    return <RoomsLocalStoriesSurface key={room.id} navigate={navigate} roomId={room.id} />;
  }
  if (surface.kind === "project") {
    return <RoomsInteractiveProjectSurface room={room} surface={surface} workspace={workspace} />;
  }
  if (surface.kind === "present") return <RoomsInteractivePresent workspace={workspace} />;
  return <RoomsLocalUnavailableSurface surface={surface} />;
}
