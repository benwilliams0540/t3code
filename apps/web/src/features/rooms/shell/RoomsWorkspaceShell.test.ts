import { describe, expect, it } from "vite-plus/test";

import type { RoomsLocalSourceFailure, RoomsLocalSourceFailureStatus } from "../dataSource";
import { localSourceStateCopy } from "./localSourceStateCopy";

function state(status: RoomsLocalSourceFailureStatus): RoomsLocalSourceFailure {
  return {
    mode: "local",
    status,
    rooms: [],
    error:
      status === "connecting"
        ? null
        : { code: `test_${status}`, message: `Message for ${status}`, httpStatus: 403 },
  };
}

describe("Rooms Local source presentation", () => {
  it("provides distinct copy for every required source state", () => {
    const statuses = [
      "connecting",
      "disabled",
      "uninitialized",
      "unavailable-outside-development",
      "invalid-bootstrap",
      "authorization-failure",
      "invalid-configuration",
      "error",
    ] as const satisfies readonly RoomsLocalSourceFailureStatus[];
    const titles = statuses.map((status) => localSourceStateCopy(state(status)).title);
    expect(new Set(titles).size).toBe(statuses.length);
    expect(localSourceStateCopy(state("connecting")).canRetry).toBe(false);
    expect(localSourceStateCopy(state("disabled")).canRetry).toBe(true);
    expect(localSourceStateCopy(state("invalid-configuration")).canRetry).toBe(false);
  });
});
