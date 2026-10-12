import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const electron = await vi.hoisted(async () => {
  const events = await import("node:events");
  return {
    app: Object.assign(new events.EventEmitter(), {
      setAsDefaultProtocolClient: vi.fn(() => true),
    }),
    handlers: new Map<string, (event: unknown, url?: string) => unknown>(),
    openExternal: vi.fn(async (_url: string): Promise<void> => undefined),
    registerSchemesAsPrivileged: vi.fn(),
    storage: {
      getItem: vi.fn(async () => null),
      setItem: vi.fn(async () => undefined),
      removeItem: vi.fn(async () => undefined),
    },
  };
});

vi.mock("electron", () => ({
  app: electron.app,
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, url?: string) => unknown) => {
      if (electron.handlers.has(channel)) throw new Error("Duplicate IPC handler");
      electron.handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => electron.handlers.delete(channel),
  },
  shell: { openExternal: electron.openExternal },
  protocol: { registerSchemesAsPrivileged: electron.registerSchemesAsPrivileged },
  BrowserWindow: {},
}));
vi.mock("@clerk/electron/storage", () => ({ storage: () => electron.storage }));
vi.mock("../../../../scripts/lib/desktop-brand.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../scripts/lib/desktop-brand.ts")>()),
  DESKTOP_BUILD_BRAND: "threadspace",
}));

// Exercise the repository adapter and the installed SDK, not a copied OAuth implementation.
// Electron events/IPC, timers, browser opening and storage remain synthetic boundaries.
import { createDesktopClerkBridge } from "./DesktopClerk.ts";

const OPEN = "clerk:oauth-transport:open";
const REDIRECT = "clerk:oauth-transport:get-redirect-url";
const EXTERNAL = "https://github.com/login/oauth/authorize?state=synthetic-private-state";
const CALLBACK =
  "threadspace://app/?code=synthetic-private-code&state=synthetic-private-state#private";
const frame = {};
const sender = { getType: () => "window", mainFrame: frame };
const event = { sender, senderFrame: frame };
const invoke = (channel: string, inputEvent: unknown = event, url?: string) => {
  const handler = electron.handlers.get(channel);
  if (!handler) throw new Error("Missing Clerk IPC handler");
  return handler(inputEvent, url);
};
const open = () => invoke(OPEN, event, EXTERNAL) as Promise<{ callbackUrl: string }>;
const callback = (url = CALLBACK) =>
  electron.app.emit("open-url", { preventDefault: vi.fn() }, url);
let bridge: ReturnType<typeof createDesktopClerkBridge>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  electron.openExternal.mockResolvedValue(undefined);
  electron.app.setAsDefaultProtocolClient.mockReturnValue(true);
  bridge = createDesktopClerkBridge("/synthetic/state", false, false);
});

