import type { DesktopNotificationRequest, DesktopNotificationResult } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as Electron from "electron";

const MAX_SEEN_NOTIFICATIONS = 512;

export interface ElectronNotificationHandle {
  readonly once: (event: "click" | "close", listener: () => void) => void;
  readonly show: () => void;
}

export interface ElectronNotificationRuntime {
  readonly create: (request: DesktopNotificationRequest) => ElectronNotificationHandle;
  readonly isFocused: () => boolean;
  readonly isSupported: () => boolean;
  readonly reveal: () => void;
}

export class ElectronNotification extends Context.Service<
  ElectronNotification,
  {
    readonly show: (
      request: DesktopNotificationRequest,
    ) => Effect.Effect<DesktopNotificationResult>;
  }
>()("@t3tools/desktop/electron/ElectronNotification") {}

const runtime: ElectronNotificationRuntime = {
  create: (request) => {
    const notification = new Electron.Notification({
      title: request.title,
      body: request.body,
    });
    return {
      once: (event, listener) => {
        if (event === "click") notification.once("click", listener);
        else notification.once("close", listener);
      },
      show: () => notification.show(),
    };
  },
  isFocused: () => Electron.BrowserWindow.getFocusedWindow() !== null,
  isSupported: () => Electron.Notification.isSupported(),
  reveal: () => {
    const window =
      Electron.BrowserWindow.getFocusedWindow() ?? Electron.BrowserWindow.getAllWindows()[0];
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  },
};

export const make = (
  notificationRuntime: ElectronNotificationRuntime = runtime,
): ElectronNotification["Service"] => {
  const seen = new Set<string>();
  const seenOrder: string[] = [];
  const active = new Map<string, ElectronNotificationHandle>();

  const remember = (id: string): void => {
    seen.add(id);
    seenOrder.push(id);
    while (seenOrder.length > MAX_SEEN_NOTIFICATIONS) {
      const oldest = seenOrder.shift();
      if (oldest) seen.delete(oldest);
    }
  };

  return ElectronNotification.of({
    show: (request) =>
      Effect.sync(() => {
        if (!notificationRuntime.isSupported()) return "unsupported";
        if (notificationRuntime.isFocused()) return "focused";
        if (seen.has(request.id)) return "duplicate";

        try {
          const notification = notificationRuntime.create(request);
          remember(request.id);
          active.set(request.id, notification);
          notification.once("click", notificationRuntime.reveal);
          notification.once("close", () => active.delete(request.id));
          notification.show();
          return "shown";
        } catch {
          active.delete(request.id);
          seen.delete(request.id);
          return "unsupported";
        }
      }),
  });
};

export const layer = Layer.succeed(ElectronNotification, make());
