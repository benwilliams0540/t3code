import { removeLocalStorageItemAndNotify } from "~/hooks/useLocalStorage";

import { ROOMS_SELECTED_ROOM_STORAGE_KEY } from "../model/selection";
import { ROOMS_LAST_ROUTE_STORAGE_KEY, ROOMS_SIDEBAR_OPEN_STORAGE_KEY } from "../shell/navigation";
import { ROOMS_SIDEBAR_WIDTH_STORAGE_KEY } from "../shell/roomsSidebarWidth";
import { ROOMS_PROJECT_BINDINGS_STORAGE_KEY } from "../threads/roomProjectBindings";
import {
  ROOMS_DATA_SOURCE_STORAGE_KEY,
  ROOMS_LOCAL_WORKSPACE_STORAGE_KEY,
  ROOMS_SELECTED_ROOM_BY_SOURCE_STORAGE_KEY,
} from "./model";

export const ROOMS_RESETTABLE_STORAGE_KEYS = [
  ROOMS_DATA_SOURCE_STORAGE_KEY,
  ROOMS_LOCAL_WORKSPACE_STORAGE_KEY,
  ROOMS_SELECTED_ROOM_BY_SOURCE_STORAGE_KEY,
  ROOMS_SELECTED_ROOM_STORAGE_KEY,
  ROOMS_PROJECT_BINDINGS_STORAGE_KEY,
  ROOMS_SIDEBAR_OPEN_STORAGE_KEY,
  ROOMS_SIDEBAR_WIDTH_STORAGE_KEY,
  ROOMS_LAST_ROUTE_STORAGE_KEY,
] as const;

export function resetRoomsBetaSettings(
  remove: (key: string) => void = removeLocalStorageItemAndNotify,
): void {
  for (const key of ROOMS_RESETTABLE_STORAGE_KEYS) remove(key);
}
