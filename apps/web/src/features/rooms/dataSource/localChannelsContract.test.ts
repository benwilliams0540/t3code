import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import emptyFeedDocument from "./fixtures/local-channels-v1-empty-channel.json";
import populatedFeedDocument from "./fixtures/local-channels-v1-populated-feed.json";
import zeroWorkspaceDocument from "./fixtures/local-channels-v1-zero-workspace.json";
import { RoomsLocalFeed, RoomsLocalFeedItem, RoomsLocalWorkspace } from "./localChannelsContract";
import { ROOMS_LOCAL_CHANNELS_SOURCE } from "../model/source";

const decodeWorkspace = Schema.decodeUnknownSync(RoomsLocalWorkspace);
const decodeFeed = Schema.decodeUnknownSync(RoomsLocalFeed);
const decodeFeedItem = Schema.decodeUnknownSync(RoomsLocalFeedItem);

describe("rooms.local-channels v1 contract fixtures", () => {
  it("pins the published producer contract and decodes zero-channel discovery", () => {
    const workspace = decodeWorkspace(zeroWorkspaceDocument);
    expect(ROOMS_LOCAL_CHANNELS_SOURCE).toEqual({
      repositorySha: "75d4f6b6660f8572b34d979cb3b89e3523ec0372",
      contractId: "rooms.local-channels",
      contractVersion: 1,
      schemaUri: "contracts/rooms/local-channels/v1/schema.json",
    });
    expect(workspace.status).toBe("ready");
    expect(workspace.channels).toEqual([]);
    expect(workspace.room.id).not.toContain("room:local:");
  });

  it("decodes successful empty and populated feeds without conflating them with errors", () => {
    const empty = decodeFeed(emptyFeedDocument);
    const populated = decodeFeed(populatedFeedDocument);
    expect(empty.items).toEqual([]);
    expect(empty.page_info.has_more).toBe(false);
    expect(populated.items[0]?.kind).toBe("human_message");
    expect(populated.items[0]?.payload).toEqual({
      body_markdown: "**Hello** from the durable local feed.",
    });
  });

  it("decodes unknown schemas as visible feed items", () => {
    const unknown = decodeFeedItem({
      id: "feed-item:019fb9f0-3000-7000-8000-000000000002",
      room_id: "room:019fb9f0-1000-7000-8000-000000000001",
      channel_id: "channel:019fb9f0-2000-7000-8000-000000000001",
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
        writer_principal_id: "h:019fb9f0-0001-7000-8000-000000000001",
        actor_principal_id: "h:019fb9f0-0001-7000-8000-000000000001",
      },
      payload: { event_type: "channel.notice", event_schema: 2, display: "unknown_event" },
    });
    expect(unknown.kind).toBe("unknown_schema");
    if (unknown.kind === "unknown_schema") expect(unknown.payload.event_schema).toBe(2);
  });
});
