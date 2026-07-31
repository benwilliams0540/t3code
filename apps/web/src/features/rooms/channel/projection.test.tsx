import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { RoomsChannelFeed } from "./RoomsChannelFeed";
import { projectRoomsChannel } from "./projection";

describe("Rooms channel projection", () => {
  const fixture = roomsWorkspaceFixture;
  const room = fixture.rooms.find(
    (candidate) => candidate.id === fixture.workspace.selected_room_id,
  )!;

  it("preserves source order, cursor metadata, and structured kinds", () => {
    const infra = projectRoomsChannel(fixture, fixture.workspace, "infra");
    expect(infra.kind).toBe("feed");
    if (infra.kind !== "feed") return;
    expect(infra.feed.page_info).toBe(fixture.workspace.feeds[0]?.page_info);
    expect(infra.items.map((activity) => activity.item.source_event.seq)).toEqual([111, 112, 115]);
    expect(infra.items.map((activity) => activity.cardKind)).toEqual([
      "message",
      "reaction",
      "run",
    ]);

    const product = projectRoomsChannel(fixture, fixture.workspace, "product");
    expect(product.kind).toBe("feed");
    if (product.kind !== "feed") return;
    expect(product.items.map((activity) => activity.item.source_event.seq)).toEqual([
      113, 114, 116, 117,
    ]);
    expect(product.items.map((activity) => activity.cardKind)).toEqual([
      "message",
      "story",
      "evidence",
      "approval",
    ]);
  });

  it.each([
    ["state-unauthorized", "unauthorized"],
    ["state-stale-cursor", "stale_cursor"],
    ["state-empty", "empty"],
  ] as const)("selects exact fixture state %s", (slug, expectedName) => {
    const projection = projectRoomsChannel(fixture, fixture.workspace, slug);
    expect(projection.kind).toBe("fixture_state");
    if (projection.kind !== "fixture_state") return;
    expect(projection.state).toBe(
      fixture.states.find((candidate) => candidate.name === expectedName),
    );
  });

  it("renders ordered semantics and a native keyboard-accessible thread link", () => {
    const markup = renderToStaticMarkup(
      <RoomsChannelFeed
        fixture={fixture}
        room={room}
        surface={{ kind: "channel", channelSlug: "infra" }}
        workspace={fixture.workspace}
      />,
    );
    expect(markup).toContain('aria-label="Ordered # infra activity"');
    expect(markup.indexOf('data-source-seq="111"')).toBeLessThan(
      markup.indexOf('data-source-seq="112"'),
    );
    expect(markup.indexOf('data-source-seq="112"')).toBeLessThan(
      markup.indexOf('data-source-seq="115"'),
    );
    expect(markup).toContain(
      'href="/env%3At3rooms-local/thread%3A019fb900-4000-7000-8000-000000000001"',
    );
    expect(markup).toContain("Open detailed T3 thread");
    expect(markup).toContain("source sequence 115");
  });

  it("renders exact unauthorized, stale-cursor, and empty metadata", () => {
    const renderState = (channelSlug: string) =>
      renderToStaticMarkup(
        <RoomsChannelFeed
          fixture={fixture}
          room={room}
          surface={{ kind: "channel", channelSlug }}
          workspace={fixture.workspace}
        />,
      );
    const unauthorized = renderState("state-unauthorized");
    expect(unauthorized).toContain("Reachability does not create room membership.");
    expect(unauthorized).toContain("room_membership_required");
    expect(unauthorized).toContain("403");

    const stale = renderState("state-stale-cursor");
    expect(stale).toContain("seq 100");
    expect(stale).toContain("seq 99");
    expect(stale).toContain("409");

    const empty = renderState("state-empty");
    expect(empty).toContain("zero items after seq 117");
    expect(empty).toContain("snapshot 117");
    expect(empty).toContain("has more false");
  });

  it("labels an undeclared channel instead of rendering a silent empty feed", () => {
    const projection = projectRoomsChannel(fixture, fixture.workspace, "missing");
    expect(projection).toEqual({
      kind: "missing",
      slug: "missing",
      availableChannelNames: ["# infra", "# product"],
    });
  });
});
