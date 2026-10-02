import {
  RoomsChangeLoop,
  ROOMS_CHANGE_WAIT_TIMEOUT_MS,
  ROOMS_CHANGE_RETRY_INITIAL_MS,
  ROOMS_CHANGE_RETRY_MAX_MS,
} from "@t3tools/client-runtime/rooms/change-loop";

import { RoomsMobileClientError } from "./client";

export const ROOMS_MOBILE_CHANGE_WAIT_TIMEOUT_MS = ROOMS_CHANGE_WAIT_TIMEOUT_MS;
export const ROOMS_MOBILE_CHANGE_RETRY_INITIAL_MS = ROOMS_CHANGE_RETRY_INITIAL_MS;
export const ROOMS_MOBILE_CHANGE_RETRY_MAX_MS = ROOMS_CHANGE_RETRY_MAX_MS;

import type { RoomsRealtimeEvent } from "./contract";

export type RoomsMobileLiveUpdatesStatus = "stopped" | "catching_up" | "connected" | "reconnecting";

export interface RoomsMobileChangeInvalidation {
  readonly roomId: string;
  readonly afterSeq: number;
  readonly headSeq: number;
  readonly initial: boolean;
  readonly reason: "advanced" | "cursor_ahead";
  readonly realtimeEvents: readonly RoomsRealtimeEvent[];
}

export interface RoomsMobileChangeLoopOptions {
  readonly client: {
    readonly waitForChanges: (
      roomId: string,
      input: {
        readonly afterSeq: number;
        readonly timeoutMs?: number;
        readonly signal?: AbortSignal;
        readonly realtime?: boolean;
        readonly clientId?: string;
      },
    ) => Promise<{
      readonly changed: boolean;
      readonly head_seq: number;
      readonly realtime_events?: readonly RoomsRealtimeEvent[];
    }>;
  };
  readonly onInvalidate: (invalidation: RoomsMobileChangeInvalidation) => Promise<void>;
  readonly onStatusChange?: (status: RoomsMobileLiveUpdatesStatus) => void;
  readonly scheduleRetry?: (callback: () => void, delayMs: number) => () => void;
  readonly waitTimeoutMs?: number;
  readonly clientId?: string;
  readonly cursorStore?: {
    readonly load: (roomId: string) => Promise<number>;
    readonly save: (roomId: string, cursor: number) => Promise<void>;
  };
}

function defaultScheduleRetry(callback: () => void, delayMs: number): () => void {
  const timer = globalThis.setTimeout(callback, delayMs);
  return () => globalThis.clearTimeout(timer);
}

/** Supplies mobile transport, durable cursors and realtime events to the shared owner. */
export class RoomsMobileChangeLoop extends RoomsChangeLoop<RoomsRealtimeEvent> {
  constructor(options: RoomsMobileChangeLoopOptions) {
    super({
      waitForChanges: async (roomId, input) => {
        const response = await options.client.waitForChanges(roomId, {
          afterSeq: input.afterSeq,
          timeoutMs: input.timeoutMs,
          signal: input.signal,
          realtime: input.initialized,
          ...(options.clientId ? { clientId: options.clientId } : {}),
        });
        return {
          changed: response.changed,
          headSeq: response.head_seq,
          events: response.realtime_events ?? [],
        };
      },
      cursorAheadHead: (error) =>
        error instanceof RoomsMobileClientError && error.code === "change_cursor_ahead"
          ? error.headSeq
          : null,
      onInvalidate: ({ events, ...invalidation }) =>
        options.onInvalidate({ ...invalidation, realtimeEvents: events }),
      onStatusChange: options.onStatusChange ?? (() => undefined),
      scheduleRetry: options.scheduleRetry ?? defaultScheduleRetry,
      waitTimeoutMs: options.waitTimeoutMs,
      initialWaitTimeoutMs: 1_000,
      abortWaitOnStop: true,
      cursorStore: options.cursorStore ?? {
        load: async () => 0,
        save: async () => undefined,
      },
    });
  }
}
