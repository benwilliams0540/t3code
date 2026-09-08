import type { ComponentType } from "react";

import { RoomsVisionAtlas } from "../atlas";
import { RoomsChannelFeed } from "../channel";
import { RoomsDashboard } from "../dashboard";
import type { RoomsRoom, RoomsWorkspace, RoomsWorkspaceReadFixture } from "../model/workspace";
import { RoomsProjectSurface } from "../project";
import type { RoomsWorkspaceSurface } from "./navigation";

export interface RoomsWorkspaceSlotProps {
  readonly fixture: RoomsWorkspaceReadFixture;
  readonly room: RoomsRoom;
  readonly workspace: RoomsWorkspace;
  readonly surface: RoomsWorkspaceSurface;
}

export type RoomsWorkspaceSlot = ComponentType<RoomsWorkspaceSlotProps>;

export interface RoomsWorkspaceSlots {
  readonly dashboard?: RoomsWorkspaceSlot;
  readonly channel?: RoomsWorkspaceSlot;
  readonly project?: RoomsWorkspaceSlot;
  readonly atlas?: RoomsWorkspaceSlot;
}

export const roomsWorkspaceSlots = {
  dashboard: RoomsDashboard,
  channel: RoomsChannelFeed,
  project: RoomsProjectSurface,
  atlas: RoomsVisionAtlas,
} satisfies RoomsWorkspaceSlots;
