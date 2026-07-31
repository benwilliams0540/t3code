import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import type { RoomsWorkspace } from "../model/workspace";
import { RoomsProjectIndex } from "./RoomsProjectIndex";
import { RoomsProjectSurface } from "./RoomsProjectSurface";
import { projectRoomsProjectIndex, resolveRoomsProjectSection } from "./projection";

const room = roomsWorkspaceFixture.rooms.find(
  (candidate) => candidate.id === roomsWorkspaceFixture.workspace.selected_room_id,
)!;

describe("Rooms project surface", () => {
  it("routes each declared project section and rejects unknown project views", () => {
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
    expect(resolveRoomsProjectSection({ kind: "project", projectSection: "not-declared" })).toBe(
      "unknown",
    );
    expect(
      resolveRoomsProjectSection({
        kind: "project",
        projectSection: "vision",
        projectView: "not-declared",
      }),
    ).toBe("unknown");
  });

  it("projects the single fixture document and every project navigation entry", () => {
    const projection = projectRoomsProjectIndex(
      roomsWorkspaceFixture,
      roomsWorkspaceFixture.workspace,
    );

    expect(projection.documents).toHaveLength(1);
    expect(projection.documents[0]).toMatchObject({
      document: { title: "Rooms Vision", freshness: { state: "stale" } },
      currentRevision: { state: "current" },
      author: { display_name: "Ben" },
    });
    expect(projection.navigation.map(({ key }) => key)).toEqual([
      "vision",
      "stories",
      "evidence",
      "audit_decisions",
    ]);
  });

  it("renders truthful unknown and empty states", () => {
    const unknownHtml = renderToStaticMarkup(
      <RoomsProjectSurface
        fixture={roomsWorkspaceFixture}
        room={room}
        surface={{ kind: "project", projectSection: "not-declared" }}
        workspace={roomsWorkspaceFixture.workspace}
      />,
    );
    expect(unknownHtml).toContain("Unknown project section");

    const emptyWorkspace: RoomsWorkspace = {
      ...roomsWorkspaceFixture.workspace,
      documents: [],
      project_navigation: [],
    };
    const emptyHtml = renderToStaticMarkup(
      <RoomsProjectIndex
        fixture={roomsWorkspaceFixture}
        room={room}
        surface={{ kind: "project", projectSection: "index" }}
        workspace={emptyWorkspace}
      />,
    );
    expect(emptyHtml).toContain("No project surfaces declared");
  });
});
