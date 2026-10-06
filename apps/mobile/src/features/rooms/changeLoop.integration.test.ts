import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const secureStore = vi.hoisted(() => ({
  values: new Map<string, string>(),
  beforeWrite: async (_value: string): Promise<void> => undefined,
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => secureStore.values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    await secureStore.beforeWrite(value);
    secureStore.values.set(key, value);
  },
}));

import { RoomsMobileChangeLoop, type RoomsMobileChangeInvalidation } from "./changeLoop";
import { createRoomsMobileClient } from "./client";
import type { RoomsRealtimeEvent } from "./contract";

const baseUrl = "https://rooms.example.test";
const roomId = "room:019fed3b-e36c-7730-aed8-4a927abc756a";
const channelId = "channel:019fed3b-e36c-7730-aed8-4a927abc756b";
const userId = "user:synthetic";
const contract = {
  id: "rooms.human-shared",
  version: 1,
  schema_uri: "contracts/rooms/human-shared/v1/schema.json",
};
const event: RoomsRealtimeEvent = {
  event_id: "019fed3b-e36c-7730-aed8-4a927abc756c",
  seq: 12,
  room_id: roomId,
  channel_id: channelId,
  actor_principal_id: "h:other",
  sender_display_name: "Other human",
  summary: "Synthetic message",
  occurred_at: "2026-10-02T00:00:00Z",
  fallback_published: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function advanced(afterSeq: number, headSeq: number, events: readonly RoomsRealtimeEvent[] = []) {
  return json({
    contract,
    room_id: roomId,
    after_seq: afterSeq,
    head_seq: headSeq,
    changed: true,
    reason: "advanced",
    realtime_events: events,
  });
}

const loops = new Set<RoomsMobileChangeLoop>();
function track(loop: RoomsMobileChangeLoop) {
  loops.add(loop);
  return loop;
}

describe("mobile HTTP, change owner and persistence composition", () => {
  beforeEach(() => {
    vi.resetModules();
    secureStore.values.clear();
    secureStore.beforeWrite = async () => undefined;
  });

  afterEach(() => {
    for (const loop of loops) loop.stop();
    loops.clear();
  });

  it("decodes an ahead cursor and commits its lower head only after reconciliation", async () => {
    const { roomsCursorStore } = await import("./realtimePersistence");
    const store = roomsCursorStore(userId);
    await store.save(roomId, 44);
    const refreshing = deferred<RoomsMobileChangeInvalidation>();
    const refreshed = deferred<void>();
    const resumed = deferred<void>();
    const pending = deferred<Response>();
    const requests: number[] = [];
    const client = createRoomsMobileClient({
      baseUrl,
      readToken: async () => "synthetic-bearer",
      fetch: async (input) => {
        requests.push(Number(new URL(input).searchParams.get("after_seq")));
        if (requests.length === 1)
          return json(
            {
              error: "change_cursor_ahead",
              message: "Cursor is ahead.",
              after_seq: 44,
              head_seq: 2,
            },
            409,
          );
        resumed.resolve();
        return pending.promise;
      },
    });
    const loop = track(
      new RoomsMobileChangeLoop({
        client,
        cursorStore: store,
        onInvalidate: async (invalidation) => {
          refreshing.resolve(invalidation);
          await refreshed.promise;
        },
      }),
    );
    loop.start(roomId);
    expect(await refreshing.promise).toEqual({
      roomId,
      afterSeq: 44,
      headSeq: 2,
      initial: true,
      reason: "cursor_ahead",
      realtimeEvents: [],
    });
    expect(requests).toEqual([44]);
    await expect(store.load(roomId)).resolves.toBe(44);
    refreshed.resolve();
    await resumed.promise;
    expect(requests).toEqual([44, 2]);
    await expect(store.load(roomId)).resolves.toBe(2);
  });

  it("acknowledges decoded event IDs and persists progress before advertising realtime", async () => {
    const { roomsCursorStore, recordRoomsEvent, hasSeenRoomsEvent } =
      await import("./realtimePersistence");
    const store = roomsCursorStore(userId);
    await store.save(roomId, 9);
    const acknowledging = deferred<void>();
    const acknowledged = deferred<Response>();
    const writing = deferred<void>();
    const written = deferred<void>();
    const resumed = deferred<void>();
    const pending = deferred<Response>();
    const requests: URL[] = [];
    const ackBodies: unknown[] = [];
    secureStore.beforeWrite = async (value) => {
      const state = JSON.parse(value) as { cursors: Record<string, number> };
      if (state.cursors[`${userId}|${roomId}`] === 12) {
        writing.resolve();
        await written.promise;
      }
    };
    const client = createRoomsMobileClient({
      baseUrl,
      readToken: async () => "synthetic-bearer",
      fetch: async (input, init) => {
        const url = new URL(input);
        if (url.pathname.endsWith("delivery-acknowledgements")) {
          ackBodies.push(JSON.parse(String(init.body)));
          acknowledging.resolve();
          return acknowledged.promise;
        }
        requests.push(url);
        if (requests.length === 1) return advanced(9, 12, [event]);
        resumed.resolve();
        return pending.promise;
      },
    });
    const loop = track(
      new RoomsMobileChangeLoop({
        client,
        clientId: "ios:synthetic",
        cursorStore: store,
        onInvalidate: async ({ realtimeEvents }) => {
          for (const item of realtimeEvents) await recordRoomsEvent({ eventId: item.event_id });
          await client.acknowledgeDeliveries(
            roomId,
            realtimeEvents.map((item) => item.event_id),
          );
        },
      }),
    );
    loop.start(roomId);
    await acknowledging.promise;
    expect(ackBodies).toEqual([{ event_ids: [event.event_id] }]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.searchParams.get("realtime")).toBe("0");
    await expect(hasSeenRoomsEvent(event.event_id)).resolves.toBe(true);
    acknowledged.resolve(
      json({ contract, room_id: roomId, acknowledged_event_ids: [event.event_id] }),
    );
    await writing.promise;
    expect(requests).toHaveLength(1);
    await expect(store.load(roomId)).resolves.toBe(9);
    written.resolve();
    await resumed.promise;
    expect(requests[1]?.searchParams.get("after_seq")).toBe("12");
    expect(requests[1]?.searchParams.get("realtime")).toBe("1");
    expect(requests[1]?.searchParams.get("client_id")).toBe("ios:synthetic");
    await expect(store.load(roomId)).resolves.toBe(12);
  });

  it("retries decoded changes from the committed cursor after a real persistence failure", async () => {
    const { roomsCursorStore } = await import("./realtimePersistence");
    const store = roomsCursorStore(userId);
    await store.save(roomId, 9);
    secureStore.beforeWrite = async () => {
      throw new Error("synthetic storage failure");
    };
    const scheduled = deferred<{ retry: () => void; delay: number }>();
    const resumed = deferred<void>();
    const pending = deferred<Response>();
    const requests: URL[] = [];
    const client = createRoomsMobileClient({
      baseUrl,
      readToken: async () => "synthetic-bearer",
      fetch: async (input) => {
        requests.push(new URL(input));
        if (requests.length === 1) return advanced(9, 12);
        resumed.resolve();
        return pending.promise;
      },
    });
    const loop = track(
      new RoomsMobileChangeLoop({
        client,
        cursorStore: store,
        onInvalidate: async () => undefined,
        scheduleRetry: (retry, delay) => {
          scheduled.resolve({ retry, delay });
          return () => undefined;
        },
      }),
    );
    loop.start(roomId);
    const retry = await scheduled.promise;
    expect(retry.delay).toBe(500);
    await expect(store.load(roomId)).resolves.toBe(9);
    retry.retry();
    await resumed.promise;
    expect(requests.map((url) => url.searchParams.get("after_seq"))).toEqual(["9", "9"]);
    expect(requests.map((url) => url.searchParams.get("realtime"))).toEqual(["0", "0"]);
  });

  it("aborts transport on stop and ignores a late decoded realtime response", async () => {
    const { roomsCursorStore, hasSeenRoomsEvent, recordRoomsEvent } =
      await import("./realtimePersistence");
    const store = roomsCursorStore(userId);
    await store.save(roomId, 9);
    const requested = deferred<AbortSignal>();
    const response = deferred<Response>();
    const fetch = vi.fn(async (_input: string, init: RequestInit) => {
      requested.resolve(init.signal as AbortSignal);
      return response.promise;
    });
    const client = createRoomsMobileClient({
      baseUrl,
      readToken: async () => "synthetic-bearer",
      fetch,
    });
    const wait = vi.spyOn(client, "waitForChanges");
    const acknowledge = vi.spyOn(client, "acknowledgeDeliveries");
    const onInvalidate = vi.fn(async () => {
      await recordRoomsEvent({ eventId: event.event_id });
      await client.acknowledgeDeliveries(roomId, [event.event_id]);
    });
    const loop = track(new RoomsMobileChangeLoop({ client, cursorStore: store, onInvalidate }));
    loop.start(roomId);
    const signal = await requested.promise;
    loop.stop();
    expect(signal.aborted).toBe(true);
    response.resolve(advanced(9, 12, [event]));
    await wait.mock.results[0]!.value;
    await expect(store.load(roomId)).resolves.toBe(9);
    await expect(hasSeenRoomsEvent(event.event_id)).resolves.toBe(false);
    expect(onInvalidate).not.toHaveBeenCalled();
    expect(acknowledge).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not commit progress after stop during reconciliation", async () => {
    const { roomsCursorStore } = await import("./realtimePersistence");
    const store = roomsCursorStore(userId);
    await store.save(roomId, 9);
    const save = vi.spyOn(store, "save");
    const refreshing = deferred<void>();
    const refreshed = deferred<void>();
    const fetch = vi.fn(async () => advanced(9, 12));
    const client = createRoomsMobileClient({
      baseUrl,
      readToken: async () => "synthetic-bearer",
      fetch,
    });
    const onInvalidate = vi.fn(async () => {
      refreshing.resolve();
      await refreshed.promise;
    });
    const loop = track(new RoomsMobileChangeLoop({ client, cursorStore: store, onInvalidate }));
    loop.start(roomId);
    await refreshing.promise;
    loop.stop();
    refreshed.resolve();
    await onInvalidate.mock.results[0]!.value;
    await expect(store.load(roomId)).resolves.toBe(9);
    expect(save).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
