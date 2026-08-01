import * as Schema from "effect/Schema";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import populatedFeedDocument from "../dataSource/fixtures/local-channels-v1-populated-feed.json";
import zeroWorkspaceDocument from "../dataSource/fixtures/local-channels-v1-zero-workspace.json";
import {
  RoomsLocalFeed,
  RoomsLocalFeedItem,
  RoomsLocalWorkspace,
} from "../dataSource/localChannelsContract";
import { mergeRoomsLocalFeedPages, RoomsLocalFeedItemCard } from "./RoomsLocalChannelFeed";

const decodeFeed = Schema.decodeUnknownSync(RoomsLocalFeed);
const workspace = Schema.decodeUnknownSync(RoomsLocalWorkspace)(zeroWorkspaceDocument);
const firstPage = decodeFeed({
  ...populatedFeedDocument,
  page_info: {
    after_seq: 0,
    limit: 1,
    snapshot_head_seq: 5,
    next_cursor: 4,
    has_more: true,
  },
});
const unknownItem = Schema.decodeUnknownSync(RoomsLocalFeedItem)({
  id: "feed-item:019fb9f0-3000-7000-8000-000000000002",
  room_id: firstPage.room_id,
  channel_id: firstPage.channel_id,
  kind: "unknown_schema",
  occurred_at: "2026-08-01T15:31:00.000Z",
  summary: "Unsupported channel.notice schema 2.",
  source_event: {
    seq: 5,
    event_id: "019fb9f0-3000-7000-8000-000000000002",
    type: "channel.notice",
    schema: 2,
  },
  attribution: {
    mode: "explicit_principal",
    writer_principal_id: workspace.principal.id,
    actor_principal_id: workspace.principal.id,
  },
  payload: { event_type: "channel.notice", event_schema: 2, display: "unknown_event" },
});

describe("Rooms Local channel feed", () => {
  it("merges exclusive pages only within one pinned snapshot", () => {
    const secondPage = decodeFeed({
      room_id: firstPage.room_id,
      channel_id: firstPage.channel_id,
      page_info: {
        after_seq: 4,
        limit: 1,
        snapshot_head_seq: 5,
        next_cursor: 5,
        has_more: false,
      },
      items: [unknownItem],
    });
    const merged = mergeRoomsLocalFeedPages([firstPage, secondPage]);
    expect(merged?.items.map((item) => item.source_event.seq)).toEqual([4, 5]);
    expect(merged?.page_info).toEqual(secondPage.page_info);
  });

  it("rejects room, channel, or snapshot drift between pages", () => {
    const mismatched = decodeFeed({
      ...populatedFeedDocument,
      page_info: { ...populatedFeedDocument.page_info, snapshot_head_seq: 99 },
    });
    expect(() => mergeRoomsLocalFeedPages([firstPage, mismatched])).toThrow(
      "changed identity within a pinned snapshot",
    );
  });

  it("renders exact Markdown with explicit principal attribution and unknown schemas visibly", () => {
    const human = firstPage.items[0]!;
    const humanMarkup = renderToStaticMarkup(
      <RoomsLocalFeedItemCard item={human} workspace={workspace} />,
    );
    const unknownMarkup = renderToStaticMarkup(
      <RoomsLocalFeedItemCard item={unknownItem} workspace={workspace} />,
    );
    expect(humanMarkup).toContain("<strong>Hello</strong>");
    expect(humanMarkup).toContain(workspace.principal.display_name);
    expect(humanMarkup).toContain(workspace.principal.id);
    expect(unknownMarkup).toContain("Unsupported channel event");
    expect(unknownMarkup).toContain("channel.notice schema 2");
  });
});
