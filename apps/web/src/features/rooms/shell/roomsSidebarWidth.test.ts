import { describe, expect, it } from "vite-plus/test";

import { resolveRoomsSidebarMaximumWidth, ROOMS_SIDEBAR_MIN_WIDTH } from "./roomsSidebarWidth";

describe("Rooms sidebar width", () => {
  it("preserves the room rail and minimum main-content width", () => {
    expect(resolveRoomsSidebarMaximumWidth(1280)).toBe(584);
  });

  it("never lets a narrow window shrink the sidebar below its usable minimum", () => {
    expect(resolveRoomsSidebarMaximumWidth(720)).toBe(ROOMS_SIDEBAR_MIN_WIDTH);
  });
});
