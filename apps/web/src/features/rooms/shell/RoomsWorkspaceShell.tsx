import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronRightIcon,
  PanelLeftCloseIcon,
  PanelLeftIcon,
} from "lucide-react";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { useAppSidebarVariantSelection } from "~/components/appSidebarVariant";
import { Button } from "~/components/ui/button";
import { SidebarInset } from "~/components/ui/sidebar";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useResizableWidth } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";

import { roomsWorkspaceFixture } from "../fixtures";
import { findDeclaredRoomBySlug, workspaceForDeclaredRoom } from "../model/selection";
import type { RoomsRoom } from "../model/workspace";
import {
  buildRoomsBreadcrumbs,
  isRoomsWorkspaceEnabled,
  roomsSurfaceSourceLabel,
  ROOMS_SIDEBAR_OPEN_STORAGE_KEY,
  type RoomsNavigationTarget,
  type RoomsWorkspaceSurface,
} from "./navigation";
import { RoomsWorkspaceNavigation, type RoomsWorkspaceNavigate } from "./RoomsWorkspaceNavigation";
import {
  resolveRoomsSidebarMaximumWidth,
  ROOMS_SIDEBAR_DEFAULT_WIDTH,
  ROOMS_SIDEBAR_MIN_WIDTH,
  ROOMS_SIDEBAR_WIDTH_STORAGE_KEY,
} from "./roomsSidebarWidth";
import { RoomsWorkspaceSurfaceView } from "./RoomsWorkspaceSurface";
import { useRoomsWorkspaceSelection } from "./useRoomsWorkspaceSelection";

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

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
        case "native-thread":
          void navigate({
            to: "/rooms/$roomSlug/threads/$environmentId/$threadId",
            params: {
              roomSlug: room.slug,
              environmentId: target.environmentId,
              threadId: target.threadId,
            },
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
  isSidebarVisible,
  onToggleSidebar,
  room,
  surface,
}: {
  readonly isSidebarVisible: boolean;
  readonly onToggleSidebar: () => void;
  readonly room: RoomsRoom;
  readonly surface: RoomsWorkspaceSurface;
}) {
  const navigateWithinRoom = useNavigateWithinRoom(room);
  const breadcrumbs = buildRoomsBreadcrumbs(room, surface);

  return (
    <header className="workspace-topbar drag-region relative z-40 flex shrink-0 items-center gap-1 border-b border-border pl-[calc(var(--rooms-titlebar-leading-inset)+0.75rem)] pr-3 sm:pl-[calc(var(--rooms-titlebar-leading-inset)+1rem)] sm:pr-4">
      <Button
        aria-label={isSidebarVisible ? "Collapse Rooms sidebar" : "Expand Rooms sidebar"}
        aria-pressed={isSidebarVisible}
        className="mr-1 hidden size-[var(--workspace-titlebar-control-size)] shrink-0 md:inline-flex"
        onClick={onToggleSidebar}
        size="icon"
        title={isSidebarVisible ? "Collapse Rooms sidebar" : "Expand Rooms sidebar"}
        variant="ghost"
      >
        {isSidebarVisible ? <PanelLeftCloseIcon /> : <PanelLeftIcon />}
      </Button>
      <Button
        aria-label="Go back"
        className="shrink-0"
        onClick={() => window.history.back()}
        size="icon-xs"
        title="Back"
        variant="ghost"
      >
        <ArrowLeftIcon />
      </Button>
      <Button
        aria-label="Go forward"
        className="shrink-0"
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
        {roomsSurfaceSourceLabel(surface)}
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
  const [isSidebarVisible, setSidebarVisible] = useLocalStorage(
    ROOMS_SIDEBAR_OPEN_STORAGE_KEY,
    true,
    Schema.Boolean,
  );
  const toggleSidebar = useCallback(() => {
    setSidebarVisible((visible) => !visible);
  }, [setSidebarVisible]);
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);
  const { width: sidebarWidth, handlers: sidebarResizeHandlers } = useResizableWidth({
    storageKey: ROOMS_SIDEBAR_WIDTH_STORAGE_KEY,
    defaultWidth: ROOMS_SIDEBAR_DEFAULT_WIDTH,
    minWidth: ROOMS_SIDEBAR_MIN_WIDTH,
    maxWidth: resolveRoomsSidebarMaximumWidth(viewportWidth),
    edge: "right",
  });
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
      <RoomsBreadcrumbBar
        isSidebarVisible={isSidebarVisible}
        onToggleSidebar={toggleSidebar}
        room={room}
        surface={surface}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        {isSidebarVisible ? (
          <aside
            className="relative hidden shrink-0 border-r border-border bg-sidebar/45 md:flex"
            data-rooms-sidebar=""
            style={{ width: `${sidebarWidth}px` }}
          >
            <RoomsWorkspaceNavigation
              navigate={navigateWithinRoom as RoomsWorkspaceNavigate}
              room={room}
              surface={surface}
              workspace={workspace}
            />
            <button
              aria-label="Resize Rooms sidebar"
              className="absolute inset-y-0 -right-2 z-30 w-4 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px hover:after:bg-sidebar-border"
              data-rooms-sidebar-resize-handle=""
              onPointerCancel={sidebarResizeHandlers.onPointerCancel}
              onPointerDown={sidebarResizeHandlers.onPointerDown}
              onPointerMove={sidebarResizeHandlers.onPointerMove}
              onPointerUp={sidebarResizeHandlers.onPointerUp}
              tabIndex={-1}
              title="Drag to resize Rooms sidebar"
              type="button"
            />
          </aside>
        ) : null}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            surface.kind === "native-thread" || surface.kind === "native-draft"
              ? "overflow-hidden"
              : "overflow-y-auto",
          )}
        >
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
          <div
            className={cn(
              "min-h-0 flex-1",
              (surface.kind === "native-thread" || surface.kind === "native-draft") && "flex",
            )}
          >
            <RoomsWorkspaceSurfaceView
              navigate={navigateWithinRoom as RoomsWorkspaceNavigate}
              room={room}
              surface={surface}
              workspace={workspace}
            />
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
