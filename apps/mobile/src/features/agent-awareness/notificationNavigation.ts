import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { useLinkTo } from "@react-navigation/native";

import {
  extractRoomsNotificationEvent,
  routeAgentNotificationResponseOnce,
} from "./notificationPayload";
import { consumeLastAgentNotificationResponse } from "./notificationResponseConsumer";
import { recordRoomsEvent } from "../rooms/realtimePersistence";

export function useAgentNotificationNavigation(): void {
  const linkTo = useLinkTo();
  const handledResponseIds = useRef(new Set<string>());

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse): void => {
      const roomsEvent = extractRoomsNotificationEvent(response);
      if (roomsEvent) {
        void recordRoomsEvent({
          eventId: roomsEvent.eventId,
          unreadChannel: { roomId: roomsEvent.roomId, channelId: roomsEvent.channelId },
        });
      }
      routeAgentNotificationResponseOnce({
        handledResponseIds: handledResponseIds.current,
        response,
        navigate: linkTo,
      });
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void consumeLastAgentNotificationResponse({
      getLastResponse: () => Notifications.getLastNotificationResponseAsync(),
      clearLastResponse: () => Notifications.clearLastNotificationResponseAsync(),
      handleResponse,
    });

    return () => {
      subscription.remove();
    };
  }, [linkTo]);
}
