import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import type { RoomsRoom, RoomsStateExample, RoomsWorkspace } from "../model/workspace";
import { RoomsDashboard } from "./RoomsDashboard";
import { buildRoomsDashboardProjection } from "./projection";

function pair(index: number): { readonly room: RoomsRoom; readonly workspace: RoomsWorkspace } {
  const room = roomsWorkspaceFixture.rooms[index];
  const workspace = roomsWorkspaceFixture.workspaces[index];
  if (!room || !workspace) throw new Error(`Missing room/workspace pair ${index}.`);
  return { room, workspace };
}

function state(kind: RoomsStateExample["kind"]): RoomsStateExample {
  const found = roomsWorkspaceFixture.states.find((candidate) => candidate.kind === kind);
  if (!found) throw new Error(`Missing state ${kind}.`);
  return found;
}

describe("Rooms v2 dashboard projection", () => {
  it("renders the contract-selected desktop and narrow projections for both workspaces", () => {
    for (const index of [0, 1]) {
      const { room, workspace } = pair(index);
      const desktop = buildRoomsDashboardProjection(
        roomsWorkspaceFixture,
        room,
        workspace,
        "desktop",
      );
      const narrow = buildRoomsDashboardProjection(
        roomsWorkspaceFixture,
        room,
        workspace,
        "narrow",
      );
      expect(desktop.status).toBe("ready");
      expect(narrow.status).toBe("ready");
      if (desktop.status !== "ready" || narrow.status !== "ready") continue;
      expect(desktop.sourceProjection.kind).toBe("desktop_board");
      expect(narrow.sourceProjection.kind).toBe("mobile_vertical_stages");
      expect(desktop.stages.map((group) => group.stories.map(({ story }) => story.id))).toEqual(
        desktop.sourceProjection.groups.map((group) => group.story_ids),
      );
      expect(narrow.stages.map((group) => group.stories.map(({ story }) => story.id))).toEqual(
        narrow.sourceProjection.groups.map((group) => group.story_ids),
      );
    }
  });

  it("uses server-supplied Needs Attention priority and Recent Activity rank without derivation", () => {
    const { room, workspace } = pair(0);
    const projection = buildRoomsDashboardProjection(
      roomsWorkspaceFixture,
      room,
      workspace,
      "desktop",
    );
    expect(projection.status).toBe("ready");
    if (projection.status !== "ready") return;
    expect(projection.needsAttention.map(({ fact }) => [fact.priority, fact.kind])).toEqual([
      [0, "human_gate_pending"],
      [1, "blocked_run"],
      [2, "stale_mirror"],
    ]);
    expect(
      projection.recentActivity.map(({ fact, activity }) => [
        fact.rank,
        fact.reason,
        activity.item.id,
      ]),
    ).toEqual(
      workspace.dashboard.recent_activity.map((fact) => [
        fact.rank,
        fact.reason,
        fact.feed_item_id,
      ]),
    );
  });

  it("switching rooms coherently changes vision, stories, attention, and activity", () => {
    const first = pair(0);
    const second = pair(1);
    const firstProjection = buildRoomsDashboardProjection(
      roomsWorkspaceFixture,
      first.room,
      first.workspace,
      "desktop",
    );
    const secondProjection = buildRoomsDashboardProjection(
      roomsWorkspaceFixture,
      second.room,
      second.workspace,
      "desktop",
    );
    expect(firstProjection.status).toBe("ready");
    expect(secondProjection.status).toBe("ready");
    if (firstProjection.status !== "ready" || secondProjection.status !== "ready") return;
    expect(firstProjection.vision.headline).not.toBe(secondProjection.vision.headline);
    expect(
      firstProjection.stages.flatMap((group) => group.stories).map(({ story }) => story.id),
    ).not.toEqual(
      secondProjection.stages.flatMap((group) => group.stories).map(({ story }) => story.id),
    );
    expect(firstProjection.needsAttention.map(({ fact }) => fact.id)).not.toEqual(
      secondProjection.needsAttention.map(({ fact }) => fact.id),
    );
    expect(firstProjection.recentActivity.map(({ fact }) => fact.id)).not.toEqual(
      secondProjection.recentActivity.map(({ fact }) => fact.id),
    );
  });

  it("renders four desktop columns, vertical narrow order, and direct gate facts", () => {
    const { room, workspace } = pair(0);
    const markup = renderToStaticMarkup(
      <RoomsDashboard
        fixture={roomsWorkspaceFixture}
        room={room}
        surface={{ kind: "dashboard" }}
        workspace={workspace}
      />,
    );
    expect(markup).toContain('data-rooms-dashboard-board="columns"');
    expect(markup).toContain('data-rooms-dashboard-board="vertical-stages"');
    expect(markup).toContain('data-rooms-dashboard-header="desktop_board"');
    expect(markup).toContain('data-rooms-dashboard-header="mobile_vertical_stages"');
    expect(markup).toContain("grid-cols-4");
    expect(markup).toContain("Gate requires all: test run");
    expect(markup).toContain("self review forbidden");
    expect(markup).not.toContain("draggable");
  });

  it("renders closed empty and authorization errors and fails visibly on missing projections", () => {
    const { room, workspace } = pair(0);
    const render = (
      fixtureState?: RoomsStateExample,
      workspaceValue: RoomsWorkspace = workspace,
    ) => {
      const stateProps = fixtureState === undefined ? {} : { state: fixtureState };
      return renderToStaticMarkup(
        <RoomsDashboard
          fixture={roomsWorkspaceFixture}
          room={room}
          {...stateProps}
          surface={{ kind: "dashboard" }}
          workspace={workspaceValue}
        />,
      );
    };
    expect(render(state("empty"))).toContain('data-rooms-dashboard-state="empty"');
    expect(render(state("unauthorized"))).toContain("room_membership_required");
    expect(render(undefined, { ...workspace, projections: [] })).toContain(
      "invalid_workspace_projection",
    );
  });
});
