import { createFileRoute } from "@tanstack/react-router";

import { RoomsWorkspaceShell } from "~/features/rooms/shell";

function RoomsPresentRoute() {
  const { roomSlug } = Route.useParams();
  return <RoomsWorkspaceShell roomSlug={roomSlug} surface={{ kind: "present" }} />;
}

export const Route = createFileRoute("/_chat/rooms/$roomSlug/present")({
  component: RoomsPresentRoute,
});
