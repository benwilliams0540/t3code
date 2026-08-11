import { describe, expect, it } from "vite-plus/test";

import { isMissingShareAppGroupError, shouldIngestNativeShares } from "./sharingAvailability";

describe("native share availability", () => {
  it("disables native ingestion for reduced-capability Personal Team iOS builds", () => {
    expect(shouldIngestNativeShares("ios", true)).toBe(false);
    expect(shouldIngestNativeShares("ios", false)).toBe(true);
    expect(shouldIngestNativeShares("android", true)).toBe(true);
    expect(shouldIngestNativeShares("web", false)).toBe(false);
  });

  it("recognizes the missing app-group failure returned by expo-sharing", () => {
    expect(
      isMissingShareAppGroupError(
        new Error(
          "FailedToResolveAppGroupIdException: Expo-sharing has failed to fetch the app group id",
        ),
      ),
    ).toBe(true);
    expect(isMissingShareAppGroupError(new Error("disk full"))).toBe(false);
  });
});
