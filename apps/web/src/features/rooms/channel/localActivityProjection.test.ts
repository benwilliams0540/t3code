import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import populatedFeedDocument from "../dataSource/fixtures/local-channels-v1-populated-feed.json";
import zeroWorkspaceDocument from "../dataSource/fixtures/local-channels-v1-zero-workspace.json";
import {
  RoomsLocalFeed,
  RoomsLocalFeedItem,
  RoomsLocalWorkspace,
} from "../dataSource/localChannelsContract";
import { isRoomsFeedFollowing } from "../activity/RoomsActivityFeed";
import { roomsActivityRegister } from "../activity/projection";
import {
  projectRoomsLocalActivityItem,
  resolveRoomsLocalPrincipal,
} from "./localActivityProjection";
import { roomsChannelDisplayName } from "./channelName";

const workspace = Schema.decodeUnknownSync(RoomsLocalWorkspace)(zeroWorkspaceDocument);
const feed = Schema.decodeUnknownSync(RoomsLocalFeed)(populatedFeedDocument);
const [humanItem] = feed.items;
if (humanItem?.kind !== "human_message") {
  throw new Error("The pinned populated-feed example must start with a human message.");
}
const unknownItem = Schema.decodeUnknownSync(RoomsLocalFeedItem)({
  id: "feed-item:019fb9f0-3000-7000-8000-000000000002",
  room_id: feed.room_id,
  channel_id: feed.channel_id,
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

describe("Rooms Local activity projection", () => {
  it("projects a durable human message into the conversation register", () => {
    const activity = projectRoomsLocalActivityItem(workspace, humanItem);
    expect(activity.cardKind).toBe("message");
    expect(roomsActivityRegister(activity.cardKind)).toBe("conversation");
    expect(activity.bodyMarkdown).toBe(humanItem.payload.body_markdown);
    expect(activity.item.source_event).toEqual(humanItem.source_event);
    expect(activity.attribution.writer.display_name).toBe(workspace.principal.display_name);
  });

  it("keeps an unsupported event in the record register with its retained schema facts", () => {
    const activity = projectRoomsLocalActivityItem(workspace, unknownItem);
    expect(activity.cardKind).toBe("unknown");
    expect(roomsActivityRegister(activity.cardKind)).toBe("record");
    expect(activity.unknownSchema).toEqual({ eventType: "channel.notice", eventSchema: 2 });
    expect(activity.bodyMarkdown).toBeNull();
  });

  it("never attributes an unrecognized writer to the reading principal", () => {
    const other = resolveRoomsLocalPrincipal(workspace, "h:019fbf3b-ffff-7000-8000-00000000ffff");
    expect(other.type).toBe("unresolved");
    expect(other.display_name).toBe("h:019fbf3b-ffff-7000-8000-00000000ffff");
    expect(resolveRoomsLocalPrincipal(workspace, workspace.principal.id).type).toBe("human");
  });

  it("carries no Sample story, thread, evidence, or approval state into Local mode", () => {
    const activity = projectRoomsLocalActivityItem(workspace, humanItem);
    expect(activity.story).toBeNull();
    expect(activity.thread).toBeNull();
    expect(activity.threadHref).toBeNull();
    expect(activity.evidence).toBeNull();
    expect(activity.approval).toBeNull();
    expect(activity.gate).toBeNull();
    expect(activity.unavailable).toBeNull();
  });

  it("renders a stored channel name without doubling its hash", () => {
    expect(roomsChannelDisplayName("# m21-live-notifications")).toBe("m21-live-notifications");
    expect(roomsChannelDisplayName("#infra")).toBe("infra");
    expect(roomsChannelDisplayName("infra")).toBe("infra");
  });

  it("follows the newest activity only while the reader is at the bottom", () => {
    expect(isRoomsFeedFollowing({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 })).toBe(
      true,
    );
    expect(isRoomsFeedFollowing({ scrollTop: 100, scrollHeight: 1000, clientHeight: 100 })).toBe(
      false,
    );
  });
});
