import * as NodeCrypto from "node:crypto";
import { describe, expect, it } from "vite-plus/test";

import { ROOMS_WORKSPACE_READ_SOURCE } from "../model/source";
import { roomsWorkspaceFixture } from ".";
import rawWorkspaceReadV1 from "./workspace-read-v1.json?raw";
import rawWorkspaceReadV1Schema from "./workspace-read-v1.schema.json?raw";

function sha256(value: string): string {
  return NodeCrypto.createHash("sha256").update(value).digest("hex");
}

describe("workspace-read v1 fixture boundary", () => {
  it("preserves the exact integrated server source pins", () => {
    expect(ROOMS_WORKSPACE_READ_SOURCE.repositorySha).toBe(
      "082f85871125c780a9bb6cbdf78a6df83c622290",
    );
    expect(roomsWorkspaceFixture.contract).toMatchObject({
      id: ROOMS_WORKSPACE_READ_SOURCE.contractId,
      version: ROOMS_WORKSPACE_READ_SOURCE.contractVersion,
    });
    expect(sha256(rawWorkspaceReadV1Schema)).toBe(ROOMS_WORKSPACE_READ_SOURCE.schemaSha256);
    expect(sha256(rawWorkspaceReadV1)).toBe(ROOMS_WORKSPACE_READ_SOURCE.fixtureSha256);
  });

  it("exposes every producer boundary needed by Wave 2 consumers", () => {
    expect(roomsWorkspaceFixture.rooms.map((room) => room.id)).toContain(
      roomsWorkspaceFixture.workspace.selected_room_id,
    );
    expect(roomsWorkspaceFixture.workspace.channels.map((channel) => channel.name)).toEqual([
      "# infra",
      "# product",
    ]);
    expect(roomsWorkspaceFixture.workspace.workflow.stages.map((stage) => stage.key)).toEqual([
      "backlog",
      "in_progress",
      "human_qa",
      "done",
    ]);
    expect(
      roomsWorkspaceFixture.workspace.projections.map((projection) => projection.kind),
    ).toEqual(["desktop_board", "mobile_vertical_stages"]);
    expect(roomsWorkspaceFixture.states.map((state) => state.name)).toEqual([
      "unauthenticated",
      "unauthorized",
      "empty",
      "stale_cursor",
      "reachable_but_stale",
    ]);
  });
});
