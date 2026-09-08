import { sha256 } from "@noble/hashes/sha2";
import type {
  RelayDeliveryResult,
  RelayPublishResponse,
  RelayRoomsMessagePublishRequest,
} from "@t3tools/contracts/relay";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as ApnsDeliveryQueue from "../agentActivity/ApnsDeliveryQueue.ts";
import * as LiveActivities from "../agentActivity/LiveActivities.ts";

export type RoomsMessagePublishError =
  | LiveActivities.LiveActivityTargetListPersistenceError
  | ApnsDeliveryQueue.ApnsDeliveryQueueError;

export class RoomsMessagePublisher extends Context.Service<
  RoomsMessagePublisher,
  {
    readonly publish: (
      input: RelayRoomsMessagePublishRequest,
    ) => Effect.Effect<RelayPublishResponse, RoomsMessagePublishError>;
  }
>()("t3code-relay/rooms/RoomsMessagePublisher") {}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function roomsDeliveryJobId(input: {
  readonly eventId: string;
  readonly userId: string;
  readonly deviceId: string;
}): string {
  return hex(
    sha256(new TextEncoder().encode(`${input.eventId}\n${input.userId}\n${input.deviceId}`)),
  );
}

export function roomsNotificationPayload(input: RelayRoomsMessagePublishRequest) {
  return {
    title: input.roomName,
    body: input.senderDisplayName
      ? `${input.senderDisplayName} posted in ${input.channelName}`
      : `New message in ${input.channelName}`,
    environmentId: "rooms",
    threadId: input.eventId,
    deepLink: input.deepLink,
    eventId: input.eventId,
    roomId: input.roomId,
    channelId: input.channelId,
  } as const;
}

export const make = Effect.gen(function* () {
  const targets = yield* LiveActivities.LiveActivities;
  const queue = yield* ApnsDeliveryQueue.ApnsDeliveryQueue;

  return RoomsMessagePublisher.of({
    publish: Effect.fn("relay.rooms.publish_message")(function* (input) {
      const deliveryTargets = yield* targets.listTargets({ userId: input.recipientUserId });
      const deliveries = yield* Effect.forEach(
        deliveryTargets,
        (target): Effect.Effect<RelayDeliveryResult | null, RoomsMessagePublishError> => {
          let preferences: { readonly notificationsEnabled?: unknown };
          try {
            preferences = JSON.parse(target.preferences_json) as typeof preferences;
          } catch {
            return Effect.succeed(null);
          }
          if (!target.push_token || preferences.notificationsEnabled !== true) {
            return Effect.succeed(null);
          }
          return queue.enqueuePushNotification({
            userId: target.user_id,
            deviceId: target.device_id,
            token: target.push_token,
            bundleId: target.bundle_id,
            apsEnvironment: target.aps_environment,
            jobId: roomsDeliveryJobId({
              eventId: input.eventId,
              userId: target.user_id,
              deviceId: target.device_id,
            }),
            notification: roomsNotificationPayload(input),
          });
        },
        { concurrency: "unbounded" },
      );
      return { ok: true as const, deliveries: deliveries.filter((value) => value !== null) };
    }),
  });
});

export const layer = Layer.effect(RoomsMessagePublisher, make);
