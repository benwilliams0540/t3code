import { describe, expect, it } from "vite-plus/test";

import { roomsProjectBindingMenuMode } from "./RoomsThreadNavigation";

describe("Rooms project binding menu", () => {
  it("offers project creation when no native T3 project exists", () => {
    expect(
      roomsProjectBindingMenuMode({
        availableProjectCount: 0,
        unresolvedBindingCount: 0,
      }),
    ).toBe("create");
  });

  it("keeps binding management available for projects and unresolved references", () => {
    expect(
      roomsProjectBindingMenuMode({
        availableProjectCount: 1,
        unresolvedBindingCount: 0,
      }),
    ).toBe("manage");
    expect(
      roomsProjectBindingMenuMode({
        availableProjectCount: 0,
        unresolvedBindingCount: 1,
      }),
    ).toBe("manage");
  });
});
