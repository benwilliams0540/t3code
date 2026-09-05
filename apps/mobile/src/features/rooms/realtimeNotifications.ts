import * as Notifications from "expo-notifications";

import type { RoomsRealtimeEvent } from "./contract";
import { getRoomsVisibleChannel } from "./realtimeBridge";
import { recordRoomsEvent } from "./realtimePersistence";

const FOREGROUND_REALTIME_PRESENTATION = "foreground-realtime";

export async function presentRoomsRealtimeNotification(event: RoomsRealtimeEvent): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: event.sender_display_name ?? "Threadspace",
      body: event.summary,
      data: {
        eventId: event.event_id,
        roomId: event.room_id,
        channelId: event.channel_id,
        deepLink: `/rooms/${encodeURIComponent(event.room_id)}/${encodeURIComponent(event.channel_id)}`,
        roomsPresentation: FOREGROUND_REALTIME_PRESENTATION,
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
    if (data.roomsPresentation === FOREGROUND_REALTIME_PRESENTATION) {
      return {
        shouldPlaySound: !isVisible,
        shouldSetBadge: false,
        shouldShowBanner: !isVisible,
        shouldShowList: !isVisible,
      };
    }

    // Record before deciding whether to present. This makes the decision atomic
    // with the durable dedup store when APNs races foreground realtime. A
    // has-then-record sequence lets both paths observe the event as unseen.
    const isNew = await recordRoomsEvent({
      eventId,
      ...(isVisible ? {} : { unreadChannel: { roomId, channelId } }),
    });
    if (!isNew || isVisible) {
      return {
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: false,
        shouldShowList: false,
      };
    }
  }
  return {
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  };
}
