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

import { findSourceRoomBySlug, useRoomsDataSource, type RoomsSourceRoom } from "../dataSource";
import { workspaceForDeclaredRoom } from "../model/selection";
import {
  buildRoomsBreadcrumbs,
  isRoomsWorkspaceEnabled,
  roomsSurfaceSourceLabel,
  roomsRoutePath,
  ROOMS_LAST_ROUTE_STORAGE_KEY,
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

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

function useNavigateWithinRoom(
  room: RoomsSourceRoom | null,
): (target: RoomsNavigationTarget) => void {
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
  readonly room: RoomsSourceRoom;
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
        {roomsSurfaceSourceLabel(surface, room.sourceMode)}
      </span>
    </header>
  );
}

function RoomsSourceStatePanel({
  initializeLocalWorkspace,
  message,
  onUseSample,
  title,
}: {
  readonly initializeLocalWorkspace?: (() => void) | undefined;
  readonly message: string;
  readonly onUseSample: () => void;
  readonly title: string;
}) {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <section className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-border bg-card p-7 text-center">
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {initializeLocalWorkspace ? (
              <Button onClick={initializeLocalWorkspace}>Create local workspace</Button>
            ) : null}
            <Button onClick={onUseSample} variant="outline">
              Use Sample workspace
            </Button>
          </div>
        </div>
      </section>
    </SidebarInset>
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
  const { initializeLocalWorkspace, selectRoom, selectedRoom, setMode, state } =
    useRoomsDataSource();
  const room = findSourceRoomBySlug(state, roomSlug);
  const currentRoute = roomsRoutePath(roomSlug, surface);
  const [, setLastRoomsRoute] = useLocalStorage(
    ROOMS_LAST_ROUTE_STORAGE_KEY,
    null,
    Schema.NullOr(Schema.String),
  );
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
    if (room) {
      selectRoom(room);
      setLastRoomsRoute(currentRoute);
      return;
    }
    if (state.status === "ready" && selectedRoom) {
      void navigate({
        to: "/rooms/$roomSlug/dashboard",
        params: { roomSlug: selectedRoom.slug },
        replace: true,
      });
    }
  }, [
    currentRoute,
    navigate,
    room,
    selectRoom,
    selectedRoom,
    setLastRoomsRoute,
    sidebarVariant,
    state.status,
  ]);

  if (!isRoomsWorkspaceEnabled(sidebarVariant)) {
    return <SidebarInset className="h-dvh min-h-0 bg-background" />;
  }

  if (state.status === "setup-required") {
    return (
      <RoomsSourceStatePanel
        initializeLocalWorkspace={initializeLocalWorkspace}
        message="Create a local workspace to bind actual T3 projects and threads. Sample data stays separate."
        onUseSample={() => setMode("sample")}
        title="Local workspace setup required"
      />
    );
  }

  if (state.status === "unavailable") {
    return (
      <RoomsSourceStatePanel
        message="Rooms could not load this source. Retry from Beta settings or return to the Sample workspace."
        onUseSample={() => setMode("sample")}
        title="Rooms source unavailable"
      />
    );
  }

  if (!room) {
    return <SidebarInset className="h-dvh min-h-0 bg-background" />;
  }

  const workspace = (() => {
    if (state.mode !== "sample") return null;
    const declaredRoom = state.fixture.rooms.find((candidate) => candidate.id === room.id);
    return declaredRoom ? workspaceForDeclaredRoom(state.fixture, declaredRoom.id) : null;
  })();
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <RoomsBreadcrumbBar
        isSidebarVisible={isSidebarVisible}
        onToggleSidebar={toggleSidebar}
        room={room}
        surface={surface}
      />
      <div className="flex min-h-0 min-w-0 flex-1">
        <aside
          aria-hidden={!isSidebarVisible}
          className={cn(
            "relative hidden shrink-0 overflow-hidden border-r bg-sidebar text-sidebar-foreground surface-grain transition-[width,border-color] duration-200 ease-linear motion-reduce:transition-none md:flex",
            isSidebarVisible ? "border-sidebar-border" : "pointer-events-none border-transparent",
          )}
          data-rooms-sidebar=""
          data-state={isSidebarVisible ? "expanded" : "collapsed"}
          inert={!isSidebarVisible}
          style={{ width: isSidebarVisible ? `${sidebarWidth}px` : "0px" }}
        >
          <div
            className={cn(
              "flex min-h-0 shrink-0 transition-transform duration-200 ease-linear motion-reduce:transition-none",
              !isSidebarVisible && "-translate-x-full",
            )}
            style={{ width: `${sidebarWidth}px` }}
          >
            <RoomsWorkspaceNavigation
              navigate={navigateWithinRoom as RoomsWorkspaceNavigate}
              room={room}
              sourceMode={state.mode}
              surface={surface}
              workspace={workspace}
            />
          </div>
          {isSidebarVisible ? (
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
          ) : null}
        </aside>
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col",
            surface.kind === "native-thread" || surface.kind === "native-draft"
              ? "overflow-hidden"
              : "overflow-y-auto",
          )}
        >
          <details className="shrink-0 border-b border-sidebar-border bg-sidebar text-sidebar-foreground surface-grain md:hidden">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-foreground">
              {room.name} navigation
            </summary>
            <div className="max-h-[42vh] w-60 max-w-full overflow-y-auto">
              <RoomsWorkspaceNavigation
                navigate={navigateWithinRoom as RoomsWorkspaceNavigate}
                room={room}
                sourceMode={state.mode}
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
              sourceState={state}
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
  const { initializeLocalWorkspace, selectedRoom, setMode, state } = useRoomsDataSource();
  useEffect(() => {
    if (!isRoomsWorkspaceEnabled(sidebarVariant)) {
      void navigate({ to: "/", replace: true });
      return;
    }
    if (selectedRoom) {
      void navigate({
        to: "/rooms/$roomSlug/dashboard",
        params: { roomSlug: selectedRoom.slug },
        replace: true,
      });
    }
  }, [navigate, selectedRoom, sidebarVariant]);

  if (state.status === "setup-required") {
    return (
      <RoomsSourceStatePanel
        initializeLocalWorkspace={initializeLocalWorkspace}
        message="Create a local workspace to bind actual T3 projects and threads."
        onUseSample={() => setMode("sample")}
        title="Local workspace setup required"
      />
    );
  }
  if (state.status === "unavailable") {
    return (
      <RoomsSourceStatePanel
        message="Rooms could not load this source. Return to the Sample workspace and try again."
        onUseSample={() => setMode("sample")}
        title="Rooms source unavailable"
      />
    );
  }

  return <SidebarInset className="h-dvh min-h-0 bg-background" />;
}
