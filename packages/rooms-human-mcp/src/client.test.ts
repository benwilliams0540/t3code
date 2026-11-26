import { describe, expect, it } from "vite-plus/test";

import projection from "../../client-runtime/src/rooms/fixtures/conversations-v2.json" with { type: "json" };
import feed from "../../client-runtime/src/rooms/fixtures/conversation-feed-v2.json" with { type: "json" };
import message from "../../client-runtime/src/rooms/fixtures/conversation-message-v2.json" with { type: "json" };
import { agentTurnOutcome, createRoomsHumanClient, type Fetch } from "./client.ts";
import {
  RoomsHumanFeed,
  RoomsConversationProjection,
} from "@t3tools/client-runtime/rooms/human-wire";
import * as Schema from "effect/Schema";

const TOKEN = `rha1_${"A".repeat(43)}`;
const BASE = "https://rooms.example.ts.net";
const { room_id: room, channel_id: channel, id } = projection.conversation;
const human = projection.conversation.created_by;
const agent = projection.invocations[0]!.agent.principal_id;
const workspace = {
  room: { id: room, name: "Room" },
  principal: { id: human, display_name: "Monroe" },
  principals: [
    { id: human, type: "human", display_name: "Monroe" },
    { id: agent, type: "agent", display_name: "Claw" },
  ],
  channels: [{ id: channel, name: "infra" }],
};
const names = new Map([
  [human, "Monroe"],
  [agent, "Claw"],
]);
const decodedFeed = Schema.decodeUnknownSync(RoomsHumanFeed)(feed);
const decodedProjection = Schema.decodeUnknownSync(RoomsConversationProjection)(projection);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Seen {
  readonly url: string;
  readonly init: RequestInit;
}

function fakeFetch(route: (url: URL, init: RequestInit) => Response, seen: Seen[] = []): Fetch {
  return async (input, init) => {
    seen.push({ url: input, init });
    return route(new URL(input), init);
  };
}