afterEach(() => {
  bridge.cleanup();
  expect(electron.handlers.size).toBe(0);
  expect(electron.app.listenerCount("open-url")).toBe(0);
  expect(electron.app.listenerCount("second-instance")).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(electron.storage.getItem).not.toHaveBeenCalled();
  expect(electron.storage.setItem).not.toHaveBeenCalled();
  expect(electron.storage.removeItem).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ThreadSpace Clerk OAuth transport contract", () => {
  it.each([false, true])(
    "uses the build's exact callback origin (development: %s)",
    (development) => {
      bridge.cleanup();
      bridge = createDesktopClerkBridge("/synthetic/state", development, false);
      const scheme = development ? "threadspace-dev" : "threadspace";
      expect(invoke(REDIRECT)).toBe(`${scheme}://app/`);
      expect(electron.app.setAsDefaultProtocolClient).toHaveBeenLastCalledWith(scheme);
    },
  );

  it.each(["open-url", "second-instance"])(
    "resolves a matching %s callback exactly once",
    async (kind) => {
      const pending = open();
      if (kind === "open-url") callback();
      else electron.app.emit(kind, {}, ["other-app", "--flag", CALLBACK]);
      await expect(pending).resolves.toEqual({ callbackUrl: CALLBACK });
      callback();
      electron.app.emit("second-instance", {}, ["other-app", CALLBACK]);
      expect(electron.openExternal).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("ignores nonmatching and malformed returns while a single flow is pending", async () => {
    const pending = open();
    for (const url of [
      "not-a-url",
      "https://app/",
      "threadspace-dev://app/",
      "threadspace://other/",
      "threadspace://app/probe",
    ]) {
      const preventDefault = vi.fn();
      electron.app.emit("open-url", { preventDefault }, url);
      electron.app.emit("second-instance", {}, [url]);
      expect(preventDefault).not.toHaveBeenCalled();
    }
    await expect(open()).rejects.toThrow("an OAuth flow is already pending");
    expect(electron.openExternal).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    callback();
    await expect(pending).resolves.toEqual({ callbackUrl: CALLBACK });
  });

  it("accepts a delayed callback before the existing 180-second timeout", async () => {
    const pending = open();
    await vi.advanceTimersByTimeAsync(179_999);
    callback();
    await expect(pending).resolves.toEqual({ callbackUrl: CALLBACK });
  });

  it("times out, ignores a late return, and permits a new attempt", async () => {
    const pending = open();
    const rejection = expect(pending).rejects.toThrow("OAuth callback timed out");
    await vi.advanceTimersByTimeAsync(180_000);
    await rejection;
    callback(); // No active flow. This is not a state-validation test for a later flow.
    const retry = open();
    callback();
    await expect(retry).resolves.toEqual({ callbackUrl: CALLBACK });
    expect(electron.openExternal).toHaveBeenCalledTimes(2);
  });

  it("cancels a pending flow on teardown and leaves one owner after app handoff", async () => {
    const pending = open();
    const rejection = expect(pending).rejects.toThrow("OAuth flow was cancelled");
    bridge.cleanup();
    await rejection;
    expect(electron.handlers.size).toBe(0);
    bridge = createDesktopClerkBridge("/synthetic/state", false, false);
    expect(electron.app.listenerCount("open-url")).toBe(1);
    expect(electron.app.listenerCount("second-instance")).toBe(1);
    const retry = open();
    electron.app.emit("second-instance", {}, ["replacement-app", CALLBACK]);
    await expect(retry).resolves.toEqual({ callbackUrl: CALLBACK });
  });

  it("recovers when opening the external browser rejects", async () => {
    electron.openExternal.mockRejectedValueOnce(new Error("Synthetic browser launch failure"));
    await expect(open()).rejects.toThrow("Synthetic browser launch failure");
    expect(vi.getTimerCount()).toBe(0);
    const retry = open();
    callback();
    await expect(retry).resolves.toEqual({ callbackUrl: CALLBACK });
  });

  it("accepts a forwarded callback even when default-handler registration returns false", async () => {
    bridge.cleanup();
    electron.app.setAsDefaultProtocolClient.mockReturnValue(false);
    bridge = createDesktopClerkBridge("/synthetic/state", false, false);
    const pending = open();
    electron.app.emit("second-instance", {}, ["installed-app", CALLBACK]);
    await expect(pending).resolves.toEqual({ callbackUrl: CALLBACK });
  });

  it("retains an early callback while the browser-open promise is still pending", async () => {
    let finishOpening: (() => void) | undefined;
    electron.openExternal.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishOpening = resolve;
        }),
    );
    const pending = open();
    callback();
    expect(vi.getTimerCount()).toBe(0);
    finishOpening?.();
    await expect(pending).resolves.toEqual({ callbackUrl: CALLBACK });
  });

  it("rejects non-main-frame callers before browser opening", async () => {
    const foreign = { sender, senderFrame: {} };
    expect(() => invoke(REDIRECT, foreign)).toThrow("main frame");
    await expect(invoke(OPEN, foreign, EXTERNAL)).rejects.toThrow("main frame");
    expect(electron.openExternal).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not log synthetic callback secrets on success, duplicate or timeout", async () => {
    const logs = ["log", "info", "warn", "error", "debug"] as const;
    const spies = logs.map((name) => vi.spyOn(console, name).mockImplementation(() => undefined));
    const pending = open();
    callback();
    callback();
    await pending;
    const timedOut = open();
    const rejection = expect(timedOut).rejects.toThrow("OAuth callback timed out");
    await vi.advanceTimersByTimeAsync(180_000);
    await rejection;
    const cancelled = open();
    const cancellation = expect(cancelled).rejects.toThrow("OAuth flow was cancelled");
    bridge.cleanup();
    await cancellation;
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
