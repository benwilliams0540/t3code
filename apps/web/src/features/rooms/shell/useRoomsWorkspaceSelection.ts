import * as Schema from "effect/Schema";
import { useCallback, useMemo } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";

import { roomsWorkspaceFixture } from "../fixtures";
import { resolveSelectedRoom, ROOMS_SELECTED_ROOM_STORAGE_KEY } from "../model/selection";
import type { RoomsRoom } from "../model/workspace";

export function useRoomsWorkspaceSelection(): {
  readonly selectedRoom: RoomsRoom;
  readonly selectRoom: (room: RoomsRoom) => void;
} {
  const fallbackRoomId = roomsWorkspaceFixture.workspace.selected_room_id;
  const [persistedRoomId, setPersistedRoomId] = useLocalStorage(
    ROOMS_SELECTED_ROOM_STORAGE_KEY,
    fallbackRoomId,
    Schema.String,
  );
  const selectedRoom = useMemo(
    () => resolveSelectedRoom(roomsWorkspaceFixture.rooms, persistedRoomId, fallbackRoomId),
    [fallbackRoomId, persistedRoomId],
  );
  const selectRoom = useCallback(
    (room: RoomsRoom) => {
      setPersistedRoomId(room.id);
    },
    [setPersistedRoomId],
  );

  return { selectedRoom, selectRoom };
}
