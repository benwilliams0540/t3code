export interface RoomsFeedPage {
  readonly room_id: string;
  readonly channel_id: string;
  readonly items: readonly { readonly id: string }[];
  readonly page_info: {
    readonly after_seq: number;
    readonly limit: number;
    readonly snapshot_head_seq: number;
    readonly next_cursor: number;
    readonly has_more: boolean;
  };
}

export interface RoomsFeedPageInput {
  readonly afterSeq?: number;
  readonly limit: number;
  readonly snapshotHeadSeq?: number;
}

export class RoomsFeedSnapshotError extends Error {
  readonly code: "feed_snapshot_mismatch" | "feed_cursor_not_advanced";

  constructor(code: "feed_snapshot_mismatch" | "feed_cursor_not_advanced", message: string) {
    super(message);
    this.code = code;
    this.name = "RoomsFeedSnapshotError";
  }
}

export function mergeRoomsFeedPages<Page extends RoomsFeedPage>(
  pages: readonly Page[],
): Page | null {
  const first = pages[0];
  if (!first) return null;
  const itemIds = new Set<string>();
  const items: Page["items"][number][] = [];
  for (const page of pages) {
    if (
      page.room_id !== first.room_id ||
      page.channel_id !== first.channel_id ||
      page.page_info.snapshot_head_seq !== first.page_info.snapshot_head_seq
    ) {
      throw new RoomsFeedSnapshotError(
        "feed_snapshot_mismatch",
        "The channel feed changed identity within a pinned snapshot.",
      );
    }
    for (const item of page.items) {
      if (itemIds.has(item.id)) continue;
      itemIds.add(item.id);
      items.push(item);
    }
  }
  return { ...pages.at(-1)!, items };
}

/** Loads forward through one pinned snapshot; stale selections stop issuing requests. */
export async function loadRoomsFeedSnapshot<Page extends RoomsFeedPage>(options: {
  readonly loadPage: (input: RoomsFeedPageInput) => Promise<Page>;
  readonly previous?: Page;
  readonly limit?: number;
  readonly completeSnapshot?: boolean;
  readonly isCurrent: () => boolean;
}): Promise<Page | null> {
  const pages: Page[] = options.previous ? [options.previous] : [];
  const limit = options.previous?.page_info.limit ?? options.limit ?? 100;
  const completeSnapshot = options.completeSnapshot ?? true;
  do {
    if (!options.isCurrent()) return null;
    const previous = pages.at(-1);
    if (previous && !previous.page_info.has_more) break;
    if (
      previous &&
      (!Number.isSafeInteger(previous.page_info.next_cursor) ||
        previous.page_info.next_cursor <= previous.page_info.after_seq ||
        previous.page_info.next_cursor > previous.page_info.snapshot_head_seq)
    ) {
      throw new RoomsFeedSnapshotError(
        "feed_cursor_not_advanced",
        "The channel feed cursor did not advance within its pinned snapshot.",
      );
    }
    const page = await options.loadPage(
      previous
        ? {
            afterSeq: previous.page_info.next_cursor,
            limit,
            snapshotHeadSeq: pages[0]!.page_info.snapshot_head_seq,
          }
        : { limit },
    );
    if (!options.isCurrent()) return null;
    if (previous && page.page_info.after_seq !== previous.page_info.next_cursor) {
      throw new RoomsFeedSnapshotError(
        "feed_cursor_not_advanced",
        "The channel feed page did not continue from the requested cursor.",
      );
    }
    pages.push(page);
    // Validate identity before requesting another page.
    if (previous) mergeRoomsFeedPages([pages[0]!, page]);
    if (!completeSnapshot) break;
  } while (pages.at(-1)!.page_info.has_more);
  return mergeRoomsFeedPages(pages);
}
