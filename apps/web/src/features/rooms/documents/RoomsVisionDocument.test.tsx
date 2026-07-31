import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { RoomsVisionDocument } from "./RoomsVisionDocument";
import { projectRoomsVisionDocument } from "./projection";

const room = roomsWorkspaceFixture.rooms.find(
  (candidate) => candidate.id === roomsWorkspaceFixture.workspace.selected_room_id,
)!;

describe("Rooms vision document", () => {
  it("projects the exact current and queued revisions with source freshness", () => {
    const projection = projectRoomsVisionDocument(
      roomsWorkspaceFixture,
      roomsWorkspaceFixture.workspace,
    );

    expect(projection?.currentRevision).toMatchObject({
      state: "current",
      source_hash: "033f337b7f5ee6e61de2c0277e716486698211a2",
      body_markdown: "# Rooms Vision\n\nKeep project truth connected around T3.",
    });
    expect(
      projection?.revisions.map(({ author, revision }) => [revision.state, author?.type]),
    ).toEqual([
      ["current", "human"],
      ["queued", "agent"],
    ]);
    expect(projection?.document.source).toEqual({
      remote_url: "https://github.com/benwilliams0540/rooms",
      sha: "033f337b7f5ee6e61de2c0277e716486698211a2",
      source_head: "02e787d2ce45c5e1a9bd9fb6554b6f7fe3547a62",
    });
    expect(projection?.document.freshness).toEqual({
      state: "stale",
      compared_at: "2026-07-31T15:57:00.000Z",
      source_head: "02e787d2ce45c5e1a9bd9fb6554b6f7fe3547a62",
    });
    expect(projection?.isStale).toBe(true);
  });

  it("renders Markdown, revision metadata, source pins, and a prominent stale warning", () => {
    const html = renderToStaticMarkup(
      <RoomsVisionDocument
        fixture={roomsWorkspaceFixture}
        room={room}
        surface={{ kind: "project", projectSection: "vision" }}
        workspace={roomsWorkspaceFixture.workspace}
      />,
    );

    expect(html).toContain("<h1>Rooms Vision</h1>");
    expect(html).toContain("Keep project truth connected around T3.");
    expect(html).toContain("Stale projection — regeneration required");
    expect(html).toContain("Current revision");
    expect(html).toContain("Queued revision");
    expect(html).toContain("033f337b7f5ee6e61de2c0277e716486698211a2");
    expect(html).toContain("02e787d2ce45c5e1a9bd9fb6554b6f7fe3547a62");
  });
});
