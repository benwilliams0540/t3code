import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { RoomsProjectSurface } from "./RoomsProjectSurface";
import { projectRoomsProjectIndex, resolveRoomsProjectSection } from "./projection";

describe("Rooms v2 project surfaces", () => {
  it("maps every declared project section and rejects unknown routes", () => {
    expect(resolveRoomsProjectSection({ kind: "project", projectSection: "vision" })).toBe(
      "vision",
    );
    expect(resolveRoomsProjectSection({ kind: "project", projectSection: "stories" })).toBe(
      "stories",
    );
    expect(resolveRoomsProjectSection({ kind: "project", projectSection: "evidence" })).toBe(
      "evidence",
    );
    expect(resolveRoomsProjectSection({ kind: "project", projectSection: "audit-decisions" })).toBe(
      "audit-decisions",
    );
    expect(resolveRoomsProjectSection({ kind: "project", projectSection: "other" })).toBe(
      "unknown",
    );
  });

  it("switching workspaces changes navigation, documents, authors, and source pins coherently", () => {
    const first = projectRoomsProjectIndex(
      roomsWorkspaceFixture,
      roomsWorkspaceFixture.workspaces[0]!,
    );
    const second = projectRoomsProjectIndex(
      roomsWorkspaceFixture,
      roomsWorkspaceFixture.workspaces[1]!,
    );
    expect(
      first.navigation
        .map((entry) => entry.route)
        .every((route) => route.startsWith("/rooms/rooms-local")),
    ).toBe(true);
    expect(
      second.navigation
        .map((entry) => entry.route)
        .every((route) => route.startsWith("/rooms/camera-team")),
    ).toBe(true);
    expect(first.documents[0]?.document.id).not.toBe(second.documents[0]?.document.id);
    expect(first.documents[0]?.currentRevision?.source_revision).not.toBe(
      second.documents[0]?.currentRevision?.source_revision,
    );
  });

  it("renders all project sections from typed workspace facts", () => {
    const room = roomsWorkspaceFixture.rooms[0]!;
    const workspace = roomsWorkspaceFixture.workspaces[0]!;
    for (const [projectSection, marker] of [
      ["vision", "data-rooms-document-id"],
      ["stories", 'data-rooms-project-section="stories"'],
      ["evidence", 'data-rooms-project-section="evidence"'],
      ["audit-decisions", 'data-rooms-project-section="audit-decisions"'],
    ] as const) {
      const markup = renderToStaticMarkup(
        <RoomsProjectSurface
          fixture={roomsWorkspaceFixture}
          room={room}
          surface={{ kind: "project", projectSection }}
          workspace={workspace}
        />,
      );
      expect(markup).toContain(marker);
    }
  });
});
