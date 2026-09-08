export const ROOMS_SIDEBAR_WIDTH_STORAGE_KEY = "t3code:rooms-workspace-sidebar-width:v1";
export const ROOMS_SIDEBAR_DEFAULT_WIDTH = 15 * 16;
export const ROOMS_SIDEBAR_MIN_WIDTH = 13 * 16;
export const ROOMS_MAIN_CONTENT_MIN_WIDTH = 40 * 16;
export const ROOMS_WORKSPACE_RAIL_WIDTH = 3.5 * 16;

export function resolveRoomsSidebarMaximumWidth(viewportWidth: number): number {
  return Math.max(
    ROOMS_SIDEBAR_MIN_WIDTH,
    Math.floor(viewportWidth) - ROOMS_WORKSPACE_RAIL_WIDTH - ROOMS_MAIN_CONTENT_MIN_WIDTH,
  );
}
