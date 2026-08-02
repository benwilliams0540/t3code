import { describe, expect, it } from "vite-plus/test";

import {
  canSubmitStableRoomsCommand,
  finishStableRoomsSubmission,
  prepareStableRoomsCommand,
  tryStartStableRoomsSubmission,
} from "./stableCommand";

describe("Rooms retry command identity", () => {
  it("rejects unauthorized, blank, and in-flight submissions without normalizing the payload", () => {
    expect(
      canSubmitStableRoomsCommand({ authorized: false, isPending: false, payload: "retained" }),
    ).toBe(false);
    expect(
      canSubmitStableRoomsCommand({ authorized: true, isPending: false, payload: "  \n" }),
    ).toBe(false);
    expect(
      canSubmitStableRoomsCommand({ authorized: true, isPending: true, payload: "retained" }),
    ).toBe(false);
    expect(
      canSubmitStableRoomsCommand({
        authorized: true,
        isPending: false,
        payload: "  exact body  ",
      }),
    ).toBe(true);
  });

  it("retains request id and submitted content across a failed or uncertain retry", () => {
    const first = prepareStableRoomsCommand(null, "**exact**\nbody", () => "request-1");
    const retry = prepareStableRoomsCommand(first, first.payload, () => "request-2");
    expect(retry).toBe(first);
    expect(retry).toEqual({ requestId: "request-1", payload: "**exact**\nbody" });
  });

  it("starts a new command after the UI explicitly clears the prior command on edit", () => {
    const edited = prepareStableRoomsCommand(null, "changed", () => "request-2");
    expect(edited).toEqual({ requestId: "request-2", payload: "changed" });
  });

  it("rejects a duplicate submission until the in-flight request finishes", () => {
    const pending = { current: false };
    expect(tryStartStableRoomsSubmission(pending)).toBe(true);
    expect(tryStartStableRoomsSubmission(pending)).toBe(false);
    finishStableRoomsSubmission(pending);
    expect(tryStartStableRoomsSubmission(pending)).toBe(true);
  });
});
