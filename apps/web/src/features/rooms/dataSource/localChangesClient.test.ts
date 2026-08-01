import type { RoomsLocalHttpRequest, RoomsLocalHttpResponse } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import advancedDocument from "./fixtures/local-changes-v1-advanced.json";
import cursorAheadDocument from "./fixtures/local-changes-v1-cursor-ahead.json";
import timeoutDocument from "./fixtures/local-changes-v1-timeout.json";
import { createRoomsLocalChannelsClient, type RoomsLocalTransport } from "./localChannelsClient";

function response(status: number, body: unknown): RoomsLocalHttpResponse {
  return { status, headers: {}, body: JSON.stringify(body) };
}

function transportFor(
  result: RoomsLocalHttpResponse | Error,
  requests: RoomsLocalHttpRequest[],
): RoomsLocalTransport {
  return {
    request: async (request) => {
      requests.push(request);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe("rooms.local-changes v1 client", () => {
  it("encodes the exact bounded wait query on the one-shot GET transport", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:33101", () =>
      transportFor(response(200, advancedDocument), requests),
    );
    await expect(
      client.waitForChanges(advancedDocument.room_id, { afterSeq: 42, timeoutMs: 25_000 }),
    ).resolves.toMatchObject({ changed: true, head_seq: 43 });
    expect(requests).toEqual([
      {
        baseUrl: "http://127.0.0.1:33101",
        path: `/rooms/${encodeURIComponent(advancedDocument.room_id)}/changes?after_seq=42&timeout_ms=25000`,
        method: "GET",
      },
    ]);
  });

  it("accepts an ordinary timeout and the default 25-second wait", async () => {
    const requests: RoomsLocalHttpRequest[] = [];
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:33101", () =>
      transportFor(response(200, timeoutDocument), requests),
    );
    await expect(
      client.waitForChanges(timeoutDocument.room_id, { afterSeq: 42 }),
    ).resolves.toMatchObject({ changed: false, reason: "timeout" });
    expect(requests[0]?.path).toContain("after_seq=42&timeout_ms=25000");
  });

  it("preserves both cursors from a 409 change_cursor_ahead response", async () => {
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:33101", () =>
      transportFor(response(409, cursorAheadDocument), []),
    );
    await expect(
      client.waitForChanges(advancedDocument.room_id, { afterSeq: 44 }),
    ).rejects.toMatchObject({
      kind: "server",
      status: 409,
      code: "change_cursor_ahead",
      afterSeq: 44,
      headSeq: 43,
    });
  });

  it.each([
    [{ ...advancedDocument, room_id: "room:wrong" }, "change_contract_invariant_failed"],
    [{ ...advancedDocument, head_seq: 42 }, "change_contract_invariant_failed"],
    [{ ...advancedDocument, changed: false }, "contract_decode_failed"],
  ] as const)("rejects malformed or contradictory success payloads", async (body, code) => {
    const client = createRoomsLocalChannelsClient("http://127.0.0.1:33101", () =>
      transportFor(response(200, body), []),
    );
    await expect(
      client.waitForChanges(advancedDocument.room_id, { afterSeq: 42 }),
    ).rejects.toMatchObject({ kind: "invalid_response", code });
  });

  it("distinguishes retryable 503 and transport failures", async () => {
    const cancelled = createRoomsLocalChannelsClient("http://127.0.0.1:33101", () =>
      transportFor(
        response(503, {
          error: "local_change_wait_cancelled",
          message: "Server is restarting.",
        }),
        [],
      ),
    );
    await expect(
      cancelled.waitForChanges(advancedDocument.room_id, { afterSeq: 42 }),
    ).rejects.toMatchObject({ kind: "server", status: 503, code: "local_change_wait_cancelled" });

    const unreachable = createRoomsLocalChannelsClient("http://127.0.0.1:33101", () =>
      transportFor(new Error("connection refused"), []),
    );
    await expect(
      unreachable.waitForChanges(advancedDocument.room_id, { afterSeq: 42 }),
    ).rejects.toMatchObject({ kind: "transport", code: "local_api_unreachable" });
  });
});
