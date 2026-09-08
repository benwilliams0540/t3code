import { createFileRoute } from "@tanstack/react-router";

import { RoomsWorkspaceShell } from "~/features/rooms/shell";

function RoomsNativeDraftRoute() {
  const { draftId, roomSlug } = Route.useParams();
  return <RoomsWorkspaceShell roomSlug={roomSlug} surface={{ kind: "native-draft", draftId }} />;
}

export const Route = createFileRoute("/_chat/rooms/$roomSlug/draft/$draftId")({
  component: RoomsNativeDraftRoute,
});
