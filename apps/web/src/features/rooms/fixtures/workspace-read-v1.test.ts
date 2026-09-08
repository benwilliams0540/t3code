import * as NodeCrypto from "node:crypto";
import { describe, expect, it } from "vite-plus/test";

import { ROOMS_WORKSPACE_READ_V1_SOURCE } from "../model/source";
import { decodeRoomsWorkspaceFixture, roomsWorkspaceFixtureV1 } from ".";
import rawWorkspaceReadV1Document from "./workspace-read-v1.json";
import rawWorkspaceReadV1 from "./workspace-read-v1.json?raw";
import rawWorkspaceReadV1Schema from "./workspace-read-v1.schema.json?raw";

function sha256(value: string): string {
  return NodeCrypto.createHash("sha256").update(value).digest("hex");
}

describe("workspace-read v1 immutable boundary", () => {
  it("preserves the exact integrated v1 artifacts and source pins", () => {
    expect(ROOMS_WORKSPACE_READ_V1_SOURCE.repositorySha).toBe(
      "082f85871125c780a9bb6cbdf78a6df83c622290",
    );
    expect(sha256(rawWorkspaceReadV1Schema)).toBe(ROOMS_WORKSPACE_READ_V1_SOURCE.schemaSha256);
    expect(sha256(rawWorkspaceReadV1)).toBe(ROOMS_WORKSPACE_READ_V1_SOURCE.fixtureSha256);
  });

  it("still decodes independently as v1 instead of being reinterpreted as v2", () => {
    expect(roomsWorkspaceFixtureV1.contract).toEqual({
      id: "rooms.workspace-read",
      version: 1,
      schema_uri: "https://rooms.local/contracts/workspace-read/v1/schema.json",
      fixture_id: "fixture:019fb900-0000-7000-8000-000000000001",
      captured_at: "2026-07-31T16:00:00.000Z",
    });
    expect(decodeRoomsWorkspaceFixture(rawWorkspaceReadV1Document).contract.version).toBe(1);
  });
});
