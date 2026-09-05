import { describe, expect, it } from "vite-plus/test";

import {
  isRoomsSharedSessionUsable,
  resolveRoomsAuthProvider,
  resolveRoomsSharedServerBaseUrl,
  roomsProfileAfterDiscovery,
  roomsProfileAfterSignIn,
  roomsProfileAfterSignOut,
  type RoomsSharedServerProfile,
  usableRoomsSharedSession,
} from "./serverProfile";

const contract = {
  id: "rooms.local-auth",
  version: 1,
  schema_uri: "contracts/rooms/local-auth/v1/schema.json",
} as const;

const session = {
  serverId: "srv:0198f7e2-1234-789a-8abc-123456789abc",
  accountId: "acct:0198f7e2-1234-789a-8abc-123456789abd",
  username: "monroe",
  displayName: "Monroe",
  principalId: "h:0198f7e2-1234-789a-8abc-123456789abe",
  token: "rhs1_token",
  expiresAt: "2026-12-01T00:00:00.000Z",
};
const profile: RoomsSharedServerProfile = {
  version: 1,
  baseUrl: "https://rooms.tailnet.example",
  provider: "local",
  serverId: session.serverId,
  setupRequired: false,
  session,
};
const now = Date.parse("2026-09-05T12:00:00.000Z");

describe("shared server profile", () => {
  it("prefers the runtime profile over the build-time URL and defaults to Clerk without one", () => {
    expect(resolveRoomsSharedServerBaseUrl(profile, "http://127.0.0.1:33102")).toBe(
      profile.baseUrl,
    );
    expect(resolveRoomsSharedServerBaseUrl(null, "http://127.0.0.1:33102")).toBe(
      "http://127.0.0.1:33102",
    );
    expect(resolveRoomsSharedServerBaseUrl(null, null)).toBe("");
    expect(resolveRoomsAuthProvider(null)).toBe("clerk");
    expect(resolveRoomsAuthProvider(profile)).toBe("local");
  });

  it("reuses a stored session only for the same local server while it is unexpired", () => {
    expect(usableRoomsSharedSession(profile, now)).toBe(session);
    expect(usableRoomsSharedSession({ ...profile, provider: "clerk" }, now)).toBeNull();
    expect(usableRoomsSharedSession({ ...profile, serverId: "srv:other" }, now)).toBeNull();
    expect(usableRoomsSharedSession({ ...profile, serverId: null }, now)).toBeNull();
    expect(usableRoomsSharedSession({ ...profile, session: null }, now)).toBeNull();
    expect(usableRoomsSharedSession(profile, Date.parse("2027-01-01T00:00:00.000Z"))).toBeNull();
    expect(isRoomsSharedSessionUsable({ ...session, expiresAt: "not a date" }, now)).toBe(false);
  });

  it("keeps a session across reconnects to the same server and drops it for any other", () => {
    const sameServer = roomsProfileAfterDiscovery(profile, "https://rooms.tailnet.example", {
      contract,
      provider: "local",
      server: { id: session.serverId },
      setup_required: false,
    });
    expect(sameServer.session).toBe(session);
    const otherServer = roomsProfileAfterDiscovery(profile, "https://other.example", {
      contract,
      provider: "local",
      server: { id: "srv:other" },
      setup_required: false,
    });
    expect(otherServer.session).toBeNull();
    expect(otherServer.serverId).toBe("srv:other");
    const unset = roomsProfileAfterDiscovery(profile, profile.baseUrl, {
      contract,
      provider: "local",
      server: null,
      setup_required: true,
    });
    expect(unset).toMatchObject({ serverId: null, setupRequired: true, session: null });
    const clerk = roomsProfileAfterDiscovery(null, "https://managed.example", {
      contract,
      provider: "clerk",
    });
    expect(clerk).toEqual({
      version: 1,
      baseUrl: "https://managed.example",
      provider: "clerk",
      serverId: null,
      setupRequired: false,
      session: null,
    });
  });

  it("records a sign-in exactly as the server described it and clears it on sign-out", () => {
    const signedIn = roomsProfileAfterSignIn("https://rooms.tailnet.example", {
      contract,
      status: "signed_in",
      server: { id: session.serverId },
      account: { id: session.accountId, username: "monroe", display_name: "Monroe" },
      principal: { id: session.principalId, type: "human", display_name: "Monroe" },
      session: { id: "sess:1", token: session.token, expires_at: session.expiresAt },
    });
    expect(signedIn).toEqual(profile);
    expect(roomsProfileAfterSignOut(signedIn)).toEqual({ ...profile, session: null });
    expect(roomsProfileAfterSignOut(null)).toBeNull();
    const signedOut = { ...profile, session: null };
    expect(roomsProfileAfterSignOut(signedOut)).toBe(signedOut);
  });
});
