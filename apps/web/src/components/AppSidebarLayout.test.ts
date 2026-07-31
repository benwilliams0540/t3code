import { describe, expect, it } from "vite-plus/test";

import { resolveAppSidebarPresentation } from "./AppSidebarLayout";
import { resolveAppSidebarVariantSelection } from "./appSidebarVariant";

describe("app sidebar selection", () => {
  it("migrates the existing v1/v2 preference until a three-way choice exists", () => {
    expect(
      resolveAppSidebarVariantSelection({ configuredVariant: null, sidebarV2Enabled: false }),
    ).toBe("v1");
    expect(
      resolveAppSidebarVariantSelection({ configuredVariant: null, sidebarV2Enabled: true }),
    ).toBe("v2");
  });

  it("lets an explicit v3 choice override the legacy v1/v2 preference", () => {
    expect(
      resolveAppSidebarVariantSelection({ configuredVariant: "v3", sidebarV2Enabled: true }),
    ).toBe("v3");
  });
});

describe("AppSidebarLayout sidebar exclusivity", () => {
  it("uses Rooms as the only sidebar for v3", () => {
    expect(
      resolveAppSidebarPresentation({
        isOnSettings: false,
        sidebarVariant: "v3",
      }),
    ).toEqual({
      showRoomsSidebar: true,
      useSidebarV2: false,
      useSidebarV2Theme: false,
    });
  });

  it("preserves v1 before settings hydrate or when v2 is disabled", () => {
    expect(
      resolveAppSidebarPresentation({
        isOnSettings: false,
        sidebarVariant: "v1",
      }),
    ).toEqual({ showRoomsSidebar: false, useSidebarV2: false, useSidebarV2Theme: false });
  });

  it("preserves v2 outside settings", () => {
    expect(
      resolveAppSidebarPresentation({
        isOnSettings: false,
        sidebarVariant: "v2",
      }),
    ).toEqual({ showRoomsSidebar: false, useSidebarV2: true, useSidebarV2Theme: true });
  });

  it("keeps the v1 settings navigation mounted under the v2 theme", () => {
    expect(
      resolveAppSidebarPresentation({
        isOnSettings: true,
        sidebarVariant: "v2",
      }),
    ).toEqual({ showRoomsSidebar: false, useSidebarV2: false, useSidebarV2Theme: true });
  });

  it("never mounts v1 beside v3 while Settings is open", () => {
    expect(
      resolveAppSidebarPresentation({
        isOnSettings: true,
        sidebarVariant: "v3",
      }),
    ).toEqual({ showRoomsSidebar: false, useSidebarV2: false, useSidebarV2Theme: true });
  });
});
