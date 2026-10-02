import { describe, expect, it, vi } from "vite-plus/test";

import { RoomsChangeLoop, type RoomsChangeLoopOptions } from "./changeLoop.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flush() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

const defaults = {
  cursorAheadHead: () => null,
  onInvalidate: async () => undefined,
  onStatusChange: () => undefined,
  scheduleRetry: () => () => undefined,
} satisfies Pick<
  RoomsChangeLoopOptions<never>,
  "cursorAheadHead" | "onInvalidate" | "onStatusChange" | "scheduleRetry"
>;

describe("portable Rooms change-wait ownership", () => {
  it("waits for the new account cursor even when the old physical wait finishes first", async () => {
    const oldWait = deferred<{ changed: boolean; headSeq: number }>();
    const newCursor = deferred<number>();
    const pending = deferred<{ changed: boolean; headSeq: number }>();
    const requests: Array<{ roomId: string; afterSeq: number }> = [];
    const onInvalidate = vi.fn(async () => undefined);
    const loop = new RoomsChangeLoop({
      ...defaults,
      onInvalidate,
      cursorStore: {
        load: (room) => (room === "old" ? Promise.resolve(9) : newCursor.promise),
        save: async () => undefined,
      },
      waitForChanges: (roomId, input) => {
        requests.push({ roomId, afterSeq: input.afterSeq });
        return requests.length === 1 ? oldWait.promise : pending.promise;
      },
    });
    loop.start("old");
    await flush();
    loop.start("new");
    oldWait.resolve({ changed: true, headSeq: 12 });
    await flush();
    expect(requests).toEqual([{ roomId: "old", afterSeq: 9 }]);
    expect(onInvalidate).not.toHaveBeenCalled();
    newCursor.resolve(21);
    await flush();
    expect(requests).toEqual([
      { roomId: "old", afterSeq: 9 },
      { roomId: "new", afterSeq: 21 },
    ]);
    loop.stop();
  });

  it("rejects a late cursor load from the previous account", async () => {
    const oldCursor = deferred<number>();
    const pending = deferred<{ changed: boolean; headSeq: number }>();
    const waitForChanges = vi.fn(() => pending.promise);
    const loop = new RoomsChangeLoop({
      ...defaults,
      waitForChanges,
      cursorStore: {
        load: (room) => (room === "old" ? oldCursor.promise : Promise.resolve(4)),
        save: async () => undefined,
      },
    });
    loop.start("old");
    loop.stop();
    loop.start("new");
    await flush();
    oldCursor.resolve(99);
    await flush();
    expect(waitForChanges).toHaveBeenCalledOnce();
    expect(waitForChanges).toHaveBeenCalledWith("new", expect.objectContaining({ afterSeq: 4 }));
    loop.stop();
  });

  it("retries from the last durable cursor if saving reconciled progress fails", async () => {
    const requests: number[] = [];
    const schedules: Array<() => void> = [];
    const loop = new RoomsChangeLoop({
      ...defaults,
      waitForChanges: async (_room, input) => {
        requests.push(input.afterSeq);
        return { changed: true, headSeq: 12 };
      },
      cursorStore: {
        load: async () => 9,
        save: async () => {
          throw new Error("storage unavailable");
        },
      },
      scheduleRetry: (callback) => {
        schedules.push(callback);
        return () => undefined;
      },
    });
    loop.start("room");
    await flush();
    expect(schedules).toHaveLength(1);
    schedules[0]!();
    await flush();
    expect(requests).toEqual([9, 9]);
    loop.stop();
  });

  it("does not persist an old response after sign-out during reconciliation", async () => {
    const refreshing = deferred<void>();
    const save = vi.fn(async () => undefined);
    const loop = new RoomsChangeLoop({
      ...defaults,
      waitForChanges: async () => ({ changed: true, headSeq: 12 }),
      onInvalidate: () => refreshing.promise,
      cursorStore: { load: async () => 9, save },
    });
    loop.start("room");
    await flush();
    loop.stop();
    refreshing.resolve();
    await flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps retries bounded and ignores cancelled callbacks from an old session", async () => {
    const schedules: Array<{ callback: () => void; delay: number }> = [];
    const waitForChanges = vi.fn(async () => {
      throw new Error("offline");
    });
    const loop = new RoomsChangeLoop({
      ...defaults,
      waitForChanges,
      scheduleRetry: (callback, delay) => {
        schedules.push({ callback, delay });
        return () => undefined;
      },
    });
    loop.start("old");
    await flush();
    for (let index = 0; index < 5; index += 1) {
      schedules[index]!.callback();
      await flush();
    }
    expect(schedules.map((item) => item.delay)).toEqual([500, 1_000, 2_000, 4_000, 5_000, 5_000]);
    loop.start("new");
    await flush();
    schedules[5]!.callback();
    await flush();
    expect(waitForChanges).toHaveBeenCalledTimes(7);
    schedules[6]!.callback();
    await flush();
    expect(waitForChanges).toHaveBeenCalledTimes(8);
    loop.stop();
  });
});
