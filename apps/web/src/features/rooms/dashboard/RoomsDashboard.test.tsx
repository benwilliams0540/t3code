import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import type { RoomsRoom, RoomsStateExample, RoomsWorkspace } from "../model/workspace";
import { RoomsDashboard } from "./RoomsDashboard";
import { buildRoomsDashboardProjection } from "./projection";

function selectedRoom(): RoomsRoom {
  const room = roomsWorkspaceFixture.rooms.find(
    (candidate) => candidate.id === roomsWorkspaceFixture.workspace.selected_room_id,
  );
  if (!room) throw new Error("Fixture selected room is missing.");
  return room;
}

function stateNamed(name: RoomsStateExample["name"]): RoomsStateExample {
  const state = roomsWorkspaceFixture.states.find((candidate) => candidate.name === name);
  if (!state) throw new Error(`Fixture state ${name} is missing.`);
  return state;
}

function renderDashboard(state?: RoomsStateExample): string {
  const stateProps = state === undefined ? {} : { state };
  return renderToStaticMarkup(
    <RoomsDashboard
      fixture={roomsWorkspaceFixture}
      room={selectedRoom()}
      {...stateProps}
      surface={{ kind: "dashboard" }}
      workspace={roomsWorkspaceFixture.workspace}
    />,
  );
}

describe("Rooms dashboard projection", () => {
  it("uses fixture-defined stage and story order for both responsive projections", () => {
    const desktop = buildRoomsDashboardProjection(
      roomsWorkspaceFixture,
      selectedRoom(),
      roomsWorkspaceFixture.workspace,
      "desktop",
    );
    const narrow = buildRoomsDashboardProjection(
      roomsWorkspaceFixture,
      selectedRoom(),
      roomsWorkspaceFixture.workspace,
      "narrow",
    );

    expect(desktop.status).toBe("ready");
    expect(narrow.status).toBe("ready");
    if (desktop.status !== "ready" || narrow.status !== "ready") return;

    expect(desktop.sourceProjection.kind).toBe("desktop_board");
    expect(narrow.sourceProjection.kind).toBe("mobile_vertical_stages");
    expect(desktop.stages.map((group) => group.stage.key)).toEqual([
      "backlog",
      "in_progress",
      "human_qa",
      "done",
    ]);
    expect(narrow.stages.map((group) => group.stage.key)).toEqual(
      desktop.stages.map((group) => group.stage.key),
    );
    expect(desktop.stages.map((group) => group.stories.map(({ story }) => story.title))).toEqual([
      ["Add a project decision timeline"],
      ["Freeze the workspace read fixture"],
      ["Verify the channel activity cards"],
      ["Map T3 lifecycle events"],
    ]);
  });

  it("associates declared owners, delegates, providers, evidence, and gates without mutation", () => {
    const fixtureBefore = JSON.stringify(roomsWorkspaceFixture);
    const projection = buildRoomsDashboardProjection(
      roomsWorkspaceFixture,
      selectedRoom(),
      roomsWorkspaceFixture.workspace,
      "desktop",
    );

    expect(projection.status).toBe("ready");
    if (projection.status !== "ready") return;
    const inProgress = projection.stages[1]?.stories[0];
    const humanQa = projection.stages[2]?.stories[0];
    expect(inProgress).toMatchObject({
      owner: { display_name: "Ben", type: "human" },
      delegate: {
        agent: { display_name: "Codex on MacBook", type: "agent" },
        thread: { provider: "openai-codex", status: "running" },
      },
      story: {
        evidence: { attached_ids: ["evidence:019fb900-6000-7000-8000-000000000001"] },
        gate_state: "waiting_for_evidence",
      },
    });
    expect(humanQa?.story.evidence.required_kinds).toEqual(["test-run", "screenshot"]);
    expect(projection.stages[2]?.stage.gate).toEqual({
      allowed_principal_types: ["human"],
      required_evidence_kinds: ["test-run", "screenshot"],
      self_review: "forbidden",
    });
    expect(JSON.stringify(roomsWorkspaceFixture)).toBe(fixtureBefore);
  });

  it("derives attention and recent activity only from fixture facts", () => {
    const projection = buildRoomsDashboardProjection(
      roomsWorkspaceFixture,
      selectedRoom(),
      roomsWorkspaceFixture.workspace,
      "narrow",
    );

    expect(projection.status).toBe("ready");
    if (projection.status !== "ready") return;
    expect(
      projection.needsAttention.map(({ reasons, story }) => ({
        title: story.story.title,
        reasons,
      })),
    ).toEqual([
      { title: "Freeze the workspace read fixture", reasons: ["evidence_required"] },
      {
        title: "Verify the channel activity cards",
        reasons: ["delegate_blocked", "review_required"],
      },
    ]);
    expect(projection.recentActivity.map(({ item }) => item.source_event.seq)).toEqual([
      117, 116, 115, 114, 113,
    ]);
  });

  it("renders four desktop columns and puts attention before narrow vertical stages", () => {
    const markup = renderDashboard();
    const narrowStart = markup.indexOf('data-rooms-dashboard-layout="narrow-vertical"');
    const desktopStart = markup.indexOf('data-rooms-dashboard-layout="desktop-columns"');
    const narrowMarkup = markup.slice(narrowStart, desktopStart);

    expect(markup).toContain('data-rooms-dashboard-board="columns"');
    expect(markup).toContain("grid-cols-4");
    expect(markup).not.toContain("overflow-x");
    expect(narrowMarkup.indexOf("Needs attention")).toBeGreaterThan(-1);
    expect(narrowMarkup.indexOf('data-rooms-dashboard-board="vertical-stages"')).toBeGreaterThan(
      narrowMarkup.indexOf("Needs attention"),
    );
    expect(narrowMarkup.indexOf("Backlog")).toBeLessThan(narrowMarkup.indexOf("In progress"));
    expect(narrowMarkup.indexOf("In progress")).toBeLessThan(
      narrowMarkup.indexOf("Gate / Human QA"),
    );
    expect(narrowMarkup.indexOf("Gate / Human QA")).toBeLessThan(narrowMarkup.indexOf("Done"));
  });

  it("has no client-side board control that can move or pass a gate", () => {
    const markup = renderDashboard();

    expect(markup).not.toContain("draggable");
    expect(markup).not.toContain("data-stage-action");
    expect(markup).not.toContain("<button");
    expect(markup).toContain("Waiting for evidence");
    expect(markup).toContain("self review forbidden");
  });

  it("renders exact empty and authorization error inputs as fallbacks", () => {
    const emptyMarkup = renderDashboard(stateNamed("empty"));
    const unauthorizedMarkup = renderDashboard(stateNamed("unauthorized"));

    expect(emptyMarkup).toContain('data-rooms-dashboard-state="empty"');
    expect(emptyMarkup).toContain("No workspace items were returned for this fixture state.");
    expect(unauthorizedMarkup).toContain('data-rooms-dashboard-state="error"');
    expect(unauthorizedMarkup).toContain("Reachability does not create room membership.");
    expect(unauthorizedMarkup).toContain("room_membership_required");
    expect(unauthorizedMarkup).not.toContain("Add a project decision timeline");
  });

  it("fails visibly when a required fixture projection is missing", () => {
    const workspace = {
      ...roomsWorkspaceFixture.workspace,
      projections: [],
    } satisfies RoomsWorkspace;
    const projection = buildRoomsDashboardProjection(
      roomsWorkspaceFixture,
      selectedRoom(),
      workspace,
      "desktop",
    );

    expect(projection).toEqual({
      status: "error",
      message: "Workspace fixture is missing desktop_board projection.",
    });
  });
});
