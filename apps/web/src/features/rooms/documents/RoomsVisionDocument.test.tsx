import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { RoomsVisionDocument } from "./RoomsVisionDocument";
import { projectRoomsVisionDocument } from "./projection";

describe("Rooms v2 vision document", () => {
  it("keeps rendered pin, observed head, and freshness independent for both rooms", () => {
    const first = projectRoomsVisionDocument(
      roomsWorkspaceFixture,
      roomsWorkspaceFixture.workspaces[0]!,
    );
    const second = projectRoomsVisionDocument(
      roomsWorkspaceFixture,
      roomsWorkspaceFixture.workspaces[1]!,
    );
    expect(first).toMatchObject({
      isStale: true,
      document: {
        source: {
          pinned_revision: "033f337b7f5ee6e61de2c0277e716486698211a2",
          observed_head: "02e787d2ce45c5e1a9bd9fb6554b6f7fe3547a62",
        },
        freshness: { state: "stale" },
      },
      currentRevision: { source_revision: "033f337b7f5ee6e61de2c0277e716486698211a2" },
    });
    expect(second).toMatchObject({
      isStale: false,
      document: { freshness: { state: "current" } },
    });
  });

  it("renders the pinned revision rather than silently advancing to observed head", () => {
    const room = roomsWorkspaceFixture.rooms[0]!;
    const workspace = roomsWorkspaceFixture.workspaces[0]!;
    const markup = renderToStaticMarkup(
      <RoomsVisionDocument
        fixture={roomsWorkspaceFixture}
        room={room}
        surface={{ kind: "project", projectSection: "vision", projectView: "document" }}
        workspace={workspace}
      />,
    );
    expect(markup).toContain("033f337b7f5ee6e61de2c0277e716486698211a2");
    expect(markup).toContain("02e787d2ce45c5e1a9bd9fb6554b6f7fe3547a62");
    expect(markup).toContain("data-rooms-markdown-source=");
  });
});
