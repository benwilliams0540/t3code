import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { RoomsAuditDecisions } from "./RoomsAuditDecisions";
import { projectRoomsAudit } from "./projection";

describe("Rooms v2 audit and decisions", () => {
  it("projects first-class decisions and resolves every audit source event locally", () => {
    for (const workspace of roomsWorkspaceFixture.workspaces) {
      const projection = projectRoomsAudit(roomsWorkspaceFixture, workspace);
      expect(projection.decisions.map(({ decision }) => decision.id)).toEqual(
        workspace.decisions.map((decision) => decision.id),
      );
      expect(projection.events.map(({ sourceEvent }) => sourceEvent.event_id)).toEqual(
        workspace.audit.map((audit) => audit.source_event_id),
      );
      expect(
        projection.events.every(
          ({ audit, sourceEvent }) => audit.source_event_id === sourceEvent.event_id,
        ),
      ).toBe(true);
    }
  });

  it("renders decisions, typed subjects, and source-event provenance", () => {
    const markup = renderToStaticMarkup(
      <RoomsAuditDecisions
        fixture={roomsWorkspaceFixture}
        room={roomsWorkspaceFixture.rooms[0]!}
        surface={{ kind: "project", projectSection: "audit-decisions" }}
        workspace={roomsWorkspaceFixture.workspaces[0]!}
      />,
    );
    expect(markup).toContain("Keep detailed traces in T3");
    expect(markup).toContain("decision:");
    expect(markup).toContain("decision.recorded");
    expect(markup).toContain("Gate definitions");
  });
});
