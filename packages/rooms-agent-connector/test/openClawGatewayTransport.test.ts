// @effect-diagnostics globalDate:off globalTimers:off - Fake socket events are queued without network or wall-clock waits.
import { describe, expect, it } from "vite-plus/test";

import { buildResidentAgentInvocation } from "../src/contextEnvelope.ts";
import type { ConnectorBinding, InboundChannelEvent } from "../src/contracts.ts";
import {
  OpenClawGatewayTransport,
  type WebSocketFactory,
  type WebSocketLike,
} from "../src/openClawGatewayTransport.ts";

interface Frame {
  readonly type: string;
  readonly id?: string;
  readonly method?: string;
  readonly params?: Readonly<Record<string, unknown>>;
}

type ServerHandler = (frame: Frame, socket: FakeWebSocket) => void;

class FakeWebSocket implements WebSocketLike {
  readyState = 1;
  readonly url: string;
  readonly sent: Frame[] = [];
  readonly #listeners = new Map<string, Set<(event: { readonly data?: unknown }) => void>>();
  readonly #server: ServerHandler;

  constructor(url: string, server: ServerHandler) {
    this.url = url;
    this.#server = server;
    queueMicrotask(() => {
      this.emit({
        type: "event",
        event: "connect.challenge",
        payload: { nonce: "challenge-nonce", ts: 1 },
      });
    });
  }

  send(data: string): void {
    const frame = JSON.parse(data) as Frame;
    this.sent.push(frame);
    this.#server(frame, this);
  }

  close(): void {
    this.readyState = 3;
  }

