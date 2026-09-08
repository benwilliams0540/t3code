import { roomsWorkspaceFixture } from "../fixtures";
import type { RoomsSampleSourceReady } from "./model";

export const roomsSampleDataSource: RoomsSampleSourceReady = {
  mode: "sample",
  status: "ready",
  rooms: roomsWorkspaceFixture.rooms.map((room) => ({
    sourceMode: "sample",
    id: room.id,
    slug: room.slug,
    name: room.name,
    locality: room.locality,
    membershipRole: room.membership.role,
    unreadCount: room.unread.count,
  })),
  fixture: roomsWorkspaceFixture,
};
