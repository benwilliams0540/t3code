import { describe, expect, it } from "vite-plus/test";

import type { RoomsHumanSourceFailure, RoomsHumanSourceFailureStatus } from "../dataSource";
import { roomsHumanAccessCopy } from "./RoomsHumanAccessPanel";

function state(status: RoomsHumanSourceFailureStatus): RoomsHumanSourceFailure {
  return {
    mode: "shared",
    status,
    rooms: [],
    invitation: null,
    authenticationGeneration: 1,
    error: null,
  };
}

describe("shared Rooms access state copy", () => {
  it("represents every authentication and membership state honestly", () => {
    expect(roomsHumanAccessCopy(state("signed-out"))[0]).toContain("Sign in");
    expect(roomsHumanAccessCopy(state("authenticating"))[0]).toContain("Authenticating");
    expect(roomsHumanAccessCopy(state("authenticated-nonmember"))[0]).toContain("not yet a member");
    expect(roomsHumanAccessCopy(state("invited"))[0]).toContain("Invitation");
    expect(roomsHumanAccessCopy(state("expired"))[0]).toContain("expired");
    expect(roomsHumanAccessCopy(state("authorization-failure"))[0]).toContain("authorization");
    expect(roomsHumanAccessCopy(state("invalid-configuration"))[0]).toContain("not configured");
    expect(roomsHumanAccessCopy(state("error"))[0]).toContain("unavailable");
  });
});
