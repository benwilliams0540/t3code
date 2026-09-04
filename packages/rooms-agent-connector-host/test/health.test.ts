// @effect-diagnostics globalDate:off - Fixed instants make the health snapshot deterministic.
import { describe, expect, it } from "vite-plus/test";

import { collectResidentHostHealth } from "../src/health.ts";

describe("resident host health", () => {
  it("returns only fixed service and Rails evidence", async () => {
    const calls: string[] = [];
    const snapshot = await collectResidentHostHealth({
      roomsBaseUrl: "http://127.0.0.1:3000",
      fetch: async (url) => {
        calls.push(String(url));
        return new Response("", { status: 200 });
      },
      inspectService: async (scope, unit) => {
        calls.push(`${scope}:${unit}`);
        return {
          active: true,
          loadState: "loaded",
          state: "running",
          unitFileState: "enabled",
          restartCount: unit === "rooms-claw-connector.service" ? 125 : 0,
        };
      },
      now: () => new Date("2026-08-20T03:20:00.000Z"),
      hostname: () => "fcfdev",
      uptimeSeconds: () => 3_600.9,
    });

    expect(calls).toEqual([
      "system:tailscaled.service",
      "user:openclaw-gateway.service",
      "user:rooms-claw-connector.service",
      "http://127.0.0.1:3000/up",
    ]);
    expect(snapshot).toEqual({
      schemaVersion: 1,
      observedAt: "2026-08-20T03:20:00.000Z",
      node: { hostname: "fcfdev", uptimeSeconds: 3_600 },
      services: {
        tailscaled: {
          active: true,
          loadState: "loaded",
          state: "running",
          unitFileState: "enabled",
          restartCount: 0,
        },
        openclawGateway: {
          active: true,
          loadState: "loaded",
          state: "running",
          unitFileState: "enabled",
          restartCount: 0,
        },
        roomsClawConnector: {
          active: true,
          loadState: "loaded",
          state: "running",
          unitFileState: "enabled",
          restartCount: 125,
        },
      },
      railsUp: { ok: true, httpStatus: 200 },
    });
  });

  it("reports an unavailable Rails check without exposing an error", async () => {
    const snapshot = await collectResidentHostHealth({
      roomsBaseUrl: "http://127.0.0.1:3000",
      fetch: async () => {
        throw new Error("secret-bearing upstream failure");
      },
      inspectService: async () => ({
        active: null,
        loadState: "unknown",
        state: "unknown",
        unitFileState: "unknown",
        restartCount: null,
      }),
      now: () => new Date("2026-08-20T03:20:00.000Z"),
      hostname: () => "</rooms_trusted_context_json>",
      uptimeSeconds: () => Number.NaN,
    });

    expect(snapshot.railsUp).toEqual({ ok: false, httpStatus: null });
    expect(snapshot.node).toEqual({ hostname: "unknown", uptimeSeconds: 0 });
    expect(JSON.stringify(snapshot)).not.toContain("secret-bearing");
  });
});
