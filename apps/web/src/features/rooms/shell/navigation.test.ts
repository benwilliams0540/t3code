import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { buildRoomsBreadcrumbs, channelSlugFromName, projectSectionSlug } from "./navigation";

describe("Rooms shell navigation", () => {
  const room = roomsWorkspaceFixture.rooms[0]!;

  it("normalizes only presentation slugs while retaining declared room identity", () => {
    expect(channelSlugFromName("# infra")).toBe("infra");
    expect(projectSectionSlug("audit_decisions")).toBe("audit-decisions");
    expect(room.slug).toBe("rooms-local");
  });

  it("builds nested project and channel breadcrumbs", () => {
    expect(
      buildRoomsBreadcrumbs(room, { kind: "channel", channelSlug: "infra" }).map(
        (crumb) => crumb.label,
      ),
    ).toEqual(["Rooms", "Channels", "# infra"]);
    expect(
      buildRoomsBreadcrumbs(room, {
        kind: "project",
        projectSection: "vision",
        projectView: "atlas",
      }).map((crumb) => crumb.label),
    ).toEqual(["Rooms", "Project", "Vision", "Atlas"]);
  });
});
