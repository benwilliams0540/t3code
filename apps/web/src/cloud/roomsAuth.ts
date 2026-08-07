export type RoomsAuthenticationSnapshot =
  | { readonly status: "authenticating"; readonly generation: number }
  | { readonly status: "signed-out"; readonly generation: number }
  | {
      readonly status: "signed-in";
      readonly generation: number;
      readonly accountId: string;
    };

const MAX_BEARER_BYTES = 16 * 1024;

export class RoomsAuthenticationError extends Error {
  constructor(
    readonly code: "rooms_auth_unavailable" | "rooms_session_expired" | "rooms_token_invalid",
  ) {
    super(
      code === "rooms_session_expired"
        ? "The Rooms T3 Connect session expired."
        : code === "rooms_token_invalid"
          ? "The Rooms Clerk token is invalid."
          : "Rooms authentication is not active for this account generation.",
    );
    this.name = "RoomsAuthenticationError";
  }
}

let generation = 0;
let snapshot: RoomsAuthenticationSnapshot = { status: "authenticating", generation };
let tokenProvider: (() => Promise<string | null>) | null = null;
const listeners = new Set<() => void>();

function publish(next: RoomsAuthenticationSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribeRoomsAuthentication(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readRoomsAuthenticationSnapshot(): RoomsAuthenticationSnapshot {
  return snapshot;
}

export function assertRoomsAuthenticationGeneration(expectedGeneration: number): void {
  if (snapshot.status !== "signed-in" || snapshot.generation !== expectedGeneration) {
    throw new RoomsAuthenticationError("rooms_auth_unavailable");
  }
}

export function markRoomsAuthenticationLoading(): void {
  tokenProvider = null;
  generation += 1;
  publish({ status: "authenticating", generation });
}

export function deactivateRoomsAuthentication(): void {
  tokenProvider = null;
  generation += 1;
  publish({ status: "signed-out", generation });
}

export function activateRoomsAuthentication(
  accountId: string,
  readToken: () => Promise<string | null>,
): void {
  tokenProvider = readToken;
  generation += 1;
  publish({ status: "signed-in", generation, accountId });
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
  generation = 0;
  tokenProvider = null;
  snapshot = { status: "authenticating", generation };
  listeners.clear();
}
