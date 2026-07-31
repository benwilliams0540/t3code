import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { roomsWorkspaceFixture } from "../fixtures";
import { RoomsAuditDecisions } from "./RoomsAuditDecisions";
import { projectRoomsAudit } from "./projection";

const room = roomsWorkspaceFixture.rooms.find(
  (candidate) => candidate.id === roomsWorkspaceFixture.workspace.selected_room_id,
)!;

describe("Rooms audit and decisions", () => {
  it("orders source events globally and preserves actor identity on decisions", () => {
    const projection = projectRoomsAudit(roomsWorkspaceFixture, roomsWorkspaceFixture.workspace);

    expect(projection.events.map(({ item }) => item.source_event.seq)).toEqual([
      111, 112, 113, 114, 115, 116, 117,
    ]);
    expect(projection.decisions).toHaveLength(1);
    expect(projection.decisions[0]).toMatchObject({
      decision: "needs_changes",
      scope: "once",
      taskId: "task:019fb900-3000-7000-8000-000000000003",
      actor: {
        id: "h:019fb900-0001-7000-8000-000000000002",
        display_name: "Maya",
        type: "human",
      },
      item: { source_event: { seq: 117, type: "approval.decided" } },
    });
    expect(projection.gateFacts.map(({ stage }) => stage.name)).toEqual([
      "Gate / Human QA",
      "Done",
    ]);
  });

  it("renders ordered audit records separately from gate-definition facts", () => {
    const html = renderToStaticMarkup(
      <RoomsAuditDecisions
        fixture={roomsWorkspaceFixture}
        room={room}
        surface={{ kind: "project", projectSection: "audit-decisions" }}
        workspace={roomsWorkspaceFixture.workspace}
      />,
    );

    expect(html.indexOf("seq 111")).toBeLessThan(html.indexOf("seq 117"));
    expect(html).toContain("needs_changes");
    expect(html).toContain("Maya");
    expect(html).toContain("These are workflow-definition facts, not synthetic audit events.");
  });
});
