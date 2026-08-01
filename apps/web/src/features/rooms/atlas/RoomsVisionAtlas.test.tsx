import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { RoomsVisionAtlas } from "./RoomsVisionAtlas";
import { projectRoomsAtlas } from "./projection";

describe("Rooms v2 Atlas", () => {
  it("binds Atlas to each workspace document revision and freshness", () => {
    const first = projectRoomsAtlas(
      roomsWorkspaceFixture,
      roomsWorkspaceFixture.rooms[0]!,
      roomsWorkspaceFixture.workspaces[0]!,
    );
    const second = projectRoomsAtlas(
      roomsWorkspaceFixture,
      roomsWorkspaceFixture.rooms[1]!,
      roomsWorkspaceFixture.workspaces[1]!,
    );
    expect(first).toMatchObject({ isStale: true, boundRevision: { state: "current" } });
    expect(second).toMatchObject({ isStale: false, boundRevision: { state: "current" } });
    expect(first?.boundRevision.id).not.toBe(second?.boundRevision.id);
    expect(first?.stages.map((stage) => stage.key)).toEqual([
      "backlog",
      "in_progress",
      "human_qa",
      "done",
    ]);
  });

  it("renders stale Atlas and direct gate evidence counts", () => {
    const markup = renderToStaticMarkup(
      <RoomsVisionAtlas
        fixture={roomsWorkspaceFixture}
        room={roomsWorkspaceFixture.rooms[0]!}
        surface={{ kind: "project", projectSection: "vision", projectView: "atlas" }}
        workspace={roomsWorkspaceFixture.workspaces[0]!}
      />,
    );
    expect(markup).toContain("stale");
    expect(markup).toContain("evidence kind(s)");
  });
});
