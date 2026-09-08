export type RoomsAuthenticationSource = "clerk" | "local";

export type RoomsAuthenticationSnapshot =
  | { readonly status: "authenticating"; readonly generation: number }
  | { readonly status: "signed-out"; readonly generation: number }
  | {
      readonly status: "signed-in";
      readonly generation: number;
      readonly accountId: string;
      readonly source: RoomsAuthenticationSource;
    };

const MAX_BEARER_BYTES = 16 * 1024;

export class RoomsAuthenticationError extends Error {
  constructor(
    readonly code: "rooms_auth_unavailable" | "rooms_session_expired" | "rooms_token_invalid",
  ) {
    super(
      code === "rooms_session_expired"
        ? "The Rooms session expired."
        : code === "rooms_token_invalid"
          ? "The Rooms bearer token is invalid."
          : "Rooms authentication is not active for this account generation.",
    );
    this.name = "RoomsAuthenticationError";
  }
}

type SignedInIntent = {
  readonly status: "signed-in";
  readonly accountId: string;
  readonly readToken: () => Promise<string | null>;
};
type ClerkIntent =
  | { readonly status: "loading" }
  | { readonly status: "signed-out" }
  | SignedInIntent;

// Exactly one source owns the published Rooms session at a time. The Clerk provider
// (managed T3 Connect) and a server-owned local session both record their intent
// whenever it changes, but only the owner's intent is published. Switching owner
// republishes from the new owner's intent, so a Clerk sign-in survives a detour
// through a local server and vice versa.
let owner: RoomsAuthenticationSource = "clerk";
let clerkIntent: ClerkIntent = { status: "loading" };
let localIntent: SignedInIntent | null = null;
let generation = 0;
let snapshot: RoomsAuthenticationSnapshot = { status: "authenticating", generation };
let tokenProvider: (() => Promise<string | null>) | null = null;
const listeners = new Set<() => void>();

function publish(next: RoomsAuthenticationSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function publishOwner(): void {
  generation += 1;
  tokenProvider = null;
  const intent: ClerkIntent =
    owner === "clerk" ? clerkIntent : (localIntent ?? { status: "signed-out" });
  if (intent.status === "signed-in") {
    tokenProvider = intent.readToken;
    publish({ status: "signed-in", generation, accountId: intent.accountId, source: owner });
    return;
  }
  publish({ status: intent.status === "loading" ? "authenticating" : "signed-out", generation });
}

export function subscribeRoomsAuthentication(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readRoomsAuthenticationSnapshot(): RoomsAuthenticationSnapshot {
  return snapshot;
}

export function readRoomsAuthenticationOwner(): RoomsAuthenticationSource {
  return owner;
}

export function setRoomsAuthenticationOwner(next: RoomsAuthenticationSource): void {
  if (owner === next) return;
  owner = next;
  publishOwner();
}

export function assertRoomsAuthenticationGeneration(expectedGeneration: number): void {
  if (snapshot.status !== "signed-in" || snapshot.generation !== expectedGeneration) {
    throw new RoomsAuthenticationError("rooms_auth_unavailable");
  }
}

export function markRoomsAuthenticationLoading(): void {
  clerkIntent = { status: "loading" };
  if (owner === "clerk") publishOwner();
}

export function deactivateRoomsAuthentication(): void {
  clerkIntent = { status: "signed-out" };
  if (owner === "clerk") publishOwner();
}

export function activateRoomsAuthentication(
  accountId: string,
  readToken: () => Promise<string | null>,
): void {
  clerkIntent = { status: "signed-in", accountId, readToken };
  if (owner === "clerk") publishOwner();
}

// A server-owned session token is a durable credential rather than a just-in-time
// mint, so the reader simply returns it until the session is deactivated.
export function activateLocalRoomsSession(accountId: string, token: string): void {
  localIntent = { status: "signed-in", accountId, readToken: async () => token };
  if (owner === "local") publishOwner();
}

export function deactivateLocalRoomsSession(): void {
  localIntent = null;
  if (owner === "local") publishOwner();
}

export async function readRoomsClerkToken(expectedGeneration?: number): Promise<string> {
  const provider = tokenProvider;
  const current = snapshot;
  if (
    !provider ||
    current.status !== "signed-in" ||
    (expectedGeneration !== undefined && current.generation !== expectedGeneration)
  ) {
    throw new RoomsAuthenticationError("rooms_auth_unavailable");
  }
  const token = await provider();
  if (token === null) throw new RoomsAuthenticationError("rooms_session_expired");
  if (
    token.trim() === "" ||
    /[\r\n]/.test(token) ||
    new TextEncoder().encode(token).byteLength > MAX_BEARER_BYTES
  ) {
    throw new RoomsAuthenticationError("rooms_token_invalid");
  }
  if (snapshot.generation !== current.generation || snapshot.status !== "signed-in") {
    throw new RoomsAuthenticationError("rooms_auth_unavailable");
  }
  return token;
}

export function __resetRoomsAuthenticationForTests(): void {
  owner = "clerk";
  clerkIntent = { status: "loading" };
  localIntent = null;
  generation = 0;
  tokenProvider = null;
  snapshot = { status: "authenticating", generation };
  listeners.clear();
}
