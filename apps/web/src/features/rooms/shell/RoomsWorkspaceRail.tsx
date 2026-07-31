import { useNavigate } from "@tanstack/react-router";
import { BoxesIcon, LockKeyholeIcon, UsersIcon } from "lucide-react";
import { useCallback, useEffect } from "react";

import { cn } from "~/lib/utils";

import { roomsWorkspaceFixture } from "../fixtures";
import { roomForShortcut } from "../model/selection";
import type { RoomsRoom } from "../model/workspace";
import { useRoomsWorkspaceSelection } from "./useRoomsWorkspaceSelection";

function roomMonogram(room: RoomsRoom): string {
  return room.name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function RoomsWorkspaceRail() {
  const navigate = useNavigate();
  const { selectedRoom, selectRoom } = useRoomsWorkspaceSelection();
  const openRoom = useCallback(
    (room: RoomsRoom) => {
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
      const room = roomForShortcut(roomsWorkspaceFixture.rooms, event);
      if (!room) return;
      event.preventDefault();
      openRoom(room);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [openRoom]);

  return (
    <aside
      aria-label="Rooms workspaces"
      className="relative z-30 flex h-full w-[var(--rooms-workspace-rail-width)] shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar text-sidebar-foreground surface-grain"
      data-rooms-workspace-rail=""
    >
      <div className="flex h-[var(--workspace-topbar-height)] shrink-0 items-center justify-center">
        <BoxesIcon aria-hidden className="size-4 text-muted-foreground" />
        <span className="sr-only">Rooms</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2 py-2">
        {roomsWorkspaceFixture.rooms.map((room, index) => {
          const isSelected = selectedRoom.id === room.id;
          const LocalityIcon = room.locality === "local_only" ? LockKeyholeIcon : UsersIcon;
          const modifierLabel =
            typeof navigator !== "undefined" && navigator.platform.includes("Mac") ? "⌘" : "Ctrl+";
          return (
            <button
              aria-current={isSelected ? "page" : undefined}
              aria-label={`${room.name}, ${room.unread.count} unread, ${room.locality === "local_only" ? "local only" : "shared"}`}
              className={cn(
                "group/room relative flex size-10 shrink-0 items-center justify-center rounded-xl border text-xs font-semibold transition-[border-color,background-color,border-radius] motion-reduce:transition-none",
                isSelected
                  ? "rounded-[0.65rem] border-blue-500/70 bg-blue-500/18 text-foreground"
                  : "border-border bg-muted/45 text-muted-foreground hover:rounded-[0.65rem] hover:border-border/90 hover:bg-muted hover:text-foreground",
              )}
              data-room-id={room.id}
              key={room.id}
              onClick={() => openRoom(room)}
              title={`${room.name} · ${modifierLabel}${index + 1}`}
              type="button"
            >
              {isSelected ? (
                <span className="absolute -left-[9px] h-5 w-[3px] rounded-full bg-foreground" />
              ) : null}
              {roomMonogram(room)}
              <LocalityIcon
                aria-hidden
                className="absolute -bottom-1 -left-1 size-3 rounded-full bg-sidebar p-0.5 text-muted-foreground"
              />
              {room.unread.count > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
                  {room.unread.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
