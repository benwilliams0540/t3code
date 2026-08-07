// @effect-diagnostics nodeBuiltinImport:off - Temporary files exercise the owner-only secret boundary.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  parseResidentHostConfig,
  readOpenClawGatewayToken,
  readRoomsBearer,
} from "../src/config.ts";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

const valid = (): Readonly<Record<string, unknown>> => ({
  contract: { id: "rooms.resident-agent-host-config", version: 1 },
  connector: { id: "connector:openclaw-local", version: 1, configurationEpoch: 7 },
  rooms: {
    baseUrl: "http://127.0.0.1:3000",
    bearerTokenFile: "/run/user/1000/rooms-bearer",
    roomId: "room:019fbf3b-8742-7fc2-b021-543a8cf3d379",
    channelId: "channel:019fbf45-d4df-78c3-8554-f5432c37a3c0",
    agentPrincipalId: "a:019fc9d0-0000-7000-8000-000000000003",
    hostMachinePrincipalId: "m:019fc9d0-0000-7000-8000-000000000004",
  },
  nativeT3: { environmentId: "native", projectId: "project", threadId: "thread" },
  openClaw: {
    gatewayUrl: "ws://127.0.0.1:18789",
    configFile: "/home/monroe/.openclaw/openclaw.json",
    hostId: "4362e7bb-7d83-4f0a-aa81-d44dbfae360a",
    agentId: "main",
  },
  stateDirectory: "/home/monroe/.local/state/rooms-claw",
  delivery: { initialCursor: 40, timeoutMs: 25_000, retryDelayMs: 1_000 },
});

describe("resident host configuration", () => {
  it("accepts HTTPS Shared Rooms while keeping the frozen configuration shape", () => {
    expect(parseResidentHostConfig(valid()).rooms.baseUrl).toBe("http://127.0.0.1:3000");
    const shared = structuredClone(valid());
    (shared.rooms as Record<string, unknown>).baseUrl = "https://rooms.example.test";
    expect(parseResidentHostConfig(shared).rooms.baseUrl).toBe("https://rooms.example.test");
    expect(() => parseResidentHostConfig({ ...valid(), extra: true })).toThrowError(/frozen/u);
    for (const baseUrl of [
      "http://100.108.246.98:3000",
      "https://user:secret@rooms.example.test",
      "https://rooms.example.test/nested",
      "https://rooms.example.test?token=secret",
      "https://rooms.example.test#fragment",
      "//rooms.example.test",
    ]) {
      const invalid = structuredClone(valid());
      (invalid.rooms as Record<string, unknown>).baseUrl = baseUrl;
      expect(() => parseResidentHostConfig(invalid)).toThrowError(/HTTPS|loopback/u);
    }

    const remoteGateway = structuredClone(shared);
    (remoteGateway.openClaw as Record<string, unknown>).gatewayUrl = "wss://gateway.example.test";
    expect(() => parseResidentHostConfig(remoteGateway)).toThrowError(/loopback/u);
  });

  it("reads both secrets only from regular owner mode-0600 files", () => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "rooms-host-secrets-"));
    directories.push(directory);
    const rooms = NodePath.join(directory, "rooms.secret");
    const claw = NodePath.join(directory, "openclaw.json");
    NodeFS.writeFileSync(rooms, "rooms-bearer-value-long-enough", { mode: 0o600 });
    NodeFS.writeFileSync(
      claw,
      JSON.stringify({ gateway: { auth: { token: "openclaw-token-long-enough" } } }),
      { mode: 0o600 },
    );
    expect(readRoomsBearer(rooms)).toBe("rooms-bearer-value-long-enough");
    expect(readOpenClawGatewayToken(claw)).toBe("openclaw-token-long-enough");

    NodeFS.chmodSync(rooms, 0o640);
    expect(() => readRoomsBearer(rooms)).toThrowError(/mode-0600/u);
  });
});
