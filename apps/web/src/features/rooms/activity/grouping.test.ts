import { describe, expect, it } from "vite-plus/test";

import { groupRoomsActivityRows, roomsActivityDayKey } from "./grouping";
import type { RoomsActivityPrincipal, RoomsProjectedActivity } from "./projection";

const ben: RoomsActivityPrincipal = {
  id: "h:019fbf3b-0000-7000-8000-000000000001",
  type: "human",
  display_name: "Shared Local user",
};
const monroe: RoomsActivityPrincipal = {
  id: "h:019fbf3b-0000-7000-8000-000000000002",
  type: "human",
  display_name: "Second human",
};

function activity(overrides: {
  readonly id: string;
  readonly occurredAt: string;
  readonly writer?: RoomsActivityPrincipal;
  readonly cardKind?: RoomsProjectedActivity["cardKind"];
  readonly seq?: number;
}): RoomsProjectedActivity {
  const writer = overrides.writer ?? ben;
  return {
    item: {
      id: overrides.id,
      kind: overrides.cardKind === "unknown" ? "unknown_schema" : "human_message",
      occurred_at: overrides.occurredAt,
      summary: "summary",
      source_event: {
        seq: overrides.seq ?? 1,
        event_id: overrides.id,
        type: "message.created",
        schema: 1,
      },
    },
    cardKind: overrides.cardKind ?? "message",
    attribution: {
      mode: "explicit_principal",
      writer,
      actor: writer,
      upstream: null,
      delegatedAgent: null,
      machine: null,
    },
    bodyMarkdown: "body",
    emoji: null,
    targetItemId: null,
    story: null,
    stage: null,
    thread: null,
    threadHref: null,
    status: null,
    evidence: null,
    approval: null,
    gate: null,
    unknownSchema: null,
    unavailable: null,
  };
}

describe("Rooms activity grouping", () => {
  it("collapses consecutive messages from one writer into a single spoken block", () => {
    const rows = groupRoomsActivityRows([
      activity({ id: "a", occurredAt: "2026-08-01T12:00:00.000Z" }),
      activity({ id: "b", occurredAt: "2026-08-01T12:01:00.000Z" }),
    ]);
    const items = rows.filter((row) => row.kind === "activity");
    expect(items.map((row) => (row.kind === "activity" ? row.showHeader : null))).toEqual([
      true,
      false,
    ]);
  });

  it("starts a new block for a different writer, a stale gap, or a different register", () => {
    const rows = groupRoomsActivityRows([
      activity({ id: "a", occurredAt: "2026-08-01T12:00:00.000Z" }),
      activity({ id: "b", occurredAt: "2026-08-01T12:00:30.000Z", writer: monroe }),
      activity({ id: "c", occurredAt: "2026-08-01T12:40:00.000Z", writer: monroe }),
      activity({ id: "d", occurredAt: "2026-08-01T12:41:00.000Z", cardKind: "unknown" }),
      activity({ id: "e", occurredAt: "2026-08-01T12:41:30.000Z" }),
    ]);
    const items = rows.filter((row) => row.kind === "activity");
    expect(items.map((row) => (row.kind === "activity" ? row.showHeader : null))).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it("classifies each row into its presentation register", () => {
    const rows = groupRoomsActivityRows([
      activity({ id: "a", occurredAt: "2026-08-01T12:00:00.000Z" }),
      activity({ id: "b", occurredAt: "2026-08-01T12:00:10.000Z", cardKind: "unknown" }),
      activity({ id: "c", occurredAt: "2026-08-01T12:00:20.000Z", cardKind: "run" }),
    ]);
    expect(
      rows
        .filter((row) => row.kind === "activity")
        .map((row) => (row.kind === "activity" ? row.register : null)),
    ).toEqual(["conversation", "record", "excerpt"]);
  });

  it("emits one separator per calendar day and restarts grouping across the boundary", () => {
    // Constructed in local time so the boundary holds in whatever zone the reader is in.
    const lateNight = new Date(2026, 7, 1, 23, 59, 0).toISOString();
    const justAfterMidnight = new Date(2026, 7, 2, 0, 0, 30).toISOString();
    const shortlyAfter = new Date(2026, 7, 2, 0, 1, 0).toISOString();
    const rows = groupRoomsActivityRows([
      activity({ id: "a", occurredAt: lateNight }),
      activity({ id: "b", occurredAt: justAfterMidnight }),
      activity({ id: "c", occurredAt: shortlyAfter }),
    ]);
    expect(rows.filter((row) => row.kind === "day")).toHaveLength(2);
    const items = rows.filter((row) => row.kind === "activity");
    expect(items.map((row) => (row.kind === "activity" ? row.showHeader : null))).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("never groups across an unparsable timestamp", () => {
    expect(roomsActivityDayKey("not-a-date")).toBeNull();
    const rows = groupRoomsActivityRows([
      activity({ id: "a", occurredAt: "2026-08-01T12:00:00.000Z" }),
      activity({ id: "b", occurredAt: "not-a-date" }),
    ]);
    const items = rows.filter((row) => row.kind === "activity");
    expect(items.map((row) => (row.kind === "activity" ? row.showHeader : null))).toEqual([
      true,
      true,
    ]);
  });
});
