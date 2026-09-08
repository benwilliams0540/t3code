import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { RoomsEvidenceList } from "./RoomsEvidenceList";
import { projectRoomsEvidence } from "./projection";

describe("Rooms v2 evidence", () => {
  it("projects only first-class evidence with exact producer, story, run, and CAS facts", () => {
    const first = projectRoomsEvidence(roomsWorkspaceFixture, roomsWorkspaceFixture.workspaces[0]!);
    const second = projectRoomsEvidence(
      roomsWorkspaceFixture,
      roomsWorkspaceFixture.workspaces[1]!,
    );
    expect(first.items.map(({ evidence }) => evidence.id)).toEqual(
      roomsWorkspaceFixture.workspaces[0]!.evidence.map((record) => record.id),
    );
    expect(first.items[0]).toMatchObject({
      evidence: { kind: "artifact", run_id: "run:019fb920-4100-7000-8000-000000000001" },
      producer: { agent_kind: "execution" },
    });
    expect(second.items.map(({ story }) => story.room_id)).toEqual([
      roomsWorkspaceFixture.rooms[1]!.id,
      roomsWorkspaceFixture.rooms[1]!.id,
      roomsWorkspaceFixture.rooms[1]!.id,
    ]);
  });

  it("renders direct gate requirements separately from evidence records", () => {
    const markup = renderToStaticMarkup(
      <RoomsEvidenceList
        fixture={roomsWorkspaceFixture}
        room={roomsWorkspaceFixture.rooms[0]!}
        surface={{ kind: "project", projectSection: "evidence" }}
        workspace={roomsWorkspaceFixture.workspaces[0]!}
      />,
    );
    expect(markup).toContain("First-class v2 evidence");
    expect(markup).toContain("Workflow gate facts");
    expect(markup).toContain("self review forbidden");
  });
});
