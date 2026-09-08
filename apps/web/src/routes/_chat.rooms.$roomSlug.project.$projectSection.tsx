import { createFileRoute } from "@tanstack/react-router";

import { RoomsWorkspaceShell } from "~/features/rooms/shell";

function RoomsProjectRoute() {
  const { projectSection, roomSlug } = Route.useParams();
  return <RoomsWorkspaceShell roomSlug={roomSlug} surface={{ kind: "project", projectSection }} />;
}

export const Route = createFileRoute("/_chat/rooms/$roomSlug/project/$projectSection")({
  component: RoomsProjectRoute,
});
