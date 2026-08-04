// @effect-diagnostics nodeBuiltinImport:off - Temporary state exercises crash and restart cursor semantics.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "vite-plus/test";

import type { ResidentHostConfig } from "../src/config.ts";
import { DeliveryCursorStore } from "../src/cursorStore.ts";
import { parseAgentDeliveryPage, type AgentDeliveryPage } from "../src/deliveryClient.ts";
import { processDeliveryPage } from "../src/host.ts";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

const config = (): ResidentHostConfig => ({
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

const page = (): AgentDeliveryPage =>
  parseAgentDeliveryPage({
    contract: {
      id: "rooms.agent-deliveries",
      version: 1,
      schema_uri: "contracts/rooms/agent-deliveries/v1/schema.json",
    },
    binding: {
      room_id: config().rooms.roomId,
      agent_principal_id: config().rooms.agentPrincipalId,
      host_machine_principal_id: config().rooms.hostMachinePrincipalId,
      profile: "read_write",
    },
    page: {
      after_seq: 40,
      next_cursor: 43,
      source_head_seq: 43,
      has_more: false,
      reason: "advanced",
    },
    deliveries: [
      {
        source_message_id: "019fc9d0-0000-7000-8000-000000000011",
        source_sequence: 41,
        trace_id: "rooms-message:019fc9d0-0000-7000-8000-000000000011",
        room_id: config().rooms.roomId,
        channel_id: config().rooms.channelId,
        author: {
          principal_id: "h:019fc9d0-0000-7000-8000-000000000021",
          principal_type: "human",
          display_name: "Monroe",
        },
        mentioned_agent: false,
        occurred_at: "2026-08-03T12:00:00.000Z",
        body_markdown: "ordinary control",
        attachments: [],
        links: [],
      },
      {
        source_message_id: "019fc9d0-0000-7000-8000-000000000012",
        source_sequence: 42,
        trace_id: "rooms-message:019fc9d0-0000-7000-8000-000000000012",
        room_id: config().rooms.roomId,
        channel_id: "channel:019fbf9c-ce85-7a35-8d85-c00bf7bb4033",
        author: {
          principal_id: "h:019fc9d0-0000-7000-8000-000000000021",
          principal_type: "human",
          display_name: "Monroe",
        },
        mentioned_agent: true,
        occurred_at: "2026-08-03T12:00:01.000Z",
        body_markdown: "@Claw outside allow-list",
        attachments: [],
        links: [],
      },
      {
        source_message_id: "019fc9d0-0000-7000-8000-000000000013",
        source_sequence: 43,
        trace_id: "rooms-message:019fc9d0-0000-7000-8000-000000000013",
        room_id: config().rooms.roomId,
        channel_id: config().rooms.channelId,
        author: {
          principal_id: "h:019fc9d0-0000-7000-8000-000000000021",
          principal_type: "human",
          display_name: "Monroe",
        },
        mentioned_agent: true,
        occurred_at: "2026-08-03T12:00:02.000Z",
        body_markdown: "@Claw reply once",
        attachments: [],
        links: [],
      },
    ],
  });

describe("resident delivery page processing", () => {
  it("handles the allow-listed channel sequentially and ignores every other channel", async () => {
    const observed: Array<{ readonly mentioned: boolean; readonly source: string }> = [];
    const handled = await processDeliveryPage({
      config: config(),
      page: page(),
      expectedCursor: 40,
      consumer: {
        handleInbound: async ({ event }) => {
          observed.push({ mentioned: event.mentioned, source: event.sourceMessageId });
          return event.mentioned
            ? {
                kind: "server_terminal" as const,
                invocation: {} as never,
              }
            : {
                kind: "ignored" as const,
                connector: { kind: "recorded_non_mention" as const },
              };
        },
      },
    });

    expect(observed).toEqual([
      { mentioned: false, source: "019fc9d0-0000-7000-8000-000000000011" },
      { mentioned: true, source: "019fc9d0-0000-7000-8000-000000000013" },
    ]);
    expect(handled).toEqual({ nextCursor: 43, delivered: 2, ignored: 1 });
  });

  it("does not checkpoint a partially handled page and replays it after restart", async () => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "rooms-host-crash-"));
    directories.push(directory);
    const path = NodePath.join(directory, "cursor.sqlite");
    const cursor = new DeliveryCursorStore(path);
    cursor.initialize(40);
    let calls = 0;
    await expect(
      processDeliveryPage({
        config: config(),
        page: page(),
        expectedCursor: 40,
        consumer: {
          handleInbound: async () => {
            calls += 1;
            if (calls === 2) throw new Error("simulated crash");
            return {
              kind: "ignored" as const,
              connector: { kind: "recorded_non_mention" as const },
            };
          },
        },
      }),
    ).rejects.toThrowError("simulated crash");
    expect(cursor.peek()).toBe(40);
    cursor.close();

    const reopened = new DeliveryCursorStore(path);
    const replayed = await processDeliveryPage({
      config: config(),
      page: page(),
      expectedCursor: reopened.peek()!,
      consumer: {
        handleInbound: async () => ({
          kind: "ignored" as const,
          connector: { kind: "recorded_non_mention" as const },
        }),
      },
    });
    reopened.checkpoint(40, replayed.nextCursor);
    expect(reopened.peek()).toBe(43);
    reopened.close();
  });

  it("fails closed on server-derived identity mismatch", async () => {
    const mismatched = { ...config(), rooms: { ...config().rooms, agentPrincipalId: "a:wrong" } };
    await expect(
      processDeliveryPage({
        config: mismatched,
        page: page(),
        expectedCursor: 40,
        consumer: {
          handleInbound: async () => ({
            kind: "ignored" as const,
            connector: { kind: "recorded_non_mention" as const },
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "delivery_binding_mismatch" });
  });
});
