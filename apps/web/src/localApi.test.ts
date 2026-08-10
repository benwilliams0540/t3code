import {
  DEFAULT_CLIENT_SETTINGS,
  type ContextMenuItem,
  type DesktopBridge,
} from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const showContextMenuFallbackMock =
  vi.fn<
    <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>
  >();

vi.mock("./contextMenuFallback", () => ({
  showContextMenuFallback: showContextMenuFallbackMock,
}));

function createLocalStorageStub(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

function testWindow(): Window & typeof globalThis {
  return globalThis.window ?? (globalThis as unknown as Window & typeof globalThis);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  if (globalThis.window === undefined) {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });
  }
  Reflect.deleteProperty(testWindow(), "desktopBridge");
  Object.defineProperty(testWindow(), "localStorage", {
    configurable: true,
    value: createLocalStorageStub(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LocalApi", () => {
  it("keeps backend operations out of the local host facade", async () => {
    const { createLocalApi } = await import("./localApi");
    const api = createLocalApi();

    expect(api).not.toHaveProperty("server");
    expect(api.shell).not.toHaveProperty("openInEditor");
  });

  it("uses the browser context-menu fallback without a desktop bridge", async () => {
    showContextMenuFallbackMock.mockResolvedValue("rename");
    const { createLocalApi } = await import("./localApi");
    const items = [{ id: "rename", label: "Rename" }] as const;

    await expect(createLocalApi().contextMenu.show(items, { x: 4, y: 5 })).resolves.toBe("rename");
    expect(showContextMenuFallbackMock).toHaveBeenCalledWith(items, { x: 4, y: 5 });
  });

  it("delegates host capabilities and persistence to the desktop bridge", async () => {
    const showContextMenu = vi.fn().mockResolvedValue("delete");
    const pickFolder = vi.fn().mockResolvedValue("/tmp/project");
    const getClientSettings = vi.fn().mockResolvedValue(DEFAULT_CLIENT_SETTINGS);
    const setClientSettings = vi.fn().mockResolvedValue(undefined);
    testWindow().desktopBridge = {
      showContextMenu,
      pickFolder,
      getClientSettings,
      setClientSettings,
    } as unknown as DesktopBridge;

    const { createLocalApi } = await import("./localApi");
    const api = createLocalApi();
    const items = [{ id: "delete", label: "Delete" }] as const;

    await expect(api.contextMenu.show(items)).resolves.toBe("delete");
    await expect(api.dialogs.pickFolder({ initialPath: "/tmp" })).resolves.toBe("/tmp/project");
    await expect(api.persistence.getClientSettings()).resolves.toEqual(DEFAULT_CLIENT_SETTINGS);
    await api.persistence.setClientSettings(DEFAULT_CLIENT_SETTINGS);

    expect(showContextMenu).toHaveBeenCalledWith(items, undefined);
    expect(pickFolder).toHaveBeenCalledWith({ initialPath: "/tmp" });
    expect(getClientSettings).toHaveBeenCalledTimes(1);
    expect(setClientSettings).toHaveBeenCalledWith(DEFAULT_CLIENT_SETTINGS);
  });

  it("persists client settings in browser storage", async () => {
    const { createLocalApi } = await import("./localApi");
    const api = createLocalApi();
    const settings = {
      ...DEFAULT_CLIENT_SETTINGS,
      timestampFormat: "12-hour" as const,
    };

    await api.persistence.setClientSettings(settings);
    await expect(api.persistence.getClientSettings()).resolves.toEqual(settings);
  });

  it("rejects Shared HTTPS outside the signed desktop transport", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { createLocalApi } = await import("./localApi");

    await expect(
      createLocalApi().roomsHuman!.request({
        baseUrl: "https://rooms.example.test",
        path: "/rooms/human/v1/session",
        method: "GET",
        bearer: "header.payload.signature",
      }),
    ).rejects.toThrow("signed desktop transport");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps browser loopback requests bounded and rejects redirects", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(null, { status: 302, headers: { location: "https://example.test" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createLocalApi } = await import("./localApi");

    await expect(
      createLocalApi().roomsHuman!.request({
        baseUrl: "http://127.0.0.1:33102",
        path: "/rooms/human/v1/session",
        method: "GET",
        bearer: "header.payload.signature",
      }),
    ).rejects.toThrow("redirects are not allowed");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit", redirect: "manual" });
  });

  it("delegates Shared HTTPS to the desktop boundary", async () => {
    const requestRoomsHuman = vi.fn().mockResolvedValue({ status: 200, headers: {}, body: "{}" });
    testWindow().desktopBridge = { requestRoomsHuman } as unknown as DesktopBridge;
    const { createLocalApi } = await import("./localApi");
    const request = {
      baseUrl: "https://rooms.example.test",
      path: "/rooms/human/v1/session",
      method: "GET" as const,
      bearer: "header.payload.signature",
    };

    await createLocalApi().roomsHuman!.request(request);
    expect(requestRoomsHuman).toHaveBeenCalledWith(request);
  });
});
