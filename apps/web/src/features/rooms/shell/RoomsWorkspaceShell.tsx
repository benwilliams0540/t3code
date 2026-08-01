import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, ArrowRightIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect } from "react";

import { useAppSidebarVariantSelection } from "~/components/appSidebarVariant";
import { Button } from "~/components/ui/button";
import { SidebarInset } from "~/components/ui/sidebar";

import { roomsWorkspaceFixture } from "../fixtures";
import { findDeclaredRoomBySlug, workspaceForDeclaredRoom } from "../model/selection";
import type { RoomsRoom } from "../model/workspace";
import {
  buildRoomsBreadcrumbs,
  isRoomsWorkspaceEnabled,
  type RoomsNavigationTarget,
  type RoomsWorkspaceSurface,
} from "./navigation";
import { RoomsWorkspaceNavigation, type RoomsWorkspaceNavigate } from "./RoomsWorkspaceNavigation";
import { RoomsWorkspaceSurfaceView } from "./RoomsWorkspaceSurface";
import { useRoomsWorkspaceSelection } from "./useRoomsWorkspaceSelection";

function useNavigateWithinRoom(room: RoomsRoom | null): (target: RoomsNavigationTarget) => void {
  const navigate = useNavigate();
  return useCallback(
    (target: RoomsNavigationTarget) => {
      if (!room) return;
      switch (target.kind) {
        case "dashboard":
          void navigate({
            to: "/rooms/$roomSlug/dashboard",
            params: { roomSlug: room.slug },
          });
          return;
        case "channel":
          void navigate({
            to: "/rooms/$roomSlug/channels/$channelSlug",
            params: { roomSlug: room.slug, channelSlug: target.channelSlug },
          });
          return;
        case "threads":
          void navigate({
            to: "/rooms/$roomSlug/threads",
            params: { roomSlug: room.slug },
          });
          return;
        case "project":
          void navigate({
            to: "/rooms/$roomSlug/project/$projectSection",
            params: { roomSlug: room.slug, projectSection: target.projectSection },
          });
          return;
        case "project-view":
          void navigate({
            to: "/rooms/$roomSlug/project/$projectSection/$projectView",
            params: {
              roomSlug: room.slug,
              projectSection: target.projectSection,
              projectView: target.projectView,
            },
          });
          return;
        case "present":
          void navigate({
            to: "/rooms/$roomSlug/present",
            params: { roomSlug: room.slug },
          });
      }
    },
    [navigate, room?.slug],
  );
}

function RoomsBreadcrumbBar({
  room,
  surface,
}: {
  readonly room: RoomsRoom;
  readonly surface: RoomsWorkspaceSurface;
}) {
  const navigateWithinRoom = useNavigateWithinRoom(room);
  const breadcrumbs = buildRoomsBreadcrumbs(room, surface);

  return (
    <header className="workspace-topbar flex shrink-0 items-center gap-1 border-b border-border px-3 sm:px-4">
      <Button
        aria-label="Go back"
        onClick={() => window.history.back()}
        size="icon-xs"
        title="Back"
        variant="ghost"
      >
        <ArrowLeftIcon />
      </Button>
      <Button
        aria-label="Go forward"
        onClick={() => window.history.forward()}
        size="icon-xs"
        title="Forward"
        variant="ghost"
      >
        <ArrowRightIcon />
      </Button>
      <div className="ml-1 flex min-w-0 items-center gap-1 text-sm">
        {breadcrumbs.map((breadcrumb, index) => {
          const target = breadcrumb.target;
          return (
            <div
              className="flex min-w-0 items-center gap-1"
              key={breadcrumb.label + "-" + String(index)}
            >
              {index > 0 ? (
                <ChevronRightIcon
                  aria-hidden
                  className="size-3 shrink-0 text-muted-foreground/45"
                />
              ) : null}
              {target ? (
                <button
                  className="truncate text-muted-foreground hover:text-foreground"
                  onClick={() => navigateWithinRoom(target)}
                  type="button"
                >
                  {breadcrumb.label}
                </button>
              ) : (
                <span className="truncate font-medium text-foreground">{breadcrumb.label}</span>
              )}
            </div>
          );
        })}
      </div>
      <span className="ml-auto hidden rounded-full border border-border bg-muted/35 px-2 py-0.5 text-[10px] text-muted-foreground sm:inline-flex">
        Fixture · workspace-read v2
      </span>
    </header>
  );
}

export function RoomsWorkspaceShell({
  roomSlug,
  surface,
}: {
  readonly roomSlug: string;
  readonly surface: RoomsWorkspaceSurface;
}) {
  const navigate = useNavigate();
  const [sidebarVariant] = useAppSidebarVariantSelection();
  const room = findDeclaredRoomBySlug(roomsWorkspaceFixture.rooms, roomSlug);
  const { selectRoom } = useRoomsWorkspaceSelection();
  const navigateWithinRoom = useNavigateWithinRoom(room);
  useEffect(() => {
    if (!isRoomsWorkspaceEnabled(sidebarVariant)) {
      void navigate({ to: "/", replace: true });
      return;
    }
    if (room) selectRoom(room);
  }, [navigate, room, selectRoom, sidebarVariant]);

  if (!isRoomsWorkspaceEnabled(sidebarVariant)) {
    return <SidebarInset className="h-dvh min-h-0 bg-background" />;
  }

  if (!room) {
    return (
      <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
        <section className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md text-center">
            <h1 className="text-lg font-semibold">Room not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The requested room is not declared by workspace-read v2.
            </p>
          </div>
        </section>
      </SidebarInset>
    );
  }

  const workspace = workspaceForDeclaredRoom(roomsWorkspaceFixture, room.id);
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <RoomsBreadcrumbBar room={room} surface={surface} />
      <div className="flex min-h-0 min-w-0 flex-1">
        <aside className="hidden w-60 shrink-0 border-r border-border bg-sidebar/45 md:flex">
          <RoomsWorkspaceNavigation
            navigate={navigateWithinRoom as RoomsWorkspaceNavigate}
            room={room}
            surface={surface}
            workspace={workspace}
          />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <details className="shrink-0 border-b border-border bg-sidebar/45 md:hidden">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-foreground">
              {room.name} navigation
            </summary>
            <div className="max-h-[42vh] w-60 max-w-full overflow-y-auto">
              <RoomsWorkspaceNavigation
                navigate={navigateWithinRoom as RoomsWorkspaceNavigate}
                room={room}
                surface={surface}
                workspace={workspace}
              />
            </div>
          </details>
          <div className="min-h-0 flex-1">
            <RoomsWorkspaceSurfaceView room={room} surface={surface} workspace={workspace} />
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

export function RoomsWorkspaceLanding() {
  const navigate = useNavigate();
  const [sidebarVariant] = useAppSidebarVariantSelection();
  const { selectedRoom } = useRoomsWorkspaceSelection();
  useEffect(() => {
    if (!isRoomsWorkspaceEnabled(sidebarVariant)) {
      void navigate({ to: "/", replace: true });
      return;
    }
    void navigate({
      to: "/rooms/$roomSlug/dashboard",
      params: { roomSlug: selectedRoom.slug },
      replace: true,
    });
  }, [navigate, selectedRoom.slug, sidebarVariant]);

  return <SidebarInset className="h-dvh min-h-0 bg-background" />;
}
