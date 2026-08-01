import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { resolveRoomsInternalHref } from "./internalHref";
import {
  buildRoomsBreadcrumbs,
  channelSlugFromName,
  isRoomsWorkspaceEnabled,
  projectSectionSlug,
  roomsSurfaceSourceLabel,
  shouldUseRoomsWorkspaceLanding,
} from "./navigation";

describe("Rooms shell navigation", () => {
  const room = roomsWorkspaceFixture.rooms[0]!;

  it("normalizes only presentation slugs while retaining declared room identity", () => {
    expect(channelSlugFromName("# infra")).toBe("infra");
    expect(projectSectionSlug("audit_decisions")).toBe("audit-decisions");
    expect(room.slug).toBe("rooms-local");
  });

  it("enables Rooms only for the mutually exclusive Version 3 selection", () => {
    expect(isRoomsWorkspaceEnabled("v1")).toBe(false);
    expect(isRoomsWorkspaceEnabled("v2")).toBe(false);
    expect(isRoomsWorkspaceEnabled("v3")).toBe(true);
    expect(shouldUseRoomsWorkspaceLanding("v1")).toBe(false);
    expect(shouldUseRoomsWorkspaceLanding("v2")).toBe(false);
    expect(shouldUseRoomsWorkspaceLanding("v3")).toBe(true);
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

  it("keeps Rooms chrome around native T3 thread and draft surfaces", () => {
    const threadSurface = {
      kind: "native-thread",
      environmentId: "environment-local",
      threadId: "thread-native",
    } as const;

    expect(buildRoomsBreadcrumbs(room, threadSurface).map((crumb) => crumb.label)).toEqual([
      "Rooms",
      "Your Threads",
      "T3 Thread",
    ]);
    expect(roomsSurfaceSourceLabel(threadSurface, "sample")).toBe("Local T3 thread");
    expect(
      roomsSurfaceSourceLabel({ kind: "native-draft", draftId: "draft-native" }, "sample"),
    ).toBe("Local T3 thread");
    expect(roomsSurfaceSourceLabel({ kind: "threads" }, "sample")).toBe("Local T3 projects");
    expect(roomsSurfaceSourceLabel({ kind: "dashboard" }, "local")).toBe("Local T3 only");
  });

  it("keeps web routes path-based and adapts internal links to Electron hash history", () => {
    const route = "/rooms/rooms-local/project/vision/atlas";

    expect(resolveRoomsInternalHref(route, "https:")).toBe(route);
    expect(resolveRoomsInternalHref(route, "t3code-dev:")).toBe(`#${route}`);
  });
});
