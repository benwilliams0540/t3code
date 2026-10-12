import { describe, expect, it } from "vite-plus/test";

import {
  nextRoomsAgentTurnTransitionAt,
  projectRoomsAgentTurns,
  ROOMS_AGENT_DELAY_MS,
  roomsAgentTurnAnnouncement,
  roomsAgentTurnCopy,
  roomsLegacyChannelHistoryItems,
} from "./agentTurns.ts";

const source = (seq: number, type: string) => ({
  seq,
  event_id: `event-${seq}`,
  type,
  schema: 1,
});
const attribution = {
  writer_principal_id: "a:claw",
  actor_principal_id: "a:claw",
};
const message = (seq: number, writer: string, body: string) => ({
  id: `feed-${seq}`,
  kind: "human_message",
  occurred_at: `2026-09-04T12:00:${String(seq).padStart(2, "0")}.000Z`,
  summary: body,
  source_event: source(seq, "message.created"),
  attribution: { writer_principal_id: writer, actor_principal_id: writer },
  payload: { body_markdown: body },
});
const update = (
  seq: number,
  status: "running" | "succeeded" | "failed",
  options: { readonly error?: "provider_request_rejected"; readonly replySeq?: number } = {},
) => ({
  id: `feed-${seq}`,
  kind: "agent_invocation_update",
  occurred_at: `2026-09-04T12:00:${String(seq).padStart(2, "0")}.000Z`,
  summary: `Agent invocation ${status}`,
  source_event: source(seq, `agent.invocation-${status}`),
  attribution,
  payload: {
    invocation_id: "invocation:one",
    triggering_message: source(1, "message.created"),
    status,
    safe_error_code: options.error ?? null,
    reply_source_event:
      options.replySeq === undefined ? null : source(options.replySeq, "message.created"),
  },
});

