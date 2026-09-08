import { useAuth } from "@clerk/expo";
import * as Notifications from "expo-notifications";
import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";

import { uuidv7 } from "../../lib/uuid";
import {
  hasRoomsPublicConfig,
  resolveCloudPublicConfig,
  resolveRoomsClerkTokenOptions,
} from "../cloud/publicConfig";
import { RoomsMobileChangeLoop } from "./changeLoop";
import { createRoomsMobileClient } from "./client";
import { emitRoomsInvalidation, getRoomsVisibleChannel } from "./realtimeBridge";
import {
  presentRoomsRealtimeNotification,
  roomsNotificationBehavior,
} from "./realtimeNotifications";
import { markRoomsChannelRead, recordRoomsEvent, roomsCursorStore } from "./realtimePersistence";

const REALTIME_CLIENT_ID = `ios:${uuidv7()}`;

// Install this at module evaluation rather than after React effects run. APNs
// can arrive during initial render or session restoration, and the global
// handler must already own the presentation decision in that window.
Notifications.setNotificationHandler({
  handleNotification: roomsNotificationBehavior,
});

export function RoomsRealtimeCoordinator(): null {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const loopsRef = useRef(new Map<string, RoomsMobileChangeLoop>());

  const client = useMemo(() => {
    if (!hasRoomsPublicConfig()) return null;
    return createRoomsMobileClient({
      baseUrl: resolveCloudPublicConfig().rooms.apiUrl!,
      readToken: () => getTokenRef.current(resolveRoomsClerkTokenOptions()),
    });
  }, []);

  useEffect(() => {
    if (!client || !isLoaded || !isSignedIn || !userId) return;
    let cancelled = false;

    const stop = () => {
      for (const loop of loopsRef.current.values()) loop.stop();
      loopsRef.current.clear();
    };

    const start = async () => {
      stop();
      const session = await client.getSession();
      if (cancelled || AppState.currentState !== "active") return;
      for (const room of session.rooms) {
        const loop = new RoomsMobileChangeLoop({
          client,
          clientId: REALTIME_CLIENT_ID,
          cursorStore: roomsCursorStore(userId),
          onInvalidate: async (invalidation) => {
            const channels = new Set(invalidation.realtimeEvents.map((event) => event.channel_id));
            await Promise.all([...channels].map((channelId) => client.getFeed(room.id, channelId)));
            emitRoomsInvalidation(room.id);

            for (const event of invalidation.realtimeEvents) {
              if (event.actor_principal_id === session.principal?.id) {
                await recordRoomsEvent({ eventId: event.event_id });
                continue;
              }
              const visible = getRoomsVisibleChannel();
              const isVisible =
                visible?.roomId === event.room_id && visible.channelId === event.channel_id;
              const isNew = await recordRoomsEvent({
                eventId: event.event_id,
                ...(isVisible
                  ? {}
                  : { unreadChannel: { roomId: event.room_id, channelId: event.channel_id } }),
              });
              if (isNew && !isVisible && !event.fallback_published) {
                await presentRoomsRealtimeNotification(event);
              }
              if (isVisible) await markRoomsChannelRead(event.room_id, event.channel_id);
            }
            if (invalidation.realtimeEvents.length > 0) {
              await client.acknowledgeDeliveries(
                room.id,
                invalidation.realtimeEvents.map((event) => event.event_id),
              );
            }
          },
        });
        loopsRef.current.set(room.id, loop);
        loop.start(room.id);
      }
    };

    const startSafely = () => void start().catch(() => stop());

    if (AppState.currentState === "active") startSafely();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") startSafely();
      else stop();
    });
    return () => {
      cancelled = true;
      subscription.remove();
      stop();
    };
  }, [client, isLoaded, isSignedIn, userId]);

  return null;
}
