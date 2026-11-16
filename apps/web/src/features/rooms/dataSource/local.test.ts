import { describe, expect, it } from "vite-plus/test";

import { RoomsLocalClientError } from "./localChannelsClient";
import { connectingLocalRoomsDataSourceState, failedLocalRoomsDataSourceState } from "./local";

describe("Rooms Local source states", () => {
  it("starts in a distinct connecting state", () => {
    expect(connectingLocalRoomsDataSourceState()).toEqual({
      mode: "local",
      status: "connecting",
      rooms: [],
      error: null,
    });
  });

  it.each([
    ["local_session_disabled", "disabled"],
    ["local_workspace_uninitialized", "uninitialized"],
    ["local_session_unavailable", "unavailable-outside-development"],
    ["local_workspace_invalid", "invalid-bootstrap"],
    ["room_membership_required", "authorization-failure"],
    ["capability_denied", "authorization-failure"],
    ["caller_identity_forbidden", "authorization-failure"],
  ] as const)("maps server error %s to %s", (code, status) => {
    expect(
      failedLocalRoomsDataSourceState(
        new RoomsLocalClientError({ kind: "server", code, status: 403, message: code }),
      ),
    ).toMatchObject({ mode: "local", status, rooms: [], error: { code } });
  });

  it("distinguishes invalid configuration and ordinary transport/server failures", () => {
    expect(
      failedLocalRoomsDataSourceState(
        new RoomsLocalClientError({
          kind: "invalid_configuration",
          code: "invalid_local_api_base_url",
          message: "bad URL",
        }),
      ).status,
    ).toBe("invalid-configuration");
    expect(
      failedLocalRoomsDataSourceState(
        new RoomsLocalClientError({
          kind: "transport",
          code: "local_api_unreachable",
          message: "offline",
        }),
      ).status,
    ).toBe("error");
    expect(
      failedLocalRoomsDataSourceState(
        new RoomsLocalClientError({
          kind: "server",
          status: 500,
          code: "internal_server_error",
          message: "failed",
        }),
      ).status,
    ).toBe("error");
  });
});
