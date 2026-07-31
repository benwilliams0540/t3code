import { createFileRoute } from "@tanstack/react-router";

import { RoomsWorkspaceShell } from "~/features/rooms/shell";

function RoomsChannelRoute() {
  const { channelSlug, roomSlug } = Route.useParams();
  return <RoomsWorkspaceShell roomSlug={roomSlug} surface={{ kind: "channel", channelSlug }} />;
}

export const Route = createFileRoute("/_chat/rooms/$roomSlug/channels/$channelSlug")({
  component: RoomsChannelRoute,
});