  addEventListener(type: string, listener: (event: { readonly data?: unknown }) => void): void {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: { readonly data?: unknown }) => void): void {
    this.#listeners.get(type)?.delete(listener);
  }

  emit(frame: unknown): void {
    const event = { data: JSON.stringify(frame) };
    for (const listener of this.#listeners.get("message") ?? []) listener(event);
  }

  emitRaw(data: unknown): void {
    for (const listener of this.#listeners.get("message") ?? []) listener({ data });
  }
}

function hello(
  id: string,
  methods = ["agent", "agent.wait", "chat.history", "sessions.abort"],
): unknown {
  return {
    type: "res",
    id,
    ok: true,
    payload: {
      type: "hello-ok",
      protocol: 4,
      server: { version: "2026.7.1-2", connId: "conn-1" },
      features: { methods, events: ["agent"] },
      snapshot: {},
      auth: { role: "operator", scopes: ["operator.read", "operator.write"] },
      policy: { maxPayload: 262144, maxBufferedBytes: 524288, tickIntervalMs: 15000 },
    },
  };
}

const binding: ConnectorBinding = {
  connectorId: "connector:openclaw-local",
  connectorVersion: 1,
  roomId: "room:local",
  channelId: "channel:allowed",
  agentPrincipalId: "a:claw-local",
  openClawHostId: "host:local",
  openClawAgentId: "rooms",
  enabled: true,
  configVersion: 1,
};

const source: InboundChannelEvent = {
  contract: { id: "rooms.resident-agent-inbound", version: 1 },
  connectorId: binding.connectorId,
  roomId: binding.roomId,
  channelId: binding.channelId,
  sourceMessageId: "message:100",
  sourceSequence: 100,
  authorPrincipalId: "h:monroe",
  mentioned: true,
  bodyMarkdown: "@Claw reply from bounded context.",
  attachments: [],
  links: [],
  occurredAt: "2026-08-02T00:00:00.000Z",
  traceId: "trace:100",
};

const invocation = buildResidentAgentInvocation({
  binding,
  event: source,
  candidates: [],
  createdAt: "2026-08-02T00:00:01.000Z",
  deadline: "2026-08-02T00:02:01.000Z",
});

function createTransport(input: {
  readonly server: ServerHandler;
  readonly token?: string;
  readonly sockets?: FakeWebSocket[];
}): OpenClawGatewayTransport {
  const socketFactory: WebSocketFactory = (url) => {
    const socket = new FakeWebSocket(url, input.server);
    input.sockets?.push(socket);
    return socket;
  };
  return new OpenClawGatewayTransport({
    url: "ws://127.0.0.1:18789",
    getToken: async () => input.token ?? "gateway-secret",
    hostId: "host:local",
    agentId: "rooms",
    socketFactory,
    clientVersion: "test-1",
    now: () => Date.parse("2026-08-02T00:00:02.000Z"),
  });
}

describe("OpenClaw Gateway RPC transport", () => {
  it("uses protocol v4 agent/wait/history and returns one bounded Markdown reply", async () => {
    const sockets: FakeWebSocket[] = [];
    let acceptedRunId: string | undefined;
    const transport = createTransport({
      sockets,
      token: "sentinel-gateway-secret",
      server: (frame, socket) => {
        if (frame.method === "connect") {
          socket.emit(hello(frame.id!));
        } else if (frame.method === "agent") {
          expect(frame.params).toMatchObject({
            agentId: "rooms",
            deliver: false,
            promptMode: "none",
            disableMessageTool: true,
            idempotencyKey: invocation.invocationId,
          });
          expect(JSON.stringify(frame.params)).not.toContain("agentPrincipalId");
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-1", status: "accepted", acceptedAt: 1 },
          });
        } else if (frame.method === "agent.wait") {
          socket.emit({
            type: "event",
            event: "agent",
            payload: {
              runId: "run-1",
              seq: 1,
              stream: "assistant",
              ts: 1,
              data: { text: "Streamed reply." },
            },
          });
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-1", status: "ok" },
          });
        } else if (frame.method === "chat.history") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              messages: [
                { role: "assistant", content: [{ type: "text", text: "Final **reply**." }] },
              ],
            },
          });
        }
      },
    });

    const result = await transport.invoke(invocation, {
      onAccepted: (runId) => {
        acceptedRunId = runId;
      },
    });
    expect(acceptedRunId).toBe("run-1");
    expect(result).toEqual({
      status: "completed",
      replyMarkdown: "Final **reply**.",
      agentVersion: "2026.7.1-2",
    });
    const sent = sockets[0]!.sent;
    expect(sent.map((frame) => frame.method)).toEqual([
      "connect",
      "agent",
      "agent.wait",
      "chat.history",
    ]);
    expect((sent[0]!.params!.auth as { token: string }).token).toBe("sentinel-gateway-secret");
    expect(JSON.stringify(sent.slice(1))).not.toContain("sentinel-gateway-secret");
    expect(JSON.stringify(result)).not.toContain("sentinel-gateway-secret");
    expect(sockets[0]!.url).toBe("ws://127.0.0.1:18789");
  });

  it("resumes an accepted run without issuing another agent request", async () => {
    const methods: string[] = [];
    const transport = createTransport({
      server: (frame, socket) => {
        methods.push(frame.method!);
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "agent.wait") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-existing", status: "ok" },
          });
        } else if (frame.method === "chat.history") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { messages: [{ role: "assistant", content: "Recovered reply." }] },
          });
        }
      },
    });
    await expect(transport.resume(invocation, "run-existing")).resolves.toMatchObject({
      status: "completed",
      replyMarkdown: "Recovered reply.",
    });
    expect(methods).toEqual(["connect", "agent.wait", "chat.history"]);
  });

  it("maps Gateway timeout and aborts the accepted run", async () => {
    const methods: string[] = [];
    const transport = createTransport({
      server: (frame, socket) => {
        methods.push(frame.method!);
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "agent") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-timeout", status: "accepted" },
          });
        } else if (frame.method === "agent.wait") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-timeout", status: "timeout" },
          });
        } else if (frame.method === "sessions.abort") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { ok: true, abortedRunId: "run-timeout" },
          });
        }
      },
    });
    const result = await transport.invoke(invocation, { onAccepted: () => {} });
    expect(result).toMatchObject({ status: "timed_out", failure: { code: "agent_timed_out" } });
    expect(methods).toEqual(["connect", "agent", "agent.wait", "sessions.abort"]);
  });

  it("rejects remote or credential-bearing Gateway URLs before creating a socket", () => {
    for (const url of [
      "ws://100.108.246.98:18789",
      "wss://127.0.0.1:18789",
      "ws://user@127.0.0.1:18789",
      "ws://127.0.0.1:18789/path",
      "ws://127.0.0.1:18789?token=secret",
    ]) {
      expect(
        () =>
          new OpenClawGatewayTransport({
            url,
            getToken: async () => "secret",
            hostId: "host:local",
            agentId: "rooms",
            socketFactory: () => {
              throw new Error("socket must not be created");
            },
          }),
      ).toThrow("loopback WebSocket origin");
    }
  });

  it("fails closed when required methods or response correlation are wrong", async () => {
    const missingMethod = createTransport({
      server: (frame, socket) => {
        if (frame.method === "connect") socket.emit(hello(frame.id!, ["agent", "agent.wait"]));
      },
    });
    await expect(missingMethod.health()).resolves.toEqual({
      available: false,
      safeMessage: "OpenClaw Gateway is unavailable.",
    });

    const wrongId = createTransport({
      server: (frame, socket) => {
        if (frame.method === "connect") socket.emit(hello("not-the-request-id"));
      },
    });
    await expect(wrongId.invoke(invocation, { onAccepted: () => {} })).rejects.toMatchObject({
      code: "gateway_response_id_mismatch",
    });

    const wrongTarget = {
      ...invocation,
      connector: {
        ...invocation.connector,
        target: { ...invocation.connector.target, agentId: "other-agent" },
      },
    };
    await expect(
      createTransport({ server: () => {} }).invoke(wrongTarget, { onAccepted: () => {} }),
    ).rejects.toMatchObject({ code: "gateway_target_mismatch" });

    const wrongRun = createTransport({
      server: (frame, socket) => {
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "agent") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-expected", status: "accepted" },
          });
        } else if (frame.method === "agent.wait") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-other", status: "ok" },
          });
        }
      },
    });
    await expect(wrongRun.invoke(invocation, { onAccepted: () => {} })).rejects.toMatchObject({
      code: "gateway_wait_invalid",
    });
  });

  it("rejects binary frames and oversized replies without leaking the Gateway credential", async () => {
    const secret = "sentinel-do-not-leak";
    let socketRef: FakeWebSocket | undefined;
    const binary = createTransport({
      token: secret,
      sockets: [],
      server: (frame, socket) => {
        socketRef = socket;
        if (frame.method === "connect") socket.emitRaw(new Uint8Array([1, 2, 3]));
      },
    });
    const binaryError = await binary
      .invoke(invocation, { onAccepted: () => {} })
      .catch((error: unknown) => error);
    expect(binaryError).toMatchObject({ code: "gateway_binary_frame_rejected" });
    expect(String(binaryError)).not.toContain(secret);
    expect(socketRef?.readyState).toBe(3);

    const oversized = createTransport({
      token: secret,
      server: (frame, socket) => {
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "agent") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-large", status: "accepted" },
          });
        } else if (frame.method === "agent.wait") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-large", status: "ok" },
          });
        } else if (frame.method === "chat.history") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { messages: [{ role: "assistant", content: "x".repeat(20_000) }] },
          });
        }
      },
    });
    const largeError = await oversized
      .invoke(invocation, { onAccepted: () => {} })
      .catch((error: unknown) => error);
    expect(largeError).toMatchObject({ code: "agent_reply_too_large" });
    expect(String(largeError)).not.toContain(secret);
  });
});
