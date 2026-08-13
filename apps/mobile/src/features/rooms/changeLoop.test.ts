import { describe, expect, it, vi } from "vite-plus/test";

import { RoomsMobileClientError } from "./client";
import {
  RoomsMobileChangeLoop,
  type RoomsMobileChangeInvalidation,
  type RoomsMobileLiveUpdatesStatus,
} from "./changeLoop";

const ROOM_A = "room:019fbe90-0000-7000-8000-000000000001";
const ROOM_B = "room:019fbe90-0000-7000-8000-000000000002";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe("Rooms mobile change loop", () => {
  it("reissues timeouts and refreshes before advancing the cursor", async () => {
    const waits = [
      deferred<{ changed: boolean; head_seq: number }>(),
      deferred<{ changed: boolean; head_seq: number }>(),
      deferred<{ changed: boolean; head_seq: number }>(),
    ];
    const requests: Array<{ roomId: string; afterSeq: number; realtime: boolean | undefined }> = [];
    const invalidations: RoomsMobileChangeInvalidation[] = [];
    const loop = new RoomsMobileChangeLoop({
      client: {
        waitForChanges: (roomId, input) => {
          requests.push({ roomId, afterSeq: input.afterSeq, realtime: input.realtime });
          return waits[requests.length - 1]!.promise;
        },
      },
      onInvalidate: async (invalidation) => {
        invalidations.push(invalidation);
      },
    });

    loop.start(ROOM_A);
    waits[0]!.resolve({ changed: false, head_seq: 0 });
    await flush();
    waits[1]!.resolve({ changed: true, head_seq: 4 });
    await flush();

    expect(invalidations).toEqual([
      {
        roomId: ROOM_A,
        afterSeq: 0,
        headSeq: 4,
        initial: false,
        reason: "advanced",
        realtimeEvents: [],
      },
    ]);
    expect(requests).toMatchObject([
      { realtime: false },
      { realtime: true },
      { afterSeq: 4, realtime: true },
    ]);
    loop.stop();
  });

  it("aborts a stale wait and starts the newly focused room", async () => {
    const requests: Array<{ roomId: string; signal: AbortSignal | undefined }> = [];
    const pending = deferred<{ changed: boolean; head_seq: number }>();
    const loop = new RoomsMobileChangeLoop({
      client: {
        waitForChanges: (roomId, input) => {
          requests.push({ roomId, signal: input.signal });
          if (requests.length === 1) {
            return new Promise((_resolve, reject) => {
              input.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
                once: true,
              });
            });
          }
          return pending.promise;
        },
      },
      onInvalidate: vi.fn(async () => undefined),
    });

    loop.start(ROOM_A);
    await flush();
    loop.start(ROOM_B);
    await flush();

    expect(requests[0]?.signal?.aborted).toBe(true);
    expect(requests.map(({ roomId }) => roomId)).toEqual([ROOM_A, ROOM_B]);
    loop.stop();
  });

  it("recovers a cursor-ahead response through authoritative refresh", async () => {
    const pending = deferred<{ changed: boolean; head_seq: number }>();
    const requests: number[] = [];
    const invalidations: RoomsMobileChangeInvalidation[] = [];
    const loop = new RoomsMobileChangeLoop({
      client: {
        waitForChanges: (_roomId, input) => {
          requests.push(input.afterSeq);
          return requests.length === 1
            ? Promise.reject(
                new RoomsMobileClientError("change_cursor_ahead", "Cursor is ahead.", 409, {
                  afterSeq: 44,
                  headSeq: 2,
                }),
              )
            : pending.promise;
        },
      },
      onInvalidate: async (invalidation) => {
        invalidations.push(invalidation);
      },
    });

    loop.start(ROOM_A);
    await flush();

    expect(invalidations).toEqual([
      {
        roomId: ROOM_A,
        afterSeq: 0,
        headSeq: 2,
        initial: true,
        reason: "cursor_ahead",
        realtimeEvents: [],
      },
    ]);
    expect(requests).toEqual([0, 2]);
    loop.stop();
  });

  it("backs off deterministically and returns to connected after recovery", async () => {
    const schedules: Array<{ callback: () => void; delayMs: number }> = [];
    const statuses: RoomsMobileLiveUpdatesStatus[] = [];
    const pending = deferred<{ changed: boolean; head_seq: number }>();
    let attempt = 0;
    const loop = new RoomsMobileChangeLoop({
      client: {
        waitForChanges: () => {
          attempt += 1;
          if (attempt === 1) return Promise.reject(new Error("network interrupted"));
          if (attempt === 2) return Promise.resolve({ changed: false, head_seq: 0 });
          return pending.promise;
        },
      },
      onInvalidate: async () => undefined,
      onStatusChange: (status) => statuses.push(status),
      scheduleRetry: (callback, delayMs) => {
        schedules.push({ callback, delayMs });
        return vi.fn();
      },
    });

    loop.start(ROOM_A);
    await flush();
    expect(schedules[0]?.delayMs).toBe(500);
    schedules[0]!.callback();
    await flush();

    expect(statuses).toEqual(["catching_up", "reconnecting", "connected"]);
    expect(attempt).toBe(3);
    loop.stop();
  });

  it("loads and persists the durable cursor before advertising availability", async () => {
    const requests: Array<{ afterSeq: number; realtime: boolean | undefined }> = [];
    const saves: number[] = [];
    const pending = deferred<{ changed: boolean; head_seq: number }>();
    const loop = new RoomsMobileChangeLoop({
      clientId: "ios:test",
      cursorStore: {
        load: async () => 9,
        save: async (_roomId, cursor) => {
          saves.push(cursor);
        },
      },
      client: {
        waitForChanges: (_roomId, input) => {
          requests.push({ afterSeq: input.afterSeq, realtime: input.realtime });
          return requests.length === 1
            ? Promise.resolve({ changed: false, head_seq: 9 })
            : pending.promise;
        },
      },
      onInvalidate: async () => undefined,
    });

    loop.start(ROOM_A);
    await flush();

    expect(requests).toEqual([
      { afterSeq: 9, realtime: false },
      { afterSeq: 9, realtime: true },
    ]);
    expect(saves).toEqual([9]);
    loop.stop();
  });

  it("does not advertise realtime availability when durable cursor persistence fails", async () => {
    const requests: Array<{ realtime: boolean | undefined }> = [];
    const schedules: Array<{ callback: () => void; delayMs: number }> = [];
    const loop = new RoomsMobileChangeLoop({
      clientId: "ios:test",
      cursorStore: {
        load: async () => 0,
        save: async () => Promise.reject(new Error("secure storage unavailable")),
      },
      client: {
        waitForChanges: (_roomId, input) => {
          requests.push({ realtime: input.realtime });
          return Promise.resolve({ changed: false, head_seq: 0 });
        },
      },
      onInvalidate: async () => undefined,
      scheduleRetry: (callback, delayMs) => {
        schedules.push({ callback, delayMs });
        return vi.fn();
      },
    });

    loop.start(ROOM_A);
    await flush();

    expect(requests).toEqual([{ realtime: false }]);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]?.delayMs).toBe(500);
    loop.stop();
  });
});
