import {
  BotIcon,
  CircleUserRoundIcon,
  FileTextIcon,
  FolderGit2Icon,
  LayoutDashboardIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { useThreadShellsForProjectRefs } from "~/state/entities";

import type { RoomsSourceRoom } from "../dataSource";
import { RoomsLocalChannelSurface } from "../channel/RoomsLocalChannelFeed";
import type { RoomsLocalWorkspace } from "../dataSource/localChannelsContract";
import { RoomsProjectBindingMenu, RoomsThreadsSurface } from "../threads/RoomsThreadNavigation";
import { useRoomProjectBindings } from "../threads/roomProjectBindings";
import { selectRoomsNativeThreadEntries } from "../threads/roomsNativeThreads";
import { RoomsLocalStoriesSurface } from "../stories/RoomsLocalStories";
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
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly room: RoomsSourceRoom;
}) {
  const { boundProjectRefs, boundProjects, unresolvedBindings } = useRoomProjectBindings(
    room.id,
    "local",
  );
  const shells = useThreadShellsForProjectRefs(boundProjectRefs);
  const threads = selectRoomsNativeThreadEntries(shells, boundProjects);

  if (boundProjects.length === 0) {
    return (
      <section
        className="flex min-h-full items-center justify-center p-6"
        data-rooms-local-setup=""
      >
        <div className="max-w-lg rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
          {unresolvedBindings.length > 0 ? (
            <TriangleAlertIcon
              aria-hidden
              className="mx-auto size-6 text-amber-600 dark:text-amber-400"
            />
          ) : (
            <LayoutDashboardIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
          )}
          <h1 className="mt-4 text-lg font-semibold text-foreground">
            {unresolvedBindings.length > 0 ? "Repair the local project binding" : "Bind a project"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {unresolvedBindings.length > 0
              ? "A saved T3 project reference is unavailable. Remove it or bind an available local project."
              : "Local workspace shows only actual T3 projects and threads. Choose a project to begin."}
          </p>
          <div className="mt-4 flex justify-center">
            <RoomsProjectBindingMenu compact={false} roomId={room.id} sourceMode="local" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl p-5 sm:p-8" data-rooms-local-dashboard="">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Local T3 only
          </p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">{room.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Actual project and thread state from this T3 environment.
          </p>
        </div>
        <RoomsProjectBindingMenu compact={false} roomId={room.id} sourceMode="local" />
      </div>
      {unresolvedBindings.length > 0 ? (
        <p className="mt-5 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
          {unresolvedBindings.length} saved project binding
          {unresolvedBindings.length === 1 ? " is" : "s are"} unavailable.
        </p>
      ) : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <FolderGit2Icon aria-hidden className="size-5 text-muted-foreground" />
          <p className="mt-4 text-2xl font-semibold text-foreground">{boundProjects.length}</p>
          <p className="text-sm text-muted-foreground">
            bound project{boundProjects.length === 1 ? "" : "s"}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {boundProjects.map((project) => project.title).join(", ")}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <BotIcon aria-hidden className="size-5 text-muted-foreground" />
          <p className="mt-4 text-2xl font-semibold text-foreground">{threads.length}</p>
          <p className="text-sm text-muted-foreground">
            active native thread{threads.length === 1 ? "" : "s"}
          </p>
          <Button className="mt-3" onClick={() => navigate({ kind: "threads" })} size="sm">
            Open Your Threads
          </Button>
        </div>
      </div>
    </section>
  );
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
  if (surface.kind === "dashboard") return <RoomsLocalDashboard navigate={navigate} room={room} />;
  if (surface.kind === "channel") {
    return <RoomsLocalChannelSurface channelSlug={surface.channelSlug} workspace={workspace} />;
  }
  if (surface.kind === "threads") {
    return <RoomsThreadsSurface navigate={navigate} room={room} sourceMode="local" />;
  }
  if (surface.kind === "project" && surface.projectSection === "stories") {
    return <RoomsLocalStoriesSurface key={room.id} navigate={navigate} roomId={room.id} />;
  }
  return <RoomsLocalUnavailableSurface surface={surface} />;
}
