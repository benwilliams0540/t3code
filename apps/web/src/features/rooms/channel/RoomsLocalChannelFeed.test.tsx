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
import { RoomsHumanFeed, type RoomsHumanWorkspace } from "../dataSource/humanSharedContract";
import { RoomsActivityFeed } from "../activity/RoomsActivityFeed";
import {
  projectRoomsLocalActivityItem,
  projectRoomsLocalActivityItems,
} from "./localActivityProjection";
import {
  isCurrentRoomsLocalFeedRequest,
  mergeRoomsLocalFeedPages,
  RoomsAgentTurnLiveStatus,
  RoomsLocalFeedItemCard,
} from "./RoomsLocalChannelFeed";

const decodeFeed = Schema.decodeUnknownSync(RoomsLocalFeed);
const decodeHumanFeed = Schema.decodeUnknownSync(RoomsHumanFeed);
const workspace = Schema.decodeUnknownSync(RoomsLocalWorkspace)(zeroWorkspaceDocument);
const sharedWorkspace = {
  ...workspace,
  contract: {
    id: "rooms.human-shared",
    version: 1,
    schema_uri: "contracts/rooms/human-shared/v1/schema.json",
  },
  room: { ...workspace.room, locality: "shared", role: "admin" },
  principal: { ...workspace.principal, role: "admin" },
  principals: [
    workspace.principal,
    { id: "a:claw", type: "agent", display_name: "Claw", role: "operator" },
  ],
  capabilities: {
    ...workspace.capabilities,
    "work.read": true,
    "work.create": true,
    "work.link_thread": true,
    "work.attach_evidence": true,
    "work.review": true,
    "work.complete": true,
    "membership.manage": true,
    "role.manage": true,
  },
} satisfies RoomsHumanWorkspace;
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

  it("deduplicates command and notification refresh results by durable feed-item identity", () => {
    const merged = mergeRoomsLocalFeedPages([firstPage, firstPage]);
    expect(merged?.items).toHaveLength(1);
    expect(merged?.items[0]?.id).toBe(firstPage.items[0]?.id);
  });

  it("discards a pinned pagination response after a live invalidation generation", () => {
    expect(isCurrentRoomsLocalFeedRequest(7, 7)).toBe(true);
    expect(isCurrentRoomsLocalFeedRequest(7, 8)).toBe(false);
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
    expect(humanMarkup).toContain("You");
    expect(humanMarkup).toContain(workspace.principal.id);
    expect(unknownMarkup).toContain("Unknown schema retained");
    expect(unknownMarkup).toContain("channel.notice · schema 2");
  });

  it("reads a human message in the conversation register and keeps its provenance disclosed", () => {
    const markup = renderToStaticMarkup(
      <RoomsLocalFeedItemCard item={firstPage.items[0]!} workspace={workspace} />,
    );
    expect(markup).toContain('data-rooms-activity-register="conversation"');
    expect(markup).toContain("data-rooms-activity-provenance");
    const provenance = markup.slice(markup.indexOf("data-rooms-activity-provenance"));
    expect(provenance).toContain(workspace.principal.id);
    expect(provenance).toContain(String(firstPage.items[0]!.source_event.seq));
  });

  it("keeps an unsupported event in the record register rather than the conversation", () => {
    const markup = renderToStaticMarkup(
      <RoomsLocalFeedItemCard item={unknownItem} workspace={workspace} />,
    );
    expect(markup).toContain('data-rooms-activity-kind="unknown"');
    expect(markup).not.toContain('data-rooms-activity-register="conversation"');
  });

  it("offers selected messages through an explicit keyboard-focusable story action", () => {
    const activity = projectRoomsLocalActivityItem(workspace, firstPage.items[0]!);
    const markup = renderToStaticMarkup(
      <RoomsActivityFeed
        activities={[activity]}
        label="Channel"
        onActivitySelect={() => {}}
        selectedActivityId={activity.item.id}
      />,
    );
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain("Shape story");
  });

  it("folds v2 lifecycle events and their reply into one live Agent turn", () => {
    const source = (seq: number, type: string) => ({
      seq,
      event_id: `event-${seq}`,
      type,
      schema: 1,
    });
    const feed = decodeHumanFeed({
      contract: {
        id: "rooms.human-shared",
        version: 2,
        schema_uri: "contracts/rooms/human-shared/v2/schema.json",
      },
      room_id: workspace.room.id,
      channel_id: firstPage.channel_id,
      page_info: {
        after_seq: 0,
        limit: 100,
        snapshot_head_seq: 5,
        next_cursor: 5,
        has_more: false,
      },
      items: [
        {
          ...firstPage.items[0],
          id: "feed-1",
          occurred_at: "2026-09-04T12:00:01.000Z",
          source_event: source(1, "message.created"),
          summary: "@Claw status",
          payload: { body_markdown: "@Claw status" },
        },
        ...[2, 3, 5].map((seq) => ({
          id: `feed-${seq}`,
          room_id: workspace.room.id,
          channel_id: firstPage.channel_id,
          kind: "agent_invocation_update",
          occurred_at: `2026-09-04T12:00:0${seq}.000Z`,
          summary: seq === 2 ? "Agent invocation running" : "Agent invocation replied",
          source_event: source(
            seq,
            seq === 2
              ? "agent.invocation-started"
              : seq === 3
                ? "agent.invocation-finished"
                : "agent.delivery-receipt-recorded",
          ),
          attribution: {
            mode: "explicit_principal",
            writer_principal_id: "a:claw",
            actor_principal_id: "a:claw",
          },
          payload: {
            invocation_id: "invocation:one",
            triggering_message: source(1, "message.created"),
            status: seq === 2 ? "running" : "succeeded",
            safe_error_code: null,
            reply_source_event: seq === 5 ? source(4, "message.created") : null,
          },
        })),
        {
          ...firstPage.items[0],
          id: "feed-4",
          occurred_at: "2026-09-04T12:00:04.000Z",
          source_event: source(4, "message.created"),
          attribution: {
            mode: "explicit_principal",
            writer_principal_id: "a:claw",
            actor_principal_id: "a:claw",
          },
          summary: "**All systems nominal.**",
          payload: { body_markdown: "**All systems nominal.**" },
        },
      ],
    });
    const activities = projectRoomsLocalActivityItems(sharedWorkspace, feed.items);
    const markup = renderToStaticMarkup(
      <>
        <RoomsActivityFeed activities={activities} label="Channel" />
        <RoomsAgentTurnLiveStatus activities={activities} />
      </>,
    );

    expect(activities.map((activity) => activity.cardKind)).toEqual(["message", "agent_turn"]);
    expect(markup).toContain('data-rooms-activity-kind="agent_turn"');
    expect(markup).toContain("<strong>All systems nominal.</strong>");
    expect(markup).toContain("Claw replied.");
    expect(markup).not.toContain("Agent invocation replied");
  });
});