describe("Rooms Agent turn projection", () => {
  it("keeps conversation messages in all-channel history without legacy status cards or announcements", () => {
    const conversation = [
      {
        ...message(1, "h:monroe", "@Claw continue"),
        payload: { body_markdown: "@Claw continue", conversation_id: "conversation:one" },
      },
      {
        ...update(2, "running"),
        source_event: { ...source(2, "agent.invocation-started"), schema: 2 },
        payload: {
          ...update(2, "running").payload,
          conversation_id: "conversation:one",
          binding_id: "binding:one",
          turn_ordinal: 1,
        },
      },
      {
        ...message(3, "a:claw", "Durable reply"),
        payload: { body_markdown: "Durable reply", conversation_id: "conversation:one" },
      },
    ];
    const projected = projectRoomsAgentTurns(conversation, Date.parse("2026-09-04T12:01:00Z"));
    expect(projected).toEqual([
      { kind: "feed_item", item: conversation[0] },
      { kind: "feed_item", item: conversation[2] },
    ]);
    expect(roomsLegacyChannelHistoryItems(conversation)).toEqual([
      conversation[0],
      conversation[2],
    ]);
    const turns = projected.flatMap((entry) => (entry.kind === "agent_turn" ? [entry.turn] : []));
    expect(turns.map((turn) => roomsAgentTurnAnnouncement(turn, "Claw"))).toEqual([]);
    expect(nextRoomsAgentTurnTransitionAt(turns)).toBeNull();
    for (const conversationId of [undefined, null]) {
      const legacy = {
        ...update(4, "running"),
        payload: { ...update(4, "running").payload, conversation_id: conversationId },
      };
      expect(roomsLegacyChannelHistoryItems([legacy])).toEqual([legacy]);
      expect(projectRoomsAgentTurns([legacy], Date.parse("2026-09-04T12:01:00Z"))[0]).toMatchObject(
        { kind: "agent_turn", turn: { status: "delayed" } },
      );
    }
  });

  it("folds lifecycle updates and the correlated reply into one attributed turn", () => {
    const projected = projectRoomsAgentTurns(
      [
        message(1, "h:monroe", "@Claw status"),
        update(2, "running"),
        update(3, "succeeded"),
        message(4, "a:claw", "All systems nominal."),
        update(5, "succeeded", { replySeq: 4 }),
      ],
      Date.parse("2026-09-04T12:01:00Z"),
    );
    expect(projected).toHaveLength(2);
    expect(projected[1]).toMatchObject({
      kind: "agent_turn",
      turn: {
        status: "replied",
        replyMarkdown: "All systems nominal.",
        triggeringMessage: { seq: 1 },
      },
    });
  });

  it("shows running, delayed, and safe failure copy without provider details", () => {
    const running = projectRoomsAgentTurns(
      [update(2, "running")],
      Date.parse("2026-09-04T12:00:20Z"),
    );
    const delayed = projectRoomsAgentTurns(
      [update(2, "running")],
      Date.parse("2026-09-04T12:00:40Z"),
    );
    const failed = projectRoomsAgentTurns(
      [update(2, "running"), update(3, "failed", { error: "provider_request_rejected" })],
      Date.parse("2026-09-04T12:01:00Z"),
    );
    if (
      running[0]?.kind !== "agent_turn" ||
      delayed[0]?.kind !== "agent_turn" ||
      failed[0]?.kind !== "agent_turn"
    ) {
      throw new Error("Expected projected Agent turns");
    }
    expect(roomsAgentTurnCopy(running[0].turn, "Claw").title).toBe("Claw is working…");
    expect(roomsAgentTurnCopy(delayed[0].turn, "Claw")).toEqual({
      title: "Taking longer than expected",
      detail: "Claw is still working.",
    });
    expect(roomsAgentTurnCopy(failed[0].turn, "Claw")).toEqual({
      title: "Claw couldn’t respond",
      detail: "OpenClaw rejected this request.",
    });
    expect(roomsAgentTurnAnnouncement(failed[0].turn, "Claw")).not.toContain("provider");
    expect(nextRoomsAgentTurnTransitionAt([running[0].turn])).toBe(
      Date.parse("2026-09-04T12:00:32.000Z"),
    );
  });

  it("uses the supplied clock snapshot at the exact default delay boundary", () => {
    const items = [update(2, "running")];
    const startedAt = Date.parse(items[0]!.occurred_at);
    const before = projectRoomsAgentTurns(items, startedAt + ROOMS_AGENT_DELAY_MS - 1);
    const at = projectRoomsAgentTurns(items, startedAt + ROOMS_AGENT_DELAY_MS);
    expect(before[0]).toMatchObject({ kind: "agent_turn", turn: { status: "running" } });
    expect(at[0]).toMatchObject({ kind: "agent_turn", turn: { status: "delayed" } });
    if (before[0]?.kind !== "agent_turn") throw new Error("Expected projected Agent turn");
    expect(nextRoomsAgentTurnTransitionAt([before[0].turn])).toBe(startedAt + ROOMS_AGENT_DELAY_MS);
    expect(projectRoomsAgentTurns(items, startedAt + ROOMS_AGENT_DELAY_MS - 1)).toEqual(before);
  });

  it("preserves custom delay boundaries and future or invalid event timestamps", () => {
    const items = [update(2, "running")];
    const startedAt = Date.parse(items[0]!.occurred_at);
    expect(projectRoomsAgentTurns(items, startedAt + 249, 250)[0]).toMatchObject({
      kind: "agent_turn",
      turn: { status: "running" },
    });
    expect(projectRoomsAgentTurns(items, startedAt + 250, 250)[0]).toMatchObject({
      kind: "agent_turn",
      turn: { status: "delayed" },
    });
    expect(projectRoomsAgentTurns(items, startedAt - 1)[0]).toMatchObject({
      kind: "agent_turn",
      turn: { status: "running" },
    });
    expect(
      projectRoomsAgentTurns([{ ...items[0]!, occurred_at: "invalid" }], startedAt)[0],
    ).toMatchObject({
      kind: "agent_turn",
      turn: { status: "running" },
    });
  });
});
