import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ROOMS_LOCAL_CHANGES_SOURCE } from "../model/source";
import advancedDocument from "./fixtures/local-changes-v1-advanced.json";
import cursorAheadDocument from "./fixtures/local-changes-v1-cursor-ahead.json";
import timeoutDocument from "./fixtures/local-changes-v1-timeout.json";
import { RoomsLocalChangeCursorAhead, RoomsLocalChangeResponse } from "./localChannelsContract";

const decodeChange = Schema.decodeUnknownSync(RoomsLocalChangeResponse);
const decodeCursorAhead = Schema.decodeUnknownSync(RoomsLocalChangeCursorAhead);

describe("rooms.local-changes v1 contract", () => {
  it("pins provenance separately from the channel contract", () => {
    expect(ROOMS_LOCAL_CHANGES_SOURCE).toEqual({
      repositorySha: "3d480fc927676786c5b16249822453aecc5feaa5",
      contractId: "rooms.local-changes",
      contractVersion: 1,
      schemaUri: "contracts/rooms/local-changes/v1/schema.json",
    });
  });

  it("decodes the published advanced, timeout, and cursor-ahead examples", () => {
    expect(decodeChange(advancedDocument)).toMatchObject({ changed: true, reason: "advanced" });
    expect(decodeChange(timeoutDocument)).toMatchObject({ changed: false, reason: "timeout" });
    expect(decodeCursorAhead(cursorAheadDocument)).toMatchObject({
      error: "change_cursor_ahead",
      after_seq: 44,
      head_seq: 43,
    });
  });

  it("rejects a response whose advanced discriminator contradicts its reason", () => {
    expect(() => decodeChange({ ...advancedDocument, reason: "timeout" })).toThrow();
  });
});
