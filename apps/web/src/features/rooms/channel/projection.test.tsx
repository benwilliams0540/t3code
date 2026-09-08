import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { RoomsChannelFeed } from "./RoomsChannelFeed";
import { projectRoomsChannel } from "./projection";

describe("Rooms v2 channel projection", () => {
  const room = roomsWorkspaceFixture.rooms[0]!;
  const workspace = roomsWorkspaceFixture.workspaces[0]!;

  it("preserves source order, pagination, attribution, and typed unavailable variants", () => {
    const infra = projectRoomsChannel(roomsWorkspaceFixture, workspace, "infra");
    expect(infra.kind).toBe("feed");
    if (infra.kind !== "feed") return;
    expect(infra.items.map((activity) => activity.item.source_event.seq)).toEqual([
      301, 302, 304, 305, 309,
    ]);
    expect(infra.items.map((activity) => activity.cardKind)).toEqual([
      "message",
      "reaction",
      "run",
      "evidence",
      "unknown",
    ]);
    expect(infra.feed.page_info).toEqual({
      after_seq: 300,
      limit: 50,
      snapshot_head_seq: 310,
      next_cursor: 309,
      has_more: false,
    });

    const product = projectRoomsChannel(roomsWorkspaceFixture, workspace, "product");
    expect(product.kind).toBe("feed");
    if (product.kind !== "feed") return;
    expect(product.items.map((activity) => activity.cardKind)).toEqual([
      "story",
      "approval",
      "gate",
      "approval",
      "unavailable",
    ]);
  });

  it("selects and renders all seven closed state/result variants", () => {
    const stateSlugs = [
      "state-authorized-workspace",
      "state-unauthenticated",
      "state-unauthorized",
      "state-empty",
      "state-stale-cursor",
      "state-reachable-but-stale",
      "state-unsupported-contract-version",
    ];
    expect(
      stateSlugs.map((slug) => {
        const projection = projectRoomsChannel(roomsWorkspaceFixture, workspace, slug);
        if (projection.kind !== "fixture_state") throw new Error(`Missing state route ${slug}.`);
        return projection.state.kind;
      }),
    ).toEqual(roomsWorkspaceFixture.states.map((state) => state.kind));

    for (const slug of stateSlugs) {
      const markup = renderToStaticMarkup(
        <RoomsChannelFeed
          fixture={roomsWorkspaceFixture}
          room={room}
          surface={{ kind: "channel", channelSlug: slug }}
          workspace={workspace}
        />,
      );
      expect(markup).toContain("workspace-read v2");
      expect(markup).toContain("data-rooms-channel-state=");
    }
  });

  it("switches to the second workspace's complete channel feed", () => {
    const camera = projectRoomsChannel(
      roomsWorkspaceFixture,
      roomsWorkspaceFixture.workspaces[1]!,
      "capture",
    );
    expect(camera.kind).toBe("feed");
    if (camera.kind !== "feed") return;
    expect(camera.channel.name).toBe("# capture");
    expect(camera.items.map((activity) => activity.item.source_event.seq)).toEqual([401, 403, 405]);
  });
});
