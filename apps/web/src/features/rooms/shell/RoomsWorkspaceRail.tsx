import { useNavigate } from "@tanstack/react-router";
import { LockKeyholeIcon, UsersIcon } from "lucide-react";
import { useCallback, useEffect } from "react";

import { cn } from "~/lib/utils";

import { useRoomsDataSource, type RoomsSourceRoom } from "../dataSource";
import { roomForShortcut } from "../model/selection";
import { ThreadspaceMark } from "./ThreadspaceIdentity";

function roomMonogram(room: RoomsSourceRoom): string {
  return room.name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function RoomsWorkspaceRail({
  reserveMacosWindowControls,
}: {
  readonly reserveMacosWindowControls: boolean;
}) {
  const navigate = useNavigate();
  const { selectedRoom, selectRoom, state } = useRoomsDataSource();
  const openRoom = useCallback(
    (room: RoomsSourceRoom) => {
      selectRoom(room);
      void navigate({
        to: "/rooms/$roomSlug/dashboard",
        params: { roomSlug: room.slug },
      });
    },
    [navigate, selectRoom],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          event.target.closest("input, textarea, select, [data-keybinding-capture]"))
      ) {
        return;
      }
      const room = roomForShortcut(state.rooms, event);
      if (!room) return;
      event.preventDefault();
      openRoom(room);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [openRoom, state.rooms]);

  return (
    <aside
      aria-label="Threadspace rooms"
      className="relative z-30 flex h-full w-[var(--rooms-workspace-rail-width)] shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar text-sidebar-foreground surface-grain"
      data-rooms-workspace-rail=""
    >
      <div
        className="drag-region relative z-10 flex h-[var(--workspace-topbar-height)] w-[var(--rooms-window-controls-width)] shrink-0 self-start bg-sidebar"
        data-rooms-macos-window-controls-spacer={reserveMacosWindowControls ? "" : undefined}
      >
        {reserveMacosWindowControls ? null : (
          <ThreadspaceMark className="m-auto size-5 text-[var(--threadspace-cyan)]" />
        )}
        <span className="sr-only">Threadspace</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2 py-2">
        {state.rooms.map((room, index) => {
          const isSelected = selectedRoom?.id === room.id;
          const LocalityIcon = room.locality === "local_only" ? LockKeyholeIcon : UsersIcon;
          const modifierLabel =
            typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "⌘" : "Ctrl+";
          return (
            <button
              aria-current={isSelected ? "page" : undefined}
              aria-label={
                room.unreadCount === null
                  ? `${room.name}, local only`
                  : `${room.name}, ${room.unreadCount} unread, ${room.locality === "local_only" ? "local only" : "shared"}`
              }
              className={cn(
                "group/room relative flex size-10 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px] font-semibold tracking-[0.08em] transition-[border-color,background-color] motion-reduce:transition-none",
                isSelected
                  ? "border-[var(--threadspace-cyan-edge)] bg-[var(--threadspace-cyan-soft)] text-foreground"
                  : "border-border bg-muted/45 text-muted-foreground hover:border-[var(--threadspace-cyan-edge)] hover:bg-muted hover:text-foreground",
              )}
              data-room-id={room.id}
              key={room.id}
              onClick={() => openRoom(room)}
              title={`${room.name} · ${modifierLabel}${index + 1}`}
              type="button"
            >
              {isSelected ? (
                <span className="absolute -left-[9px] h-5 w-[2px] bg-[var(--threadspace-cyan)]" />
              ) : null}
              {roomMonogram(room)}
              <LocalityIcon
                aria-hidden
                className="absolute -bottom-1 -left-1 size-3 bg-sidebar p-0.5 text-muted-foreground"
              />
              {room.unreadCount !== null && room.unreadCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 min-w-4 border border-sidebar bg-[var(--threadspace-amber)] px-1 text-center text-[9px] font-bold leading-4 text-white">
                  {room.unreadCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
