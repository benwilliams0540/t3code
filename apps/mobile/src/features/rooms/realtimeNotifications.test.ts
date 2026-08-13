import type { Notification } from "expo-notifications";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const secureStore = vi.hoisted(() => new Map<string, string>());
const secureStoreControl = vi.hoisted(() => ({ failWrites: false }));

vi.mock("expo-secure-store", () => ({
  getItemAsync: (key: string) => Promise.resolve(secureStore.get(key) ?? null),
  setItemAsync: (key: string, value: string) => {
    if (secureStoreControl.failWrites)
      return Promise.reject(new Error("secure storage unavailable"));
    secureStore.set(key, value);
    return Promise.resolve();
  },
}));

vi.mock("expo-notifications", () => ({
  scheduleNotificationAsync: vi.fn(() => Promise.resolve("notification-id")),
}));

import { setRoomsVisibleChannel } from "./realtimeBridge";
import { roomsNotificationBehavior } from "./realtimeNotifications";
import {
  loadRoomsUnread,
  recordRoomsEvent,
  roomsCursorStore,
  unreadKey,
} from "./realtimePersistence";

const roomId = "room:019fdb59-05c2-7a75-9455-c89f280b62e6";
const channelId = "channel:019fdb59-05c2-7a75-9455-c89f280b62e7";

function notification(eventId: string): Notification {
  return {
    request: { content: { data: { eventId, roomId, channelId } } },
  } as unknown as Notification;
}

describe("Rooms notification behavior", () => {
  beforeEach(() => {
    secureStoreControl.failWrites = false;
    setRoomsVisibleChannel(null);
  });

  it("silences an event already delivered by foreground realtime", async () => {
    const eventId = "019fdb59-05c2-7a75-9455-c89f280b62e8";
    await recordRoomsEvent({ eventId });

    await expect(roomsNotificationBehavior(notification(eventId))).resolves.toMatchObject({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
    });
  });

  it("silences the visible channel and shows an unseen background fallback", async () => {
    setRoomsVisibleChannel({ roomId, channelId });
    await expect(
      roomsNotificationBehavior(notification("019fdb59-05c2-7a75-9455-c89f280b62e9")),
    ).resolves.toMatchObject({ shouldShowBanner: false, shouldShowList: false });

    setRoomsVisibleChannel(null);
    await expect(
      roomsNotificationBehavior(notification("019fdb59-05c2-7a75-9455-c89f280b62ea")),
    ).resolves.toMatchObject({ shouldShowBanner: true, shouldShowList: true });
    await expect(loadRoomsUnread()).resolves.toMatchObject({
      [unreadKey(roomId, channelId)]: 1,
    });
  });

  it("requires a durable cursor write and recovers the serialized mutation queue", async () => {
    const store = roomsCursorStore("user:test");
    secureStoreControl.failWrites = true;
    await expect(store.save(roomId, 10)).rejects.toThrow("secure storage unavailable");

    secureStoreControl.failWrites = false;
    await expect(store.save(roomId, 11)).resolves.toBeUndefined();
    await expect(store.load(roomId)).resolves.toBe(11);
  });
});
