// Reset still clears this retired fixture-only selection preference.
export const ROOMS_SELECTED_ROOM_STORAGE_KEY = "t3code.rooms.selected-room-id.v1";

export function roomForShortcut<Room>(
  rooms: readonly Room[],
  input: { readonly key: string; readonly metaKey: boolean; readonly ctrlKey: boolean },
): Room | null {
  if (!input.metaKey && !input.ctrlKey) return null;
  if (!/^[1-9]$/.test(input.key)) return null;
  return rooms[Number(input.key) - 1] ?? null;
}
