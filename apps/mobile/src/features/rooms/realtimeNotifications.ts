import * as Notifications from "expo-notifications";

import type { RoomsRealtimeEvent } from "./contract";
import { getRoomsVisibleChannel } from "./realtimeBridge";
import { hasSeenRoomsEvent, recordRoomsEvent } from "./realtimePersistence";

export async function presentRoomsRealtimeNotification(event: RoomsRealtimeEvent): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: event.sender_display_name ?? "Rooms",
      body: event.summary,
      data: {
        eventId: event.event_id,
        roomId: event.room_id,
        channelId: event.channel_id,
        deepLink: `/rooms/${encodeURIComponent(event.room_id)}/${encodeURIComponent(event.channel_id)}`,
      },
    },
    trigger: null,
  });
}

export async function roomsNotificationBehavior(
  notification: Notifications.Notification,
): Promise<Notifications.NotificationBehavior> {
  const data = notification.request.content.data ?? {};
  const eventId = typeof data.eventId === "string" ? data.eventId : null;
  const roomId = typeof data.roomId === "string" ? data.roomId : null;
  const channelId = typeof data.channelId === "string" ? data.channelId : null;
  if (eventId && roomId && channelId) {
    const visible = getRoomsVisibleChannel();
    const isVisible = visible?.roomId === roomId && visible.channelId === channelId;
    if ((await hasSeenRoomsEvent(eventId)) || isVisible) {
      if (isVisible) await recordRoomsEvent({ eventId });
      return {
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
    await recordRoomsEvent({ eventId, unreadChannel: { roomId, channelId } });
  }
  return {
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  };
}
