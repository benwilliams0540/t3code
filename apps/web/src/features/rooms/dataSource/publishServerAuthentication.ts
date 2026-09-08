import {
  activateLocalRoomsSession,
  deactivateLocalRoomsSession,
  setRoomsAuthenticationOwner,
} from "~/cloud/roomsAuth";

import type { RoomsAuthProviderName } from "./localAuthContract";

// Publish the selected server's usable session through the shared auth boundary.
export function publishRoomsServerAuthentication(
  provider: RoomsAuthProviderName,
  accountId: string | null,
  token: string | null,
): void {
  if (provider === "local") {
    if (token !== null && accountId !== null) {
      activateLocalRoomsSession(accountId, token);
    } else {
      deactivateLocalRoomsSession();
    }
    setRoomsAuthenticationOwner("local");
    return;
  }
  deactivateLocalRoomsSession();
  setRoomsAuthenticationOwner("clerk");
}
