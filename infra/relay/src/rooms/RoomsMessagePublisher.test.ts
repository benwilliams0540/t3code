import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";

import * as ApnsDeliveryQueue from "../agentActivity/ApnsDeliveryQueue.js";
import * as LiveActivities from "../agentActivity/LiveActivities.js";
import { make, roomsDeliveryJobId, roomsNotificationPayload } from "./RoomsMessagePublisher.js";

const event = {
  eventId: "019fdb59-05c2-7a75-9455-c89f280b62e5",
  recipientUserId: "user_123",
  roomId: "room:019fdb59-05c2-7a75-9455-c89f280b62e6",
  channelId: "channel:019fdb59-05c2-7a75-9455-c89f280b62e7",
  roomName: "Threadspace",
  channelName: "# general",
  senderDisplayName: "Monroe",
  occurredAt: "2026-08-13T18:00:00.000Z",
  deepLink:
    "/rooms/room%3A019fdb59-05c2-7a75-9455-c89f280b62e6/channel%3A019fdb59-05c2-7a75-9455-c89f280b62e7",
} as const;

describe("Rooms message publication", () => {
  it("derives a stable per-event and per-device queue identity", () => {
    const first = roomsDeliveryJobId({ eventId: event.eventId, userId: "user_123", deviceId: "a" });
    const replay = roomsDeliveryJobId({
      eventId: event.eventId,
      userId: "user_123",
      deviceId: "a",
    });
    const otherDevice = roomsDeliveryJobId({
      eventId: event.eventId,
      userId: "user_123",
      deviceId: "b",
    });

    expect(first).toBe(replay);
    expect(first).toHaveLength(64);
    expect(first).not.toBe(otherDevice);
  });

  it("keeps the durable id and authoritative Rooms deep link in APNs data", () => {
    expect(roomsNotificationPayload(event)).toEqual({
      title: "Threadspace",
      body: "Monroe posted in # general",
      environmentId: "rooms",
      threadId: event.eventId,
      deepLink: event.deepLink,
      eventId: event.eventId,
      roomId: event.roomId,
      channelId: event.channelId,
    });
  });

  it("queues only notification-enabled APNs targets for the Clerk user", async () => {
    const enqueued: unknown[] = [];
    const publisher = await Effect.runPromise(
      make.pipe(
        Effect.provideService(
          LiveActivities.LiveActivities,
          LiveActivities.LiveActivities.of({
            listTargets: () =>
              Effect.succeed([
                {
                  user_id: event.recipientUserId,
                  device_id: "enabled-device",
                  push_token: "enabled-token",
                  bundle_id: "com.brw.threadspace.alpha",
                  aps_environment: "sandbox",
                  preferences_json: JSON.stringify({ notificationsEnabled: true }),
                },
                {
                  user_id: event.recipientUserId,
                  device_id: "disabled-device",
                  push_token: "disabled-token",
                  bundle_id: "com.brw.threadspace.alpha",
                  aps_environment: "sandbox",
                  preferences_json: JSON.stringify({ notificationsEnabled: false }),
                },
              ]),
          } as never),
        ),
        Effect.provideService(
          ApnsDeliveryQueue.ApnsDeliveryQueue,
          ApnsDeliveryQueue.ApnsDeliveryQueue.of({
            enqueuePushNotification: (input: unknown) => {
              enqueued.push(input);
              return Effect.succeed({
                deviceId: "enabled-device",
                kind: "push_notification" as const,
                ok: true,
                queued: true,
                apnsStatus: null,
                apnsReason: null,
                apnsId: null,
              });
            },
          } as never),
        ),
      ),
    );

    await expect(Effect.runPromise(publisher.publish(event))).resolves.toMatchObject({
      ok: true,
      deliveries: [{ deviceId: "enabled-device", queued: true }],
    });
    expect(enqueued).toEqual([
      expect.objectContaining({
        userId: event.recipientUserId,
        deviceId: "enabled-device",
        token: "enabled-token",
        bundleId: "com.brw.threadspace.alpha",
        apsEnvironment: "sandbox",
        jobId: roomsDeliveryJobId({
          eventId: event.eventId,
          userId: event.recipientUserId,
          deviceId: "enabled-device",
        }),
      }),
    ]);
  });
});
