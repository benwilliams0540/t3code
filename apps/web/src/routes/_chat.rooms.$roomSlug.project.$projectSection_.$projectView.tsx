import { createFileRoute } from "@tanstack/react-router";

import { RoomsWorkspaceShell } from "~/features/rooms/shell";

function RoomsProjectViewRoute() {
  const { projectSection, projectView, roomSlug } = Route.useParams();
  return (
    <RoomsWorkspaceShell
      roomSlug={roomSlug}
      surface={{ kind: "project", projectSection, projectView }}
    />
  );
}

export const Route = createFileRoute(
  "/_chat/rooms/$roomSlug/project/$projectSection_/$projectView",
)({
  component: RoomsProjectViewRoute,
});
