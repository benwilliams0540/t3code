import { createFileRoute } from "@tanstack/react-router";

import { RoomsWorkspaceLanding } from "~/features/rooms/shell";

export const Route = createFileRoute("/_chat/rooms/")({
  component: RoomsWorkspaceLanding,
});
