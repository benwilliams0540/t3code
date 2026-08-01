import { createFileRoute } from "@tanstack/react-router";

import { RoomsWorkspaceShell } from "~/features/rooms/shell";

function RoomsNativeThreadRoute() {
  const { environmentId, roomSlug, threadId } = Route.useParams();
  return (
    <RoomsWorkspaceShell
      roomSlug={roomSlug}
      surface={{ kind: "native-thread", environmentId, threadId }}
    />
  );
}

export const Route = createFileRoute("/_chat/rooms/$roomSlug/threads_/$environmentId/$threadId")({
  component: RoomsNativeThreadRoute,
});
