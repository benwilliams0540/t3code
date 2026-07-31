import type { ComponentType } from "react";

import type { RoomsRoom, RoomsWorkspace, RoomsWorkspaceReadFixture } from "../model/workspace";
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

// APP-01 owns integration of consumer exports after APP-2B/2C/2D return.
export const roomsWorkspaceSlots: RoomsWorkspaceSlots = {};
