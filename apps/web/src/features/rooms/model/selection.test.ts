import { expect, it } from "vite-plus/test";

import { roomForShortcut } from "./selection";

it("maps Cmd/Ctrl+1-9 to the current live room order", () => {
  const rooms = [{ id: "local-room" }, { id: "shared-room" }];
  expect(roomForShortcut(rooms, { key: "1", metaKey: true, ctrlKey: false })).toBe(rooms[0]);
  expect(roomForShortcut(rooms, { key: "2", metaKey: false, ctrlKey: true })).toBe(rooms[1]);
  expect(roomForShortcut(rooms, { key: "9", metaKey: true, ctrlKey: false })).toBeNull();
  expect(roomForShortcut(rooms, { key: "1", metaKey: false, ctrlKey: false })).toBeNull();
});
