import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import zeroWorkspaceDocument from "./fixtures/local-channels-v1-zero-workspace.json";
import { reconcileLocalWorkspaceConfig, resolveLocalRoomsDataSourceState } from "./local";
import { RoomsLocalWorkspace } from "./localChannelsContract";
import {
  findSourceRoomBySlug,
  normalizeRoomsDataSourceMode,
  RoomsDataSourceMode,
  RoomsLocalWorkspaceConfig,
  RoomsSelectedRoomBySource,
} from "./model";
import { roomsRoutePath } from "../shell/navigation";

const decodeRoomsDataSourceMode = Schema.decodeUnknownSync(RoomsDataSourceMode);
const decodeRoomsLocalWorkspaceConfig = Schema.decodeUnknownSync(RoomsLocalWorkspaceConfig);
const decodeWorkspace = Schema.decodeUnknownSync(RoomsLocalWorkspace);
const decodeSelectedRooms = Schema.decodeUnknownSync(RoomsSelectedRoomBySource);
const workspace = decodeWorkspace(zeroWorkspaceDocument);

describe("Rooms data source boundary", () => {
  it("replaces shell-only identity with server truth while preserving native project bindings", () => {
    const legacyConfig = decodeRoomsLocalWorkspaceConfig({
      version: 1,
      roomId: "room:local:legacy-shell-id",
      name: "Local workspace",
      slug: "local-workspace-legacy-shell-id",
      projectBindings: [{ environmentId: "environment-local", projectId: "project-rooms" }],
    });
    const config = reconcileLocalWorkspaceConfig(legacyConfig, workspace);

    expect(config).toEqual({
      version: 1,
      roomId: workspace.room.id,
      name: workspace.room.name,
      slug: workspace.room.slug,
      projectBindings: legacyConfig.projectBindings,
    });
    expect(config.roomId).not.toBe(legacyConfig.roomId);
  });

  it("discards retired Sample identity while preserving old Local selection", () => {
    expect(decodeSelectedRooms({ sample: "sample-room", local: "local-room" })).toEqual({
      local: "local-room",
      shared: null,
    });
  });

  it("strips human credentials from the only persisted shared-room selection", () => {
    const persisted = decodeSelectedRooms({
      local: null,
      shared: "room:0198f7e2-1234-789a-8abc-123456789abc",
      bearer: "never-persist-bearer",
      bootstrapToken: "never-persist-bootstrap",
      inviteToken: "never-persist-invite",
    });

    expect(persisted).toEqual({
      local: null,
      shared: "room:0198f7e2-1234-789a-8abc-123456789abc",
    });
    expect(JSON.stringify(persisted)).not.toContain("never-persist");
  });

  it("resolves direct routes from the server room identity", () => {
    const config = reconcileLocalWorkspaceConfig(null, workspace);
    const localState = resolveLocalRoomsDataSourceState(workspace, config);

    expect(findSourceRoomBySlug(localState, workspace.room.slug)?.id).toBe(workspace.room.id);
    expect(roomsRoutePath(workspace.room.slug, { kind: "dashboard" })).toBe(
      `/rooms/${workspace.room.slug}/dashboard`,
    );
    expect(
      roomsRoutePath(workspace.room.slug, {
        kind: "native-thread",
        environmentId: "environment-local",
        threadId: "thread-local",
      }),
    ).toBe(`/rooms/${workspace.room.slug}/threads/environment-local/thread-local`);
  });

  it("distinguishes ready zero-channel and populated Local workspaces", () => {
    const config = reconcileLocalWorkspaceConfig(null, workspace);
    expect(resolveLocalRoomsDataSourceState(workspace, config).channelState).toBe("empty");
    const populated = {
      ...workspace,
      channels: [
        {
          id: "channel:019fb9f0-2000-7000-8000-000000000001",
          room_id: workspace.room.id,
          name: "# infra",
          slug: "infra",
          purpose: null,
          created_at: "2026-08-01T15:00:00.000Z",
          source_event: {
            seq: 3,
            event_id: "019fb9f0-2000-7000-8000-000000000001",
            type: "channel.created",
            schema: 1,
          },
        },
      ],
    } satisfies RoomsLocalWorkspace;
    expect(resolveLocalRoomsDataSourceState(populated, config).channelState).toBe("populated");
  });

  it("accepts only the supported product source modes", () => {
    expect(() => decodeRoomsDataSourceMode("sample")).toThrow();
    expect(decodeRoomsDataSourceMode("local")).toBe("local");
    expect(decodeRoomsDataSourceMode("shared")).toBe("shared");
    expect(() => decodeRoomsDataSourceMode("fixture")).toThrow();
  });

  it("normalizes retired and invalid source preferences into the existing Shared flow", () => {
    expect(normalizeRoomsDataSourceMode("sample")).toBe("shared");
    expect(normalizeRoomsDataSourceMode("unknown")).toBe("shared");
    expect(normalizeRoomsDataSourceMode("shared")).toBe("shared");
    expect(normalizeRoomsDataSourceMode("local")).toBe("local");
    expect(
      decodeSelectedRooms({ sample: "sample-room", local: "local-room", shared: "shared-room" }),
    ).toEqual({ local: "local-room", shared: "shared-room" });
  });
});
