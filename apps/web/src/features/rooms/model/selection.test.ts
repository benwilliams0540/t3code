import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { resolveSelectedRoom, roomForShortcut, workspaceForDeclaredRoom } from "./selection";

describe("Rooms workspace selection", () => {
  const fallbackRoomId = roomsWorkspaceFixture.workspace.selected_room_id;

  it("persists and resolves declared room ids without logical-project derivation", () => {
    const cameraRoom = roomsWorkspaceFixture.rooms[1]!;
    expect(resolveSelectedRoom(roomsWorkspaceFixture.rooms, cameraRoom.id, fallbackRoomId)).toBe(
      cameraRoom,
    );
    expect(
      resolveSelectedRoom(roomsWorkspaceFixture.rooms, "room:not-declared", fallbackRoomId).id,
    ).toBe(fallbackRoomId);
  });

  it("maps Cmd/Ctrl+1-9 to declaration order", () => {
    expect(
      roomForShortcut(roomsWorkspaceFixture.rooms, {
        key: "1",
        metaKey: true,
        ctrlKey: false,
      }),
    ).toBe(roomsWorkspaceFixture.rooms[0]);
    expect(
      roomForShortcut(roomsWorkspaceFixture.rooms, {
        key: "2",
        metaKey: false,
        ctrlKey: true,
      }),
    ).toBe(roomsWorkspaceFixture.rooms[1]);
    expect(
      roomForShortcut(roomsWorkspaceFixture.rooms, {
        key: "1",
        metaKey: false,
        ctrlKey: false,
      }),
    ).toBeNull();
    expect(
      roomForShortcut(roomsWorkspaceFixture.rooms, {
        key: "9",
        metaKey: true,
        ctrlKey: false,
      }),
    ).toBeNull();
  });

  it("does not reuse the selected room workspace for a declaration with no fixture details", () => {
    expect(workspaceForDeclaredRoom(roomsWorkspaceFixture, fallbackRoomId)).toBe(
      roomsWorkspaceFixture.workspace,
    );
    expect(
      workspaceForDeclaredRoom(roomsWorkspaceFixture, roomsWorkspaceFixture.rooms[1]!.id),
    ).toBe(null);
  });
});
