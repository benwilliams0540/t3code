import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { roomsRoutePath } from "../shell/navigation";
import { createRoomsLocalWorkspaceConfig, resolveLocalRoomsDataSourceState } from "./local";
import {
  findSourceRoomBySlug,
  RoomsDataSourceMode,
  RoomsLocalWorkspaceConfig,
  resolveSelectedSourceRoom,
} from "./model";
import { roomsSampleDataSource } from "./sample";

const decodeRoomsDataSourceMode = Schema.decodeUnknownSync(RoomsDataSourceMode);
const decodeRoomsLocalWorkspaceConfig = Schema.decodeUnknownSync(RoomsLocalWorkspaceConfig);

describe("Rooms data source boundary", () => {
  it("defaults to the certified Sample workspace without changing its declared identities", () => {
    expect(roomsSampleDataSource.mode).toBe("sample");
    expect(roomsSampleDataSource.status).toBe("ready");
    expect(roomsSampleDataSource.rooms.map((room) => room.id)).toEqual(
      roomsSampleDataSource.fixture.rooms.map((room) => room.id),
    );
  });

  it("creates a persistent local identity that cannot be mistaken for a sample room", () => {
    const config = createRoomsLocalWorkspaceConfig(() => "local-test-id");
    expect(config).toEqual({
      version: 1,
      roomId: "room:local:local-test-id",
      name: "Local workspace",
      slug: "local-workspace-local-test-id",
      projectBindings: [],
    });
    expect(roomsSampleDataSource.rooms.some((room) => room.id === config.roomId)).toBe(false);
    expect(decodeRoomsLocalWorkspaceConfig(config)).toEqual(config);
  });

  it("keeps Sample and Local selections independent across mode switches", () => {
    const config = createRoomsLocalWorkspaceConfig(() => "selection-test");
    const localState = resolveLocalRoomsDataSourceState(config);
    const secondSample = roomsSampleDataSource.rooms[1]!;
    const selected = { sample: secondSample.id, local: config.roomId };

    expect(resolveSelectedSourceRoom(roomsSampleDataSource, selected, null)?.id).toBe(
      secondSample.id,
    );
    expect(resolveSelectedSourceRoom(localState, selected, null)?.id).toBe(config.roomId);
    expect(resolveSelectedSourceRoom(roomsSampleDataSource, selected, null)?.id).toBe(
      secondSample.id,
    );
  });

  it("exposes honest local setup state and direct routes for both sources", () => {
    expect(resolveLocalRoomsDataSourceState(null)).toMatchObject({
      mode: "local",
      status: "setup-required",
      rooms: [],
    });
    const config = createRoomsLocalWorkspaceConfig(() => "direct-route");
    const localState = resolveLocalRoomsDataSourceState(config);
    expect(findSourceRoomBySlug(localState, config.slug)?.id).toBe(config.roomId);
    expect(
      findSourceRoomBySlug(roomsSampleDataSource, roomsSampleDataSource.rooms[0]!.slug),
    ).not.toBeNull();
    expect(roomsRoutePath(config.slug, { kind: "dashboard" })).toBe(
      "/rooms/local-workspace-direct-route/dashboard",
    );
    expect(
      roomsRoutePath(config.slug, {
        kind: "native-thread",
        environmentId: "environment-local",
        threadId: "thread-local",
      }),
    ).toBe("/rooms/local-workspace-direct-route/threads/environment-local/thread-local");
  });

  it("accepts only the two versioned source mode values", () => {
    expect(decodeRoomsDataSourceMode("sample")).toBe("sample");
    expect(decodeRoomsDataSourceMode("local")).toBe("local");
    expect(() => decodeRoomsDataSourceMode("fixture")).toThrow();
  });
});
