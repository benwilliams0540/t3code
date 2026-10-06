import {
  RoomsChangeLoop,
  ROOMS_CHANGE_WAIT_TIMEOUT_MS,
  ROOMS_CHANGE_RETRY_INITIAL_MS,
  ROOMS_CHANGE_RETRY_MAX_MS,
} from "@t3tools/client-runtime/rooms/change-loop";

import { isRoomsLocalClientError } from "./localChannelsClient";

export const ROOMS_LOCAL_CHANGE_WAIT_TIMEOUT_MS = ROOMS_CHANGE_WAIT_TIMEOUT_MS;
export const ROOMS_LOCAL_CHANGE_RETRY_INITIAL_MS = ROOMS_CHANGE_RETRY_INITIAL_MS;
export const ROOMS_LOCAL_CHANGE_RETRY_MAX_MS = ROOMS_CHANGE_RETRY_MAX_MS;

export type RoomsLocalLiveUpdatesStatus = "connected" | "reconnecting";
export type RoomsLocalChangeRefreshReason = "advanced" | "cursor_ahead";

export interface RoomsLocalChangeInvalidation {
  readonly roomId: string;
  readonly afterSeq: number;
  readonly headSeq: number;
  readonly initial: boolean;
  readonly reason: RoomsLocalChangeRefreshReason;
}

export interface RoomsLocalChangeLoopOptions {
  readonly client: {
    readonly waitForChanges: (
      roomId: string,
      input: { readonly afterSeq: number; readonly timeoutMs?: number | undefined },
    ) => Promise<{
      readonly changed: boolean;
      readonly head_seq: number;
    }>;
  };
  readonly onInvalidate: (invalidation: RoomsLocalChangeInvalidation) => Promise<void>;
  readonly onStatusChange: (status: RoomsLocalLiveUpdatesStatus) => void;
  readonly scheduleRetry?: ((callback: () => void, delayMs: number) => () => void) | undefined;
  readonly waitTimeoutMs?: number | undefined;
}

function defaultScheduleRetry(callback: () => void, delayMs: number): () => void {
  const timer = globalThis.setTimeout(callback, delayMs);
  return () => globalThis.clearTimeout(timer);
}

/** Adapts Local and Shared transports to the portable change-wait owner. */
export class RoomsLocalChangeLoop extends RoomsChangeLoop {
  constructor(options: RoomsLocalChangeLoopOptions) {
    let status: RoomsLocalLiveUpdatesStatus = "connected";
    super({
      waitForChanges: async (roomId, input) => {
        const response = await options.client.waitForChanges(roomId, {
          afterSeq: input.afterSeq,
          timeoutMs: input.timeoutMs,
        });
        return { changed: response.changed, headSeq: response.head_seq };
      },
      cursorAheadHead: (error) =>
        isRoomsLocalClientError(error) && error.code === "change_cursor_ahead"
          ? error.headSeq
          : null,
      onInvalidate: ({ events: _events, ...invalidation }) => options.onInvalidate(invalidation),
      onStatusChange: (next) => {
        const mapped = next === "reconnecting" ? "reconnecting" : "connected";
        if (mapped === status) return;
        status = mapped;
        options.onStatusChange(mapped);
      },
      scheduleRetry: options.scheduleRetry ?? defaultScheduleRetry,
      waitTimeoutMs: options.waitTimeoutMs,
    });
  }
}
