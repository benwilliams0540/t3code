import { describe, expect, it } from "vite-plus/test";

import type { RoomsHumanWorkspace } from "../dataSource/humanSharedContract";
import type { RoomsLocalChannel, RoomsLocalFeedItem } from "../dataSource/localChannelsContract";
import { selectRoomsDesktopNotifications } from "./roomsDesktopNotifications";

const SELF_ID = "h:019f0000-0000-7000-8000-000000000001";
const PEER_ID = "h:019f0000-0000-7000-8000-000000000002";
const AGENT_ID = "a:019f0000-0000-7000-8000-000000000003";

const workspace = {
  principal: { id: SELF_ID },
  principals: [
    { id: SELF_ID, type: "human", display_name: "Monroe" },
    { id: PEER_ID, type: "human", display_name: "Human 019f0000" },
    { id: AGENT_ID, type: "agent", display_name: "Claw" },
  ],
} as unknown as RoomsHumanWorkspace;

const channel = { slug: "general" } as RoomsLocalChannel;

function message(input: {
  readonly id: string;
  readonly seq: number;
  readonly writer: string;
  readonly body?: string;
}): RoomsLocalFeedItem {
  return {
    id: `message:${input.id}`,
    room_id: "room:test",
    channel_id: "channel:test",
    kind: "human_message",
    occurred_at: "2026-08-11T12:00:00Z",
    summary: input.body ?? "hello",
    source_event: {
      seq: input.seq,
      event_id: input.id,
      type: "message.created",
      schema: 1,
    },
    attribution: {
      mode: "explicit_principal",
      writer_principal_id: input.writer,
      actor_principal_id: input.writer,
    },
    payload: { body_markdown: input.body ?? "hello" },
  };
}

describe("selectRoomsDesktopNotifications", () => {
  it("selects peer and agent messages in the exact cursor window", () => {
    const result = selectRoomsDesktopNotifications({
      workspace,
      channel,
      afterSeq: 10,
      headSeq: 13,
      items: [
        message({ id: "old", seq: 10, writer: PEER_ID }),
        message({ id: "self", seq: 11, writer: SELF_ID }),
        message({ id: "peer", seq: 12, writer: PEER_ID, body: "**hello**\nthere" }),
        message({ id: "agent", seq: 13, writer: AGENT_ID, body: "done" }),
        message({ id: "future", seq: 14, writer: PEER_ID }),
      ],
    });

    expect(result).toEqual([
      { id: "peer", title: "Room member in #general", body: "hello there" },
      { id: "agent", title: "Claw in #general", body: "done" },
    ]);
  });

  it("deduplicates durable event ids", () => {
    const duplicate = message({ id: "same", seq: 2, writer: AGENT_ID });
    expect(
      selectRoomsDesktopNotifications({
        workspace,
        channel,
        items: [duplicate, duplicate],
        afterSeq: 1,
        headSeq: 2,
      }),
    ).toHaveLength(1);
  });
});
