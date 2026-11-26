import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import { RoomsHumanRequestError, simplifyItem, type RoomsHumanClient } from "./client.ts";

export class RoomsHuman extends Context.Service<RoomsHuman, RoomsHumanClient>()(
  "@t3tools/rooms-human-mcp/toolkit/RoomsHuman",
) {}

export class RoomsHumanToolError extends Schema.TaggedErrorClass<RoomsHumanToolError>()(
  "RoomsHumanToolError",
  { code: Schema.String, status: Schema.Int, message: Schema.String, retryable: Schema.Boolean },
) {}

const UUID_V7 = "[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const id = (prefix: string, description: string) =>
  Schema.String.check(Schema.isPattern(new RegExp(`^${prefix}:${UUID_V7}$`))).annotate({
    description,
  });
const RoomId = id("room", "Room ID, e.g. room:0190…, from threadspace_session.");
const ChannelId = id("channel", "Channel ID from threadspace_room.");
const ConversationId = id(
  "conversation",
  "Conversation ID from threadspace_list_conversations or threadspace_start_conversation.",
);
const RequestId = Schema.String.check(Schema.isPattern(new RegExp(`^${UUID_V7}$`))).annotate({
  description:
    "Optional lowercase UUIDv7. Reuse the same value to retry a write safely after an uncertain failure; omit for a new write.",
});
const Seq = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const Limit = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }));
const Body = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(20_000)).annotate({
  description:
    "Markdown. Write @Claw (exactly, outside code and quotes) to ask the Claw agent to reply.",
});

const dependencies = [RoomsHuman];
const read = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true) as T;
const write = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true) as T;
const make = <const Name extends string, P extends Schema.Top>(
  name: Name,
  description: string,
  parameters: P,
) =>
  Tool.make(name, {
    description,
    parameters,
    success: Schema.Unknown,
    failure: RoomsHumanToolError,
    dependencies,
  });

export const SessionTool = read(
  make(
    "threadspace_session",
    "Who this server posts as (the token's human) and the rooms they belong to.",
    Schema.Struct({}),
  ),
);
export const RoomTool = read(
  make(
    "threadspace_room",
    "A room's channels and members (humans and agents such as Claw).",
    Schema.Struct({ room_id: RoomId }),
  ),
);
export const ListConversationsTool = read(
  make(
    "threadspace_list_conversations",
    "Conversations in a channel. Agents like Claw only answer @mentions inside a conversation.",
    Schema.Struct({ room_id: RoomId, channel_id: ChannelId }),
  ),
);
export const StartConversationTool = write(
  make(
    "threadspace_start_conversation",
    "Start a conversation in a channel, optionally posting its first message. Posts as the token's human.",
    Schema.Struct({
      room_id: RoomId,
      channel_id: ChannelId,
      title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
      first_message: Schema.optionalKey(Body),
      request_id: Schema.optionalKey(RequestId),
    }),
  ),
);
export const SendMessageTool = write(
  make(
    "threadspace_send_message",
    "Post a message in a conversation as the token's human. Returns the message seq to pass to threadspace_wait_for_reply.",
    Schema.Struct({
      room_id: RoomId,
      channel_id: ChannelId,
      conversation_id: ConversationId,
      body_markdown: Body,
      request_id: Schema.optionalKey(RequestId),
    }),
  ),
);
export const ReadConversationTool = read(
  make(
    "threadspace_read_conversation",
    "A conversation's agent turns (with their live state) and its messages after after_seq.",
    Schema.Struct({
      room_id: RoomId,
      channel_id: ChannelId,
      conversation_id: ConversationId,
      after_seq: Schema.optionalKey(Seq),
      limit: Schema.optionalKey(Limit),
    }),
  ),
);
export const WaitForReplyTool = read(
  make(
    "threadspace_wait_for_reply",
    "Wait until the agent's turn on a posted message replies or fails, up to timeout_seconds (default 90, max 300). On timeout it returns state running or no_turn_yet with the turn's live state.",
    Schema.Struct({
      room_id: RoomId,
      channel_id: ChannelId,
      conversation_id: ConversationId,
      message_seq: Seq,
      timeout_seconds: Schema.optionalKey(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 300 })),
      ),
    }),
  ),
);
export const ReadChannelTool = read(
  make(
    "threadspace_read_channel",
    "A channel's feed (channel messages, conversation messages and agent turn updates) after after_seq.",
    Schema.Struct({
      room_id: RoomId,
      channel_id: ChannelId,
      after_seq: Schema.optionalKey(Seq),
      limit: Schema.optionalKey(Limit),
    }),
  ),
);

