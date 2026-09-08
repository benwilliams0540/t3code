import type {
  RoomsEntityId,
  RoomsRoom,
  RoomsWorkspace,
  RoomsWorkspaceReadFixture,
} from "./workspace";

export const ROOMS_SELECTED_ROOM_STORAGE_KEY = "t3code.rooms.selected-room-id.v1";

export function resolveSelectedRoom(
  rooms: readonly RoomsRoom[],
  requestedRoomId: string | null | undefined,
  fallbackRoomId: RoomsEntityId,
): RoomsRoom {
  return (
    rooms.find((room) => room.id === requestedRoomId) ??
    rooms.find((room) => room.id === fallbackRoomId) ??
    rooms[0] ??
    (() => {
      throw new Error("The Threadspace fixture does not declare any rooms.");
    })()
  );
}

export function findDeclaredRoomBySlug(
  rooms: readonly RoomsRoom[],
  roomSlug: string,
): RoomsRoom | null {
  return rooms.find((room) => room.slug === roomSlug) ?? null;
}

export function workspaceForDeclaredRoom(
  fixture: RoomsWorkspaceReadFixture,
  roomId: RoomsEntityId,
): RoomsWorkspace | null {
  return fixture.workspaces.find((workspace) => workspace.room_id === roomId) ?? null;
}

export function roomForShortcut<Room>(
  rooms: readonly Room[],
  input: { readonly key: string; readonly metaKey: boolean; readonly ctrlKey: boolean },
): Room | null {
  if (!input.metaKey && !input.ctrlKey) return null;
  if (!/^[1-9]$/.test(input.key)) return null;
  return rooms[Number(input.key) - 1] ?? null;
}

export function roomDashboardPath(room: { readonly slug: string }): string {
  return `/rooms/${room.slug}/dashboard`;
}
