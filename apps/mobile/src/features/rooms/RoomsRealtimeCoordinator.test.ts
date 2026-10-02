import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// Invoke the real coordinator's effects synchronously while preserving refs
// across synthetic rerenders. Native/React scheduling and OS acceptance are
// outside this controlled HTTP/startup ownership test.
const platform = vi.hoisted(() => ({
  userId: "user:first" as string | null,
  refs: [] as Array<{ current: unknown }>,
  refIndex: 0,
  memo: undefined as unknown,
  cleanup: undefined as (() => void) | undefined,
  sessions: [] as Promise<unknown>[],
  listeners: new Set<(state: string) => void>(),
  appState: {
    currentState: "active",
    addEventListener: (_event: string, listener: (state: string) => void) => {
      platform.listeners.add(listener);
      return { remove: () => platform.listeners.delete(listener) };
    },
  },
}));

vi.mock("react", () => ({
  useRef: (current: unknown) => {
    const index = platform.refIndex++;
    platform.refs[index] ??= { current };
    return platform.refs[index];
  },
  useMemo: (create: () => unknown) => (platform.memo ??= create()),
  useEffect: (effect: () => void | (() => void)) => {
    platform.cleanup?.();
    platform.cleanup = effect() ?? undefined;
  },
}));
vi.mock("react-native", () => ({ AppState: platform.appState }));
vi.mock("@clerk/expo", () => ({
  useAuth: () => ({
    getToken: async () => "synthetic-bearer",
    isLoaded: true,
    isSignedIn: platform.userId !== null,
    userId: platform.userId,
  }),
}));
vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  scheduleNotificationAsync: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
}));
vi.mock("../../lib/uuid", () => ({ uuidv7: () => "synthetic-client" }));
vi.mock("../cloud/publicConfig", () => ({
  hasRoomsPublicConfig: () => true,
  resolveCloudPublicConfig: () => ({ rooms: { apiUrl: "https://rooms.example.test" } }),
  resolveRoomsClerkTokenOptions: () => ({}),
}));
vi.mock("./client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./client")>();
  return {
    ...actual,
    createRoomsMobileClient: (options: Parameters<typeof actual.createRoomsMobileClient>[0]) => {
      const client = actual.createRoomsMobileClient(options);
      const getSession = client.getSession;
      return {
        ...client,
        getSession: () => {
          const request = getSession();
          platform.sessions.push(request);
          return request;
        },
      };
    },
  };
});

import { RoomsRealtimeCoordinator } from "./RoomsRealtimeCoordinator";
import { RoomsMobileChangeLoop } from "./changeLoop";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function session() {
  return new Response(
    JSON.stringify({
      contract: {
        id: "rooms.human-shared",
        version: 1,
        schema_uri: "contracts/rooms/human-shared/v1/schema.json",
      },
      status: "ready",
      principal: { id: "h:synthetic", type: "human", display_name: "Synthetic", role: "admin" },
      rooms: [
        {
          id: "room:019fed3b-e36c-7730-aed8-4a927abc756a",
          slug: "synthetic",
          name: "Synthetic",
          locality: "shared",
          role: "admin",
        },
      ],
    }),
    { status: 200 },
  );
}

const loops: RoomsMobileChangeLoop[] = [];
beforeEach(() => {
  platform.userId = "user:first";
  platform.refs = [];
  platform.refIndex = 0;
  platform.memo = undefined;
  platform.cleanup = undefined;
  platform.sessions = [];
  platform.listeners.clear();
  platform.appState.currentState = "active";
  const start = RoomsMobileChangeLoop.prototype.start;
  vi.spyOn(RoomsMobileChangeLoop.prototype, "start").mockImplementation(function (
    this: RoomsMobileChangeLoop,
    roomId: string,
  ) {
    loops.push(this);
    start.call(this, roomId);
  });
});
afterEach(() => {
  platform.cleanup?.();
  for (const loop of loops) loop.stop();
  loops.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fixture() {
  const sessionRequests = Array.from({ length: 3 }, () => deferred<void>());
  const responses = Array.from({ length: 3 }, () => deferred<Response>());
  const waitRequests = Array.from({ length: 3 }, () => deferred<void>());
  const signals: AbortSignal[] = [];
  let requests = 0;
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    if (new URL(input).pathname.endsWith("/session")) {
      const index = requests++;
      sessionRequests[index]!.resolve();
      return responses[index]!.promise;
    }
    const signal = init.signal as AbortSignal;
    signals.push(signal);
    waitRequests[signals.length - 1]!.resolve();
    return new Promise<Response>((_resolve, reject) => {
      if (signal.aborted) reject(new Error("synthetic abort"));
      else
        signal.addEventListener("abort", () => reject(new Error("synthetic abort")), {
          once: true,
        });
    });
  });
  return {
    requested: (index: number) => sessionRequests[index]!.promise,
    waiting: (index = 0) => waitRequests[index]!.promise,
    activeWaits: () => signals.filter((signal) => !signal.aborted).length,
    async settle(index: number, ok = true) {
      responses[index]!.resolve(ok ? session() : new Response("{}", { status: 503 }));
      await platform.sessions[index]!.then(
        () => undefined,
        () => undefined,
      );
    },
  };
}

