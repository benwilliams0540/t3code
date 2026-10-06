import { describe, expect, it, vi } from "vite-plus/test";

import { createRoomsHumanClient } from "./humanSharedClient";
import { RoomsLocalChangeLoop, type RoomsLocalChangeInvalidation } from "./localChangesLoop";

const roomId = "room:0198f7e2-1234-789a-8abc-123456789abc";
const contract = {
  id: "rooms.human-shared",
  version: 1,
  schema_uri: "contracts/rooms/human-shared/v1/schema.json",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function response(body: unknown, status = 200) {
  return { status, headers: {}, body: JSON.stringify(body) };
}

function advanced(afterSeq: number, headSeq: number) {
  return response({
    contract,
    room_id: roomId,
    after_seq: afterSeq,
    head_seq: headSeq,
    changed: true,
    reason: "advanced",
  });
}

describe("Shared HTTP decoding through the portable change loop", () => {
  it("refreshes a lower authoritative head, waits there and resumes normal catch-up", async () => {
    const resumed = deferred<void>();
    const pending = deferred<ReturnType<typeof response>>();
    const requests: number[] = [];
    const invalidations: RoomsLocalChangeInvalidation[] = [];
    const client = createRoomsHumanClient(
      "https://rooms.example.test",
      async () => "synthetic-bearer",
      () => ({
        request: async (request) => {
          const cursor = Number(
            new URL(request.path, request.baseUrl).searchParams.get("after_seq"),
          );
          requests.push(cursor);
          if (requests.length === 1) return advanced(0, 44);
          if (requests.length === 2)
            return response(
              {
                error: "change_cursor_ahead",
                message: "Cursor is ahead.",
                after_seq: 44,
                head_seq: 2,
              },
              409,
            );
          if (requests.length === 3) return advanced(2, 5);
          resumed.resolve();
          return pending.promise;
        },
      }),
    );
    const loop = new RoomsLocalChangeLoop({
      client,
      onInvalidate: async (item) => {
        invalidations.push(item);
      },
      onStatusChange: vi.fn(),
    });
    loop.start(roomId);
    await resumed.promise;
    loop.stop();
    expect(requests).toEqual([0, 44, 2, 5]);
    expect(invalidations).toEqual([
      { roomId, afterSeq: 0, headSeq: 44, initial: true, reason: "advanced" },
      { roomId, afterSeq: 44, headSeq: 2, initial: true, reason: "cursor_ahead" },
      { roomId, afterSeq: 2, headSeq: 5, initial: false, reason: "advanced" },
    ]);
  });

  it.each([
    ["absent", undefined],
    ["negative", -1],
    ["fractional", 1.5],
    ["string", "2"],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
    ["null", null],
    ["unchanged", 44],
    ["forward", 50],
  ])(
    "backs off for %s reset heads without refreshing or retrying tightly",
    async (_label, head) => {
      const scheduled = deferred<number>();
      let calls = 0;
      const onInvalidate = vi.fn(async () => undefined);
      const client = createRoomsHumanClient(
        "https://rooms.example.test",
        async () => "synthetic-bearer",
        () => ({
          request: async () =>
            ++calls === 1
              ? advanced(0, 44)
              : response(
                  {
                    error: "change_cursor_ahead",
                    message: "Cursor is ahead.",
                    after_seq: 44,
                    ...(head === undefined ? {} : { head_seq: head }),
                  },
                  409,
                ),
        }),
      );
      const loop = new RoomsLocalChangeLoop({
        client,
        onInvalidate,
        onStatusChange: vi.fn(),
        scheduleRetry: (_callback, delay) => {
          scheduled.resolve(delay);
          return vi.fn();
        },
      });
      loop.start(roomId);
      expect(await scheduled.promise).toBe(500);
      loop.stop();
      expect(calls).toBe(2);
      expect(onInvalidate).toHaveBeenCalledOnce();
    },
  );

  it("preserves decoded cursor details but does not reset for unrelated errors", async () => {
    const scheduled = deferred<number>();
    let calls = 0;
    const onInvalidate = vi.fn(async () => undefined);
    const client = createRoomsHumanClient(
      "https://rooms.example.test",
      async () => "synthetic-bearer",
      () => ({
        request: async () =>
          ++calls === 1
            ? advanced(0, 44)
            : response({ error: "room_access_denied", message: "Denied.", head_seq: 2 }, 403),
      }),
    );
    const loop = new RoomsLocalChangeLoop({
      client,
      onInvalidate,
      onStatusChange: vi.fn(),
      scheduleRetry: (_callback, delay) => {
        scheduled.resolve(delay);
        return vi.fn();
      },
    });
    loop.start(roomId);
    expect(await scheduled.promise).toBe(500);
    loop.stop();
    expect(calls).toBe(2);
    expect(onInvalidate).toHaveBeenCalledOnce();
    await expect(client.waitForChanges(roomId, { afterSeq: 44 })).rejects.toMatchObject({
      code: "room_access_denied",
      status: 403,
      headSeq: 2,
    });
  });
});
