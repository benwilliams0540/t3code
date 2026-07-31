import { createFileRoute } from "@tanstack/react-router";

import { RoomsWorkspaceShell } from "~/features/rooms/shell";

function RoomsDashboardRoute() {
  const { roomSlug } = Route.useParams();
  return <RoomsWorkspaceShell roomSlug={roomSlug} surface={{ kind: "dashboard" }} />;
}

export const Route = createFileRoute("/_chat/rooms/$roomSlug/dashboard")({
  component: RoomsDashboardRoute,
});
