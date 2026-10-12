import { describe, expect, it, vi } from "vite-plus/test";

import {
  loadRoomsFeedSnapshot,
  mergeRoomsFeedPages,
  type RoomsFeedPage,
  type RoomsFeedPageInput,
} from "./feedSnapshot.ts";

function page(afterSeq: number, head = 603, limit = 100): RoomsFeedPage {
  const items = Array.from({ length: head / 3 }, (_, index) => ({
    id: `item:${(index + 1) * 3}`,
    seq: (index + 1) * 3,
  }))
    .filter((item) => item.seq > afterSeq)
    .slice(0, limit);
  const cursor = items.at(-1)?.seq ?? head;
  return {
    room_id: "room",
    channel_id: "channel",
    items,
    page_info: {
      after_seq: afterSeq,
      limit,
      snapshot_head_seq: head,
      next_cursor: cursor,
      has_more: cursor < head,
    },
  };
}

describe("Rooms pinned forward feed ownership", () => {
  it("refreshes beyond the first hundred messages through sparse global sequence cursors", async () => {
    const inputs: RoomsFeedPageInput[] = [];
    const feed = await loadRoomsFeedSnapshot({
      isCurrent: () => true,
      loadPage: async (input) => {
        inputs.push(input);
        return page(input.afterSeq ?? 0, input.snapshotHeadSeq ?? 603, input.limit);
      },
    });
    expect(feed?.items).toHaveLength(201);
    expect(feed?.items.at(-1)?.id).toBe("item:603");
    expect(inputs).toEqual([
      { limit: 100 },
      { afterSeq: 300, limit: 100, snapshotHeadSeq: 603 },
      { afterSeq: 600, limit: 100, snapshotHeadSeq: 603 },
    ]);
  });

  it("keeps initial loading lazy and appends one exclusive pinned page", async () => {
    const loadPage = vi.fn(async (input: RoomsFeedPageInput) =>
      page(input.afterSeq ?? 0, input.snapshotHeadSeq ?? 603, input.limit),
    );
    const initial = await loadRoomsFeedSnapshot({
      loadPage,
      completeSnapshot: false,
      isCurrent: () => true,
    });
    const appended = await loadRoomsFeedSnapshot({
      loadPage,
      previous: initial!,
      completeSnapshot: false,
      isCurrent: () => true,
    });
    expect(initial?.items).toHaveLength(100);
    expect(appended?.items).toHaveLength(200);
    expect(loadPage).toHaveBeenCalledTimes(2);
    expect(appended?.page_info.next_cursor).toBe(600);
  });

  it("rejects room, channel and snapshot drift and deduplicates durable item identity", () => {
    const first = page(0);
    for (const changed of [
      { ...first, room_id: "other" },
      { ...first, channel_id: "other" },
      { ...first, page_info: { ...first.page_info, snapshot_head_seq: 606 } },
    ]) {
      expect(() => mergeRoomsFeedPages([first, changed])).toThrow(
        "changed identity within a pinned snapshot",
      );
    }
    expect(mergeRoomsFeedPages([first, first])?.items).toEqual(first.items);
  });

  it("rejects a late page after source/account invalidation without issuing another request", async () => {
    let current = true;
    const loadPage = vi.fn(async () => {
      current = false;
      return page(0);
    });
    expect(await loadRoomsFeedSnapshot({ loadPage, isCurrent: () => current })).toBeNull();
    expect(loadPage).toHaveBeenCalledOnce();
  });

  it("rejects non-advancing cursors instead of repeatedly requesting the same page", async () => {
    const stalled = { ...page(0), page_info: { ...page(0).page_info, next_cursor: 0 } };
    const loadPage = vi.fn(async () => stalled);
    await expect(
      loadRoomsFeedSnapshot({ loadPage, completeSnapshot: true, isCurrent: () => true }),
    ).rejects.toMatchObject({ code: "feed_cursor_not_advanced" });
    expect(loadPage).toHaveBeenCalledOnce();
  });
});
