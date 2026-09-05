import * as Schema from "effect/Schema";

import {
  RoomsAuthProviderName,
  type RoomsLocalAuthProvider,
  type RoomsLocalAuthSignedIn,
} from "./localAuthContract";

export const ROOMS_SHARED_SERVER_STORAGE_KEY = "t3code:rooms-shared-server:v1";

// A server-owned session for one server. The token is a revocable 90-day
// credential that the server stores only as a digest; keeping it on this device
// is what lets a person reopen the app and land back in the room, the same way a
// signed-in chat app does. Sign-out revokes it server-side and clears it here.
// It is keyed by server ID and is never sent to any other origin.
export const RoomsSharedServerSession = Schema.Struct({
  serverId: Schema.String,
  accountId: Schema.String,
  username: Schema.String,
  displayName: Schema.String,
  principalId: Schema.String,
  token: Schema.String,
  expiresAt: Schema.String,
});
export type RoomsSharedServerSession = typeof RoomsSharedServerSession.Type;

// Which Threadspace server this client talks to, chosen at runtime. A profile
// replaces the build-time Rooms URL; with no profile the build-time Clerk
// configuration applies unchanged.
export const RoomsSharedServerProfile = Schema.Struct({
  version: Schema.Literal(1),
  baseUrl: Schema.String,
  provider: RoomsAuthProviderName,
  serverId: Schema.NullOr(Schema.String),
  setupRequired: Schema.Boolean,
  session: Schema.NullOr(RoomsSharedServerSession),
});
export type RoomsSharedServerProfile = typeof RoomsSharedServerProfile.Type;

export const RoomsSharedServerProfileOrNull = Schema.NullOr(RoomsSharedServerProfile);

export function resolveRoomsSharedServerBaseUrl(
  profile: RoomsSharedServerProfile | null,
  buildTimeBaseUrl: string | null,
): string {
  return profile?.baseUrl ?? buildTimeBaseUrl ?? "";
}

export function resolveRoomsAuthProvider(
  profile: RoomsSharedServerProfile | null,
): RoomsAuthProviderName {
  return profile?.provider ?? "clerk";
}

export function isRoomsSharedSessionUsable(
  session: RoomsSharedServerSession | null,
  now: number = Date.now(),
): session is RoomsSharedServerSession {
  if (session === null) return false;
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

// A session belongs to exactly one server. If the profile's server ID changed
// (the URL now points somewhere else), the stored session must not be reused.
export function usableRoomsSharedSession(
  profile: RoomsSharedServerProfile | null,
  now: number = Date.now(),
): RoomsSharedServerSession | null {
  if (profile === null || profile.provider !== "local") return null;
  if (!isRoomsSharedSessionUsable(profile.session, now)) return null;
  return profile.serverId !== null && profile.session.serverId === profile.serverId
    ? profile.session
    : null;
}

export function roomsDeviceLabel(): string {
  return typeof window !== "undefined" && window.desktopBridge
    ? "ThreadSpace desktop"
    : "ThreadSpace web";
}

// Connecting records what the server told us. A session is kept only when the
// server ID is unchanged, so repointing the URL at a different server drops it.
export function roomsProfileAfterDiscovery(
  current: RoomsSharedServerProfile | null,
  baseUrl: string,
  discovered: RoomsLocalAuthProvider,
): RoomsSharedServerProfile {
  const serverId = discovered.server?.id ?? null;
  const session =
    current?.session && serverId !== null && current.session.serverId === serverId
      ? current.session
      : null;
  return {
    version: 1,
    baseUrl,
    provider: discovered.provider,
    serverId,
    setupRequired: discovered.setup_required ?? false,
    session,
  };
}

export function roomsProfileAfterSignIn(
  baseUrl: string,
  result: RoomsLocalAuthSignedIn,
): RoomsSharedServerProfile {
  return {
    version: 1,
    baseUrl,
    provider: "local",
    serverId: result.server.id,
    setupRequired: false,
    session: {
      serverId: result.server.id,
      accountId: result.account.id,
      username: result.account.username,
      displayName: result.account.display_name,
      principalId: result.principal.id,
      token: result.session.token,
      expiresAt: result.session.expires_at,
    },
  };
}

export function roomsProfileAfterSignOut(
  current: RoomsSharedServerProfile | null,
): RoomsSharedServerProfile | null {
  return current === null || current.session === null ? current : { ...current, session: null };
}
