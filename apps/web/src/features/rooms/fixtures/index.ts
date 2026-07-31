import rawWorkspaceReadV1 from "./workspace-read-v1.json";

import { ROOMS_WORKSPACE_READ_SOURCE } from "../model/source";
import type { RoomsWorkspaceReadFixture } from "../model/workspace";

export const roomsWorkspaceFixture = rawWorkspaceReadV1 as unknown as RoomsWorkspaceReadFixture;

export function assertRoomsWorkspaceFixtureBoundary(fixture: RoomsWorkspaceReadFixture): void {
  if (
    fixture.contract.id !== ROOMS_WORKSPACE_READ_SOURCE.contractId ||
    fixture.contract.version !== ROOMS_WORKSPACE_READ_SOURCE.contractVersion
  ) {
    throw new Error("Rooms workspace fixture contract pin does not match the app boundary.");
  }
  if (!fixture.rooms.some((room) => room.id === fixture.workspace.selected_room_id)) {
    throw new Error("Rooms workspace fixture selects a room that is not declared.");
  }
}

assertRoomsWorkspaceFixtureBoundary(roomsWorkspaceFixture);
