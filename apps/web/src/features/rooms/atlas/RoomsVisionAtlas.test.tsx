import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { RoomsVisionAtlas } from "./RoomsVisionAtlas";
import { projectRoomsAtlas } from "./projection";

const room = roomsWorkspaceFixture.rooms.find(
  (candidate) => candidate.id === roomsWorkspaceFixture.workspace.selected_room_id,
)!;

describe("Rooms vision Atlas", () => {
  it("binds the Atlas to its declared revision and fixture relationships", () => {
    const projection = projectRoomsAtlas(
      roomsWorkspaceFixture,
      room,
      roomsWorkspaceFixture.workspace,
    );

    expect(projection?.document.atlas.revision_id).toBe(
      "revision:019fb900-5100-7000-8000-000000000001",
    );
    expect(projection?.boundRevision.id).toBe(projection?.document.atlas.revision_id);
    expect(projection?.boundRevision.source_hash).toBe("033f337b7f5ee6e61de2c0277e716486698211a2");
    expect(projection?.channels.map((channel) => channel.name)).toEqual(["# infra", "# product"]);
    expect(projection?.stages.map((stage) => stage.name)).toEqual([
      "Backlog",
      "In progress",
      "Gate / Human QA",
      "Done",
    ]);
    expect(projection?.presence.humans).toHaveLength(2);
    expect(projection?.presence.agents).toHaveLength(2);
    expect(projection?.presence.machines).toHaveLength(2);
    expect(projection?.isStale).toBe(true);
  });

  it("shows the stale warning and bound revision without invented remote content", () => {
    const html = renderToStaticMarkup(
      <RoomsVisionAtlas
        fixture={roomsWorkspaceFixture}
        room={room}
        surface={{ kind: "project", projectSection: "vision", projectView: "atlas" }}
        workspace={roomsWorkspaceFixture.workspace}
      />,
    );

    expect(html).toContain("Stale Atlas projection");
    expect(html).toContain("revision:019fb900-5100-7000-8000-000000000001");
    expect(html).toContain("# infra");
    expect(html).toContain("Gate / Human QA");
    expect(html).toContain("Codex on MacBook");
  });
});
