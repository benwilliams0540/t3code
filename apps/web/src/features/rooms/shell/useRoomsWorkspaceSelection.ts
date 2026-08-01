import { useRoomsDataSource } from "../dataSource";
import type { RoomsSourceRoom } from "../dataSource/model";

export function useRoomsWorkspaceSelection(): {
  readonly selectedRoom: RoomsSourceRoom | null;
  readonly selectRoom: (room: RoomsSourceRoom) => void;
} {
  const { selectedRoom, selectRoom } = useRoomsDataSource();
  return { selectedRoom, selectRoom };
}
