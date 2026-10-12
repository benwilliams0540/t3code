import * as Schema from "effect/Schema";
import {
  RoomsConversationList,
  RoomsConversationProjection,
  RoomsConversationCreated,
  RoomsConversationMessage,
  RoomsHumanFeed,
} from "./humanWire.ts";
import type { RoomsFeedPageInput } from "./feedSnapshot.ts";

export class RoomsConversationScopeError extends Error {
  readonly code = "rooms_conversation_scope_mismatch";
  constructor() {
    super("The conversation response does not match the requested room, channel or conversation.");
  }
}

/** One consumed v2 wire decoder and scoped path builder for browser and native transports. */
export function createRoomsConversationClient(
  request: <T>(
    path: string,
    method: "GET" | "POST",
    decode: (input: unknown) => T,
    body?: Readonly<Record<string, unknown>>,
  ) => Promise<T>,
) {
  const root = (room: string, channel: string) =>
    `/rooms/human/v2/rooms/${encodeURIComponent(room)}/channels/${encodeURIComponent(channel)}/conversations`;
  const conversationPath = (room: string, channel: string, id: string) =>
    `${root(room, channel)}/${encodeURIComponent(id)}`;
  const assertScope = (
    value: { readonly room_id: string; readonly channel_id: string; readonly id?: string },
    room: string,
    channel: string,
    id?: string,
  ) => {
    if (
      value.room_id !== room ||
      value.channel_id !== channel ||
      (id !== undefined && value.id !== id)
    )
      throw new RoomsConversationScopeError();
  };
  return {
    list: async (room: string, channel: string) => {
      const result = await request(
        root(room, channel),
        "GET",
        Schema.decodeUnknownSync(RoomsConversationList),
      );
      assertScope(result, room, channel);
      result.conversations.forEach((value) => assertScope(value, room, channel));
      return result;
    },
    read: async (room: string, channel: string, id: string) => {
      const result = await request(
        conversationPath(room, channel, id),
        "GET",
        Schema.decodeUnknownSync(RoomsConversationProjection),
      );
      assertScope(result.conversation, room, channel, id);
      for (const binding of result.bindings) {
        assertScope(binding, room, channel);
        if (binding.conversation_id !== id) throw new RoomsConversationScopeError();
      }
      for (const turn of result.invocations) {
        assertScope(turn, room, channel);
        if (turn.conversation_id !== id) throw new RoomsConversationScopeError();
      }
      return result;
    },
    create: async (room: string, channel: string, requestId: string, title: string) => {
      const result = await request(
        root(room, channel),
        "POST",
        Schema.decodeUnknownSync(RoomsConversationCreated),
        { request_id: requestId, title },
      );
      assertScope(result.conversation, room, channel);
      return result;
    },
    feed: async (room: string, channel: string, id: string, input: RoomsFeedPageInput) => {
      const query = new URLSearchParams({ limit: String(input.limit) });
      if (input.afterSeq !== undefined) query.set("after_seq", String(input.afterSeq));
      if (input.snapshotHeadSeq !== undefined)
        query.set("snapshot_head_seq", String(input.snapshotHeadSeq));
      const result = await request(
        `${conversationPath(room, channel, id)}/messages?${query}`,
        "GET",
        Schema.decodeUnknownSync(RoomsHumanFeed),
      );
      assertScope(result, room, channel);
      for (const item of result.items) {
        assertScope(item, room, channel);
        if (item.kind !== "unknown_schema" && item.payload.conversation_id !== id)
          throw new RoomsConversationScopeError();
      }
      return result;
    },
    send: async (
      room: string,
      channel: string,
      id: string,
      requestId: string,
      bodyMarkdown: string,
    ) => {
      const result = await request(
        `${conversationPath(room, channel, id)}/messages`,
        "POST",
        Schema.decodeUnknownSync(RoomsConversationMessage),
        { request_id: requestId, body_markdown: bodyMarkdown },
      );
      assertScope(result.conversation, room, channel, id);
      assertScope(result.item, room, channel);
      if (
        result.item.payload.conversation_id !== id ||
        result.item.payload.body_markdown !== bodyMarkdown
      )
        throw new RoomsConversationScopeError();
      return result;
    },
  };
}
export type RoomsConversationClient = ReturnType<typeof createRoomsConversationClient>;
