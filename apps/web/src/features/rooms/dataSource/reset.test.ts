import { describe, expect, it } from "vite-plus/test";

import { APP_SIDEBAR_VARIANT_STORAGE_KEY } from "~/components/appSidebarVariant";

import { ROOMS_RESETTABLE_STORAGE_KEYS, resetRoomsBetaSettings } from "./reset";

describe("Rooms beta reset", () => {
  it("removes only the declared Rooms-owned keys", () => {
    const removed: string[] = [];
    resetRoomsBetaSettings((key) => removed.push(key));

    expect(removed).toEqual(ROOMS_RESETTABLE_STORAGE_KEYS);
    expect(removed).not.toContain(APP_SIDEBAR_VARIANT_STORAGE_KEY);
    expect(removed.some((key) => key.includes("thread"))).toBe(false);
    expect(removed.some((key) => key.includes("project-storage"))).toBe(false);
  });
});
