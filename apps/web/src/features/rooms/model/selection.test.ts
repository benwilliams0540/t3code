import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import {
  resolveSelectedRoom,
  roomForShortcut,
  ROOMS_SELECTED_ROOM_STORAGE_KEY,
  workspaceForDeclaredRoom,
} from "./selection";

describe("Rooms v2 workspace selection", () => {
  const fallbackRoomId = roomsWorkspaceFixture.workspaces[0]!.room_id;

  it("preserves the existing persisted key and reloads either declared room id", () => {
    expect(ROOMS_SELECTED_ROOM_STORAGE_KEY).toBe("t3code.rooms.selected-room-id.v1");
    for (const room of roomsWorkspaceFixture.rooms) {
      expect(resolveSelectedRoom(roomsWorkspaceFixture.rooms, room.id, fallbackRoomId)).toBe(room);
      expect(workspaceForDeclaredRoom(roomsWorkspaceFixture, room.id)?.room_id).toBe(room.id);
    }
    expect(
      resolveSelectedRoom(roomsWorkspaceFixture.rooms, "room:not-declared", fallbackRoomId).id,
    ).toBe(fallbackRoomId);
  });

  it("switches every workspace-owned surface coherently", () => {
    const [first, second] = roomsWorkspaceFixture.workspaces;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (!first || !second) return;
    const fingerprint = (workspace: typeof first) => ({
      room: workspace.room_id,
      dashboard: workspace.dashboard.vision.headline,
      navigation: workspace.navigation.map((entry) => entry.route),
      feeds: workspace.feeds.flatMap((feed) => feed.items.map((item) => item.id)),
      stories: workspace.stories.map((story) => story.id),
      evidence: workspace.evidence.map((record) => record.id),
      decisions: workspace.decisions.map((record) => record.id),
      audit: workspace.audit.map((record) => record.id),
      sources: workspace.sources.map((source) => source.id),
      projections: workspace.projections.map((projection) => projection.stage_order),
    });
    expect(fingerprint(first)).not.toEqual(fingerprint(second));
    expect(first.channels.map((channel) => channel.name)).toEqual(["# infra", "# product"]);
    expect(second.channels.map((channel) => channel.name)).toEqual(["# capture", "# delivery"]);
  });

  it("maps Cmd/Ctrl+1-9 to declaration order", () => {
    expect(
      roomForShortcut(roomsWorkspaceFixture.rooms, { key: "1", metaKey: true, ctrlKey: false }),
    ).toBe(roomsWorkspaceFixture.rooms[0]);
    expect(
      roomForShortcut(roomsWorkspaceFixture.rooms, { key: "2", metaKey: false, ctrlKey: true }),
    ).toBe(roomsWorkspaceFixture.rooms[1]);
    expect(
      roomForShortcut(roomsWorkspaceFixture.rooms, { key: "9", metaKey: true, ctrlKey: false }),
    ).toBeNull();
  });
});
