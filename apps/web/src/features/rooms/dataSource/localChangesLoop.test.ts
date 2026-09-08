import { describe, expect, it, vi } from "vite-plus/test";

import { RoomsLocalClientError } from "./localChannelsClient";
import type { RoomsLocalChangeResponse } from "./localChannelsContract";
import {
  RoomsLocalChangeLoop,
  type RoomsLocalChangeInvalidation,
  type RoomsLocalLiveUpdatesStatus,
} from "./localChangesLoop";

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
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function timeout(roomId: string, afterSeq: number): RoomsLocalChangeResponse {
  return {
    contract: {
      id: "rooms.local-changes",
      version: 1,
      schema_uri: "contracts/rooms/local-changes/v1/schema.json",
    },
    room_id: roomId,
    after_seq: afterSeq,
    head_seq: afterSeq,
    changed: false,
    reason: "timeout",
  };
}

function advanced(roomId: string, afterSeq: number, headSeq: number): RoomsLocalChangeResponse {
  return {
    ...timeout(roomId, afterSeq),
    head_seq: headSeq,
    changed: true,
    reason: "advanced",
  };
}

describe("Rooms Local single change wait loop", () => {
  it("marks the first advanced cursor as baseline-only", async () => {
    const first = deferred<RoomsLocalChangeResponse>();
    const pending = deferred<RoomsLocalChangeResponse>();
    const invalidations: RoomsLocalChangeInvalidation[] = [];
    let calls = 0;
    const loop = new RoomsLocalChangeLoop({
      client: {
        waitForChanges: () => {
          calls += 1;
          return calls === 1 ? first.promise : pending.promise;
        },
      },
      onInvalidate: async (invalidation) => {
        invalidations.push(invalidation);
      },
      onStatusChange: vi.fn(),
    });

    loop.start(ROOM_A);
    first.resolve(advanced(ROOM_A, 0, 40));
    await flush();
    expect(invalidations).toEqual([
      { roomId: ROOM_A, afterSeq: 0, headSeq: 40, initial: true, reason: "advanced" },
    ]);
    loop.stop();
  });

  it("runs one physical wait, reissues timeouts, and advances only after reconciliation", async () => {
    const waits = [
      deferred<RoomsLocalChangeResponse>(),
      deferred<RoomsLocalChangeResponse>(),
      deferred<RoomsLocalChangeResponse>(),
    ];
    const requests: Array<{ roomId: string; afterSeq: number }> = [];
    const invalidations: RoomsLocalChangeInvalidation[] = [];
    const loop = new RoomsLocalChangeLoop({
      client: {
        waitForChanges: (roomId, input) => {
          requests.push({ roomId, afterSeq: input.afterSeq });
          return waits[requests.length - 1]!.promise;
        },
      },
      onInvalidate: async (invalidation) => {
        invalidations.push(invalidation);
      },
      onStatusChange: vi.fn(),
    });

    loop.start(ROOM_A);
    expect(requests).toEqual([{ roomId: ROOM_A, afterSeq: 0 }]);
    waits[0]!.resolve(timeout(ROOM_A, 0));
    await flush();
    expect(requests).toHaveLength(2);
    waits[1]!.resolve(advanced(ROOM_A, 0, 4));
    await flush();
    expect(invalidations).toEqual([
      { roomId: ROOM_A, afterSeq: 0, headSeq: 4, initial: false, reason: "advanced" },
    ]);
    expect(requests[2]).toEqual({ roomId: ROOM_A, afterSeq: 4 });
    loop.stop();
  });

  it("serializes Strict Mode restart and ignores a stale room response", async () => {
    const first = deferred<RoomsLocalChangeResponse>();
    const second = deferred<RoomsLocalChangeResponse>();
    const requests: string[] = [];
    const onInvalidate = vi.fn(async () => undefined);
    const loop = new RoomsLocalChangeLoop({
      client: {
        waitForChanges: (roomId) => {
          requests.push(roomId);
          return requests.length === 1 ? first.promise : second.promise;
        },
      },
      onInvalidate,
      onStatusChange: vi.fn(),
    });

    loop.start(ROOM_A);
    loop.stop();
    loop.start(ROOM_B);
    expect(requests).toEqual([ROOM_A]);
    first.resolve(advanced(ROOM_A, 0, 3));
    await flush();
    expect(onInvalidate).not.toHaveBeenCalled();
    expect(requests).toEqual([ROOM_A, ROOM_B]);
    loop.stop();
    second.resolve(timeout(ROOM_B, 0));
    await flush();
    expect(requests).toHaveLength(2);
  });

  it("recovers a cursor-ahead response through authoritative refresh before resetting", async () => {
    const next = deferred<RoomsLocalChangeResponse>();
    const requests: number[] = [];
    const invalidations: RoomsLocalChangeInvalidation[] = [];
    const loop = new RoomsLocalChangeLoop({
      client: {
        waitForChanges: (_roomId, input) => {
          requests.push(input.afterSeq);
          if (requests.length === 1) {
            return Promise.reject(
              new RoomsLocalClientError({
                kind: "server",
                status: 409,
                code: "change_cursor_ahead",
                message: "Cursor is ahead.",
                afterSeq: 44,
                headSeq: 2,
              }),
            );
          }
          return next.promise;
        },
      },
      onInvalidate: async (invalidation) => {
        invalidations.push(invalidation);
      },
      onStatusChange: vi.fn(),
    });
    loop.start(ROOM_A);
    await flush();
    expect(invalidations).toEqual([
      { roomId: ROOM_A, afterSeq: 0, headSeq: 2, initial: true, reason: "cursor_ahead" },
    ]);
    expect(requests).toEqual([0, 2]);
    loop.stop();
  });

  it("backs off deterministically for transport and 503 errors without spawning another wait", async () => {
    const schedules: Array<{ callback: () => void; delayMs: number }> = [];
    const statuses: RoomsLocalLiveUpdatesStatus[] = [];
    const pending = deferred<RoomsLocalChangeResponse>();
    let attempt = 0;
    const loop = new RoomsLocalChangeLoop({
      client: {
        waitForChanges: () => {
          attempt += 1;
          if (attempt === 1) {
            return Promise.reject(
              new RoomsLocalClientError({
                kind: "transport",
                code: "local_api_unreachable",
                message: "Tunnel interrupted.",
              }),
            );
          }
          if (attempt === 2) {
            return Promise.reject(
              new RoomsLocalClientError({
                kind: "server",
                status: 503,
                code: "local_change_wait_cancelled",
                message: "Server restarting.",
              }),
            );
          }
          if (attempt === 3) return Promise.resolve(timeout(ROOM_A, 0));
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
    expect(attempt).toBe(1);
    expect(schedules[0]?.delayMs).toBe(500);
    expect(statuses).toEqual(["reconnecting"]);
    schedules[0]!.callback();
    await flush();
    expect(attempt).toBe(2);
    expect(schedules[1]?.delayMs).toBe(1_000);
    schedules[1]!.callback();
    await flush();
    expect(attempt).toBe(4);
    expect(statuses).toEqual(["reconnecting", "connected"]);
    loop.stop();
  });

  it("keeps the last reconciled cursor when refresh fails and cancels its retry on stop", async () => {
    const schedules: Array<{ callback: () => void; cancelled: ReturnType<typeof vi.fn> }> = [];
    const requests: number[] = [];
    const loop = new RoomsLocalChangeLoop({
      client: {
        waitForChanges: (_roomId, input) => {
          requests.push(input.afterSeq);
          return Promise.resolve(advanced(ROOM_A, input.afterSeq, 5));
        },
      },
      onInvalidate: async () => {
        throw new Error("workspace refresh failed");
      },
      onStatusChange: vi.fn(),
      scheduleRetry: (callback) => {
        const cancelled = vi.fn();
        schedules.push({ callback, cancelled });
        return cancelled;
      },
    });
    loop.start(ROOM_A);
    await flush();
    expect(requests).toEqual([0]);
    schedules[0]!.callback();
    await flush();
    expect(requests).toEqual([0, 0]);
    loop.stop();
    expect(schedules[1]?.cancelled).toHaveBeenCalledOnce();
  });
});
