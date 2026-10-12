import feed from "./fixtures/conversation-feed-v2.json" with { type: "json" };
import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import fixture from "./fixtures/conversations-v2.json" with { type: "json" };
import { RoomsConversationProjection } from "./humanWire.ts";
import {
  roomsConversationHistoryItems,
  roomsConversationBindingLabel,
  roomsConversationTurnLabel,
} from "./conversationStatus.ts";
const projection = Schema.decodeUnknownSync(RoomsConversationProjection)(fixture);
const turn = projection.invocations[0]!;
const binding = projection.bindings[0]!;

describe("authoritative human conversation status", () => {
  it("shows ordinary conversation messages without legacy event-derived working cards", () => {
    const history = roomsConversationHistoryItems(feed.items);
    expect(
      history.filter((item) => item.kind === "human_message").map((item) => item.payload),
    ).toEqual(
      feed.items.filter((item) => item.kind === "human_message").map((item) => item.payload),
    );
    expect(history.some((item) => item.kind === "agent_invocation_update")).toBe(false);
  });
  it("does not infer working from legacy running when a turn is queued or uncertain", () => {
    expect(roomsConversationTurnLabel({ ...turn, status: "running", turn_state: "queued" })).toBe(
      "Queued",
    );
    expect(
      roomsConversationTurnLabel({ ...turn, status: "running", turn_state: "uncertain" }),
    ).toBe("Needs attention");
    expect(
      roomsConversationTurnLabel({ ...turn, status: "running", turn_state: "dispatching" }),
    ).toBe("Starting");
    expect(roomsConversationTurnLabel({ ...turn, status: "running", turn_state: "accepted" })).toBe(
      "Working",
    );
    expect(
      roomsConversationTurnLabel({ ...turn, status: "succeeded", turn_state: "terminal" }),
    ).toBe("Replied");
    expect(roomsConversationTurnLabel({ ...turn, status: "failed", turn_state: "terminal" })).toBe(
      "Failed",
    );
    expect(roomsConversationBindingLabel({ ...binding, initialization_state: "missing" })).toBe(
      "Session missing",
    );
  });
});
