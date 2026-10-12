import type { RoomsConversationProjection } from "./humanWire.ts";

export function roomsConversationTurnLabel(
  turn: RoomsConversationProjection["invocations"][number],
): string {
  if (turn.status === "failed") return "Failed";
  if (turn.status === "succeeded") return "Replied";
  switch (turn.turn_state) {
    case "queued":
      return "Queued";
    case "ready":
    case "dispatching":
      return "Starting";
    case "accepted":
      return "Working";
    case "uncertain":
    case "terminal":
    case "legacy":
      return "Needs attention";
  }
}

export function roomsConversationBindingLabel(
  binding: RoomsConversationProjection["bindings"][number],
): string {
  switch (binding.initialization_state) {
    case "initializing":
      return "Starting";
    case "ready":
      return "Ready";
    case "missing":
      return "Session missing";
  }
}

/** Selected conversations show durable messages; turn lifecycle comes from the read projection. */
export function roomsConversationHistoryItems<Item extends { readonly kind: string }>(
  items: readonly Item[],
): readonly Item[] {
  return items.filter((item) => item.kind !== "agent_invocation_update");
}
