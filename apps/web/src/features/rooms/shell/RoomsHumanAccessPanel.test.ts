import { describe, expect, it } from "vite-plus/test";

import type { RoomsHumanSourceFailure, RoomsHumanSourceFailureStatus } from "../dataSource";
import { roomsHumanAccessCopy, roomsHumanAccessOffersSignIn } from "./RoomsHumanAccessPanel";

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
    expect(roomsHumanAccessCopy(state("authenticated-nonmember"))[0]).toContain(
      "Create your first room",
    );
    expect(roomsHumanAccessCopy(state("invited"))[0]).toContain("Invitation");
    expect(roomsHumanAccessCopy(state("expired"))[0]).toContain("expired");
    expect(roomsHumanAccessCopy(state("authorization-failure"))[0]).toContain("authorization");
    expect(roomsHumanAccessCopy(state("invalid-configuration"))[0]).toContain("not configured");
    expect(roomsHumanAccessCopy(state("error"))[0]).toContain("unavailable");
  });

  it("tells a signed-out person to sign in here rather than in a sidebar the Rooms shell hides", () => {
    const [, signedOut] = roomsHumanAccessCopy(state("signed-out"));
    const [, expired] = roomsHumanAccessCopy(state("expired"));
    expect(signedOut).toContain("T3 Connect");
    expect(signedOut).not.toContain("sidebar");
    expect(expired).toContain("Sign in");
  });

  it("offers the T3 Connect sign-in only when a new session is what is missing", () => {
    expect(roomsHumanAccessOffersSignIn(state("signed-out"))).toBe(true);
    expect(roomsHumanAccessOffersSignIn(state("expired"))).toBe(true);
    for (const status of [
      "authenticating",
      "authenticated-nonmember",
      "invited",
      "authorization-failure",
      "invalid-configuration",
      "error",
    ] as const) {
      expect(roomsHumanAccessOffersSignIn(state(status))).toBe(false);
    }
  });
});
