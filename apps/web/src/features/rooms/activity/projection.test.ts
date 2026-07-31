import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { principalPresentation, projectRoomsActivityItem, roomsThreadHref } from "./projection";

describe("Rooms activity projection", () => {
  const { workspace } = roomsWorkspaceFixture;

  it("maps every fixture item kind to its structured card kind", () => {
    const items = workspace.feeds.flatMap((feed) => feed.items);
    expect(
      items.map(
        (item) => projectRoomsActivityItem(roomsWorkspaceFixture, workspace, item).cardKind,
      ),
    ).toEqual(["message", "reaction", "run", "message", "story", "evidence", "approval"]);
  });

  it("keeps human, agent, and machine semantics distinct", () => {
    const presentations = roomsWorkspaceFixture.principals.map((principal) => ({
      type: principal.type,
      ...principalPresentation(principal),
    }));
    expect(presentations.filter(({ type }) => type === "human")).toMatchObject([
      { label: "Human", tone: "human" },
      { label: "Human", tone: "human" },
    ]);
    expect(presentations.filter(({ type }) => type === "agent")).toMatchObject([
      { label: "Agent", tone: "agent" },
      { label: "Agent", tone: "agent" },
    ]);
    expect(presentations.filter(({ type }) => type === "machine")).toMatchObject([
      { label: "Machine", tone: "machine" },
      { label: "Machine", tone: "machine" },
    ]);
  });

  it("projects run lifecycle to the existing detailed T3 thread route", () => {
    const runItem = workspace.feeds
      .flatMap((feed) => feed.items)
      .find((item) => item.kind === "run_lifecycle")!;
    const projected = projectRoomsActivityItem(roomsWorkspaceFixture, workspace, runItem);
    expect(projected.thread?.id).toBe("thread:019fb900-4000-7000-8000-000000000001");
    expect(projected.threadHref).toBe(
      "/env%3At3rooms-local/thread%3A019fb900-4000-7000-8000-000000000001",
    );
    expect(projected.threadHref).toBe(roomsThreadHref(projected.thread!));
  });
});
