import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import list from "./fixtures/conversations-v2-list.json" with { type: "json" };
import projection from "./fixtures/conversations-v2.json" with { type: "json" };
import created from "./fixtures/conversations-v2-created.json" with { type: "json" };
import message from "./fixtures/conversation-message-v2.json" with { type: "json" };
import feed from "./fixtures/conversation-feed-v2.json" with { type: "json" };
import { createRoomsConversationClient } from "./conversationClient.ts";
import { RoomsHumanFeed, RoomsConversationProjection } from "./humanWire.ts";
const { room_id: room, channel_id: channel, id } = projection.conversation;

describe("human v2 conversation client against emitted service fixtures", () => {
  it("decodes authoritative bindings/turns and preserves conversation message attribution", () => {
    expect(Schema.decodeUnknownSync(RoomsConversationProjection)(projection)).toEqual(projection);
    expect(Schema.decodeUnknownSync(RoomsHumanFeed)(feed)).toEqual(feed);
  });
  it("uses captured scope and stable command IDs without sending runtime references", async () => {
    const requests: {
      path: string;
      method: string;
      body?: Readonly<Record<string, unknown>> | undefined;
    }[] = [];
    const client = createRoomsConversationClient(async (path, method, decode, body) => {
      requests.push({ path, method, body });
      return decode(
        method === "POST"
          ? path.endsWith("/messages")
            ? message
            : created
          : path.endsWith("/conversations")
            ? list
            : path.includes("/messages?")
              ? feed
              : projection,
      );
    });
    await expect(client.list(room, channel)).resolves.toEqual(list);
    await expect(client.read(room, channel, id)).resolves.toEqual(projection);
    await client.create(room, channel, "stable-create", "Build plan");
    await client.send(room, channel, id, "stable-send", message.item.payload.body_markdown);
    await client.feed(room, channel, id, { afterSeq: 11, limit: 20, snapshotHeadSeq: 17 });
    expect(requests[2]?.body).toEqual({ request_id: "stable-create", title: "Build plan" });
    expect(requests[3]?.body).toEqual({
      request_id: "stable-send",
      body_markdown: message.item.payload.body_markdown,
    });
    expect(requests[4]?.path).toContain("after_seq=11&snapshot_head_seq=17");
  });
  it("rejects cross-conversation projection/feed replies", async () => {
    const other = {
      ...projection,
      bindings: [{ ...projection.bindings[0], conversation_id: "conversation:other" }],
    };
    const client = createRoomsConversationClient(async (_path, _method, decode) => decode(other));
    await expect(client.read(room, channel, id)).rejects.toMatchObject({
      code: "rooms_conversation_scope_mismatch",
    });
    const wrongFeed = {
      ...feed,
      items: [
        {
          ...message.item,
          payload: { ...message.item.payload, conversation_id: "conversation:other" },
        },
      ],
    };
    const feedClient = createRoomsConversationClient(async (_path, _method, decode) =>
      decode(wrongFeed),
    );
    await expect(feedClient.feed(room, channel, id, { limit: 100 })).rejects.toMatchObject({
      code: "rooms_conversation_scope_mismatch",
    });
  });
});
