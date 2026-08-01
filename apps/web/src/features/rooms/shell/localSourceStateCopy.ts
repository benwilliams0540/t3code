import type { RoomsLocalSourceFailure } from "../dataSource";

export function localSourceStateCopy(state: RoomsLocalSourceFailure): {
  readonly title: string;
  readonly message: string;
  readonly canRetry: boolean;
} {
  switch (state.status) {
    case "connecting":
      return {
        title: "Connecting to Local workspace",
        message: "Discovering the server-authoritative room and channels.",
        canRetry: false,
      };
    case "disabled":
      return {
        title: "Local workspace is disabled",
        message: "Start t3rooms with ROOMS_LOCAL_UI_ENABLED=1, then retry.",
        canRetry: true,
      };
    case "uninitialized":
      return {
        title: "Local workspace is not initialized",
        message: "Run rooms:development:bootstrap_local_workspace in t3rooms, then retry.",
        canRetry: true,
      };
    case "unavailable-outside-development":
      return {
        title: "Local workspace is development-only",
        message:
          "rooms.local-channels v1 is unavailable outside the t3rooms development environment.",
        canRetry: true,
      };
    case "invalid-bootstrap":
      return {
        title: "Local workspace bootstrap is invalid",
        message:
          state.error?.message ?? "The server found ambiguous or invalid Local bootstrap state.",
        canRetry: true,
      };
    case "authorization-failure":
      return {
        title: "Local workspace authorization failed",
        message:
          state.error?.message ?? "The Local human does not have the required room capability.",
        canRetry: true,
      };
    case "invalid-configuration":
      return {
        title: "Local API address is invalid",
        message: state.error?.message ?? "Choose an HTTP loopback address in Beta settings.",
        canRetry: false,
      };
    case "error":
      return {
        title: "Local workspace is unavailable",
        message: state.error?.message ?? "The Rooms Local API request failed.",
        canRetry: true,
      };
  }
}