function render(userId = platform.userId) {
  platform.userId = userId;
  platform.refIndex = 0;
  RoomsRealtimeCoordinator();
}

function state(next: string) {
  platform.appState.currentState = next;
  for (const listener of platform.listeners) listener(next);
}

describe("Rooms native coordinator startup ownership with synthetic boundaries", () => {
  it.each(["older-first", "newer-first"])("ignores a stale success (%s)", async (order) => {
    const transport = fixture();
    render();
    await transport.requested(0);
    state("background");
    state("active");
    await transport.requested(1);
    await transport.settle(order === "older-first" ? 0 : 1);
    await transport.settle(order === "older-first" ? 1 : 0);
    await transport.waiting();
    expect(loops).toHaveLength(1);
    expect(transport.activeWaits()).toBe(1);
    platform.cleanup!();
    expect(transport.activeWaits()).toBe(0);
    expect(platform.listeners.size).toBe(0);
  });

  it.each(["older-first", "newer-first"])("ignores a stale rejection (%s)", async (order) => {
    const transport = fixture();
    render();
    await transport.requested(0);
    state("active");
    await transport.requested(1);
    if (order === "older-first") await transport.settle(0, false);
    await transport.settle(1);
    await transport.waiting();
    if (order === "newer-first") await transport.settle(0, false);
    expect(loops).toHaveLength(1);
    expect(transport.activeWaits()).toBe(1);
  });

  it("does not revive an older success after the current startup rejects", async () => {
    const transport = fixture();
    render();
    await transport.requested(0);
    state("active");
    await transport.requested(1);
    await transport.settle(1, false);
    await transport.settle(0);
    expect(loops).toHaveLength(0);
    expect(transport.activeWaits()).toBe(0);
  });

  it("ignores a session that completes in the background and starts fresh on resume", async () => {
    const transport = fixture();
    render();
    await transport.requested(0);
    state("background");
    await transport.settle(0);
    expect(loops).toHaveLength(0);
    state("active");
    await transport.requested(1);
    await transport.settle(1);
    await transport.waiting();
    expect(loops).toHaveLength(1);
  });

  it("aborts a running wait before restarting it", async () => {
    const transport = fixture();
    render();
    await transport.requested(0);
    await transport.settle(0);
    await transport.waiting(0);
    state("background");
    expect(transport.activeWaits()).toBe(0);
    state("active");
    await transport.requested(1);
    await transport.settle(1);
    await transport.waiting(1);
    expect(transport.activeWaits()).toBe(1);
    platform.cleanup!();
    expect(transport.activeWaits()).toBe(0);
  });

  it.each([true, false])(
    "ignores pending startup completion after cleanup (success: %s)",
    async (ok) => {
      const transport = fixture();
      render();
      await transport.requested(0);
      platform.cleanup!();
      await transport.settle(0, ok);
      expect(loops).toHaveLength(0);
      expect(transport.activeWaits()).toBe(0);
      expect(platform.listeners.size).toBe(0);
    },
  );

  it("keeps a new account's wait when an old effect rejects", async () => {
    const transport = fixture();
    render();
    await transport.requested(0);
    render("user:second");
    await transport.requested(1);
    await transport.settle(1);
    await transport.waiting();
    await transport.settle(0, false);
    expect(transport.activeWaits()).toBe(1);
    expect(platform.listeners.size).toBe(1);
  });

  it("does not start a pending session after sign-out", async () => {
    const transport = fixture();
    render();
    await transport.requested(0);
    render(null);
    await transport.settle(0);
    expect(loops).toHaveLength(0);
    expect(platform.listeners.size).toBe(0);
  });
});
