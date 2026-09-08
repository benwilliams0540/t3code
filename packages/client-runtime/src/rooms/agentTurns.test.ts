import { describe, expect, it } from "vite-plus/test";

import {
  nextRoomsAgentTurnTransitionAt,
  projectRoomsAgentTurns,
  roomsAgentTurnAnnouncement,
  roomsAgentTurnCopy,
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
  it("folds lifecycle updates and the correlated reply into one attributed turn", () => {
    const projected = projectRoomsAgentTurns([
      message(1, "h:monroe", "@Claw status"),
      update(2, "running"),
      update(3, "succeeded"),
      message(4, "a:claw", "All systems nominal."),
      update(5, "succeeded", { replySeq: 4 }),
    ]);
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
    const failed = projectRoomsAgentTurns([
      update(2, "running"),
      update(3, "failed", { error: "provider_request_rejected" }),
    ]);
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
});
