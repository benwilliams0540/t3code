import { useAuth } from "@clerk/expo";
import * as Notifications from "expo-notifications";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import {
  RoomsConnection,
  type RoomsConnectionIdentity,
  type RoomsConnectionRequest,
} from "@t3tools/client-runtime/rooms/connection";

import { uuidv7 } from "../../lib/uuid";
import {
  hasRoomsPublicConfig,
  resolveCloudPublicConfig,
  resolveRoomsClerkTokenOptions,
} from "../cloud/publicConfig";
import { RoomsMobileChangeLoop } from "./changeLoop";
import { createRoomsMobileClient } from "./client";
import type { RoomsHumanSession, RoomsHumanWorkspace, RoomsHumanStoriesResponse } from "./contract";
import { emitRoomsInvalidation, getRoomsVisibleChannel } from "./realtimeBridge";
import {
  presentRoomsRealtimeNotification,
  roomsNotificationBehavior,
} from "./realtimeNotifications";
import { markRoomsChannelRead, recordRoomsEvent, roomsCursorStore } from "./realtimePersistence";

const REALTIME_CLIENT_ID = `ios:${uuidv7()}`;
export interface RoomsMobileWorkspace {
  readonly workspace: RoomsHumanWorkspace;
  readonly stories: RoomsHumanStoriesResponse;
}
type Connection = RoomsConnection<RoomsHumanSession, RoomsMobileWorkspace>;
interface MobileConnection {
  readonly connection: Connection;
  readonly clientFor: (
    request: RoomsConnectionRequest,
  ) => ReturnType<typeof createRoomsMobileClient>;
  readonly identity: RoomsConnectionIdentity;
}
const RoomsMobileConnectionContext = createContext<MobileConnection | null>(null);

// APNs may arrive during initial render/session restoration, before effects.
Notifications.setNotificationHandler({ handleNotification: roomsNotificationBehavior });

/** Native transport, secure cursors, AppState and notification delivery adapt the shared owner. */
export function RoomsRealtimeCoordinator(props: { readonly children?: ReactNode } = {}) {
  const { getToken, isLoaded, isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const identity: RoomsConnectionIdentity = {
    source: "shared",
    server: hasRoomsPublicConfig() ? resolveCloudPublicConfig().rooms.apiUrl! : "",
    accountId: userId ?? null,
    authenticationGeneration: 0,
    authenticationStatus: !isLoaded ? "authenticating" : isSignedIn ? "signed-in" : "signed-out",
    configured: hasRoomsPublicConfig(),
  };
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const connection = useMemo(() => {
    const owner: Connection = new RoomsConnection({
      loadSelectedWorkspace: false,
      liveRooms: "all",
      createLiveSubscription: (roomId, request) => {
        const client = clientFor(request);
        return new RoomsMobileChangeLoop({
          client,
          clientId: REALTIME_CLIENT_ID,
          cursorStore: roomsCursorStore(request.accountId!),
          onInvalidate: async (invalidation) => {
            owner.assertCurrent(request, identityRef.current);
            const channels = new Set(invalidation.realtimeEvents.map((event) => event.channel_id));
            await Promise.all([...channels].map((channelId) => client.getFeed(roomId, channelId)));
            owner.assertCurrent(request, identityRef.current);
            emitRoomsInvalidation(roomId);
            for (const event of invalidation.realtimeEvents) {
              owner.assertCurrent(request, identityRef.current);
              if (event.actor_principal_id === owner.getSnapshot().session?.principal?.id) {
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
              owner.assertCurrent(request, identityRef.current);
              if (isNew && !isVisible && !event.fallback_published)
                await presentRoomsRealtimeNotification(event);
              owner.assertCurrent(request, identityRef.current);
              if (isVisible) await markRoomsChannelRead(event.room_id, event.channel_id);
            }
            if (invalidation.realtimeEvents.length > 0) {
              await client.acknowledgeDeliveries(
                roomId,
                invalidation.realtimeEvents.map((event) => event.event_id),
              );
            }
          },
        });
      },
    });
    function clientFor(request: RoomsConnectionRequest) {
      return createRoomsMobileClient({
        baseUrl: request.server,
        readToken: () => getTokenRef.current(resolveRoomsClerkTokenOptions()),
        assertCurrent: () => owner.assertCurrent(request, identityRef.current),
      });
    }
    return { owner, clientFor };
  }, []);

  useEffect(() => {
    const owner = connection.owner;
    owner.configure(identity, {
      discover: async (request) => {
        const session = await connection.clientFor(request).getSession();
        return { session, rooms: session.rooms };
      },
      loadWorkspace: async (roomId, request) => {
        const client = connection.clientFor(request);
        const [workspace, stories] = await Promise.all([
          client.getWorkspace(roomId),
          client.getStories(roomId),
        ]);
        return { workspace, stories };
      },
      workspaceRoomId: (result) => result.workspace.room.id,
    });
    if (!identity.configured || identity.authenticationStatus !== "signed-in") {
      owner.setActive(false);
      return;
    }
    const start = () => {
      // Repeated active notifications supersede pending discovery just as a resume does.
      owner.setActive(false);
      owner.setActive(true);
      void owner.refresh();
    };
    if (AppState.currentState === "active") start();
    else owner.setActive(false);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else owner.setActive(false);
    });
    return () => {
      subscription.remove();
      owner.setActive(false);
    };
  }, [
    connection,
    identity.server,
    identity.accountId,
    identity.authenticationStatus,
    identity.configured,
  ]);

  if (props.children === undefined) return null;
  return (
    <RoomsMobileConnectionContext
      value={{ connection: connection.owner, clientFor: connection.clientFor, identity }}
    >
      {props.children}
    </RoomsMobileConnectionContext>
  );
}

export function useRoomsMobileConnection() {
  const context = useContext(RoomsMobileConnectionContext);
  if (!context) throw new Error("Rooms must use the application's room connection owner.");
  const snapshot = useSyncExternalStore(
    context.connection.subscribe,
    context.connection.getSnapshot,
  );
  return { ...context, snapshot };
}