describe("rooms human client", () => {
  it("sends the delegated bearer to the exact Human route and a fresh UUIDv7 request id", async () => {
    const seen: Seen[] = [];
    const client = createRoomsHumanClient({
      baseUrl: BASE,
      token: TOKEN,
      fetch: fakeFetch(() => json(message, 201), seen),
    });
    const sent = await client.sendMessage(room, channel, id, message.item.payload.body_markdown);
    expect(sent.source_event.seq).toBe(message.source_event.seq);
    expect(seen[0]!.url).toBe(
      `${BASE}/rooms/human/v2/rooms/${encodeURIComponent(room)}/channels/${encodeURIComponent(channel)}/conversations/${encodeURIComponent(id)}/messages`,
    );
    expect((seen[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    const body = JSON.parse(String(seen[0]!.init.body)) as { request_id: string };
    expect(body.request_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(seen[0]!.init.redirect).toBe("error");
  });

  it("reuses a caller request id for safe retries and rejects malformed ones before sending", async () => {
    const seen: Seen[] = [];
    const client = createRoomsHumanClient({
      baseUrl: BASE,
      token: TOKEN,
      fetch: fakeFetch(() => json(message), seen),
    });
    const retry = "01a13157-d393-70bd-bc66-630e245e8c31";
    await client.sendMessage(room, channel, id, message.item.payload.body_markdown, retry);
    expect(JSON.parse(String(seen[0]!.init.body))).toMatchObject({ request_id: retry });
    await expect(client.sendMessage(room, channel, id, "hi", "not-a-uuid")).rejects.toMatchObject({
      code: "request_id_invalid",
    });
    expect(seen).toHaveLength(1);
  });

  it("surfaces the server's safe error code without the token", async () => {
    const client = createRoomsHumanClient({
      baseUrl: BASE,
      token: TOKEN,
      fetch: fakeFetch(() =>
        json(
          {
            error: "human_access_token_forbidden",
            message: "this route is not available to delegated access tokens",
          },
          403,
        ),
      ),
    });
    const error = (await client.session().then(
      () => null,
      (caught: unknown) => caught,
    )) as Error & { code: string };
    expect(error).toMatchObject({
      code: "human_access_token_forbidden",
      status: 403,
      retryable: false,
    });
    expect(JSON.stringify({ ...error, message: error.message })).not.toContain(TOKEN);

    const offline = createRoomsHumanClient({
      baseUrl: BASE,
      token: TOKEN,
      fetch: async () => {
        throw new Error(`connect failed with ${TOKEN}`);
      },
    });
    const unreachable = (await offline.session().then(
      () => null,
      (caught: unknown) => caught,
    )) as Error & { code: string };
    expect(unreachable).toMatchObject({ code: "rooms_unreachable", retryable: true });
    expect(unreachable.message).not.toContain(TOKEN);
  });

  it("waits through running and success-without-reply polls until the agent reply appears", async () => {
    const triggering = 11;
    const pending = { ...feed, items: feed.items.filter((item) => item.source_event.seq <= 12) };
    const settling = { ...feed, items: feed.items.filter((item) => item.source_event.seq <= 15) };
    const running = {
      ...projection,
      invocations: [
        {
          ...projection.invocations[0],
          status: "running",
          turn_state: "accepted",
          terminal_at: null,
          outbox: null,
        },
      ],
    };
    const responses: ReadonlyArray<
      readonly [
        unknown,
        { readonly items: ReadonlyArray<{ readonly source_event: { readonly seq: number } }> },
      ]
    > = [
      [running, pending],
      [running, settling],
      [projection, feed],
    ];
    let poll = 0;
    let clock = 0;
    const sleeps: number[] = [];
    const client = createRoomsHumanClient({
      baseUrl: BASE,
      token: TOKEN,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
        poll += 1;
      },
      fetch: fakeFetch((url) => {
        if (url.pathname.endsWith("/workspace")) return json(workspace);
        const [shown, page] = responses[Math.min(poll, responses.length - 1)]!;
        if (url.pathname.endsWith("/messages")) {
          const after = Number(url.searchParams.get("after_seq"));
          return json({
            ...page,
            items: page.items.filter((item) => item.source_event.seq > after),
          });
        }
        return json(shown);
      }),
    });
    const outcome = await client.waitForReply(room, channel, id, triggering, 60_000, 1_000);
    expect(sleeps).toEqual([1_000, 1_000]);
    expect(outcome).toMatchObject({
      state: "replied",
      invocation_id: projection.invocations[0]!.id,
      turn_state: "terminal",
      reply: { seq: 16, author: "Claw" },
    });
  });

  it("reports the live turn state when the wait times out on a stuck turn", async () => {
    const stuck = {
      ...projection,
      invocations: [
        {
          ...projection.invocations[0],
          status: "running",
          turn_state: "uncertain",
          terminal_at: null,
          outbox: null,
        },
      ],
    };
    const pending = { ...feed, items: feed.items.filter((item) => item.source_event.seq <= 12) };
    let clock = 0;
    const client = createRoomsHumanClient({
      baseUrl: BASE,
      token: TOKEN,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
      fetch: fakeFetch((url) =>
        url.pathname.endsWith("/workspace")
          ? json(workspace)
          : url.pathname.endsWith("/messages")
            ? json({
                ...pending,
                items: pending.items.filter((item) => item.source_event.seq > 11),
              })
            : json(stuck),
      ),
    });
    const outcome = await client.waitForReply(room, channel, id, 11, 5_000, 2_000);
    expect(outcome).toMatchObject({ state: "running", turn_state: "uncertain", reply: null });
    expect(outcome.waited_ms).toBeLessThanOrEqual(5_000);
  });
});

describe("agent turn outcome", () => {
  it("is no_turn_yet for a message nobody picked up, and failed with the safe code", () => {
    const empty = { ...decodedProjection, invocations: [] };
    expect(agentTurnOutcome(11, [], empty, names).state).toBe("no_turn_yet");
    const failed = decodedFeed.items
      .map((item) =>
        item.kind === "agent_invocation_update" && item.source_event.seq === 17
          ? {
              ...item,
              payload: {
                ...item.payload,
                status: "failed" as const,
                safe_error_code: "provider_timeout" as const,
                reply_source_event: null,
              },
            }
          : item,
      )
      .filter((item) => item.source_event.seq !== 15 && item.source_event.seq !== 16);
    const failedTurn = {
      ...decodedProjection,
      invocations: [{ ...decodedProjection.invocations[0]!, status: "failed" as const }],
    };
    expect(agentTurnOutcome(11, failed, failedTurn, names)).toMatchObject({
      state: "failed",
      safe_error_code: "provider_timeout",
    });
  });
});
