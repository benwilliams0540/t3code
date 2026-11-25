import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { principalPresentation } from "./projection";

describe("Rooms v2 activity projection", () => {
  it("preserves principal presentation without conflating principal types", () => {
    expect(
      roomsWorkspaceFixture.principals.map((principal) => principalPresentation(principal).tone),
    ).toContain("human");
    expect(
      roomsWorkspaceFixture.principals.map((principal) => principalPresentation(principal).tone),
    ).toContain("agent");
    expect(
      roomsWorkspaceFixture.principals.map((principal) => principalPresentation(principal).tone),
    ).toContain("machine");
  });
});
