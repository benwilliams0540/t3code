import { createFileRoute } from "@tanstack/react-router";

import { RoomsWorkspaceShell } from "~/features/rooms/shell";

function RoomsThreadsRoute() {
  const { roomSlug } = Route.useParams();
  return <RoomsWorkspaceShell roomSlug={roomSlug} surface={{ kind: "threads" }} />;
}

export const Route = createFileRoute("/_chat/rooms/$roomSlug/threads")({
  component: RoomsThreadsRoute,
});
