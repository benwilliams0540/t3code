import type {
  RoomsChannel,
  RoomsFeed,
  RoomsStateExample,
  RoomsWorkspace,
  RoomsWorkspaceReadFixture,
} from "../model/workspace";
import { projectRoomsActivityItem, type RoomsProjectedActivity } from "../activity/projection";

export type RoomsChannelFixtureStateName = RoomsStateExample["kind"];

export type RoomsChannelProjection =
  | {
      readonly kind: "feed";
      readonly channel: RoomsChannel;
      readonly feed: RoomsFeed;
      readonly items: readonly RoomsProjectedActivity[];
    }
  | {
      readonly kind: "fixture_state";
      readonly slug: string;
      readonly state: RoomsStateExample;
    }
  | {
      readonly kind: "missing";
      readonly slug: string;
      readonly availableChannelNames: readonly string[];
    };

const fixtureStateBySlug = {
  "state-authorized-workspace": "authorized_workspace",
  "state-unauthenticated": "unauthenticated",
  "state-unauthorized": "unauthorized",
  "state-stale-cursor": "stale_cursor",
  "state-empty": "empty",
  "state-reachable-but-stale": "reachable_but_stale",
  "state-unsupported-contract-version": "unsupported_contract_version",
} as const satisfies Record<string, RoomsChannelFixtureStateName>;

function channelSlug(channel: RoomsChannel): string {
  return channel.name.replace(/^#\s*/, "");
}

export function projectRoomsChannel(
  fixture: RoomsWorkspaceReadFixture,
  workspace: RoomsWorkspace,
  slug: string,
): RoomsChannelProjection {
  const fixtureStateName = fixtureStateBySlug[slug as keyof typeof fixtureStateBySlug];
  if (fixtureStateName) {
    const state = fixture.states.find((candidate) => candidate.kind === fixtureStateName);
    if (state) return { kind: "fixture_state", slug, state };
  }

  const channel = workspace.channels.find((candidate) => channelSlug(candidate) === slug);
  if (!channel) {
    return {
      kind: "missing",
      slug,
      availableChannelNames: workspace.channels.map((candidate) => candidate.name),
    };
  }

  const feed = workspace.feeds.find((candidate) => candidate.channel_id === channel.id);
  if (!feed) {
    return {
      kind: "missing",
      slug,
      availableChannelNames: workspace.channels.map((candidate) => candidate.name),
    };
  }

  return {
    kind: "feed",
    channel,
    feed,
    items: feed.items.map((item) => projectRoomsActivityItem(fixture, workspace, item)),
  };
}
