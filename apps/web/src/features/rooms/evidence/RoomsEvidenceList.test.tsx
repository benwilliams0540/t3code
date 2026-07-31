import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { RoomsEvidenceList } from "./RoomsEvidenceList";
import { projectRoomsEvidence } from "./projection";

const room = roomsWorkspaceFixture.rooms.find(
  (candidate) => candidate.id === roomsWorkspaceFixture.workspace.selected_room_id,
)!;

describe("Rooms evidence", () => {
  it("distinguishes supplied CAS metadata from reference-only evidence", () => {
    const projection = projectRoomsEvidence(roomsWorkspaceFixture, roomsWorkspaceFixture.workspace);

    expect(projection.items).toHaveLength(4);
    expect(projection.items.filter((item) => item.fidelity === "full_metadata")).toHaveLength(1);
    expect(projection.items.filter((item) => item.fidelity === "reference_only")).toHaveLength(3);
    expect(
      projection.items.find((item) => item.id === "evidence:019fb900-6000-7000-8000-000000000003")
        ?.detail,
    ).toMatchObject({
      kind: "screenshot",
      hash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      bytes: 48231,
      mediaType: "image/png",
      sourceEvent: { seq: 116, type: "evidence.attached" },
    });
    expect(projection.missingRequirements.map(({ story }) => story.title)).toEqual([
      "Add a project decision timeline",
    ]);
  });

  it("labels absent metadata instead of inventing it", () => {
    const html = renderToStaticMarkup(
      <RoomsEvidenceList
        fixture={roomsWorkspaceFixture}
        room={room}
        surface={{ kind: "project", projectSection: "evidence" }}
        workspace={roomsWorkspaceFixture.workspace}
      />,
    );

    expect(html).toContain("metadata supplied");
    expect(html).toContain("metadata absent");
    expect(html).toContain("Source event metadata");
    expect(html).toContain("Reference only");
    expect(html).toContain("Required, not attached");
  });
});
