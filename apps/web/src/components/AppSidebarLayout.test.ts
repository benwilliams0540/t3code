import { describe, expect, it } from "vite-plus/test";

import { resolveAppSidebarVariant } from "./AppSidebarLayout";

describe("AppSidebarLayout Rooms rail compatibility", () => {
  it("preserves v1 before settings hydrate or when v2 is disabled", () => {
    expect(resolveAppSidebarVariant({ isOnSettings: false, sidebarV2Enabled: false })).toEqual({
      useSidebarV2: false,
      useSidebarV2Theme: false,
    });
  });

  it("preserves v2 outside settings", () => {
    expect(resolveAppSidebarVariant({ isOnSettings: false, sidebarV2Enabled: true })).toEqual({
      useSidebarV2: true,
      useSidebarV2Theme: true,
    });
  });

  it("keeps the v1 settings navigation mounted under the v2 theme", () => {
    expect(resolveAppSidebarVariant({ isOnSettings: true, sidebarV2Enabled: true })).toEqual({
      useSidebarV2: false,
      useSidebarV2Theme: true,
    });
  });
});
