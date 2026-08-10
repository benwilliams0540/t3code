import type { ContextMenuItem, LocalApi } from "@t3tools/contracts";
import {
  normalizeRoomsOrigin,
  resolveRoomsHumanRequestUrl,
  validateRoomsHumanRequestBody,
} from "@t3tools/shared/roomsTransport";

import { resetRequestLatencyStateForTests } from "./rpc/requestLatencyState";
import { showContextMenuFallback } from "./contextMenuFallback";
import { readBrowserClientSettings, writeBrowserClientSettings } from "./clientPersistenceStorage";

let cachedApi: LocalApi | undefined;

function createBrowserLocalApi(): LocalApi {
  return {
    dialogs: {
      pickFolder: async (options) => {
        if (!window.desktopBridge) return null;
        return window.desktopBridge.pickFolder(options);
      },
      confirm: async (message) => {
        if (window.desktopBridge) {
          return window.desktopBridge.confirm(message);
        }
        return window.confirm(message);
      },
    },
    shell: {
      openExternal: async (url) => {
        if (window.desktopBridge) {
          const opened = await window.desktopBridge.openExternal(url);
          if (!opened) {
            throw new Error("Unable to open link.");
          }
          return;
        }

        window.open(url, "_blank", "noopener,noreferrer");
      },
    },
    contextMenu: {
      show: async <T extends string>(
        items: readonly ContextMenuItem<T>[],
        position?: { x: number; y: number },
      ): Promise<T | null> => {
        if (window.desktopBridge) {
          return window.desktopBridge.showContextMenu(items, position) as Promise<T | null>;
        }
        return showContextMenuFallback(items, position);
      },
    },
    persistence: {
      getClientSettings: async () => {
        if (window.desktopBridge) {
          return window.desktopBridge.getClientSettings();
        }
        return readBrowserClientSettings();
      },
      setClientSettings: async (settings) => {
        if (window.desktopBridge) {
          return window.desktopBridge.setClientSettings(settings);
        }
        writeBrowserClientSettings(settings);
      },
    },
    roomsLocal: {
      request: async (request) => {
        if (window.desktopBridge?.requestRoomsLocal) {
          return window.desktopBridge.requestRoomsLocal(request);
        }
        const target = new URL(request.path, request.baseUrl);
        const body =
          request.body === undefined
            ? undefined
            : request.bodyEncoding === "base64"
              ? Uint8Array.from(atob(request.body), (character) => character.charCodeAt(0))
              : request.body;
        const response = await fetch(target, {
          method: request.method,
          ...(body === undefined
            ? {}
            : {
                headers: { "content-type": request.contentType ?? "application/json" },
                body,
              }),
        });
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.text(),
        };
      },
    },
    roomsHuman: {
      request: async (request) => {
        if (window.desktopBridge?.requestRoomsHuman) {
          return window.desktopBridge.requestRoomsHuman(request);
        }
        const target = resolveRoomsHumanRequestUrl(request);
        if (normalizeRoomsOrigin("local", request.baseUrl) === null) {
          throw new Error("Shared Rooms HTTPS requires the signed desktop transport.");
        }
        const validatedBody = validateRoomsHumanRequestBody(request);
        const body =
          validatedBody === null
            ? undefined
            : validatedBody.bodyEncoding === "base64"
              ? Uint8Array.from(atob(validatedBody.body), (character) => character.charCodeAt(0))
              : validatedBody.body;
        const response = await fetch(target, {
          method: request.method,
          credentials: "omit",
          redirect: "manual",
          headers: {
            authorization: `Bearer ${request.bearer}`,
            ...(body === undefined
              ? {}
              : { "content-type": validatedBody?.contentType ?? "application/json" }),
          },
          ...(body === undefined ? {} : { body }),
        });
        if (response.status >= 300 && response.status < 400) {
          throw new Error("Rooms human API redirects are not allowed.");
        }
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.text(),
        };
      },
    },
  };
}

export function createLocalApi(): LocalApi {
  return createBrowserLocalApi();
}

export function readLocalApi(): LocalApi | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedApi) return cachedApi;

  cachedApi = createLocalApi();
  return cachedApi;
}

export function ensureLocalApi(): LocalApi {
  const api = readLocalApi();
  if (!api) {
    throw new Error("Local API not found");
  }
  return api;
}

export async function __resetLocalApiForTests() {
  cachedApi = undefined;
  const { __resetClientSettingsPersistenceForTests } = await import("./hooks/useSettings");
  __resetClientSettingsPersistenceForTests();
  resetRequestLatencyStateForTests();
}