export const RoomsHumanToolkit = Toolkit.make(
  SessionTool,
  RoomTool,
  ListConversationsTool,
  StartConversationTool,
  SendMessageTool,
  ReadConversationTool,
  WaitForReplyTool,
  ReadChannelTool,
);

export const roomsHumanToolNames = Object.keys(RoomsHumanToolkit.tools);

const toToolError = (error: unknown) =>
  error instanceof RoomsHumanRequestError
    ? new RoomsHumanToolError({
        code: error.code,
        status: error.status,
        message: error.message,
        retryable: error.retryable,
      })
    : new RoomsHumanToolError({
        code: "rooms_human_client_error",
        status: 500,
        message: "The ThreadSpace request failed before reaching Rooms.",
        retryable: false,
      });

const call = <A>(run: (client: RoomsHumanClient) => Promise<A>) =>
  Effect.gen(function* () {
    const client = yield* RoomsHuman;
    return yield* Effect.tryPromise({ try: () => run(client), catch: toToolError });
  });

export const RoomsHumanToolkitHandlersLive = RoomsHumanToolkit.toLayer({
  threadspace_session: () => call((client) => client.session()),
  threadspace_room: ({ room_id }) =>
    call(async (client) => {
      const workspace = await client.workspace(room_id);
      return {
        room: workspace.room,
        you: workspace.principal,
        channels: workspace.channels,
        members: workspace.principals.filter((principal) => principal.type !== "machine"),
      };
    }),
  threadspace_list_conversations: ({ room_id, channel_id }) =>
    call(async (client) => {
      const list = await client.listConversations(room_id, channel_id);
      return {
        conversations: list.conversations.map(({ id, title, created_by, created_at }) => ({
          id,
          title,
          created_by,
          created_at,
        })),
      };
    }),
  threadspace_start_conversation: ({ room_id, channel_id, title, first_message, request_id }) =>
    call(async (client) => {
      const created = await client.startConversation(room_id, channel_id, title, request_id);
      const conversation = created.conversation;
      if (first_message === undefined) return { conversation, replayed: created.replayed };
      const message = await client.sendMessage(room_id, channel_id, conversation.id, first_message);
      return {
        conversation,
        replayed: created.replayed,
        message_seq: message.source_event.seq,
      };
    }),
  threadspace_send_message: ({ room_id, channel_id, conversation_id, body_markdown, request_id }) =>
    call(async (client) => {
      const sent = await client.sendMessage(
        room_id,
        channel_id,
        conversation_id,
        body_markdown,
        request_id,
      );
      return { message_seq: sent.source_event.seq, replayed: sent.replayed };
    }),
  threadspace_read_conversation: ({ room_id, channel_id, conversation_id, after_seq, limit }) =>
    call(async (client) => {
      const { projection, feed, names } = await client.readConversation(
        room_id,
        channel_id,
        conversation_id,
        after_seq,
        limit,
      );
      return {
        conversation: projection.conversation,
        turns: projection.invocations.map((turn) => ({
          id: turn.id,
          agent: names.get(turn.agent.principal_id) ?? turn.agent.principal_id,
          status: turn.status,
          turn_state: turn.turn_state,
          triggering_seq: turn.context.cutoff_seq,
          started_at: turn.started_at,
          terminal_at: turn.terminal_at,
        })),
        items: feed.items.map((item) => simplifyItem(item, names)),
        next_after_seq: feed.page_info.next_cursor,
        has_more: feed.page_info.has_more,
      };
    }),
  threadspace_wait_for_reply: ({
    room_id,
    channel_id,
    conversation_id,
    message_seq,
    timeout_seconds,
  }) =>
    call((client) =>
      client.waitForReply(
        room_id,
        channel_id,
        conversation_id,
        message_seq,
        (timeout_seconds ?? 90) * 1_000,
      ),
    ),
  threadspace_read_channel: ({ room_id, channel_id, after_seq, limit }) =>
    call(async (client) => {
      const { feed, names } = await client.readChannel(room_id, channel_id, after_seq, limit);
      return {
        items: feed.items.map((item) => simplifyItem(item, names)),
        next_after_seq: feed.page_info.next_cursor,
        has_more: feed.page_info.has_more,
      };
    }),
});
