import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { principalPresentation, projectRoomsActivityItem, roomsThreadHref } from "./projection";

describe("Rooms v2 activity projection", () => {
  const workspace = roomsWorkspaceFixture.workspaces[0]!;

  it("exhaustively maps all ten closed feed variants", () => {
    const projected = workspace.feeds.flatMap((feed) =>
      feed.items.map((item) => projectRoomsActivityItem(roomsWorkspaceFixture, workspace, item)),
    );
    expect(projected.map((activity) => activity.item.kind)).toEqual([
      "human_message",
      "reaction",
      "run_lifecycle",
      "evidence_attached",
      "unknown_schema",
      "story_lifecycle",
      "approval_requested",
      "human_gate",
      "approval_decided",
      "unavailable",
    ]);
    expect(projected.map((activity) => activity.cardKind)).toEqual([
      "message",
      "reaction",
      "run",
      "evidence",
      "unknown",
      "story",
      "approval",
      "gate",
      "approval",
      "unavailable",
    ]);
    expect(
      projected.find((activity) => activity.cardKind === "unknown")?.unknownSchema,
    ).toBeTruthy();
    expect(
      projected.find((activity) => activity.cardKind === "unavailable")?.unavailable,
    ).toBeTruthy();
  });

  it("keeps writer, upstream actor, delegate, and machine identities distinct", () => {
    const runItem = workspace.feeds
      .flatMap((feed) => feed.items)
      .find((item) => item.kind === "run_lifecycle");
    if (!runItem) throw new Error("Certified run item is missing.");
    const projected = projectRoomsActivityItem(roomsWorkspaceFixture, workspace, runItem);
    expect(projected.attribution).toMatchObject({
      mode: "mirrored_source",
      writer: { agent_kind: "adapter", display_name: "MacBook T3 mirror" },
      actor: null,
      upstream: { status: "coarse", actor_kind: "assistant" },
      delegatedAgent: { agent_kind: "execution", display_name: "Codex on MacBook" },
      machine: { type: "machine", display_name: "Ben's MacBook" },
    });
    const unavailable = workspace.feeds
      .flatMap((feed) => feed.items)
      .map((item) => projectRoomsActivityItem(roomsWorkspaceFixture, workspace, item))
      .find((activity) => activity.attribution.upstream?.status === "unavailable");
    expect(unavailable?.attribution).toMatchObject({
      mode: "mirrored_source",
      writer: { agent_kind: "adapter" },
      actor: null,
      upstream: { status: "unavailable" },
    });
    expect(projected.threadHref).toBe(roomsThreadHref(projected.thread!));
  });

  it("preserves principal presentation without conflating principal types", () => {
    expect(
      roomsWorkspaceFixture.principals.map((principal) => principalPresentation(principal).tone),
    ).toContain("human");
    expect(
      roomsWorkspaceFixture.principals.map((principal) => principalPresentation(principal).tone),
    ).toContain("agent");
    expect(
      roomsWorkspaceFixture.principals.map((principal) => principalPresentation(principal).tone),
    ).toContain("machine");
  });
});
