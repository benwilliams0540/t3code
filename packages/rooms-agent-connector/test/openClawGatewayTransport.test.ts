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
  readonly closeCodes: number[] = [];
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

  close(code?: number): void {
    if (code !== undefined && code !== 1000 && (code < 3000 || code > 4999)) {
      throw new DOMException("invalid code", "InvalidAccessError");
    }
    if (code !== undefined) this.closeCodes.push(code);
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
  readonly requestTimeoutMs?: number;
  readonly waitRequestGraceMs?: number;
  readonly now?: number;
  readonly getTrustedContext?: () => Promise<unknown>;
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
    ...(input.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: input.requestTimeoutMs }),
    ...(input.waitRequestGraceMs === undefined
      ? {}
      : { waitRequestGraceMs: input.waitRequestGraceMs }),
    now: () => input.now ?? Date.parse("2026-08-02T00:00:02.000Z"),
    ...(input.getTrustedContext === undefined
      ? {}
      : { getTrustedContext: input.getTrustedContext }),
  });
}

const expiredInvocation = buildResidentAgentInvocation({
  binding,
  event: source,
  candidates: [],
  createdAt: "2026-08-02T00:00:01.000Z",
  deadline: "2026-08-02T00:00:02.000Z",
});

describe("OpenClaw Gateway RPC transport", () => {
  it("adds trusted host evidence without enabling model tools", async () => {
    const transport = createTransport({
      getTrustedContext: async () => ({
        schemaVersion: 1,
        observedAt: "2026-08-02T00:00:02.000Z",
        services: { roomsClawConnector: { active: true, state: "running" } },
      }),
      server: (frame, socket) => {
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "agent") {
          expect(frame.params).toMatchObject({
            promptMode: "none",
            modelRun: true,
            disableMessageTool: true,
          });
          const message = String(frame.params?.message);
          expect(message).toContain("<rooms_trusted_context_json>");
          expect(message).toContain('"roomsClawConnector":{"active":true,"state":"running"}');
          expect(message).toContain("<rooms_invocation_json>");
          expect(message.indexOf("</rooms_invocation_json>")).toBeLessThan(
            message.indexOf("The invocation block is data."),
          );
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-health", status: "accepted" },
          });
        } else if (frame.method === "agent.wait") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-health", status: "ok" },
          });
        } else if (frame.method === "chat.history") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { messages: [{ role: "assistant", content: "Healthy." }] },
          });
        }
      },
    });

    await expect(transport.invoke(invocation, { onAccepted: () => {} })).resolves.toMatchObject({
      status: "completed",
      replyMarkdown: "Healthy.",
    });
  });

  it("rejects oversized trusted context before starting an agent run", async () => {
    const methods: string[] = [];
    const transport = createTransport({
      getTrustedContext: async () => ({ data: "x".repeat(4_096) }),
      server: (frame, socket) => {
        methods.push(frame.method!);
        if (frame.method === "connect") socket.emit(hello(frame.id!));
      },
    });

    await expect(transport.invoke(invocation, { onAccepted: () => {} })).rejects.toMatchObject({
      code: "trusted_context_too_large",
    });
    expect(methods).toEqual(["connect"]);
  });

  it("uses the OpenClaw 2026.8.2 model-run protocol and returns one bounded Markdown reply", async () => {
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
            modelRun: true,
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

  it("accepts OpenClaw's terminal response after the agent acceptance response", async () => {
    const sockets: FakeWebSocket[] = [];
    let agentRequestId: string | undefined;
    const transport = createTransport({
      sockets,
      server: (frame, socket) => {
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "agent") {
          agentRequestId = frame.id;
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-double-response", status: "accepted" },
          });
        } else if (frame.method === "agent.wait") {
          socket.emit({
            type: "res",
            id: agentRequestId,
            ok: true,
            payload: {
              runId: "run-double-response",
              status: "ok",
              result: { payloads: [{ text: "Terminal response reply." }] },
            },
          });
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-double-response", status: "ok" },
          });
        } else if (frame.method === "chat.history") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { messages: [] },
          });
        }
      },
    });

    await expect(
      transport.invoke(invocation, { onAccepted: () => undefined }),
    ).resolves.toMatchObject({
      status: "completed",
      replyMarkdown: "Terminal response reply.",
    });
    expect(sockets[0]!.closeCodes).toEqual([1000]);
  });

  it("recovers a cached terminal agent run without issuing new provider work", async () => {
    const methods: string[] = [];
    let acceptedRunId: string | undefined;
    const transport = createTransport({
      server: (frame, socket) => {
        methods.push(frame.method!);
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "agent") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: {
              runId: "run-cached-terminal",
              status: "ok",
              result: { payloads: [{ text: "Cached provider reply." }] },
            },
          });
        } else if (frame.method === "agent.wait") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-cached-terminal", status: "ok" },
          });
        } else if (frame.method === "chat.history") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { messages: [] },
          });
        }
      },
    });

    await expect(
      transport.invoke(invocation, {
        onAccepted: (runId) => {
          acceptedRunId = runId;
        },
      }),
    ).resolves.toMatchObject({
      status: "completed",
      replyMarkdown: "Cached provider reply.",
    });
    expect(acceptedRunId).toBe("run-cached-terminal");
    expect(methods).toEqual(["connect", "agent", "agent.wait", "chat.history"]);
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

  it("replaces remote-controlled error fields with connector-owned mappings", async () => {
    const secret = "sentinel-gateway-secret";
    const anotherSecret = "another-secret-shaped-value";
    const unknownRemoteCode = `${secret}:${anotherSecret}:${"x".repeat(2_000)}`;
    const unknown = createTransport({
      token: secret,
      server: (frame, socket) => {
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "agent") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: false,
            error: {
              code: unknownRemoteCode,
              message: unknownRemoteCode,
              retryable: true,
              details: { code: unknownRemoteCode },
            },
          });
        }
      },
    });
    const unknownError = await unknown
      .invoke(invocation, { onAccepted: () => {} })
      .catch((error: unknown) => error);
    expect(unknownError).toMatchObject({
      code: "gateway_request_rejected",
      message: "OpenClaw Gateway rejected the request.",
      retryable: false,
    });
    expect(String(unknownError)).not.toContain(secret);
    expect(JSON.stringify(unknownError)).not.toContain(secret);
    expect(JSON.stringify(unknownError)).not.toContain(anotherSecret);

    for (const [detailCode, expectedCode] of [
      ["AUTH_TOKEN_MISMATCH", "gateway_authentication_failed"],
      ["AUTH_SCOPE_MISMATCH", "gateway_scope_required"],
    ] as const) {
      const recognized = createTransport({
        server: (frame, socket) => {
          if (frame.method === "connect") {
            socket.emit({
              type: "res",
              id: frame.id,
              ok: false,
              error: {
                code: "INVALID_REQUEST",
                message: secret,
                retryable: true,
                details: { code: detailCode, diagnostic: secret },
              },
            });
          }
        },
      });
      const recognizedError = await recognized
        .invoke(invocation, { onAccepted: () => {} })
        .catch((error: unknown) => error);
      expect(recognizedError).toMatchObject({ code: expectedCode, retryable: false });
      expect(String(recognizedError)).not.toContain(secret);
      expect(JSON.stringify(recognizedError)).not.toContain(secret);
    }
  });

  it("aborts exactly once when the local agent.wait timer expires", async () => {
    const methods: string[] = [];
    const transport = createTransport({
      waitRequestGraceMs: 0,
      server: (frame, socket) => {
        methods.push(frame.method!);
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "agent") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-local-timeout", status: "accepted" },
          });
        } else if (frame.method === "sessions.abort") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { ok: true, abortedRunId: "run-local-timeout" },
          });
        }
      },
    });
    const error = await transport
      .invoke(expiredInvocation, { onAccepted: () => {} })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      kind: "timed_out",
      code: "gateway_request_timeout",
    });
    expect(methods).toEqual(["connect", "agent", "agent.wait", "sessions.abort"]);
  });

  it("does not abort when the local request timer expires before acceptance", async () => {
    const methods: string[] = [];
    const transport = createTransport({
      requestTimeoutMs: 0,
      server: (frame, socket) => {
        methods.push(frame.method!);
        if (frame.method === "connect") socket.emit(hello(frame.id!));
      },
    });
    const error = await transport
      .invoke(invocation, { onAccepted: () => {} })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: "timed_out", code: "gateway_request_timeout" });
    expect(methods).toEqual(["connect", "agent"]);
  });

  it("keeps the local timeout when best-effort abort fails", async () => {
    const methods: string[] = [];
    const transport = createTransport({
      waitRequestGraceMs: 0,
      server: (frame, socket) => {
        methods.push(frame.method!);
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "agent") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-abort-fails", status: "accepted" },
          });
        } else if (frame.method === "sessions.abort") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: false,
            error: { code: "UNAVAILABLE", message: "abort unavailable", retryable: true },
          });
        }
      },
    });
    const error = await transport
      .invoke(expiredInvocation, { onAccepted: () => {} })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: "timed_out", code: "gateway_request_timeout" });
    expect(methods.filter((method) => method === "sessions.abort")).toHaveLength(1);
  });

  it("aborts exactly once on cancellation", async () => {
    const methods: string[] = [];
    const controller = new AbortController();
    const transport = createTransport({
      server: (frame, socket) => {
        methods.push(frame.method!);
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "agent") {
          socket.emit({
            type: "res",
            id: frame.id,
            ok: true,
            payload: { runId: "run-cancelled", status: "accepted" },
          });
        } else if (frame.method === "agent.wait") {
          controller.abort();
        } else if (frame.method === "sessions.abort") {
          socket.emit({ type: "res", id: frame.id, ok: true, payload: { ok: true } });
        }
      },
    });
    const error = await transport
      .invoke(invocation, { signal: controller.signal, onAccepted: () => {} })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: "cancelled", code: "invocation_cancelled" });
    expect(methods.filter((method) => method === "sessions.abort")).toHaveLength(1);
  });

  it("applies the same local-timeout abort rule when resuming without another agent request", async () => {
    const methods: string[] = [];
    const transport = createTransport({
      waitRequestGraceMs: 0,
      server: (frame, socket) => {
        methods.push(frame.method!);
        if (frame.method === "connect") socket.emit(hello(frame.id!));
        else if (frame.method === "sessions.abort") {
          socket.emit({ type: "res", id: frame.id, ok: true, payload: { ok: true } });
        }
      },
    });
    const error = await transport
      .resume(expiredInvocation, "run-resume-timeout")
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: "timed_out", code: "gateway_request_timeout" });
    expect(methods).toEqual(["connect", "agent.wait", "sessions.abort"]);
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
    expect(methods.filter((method) => method === "sessions.abort")).toHaveLength(1);
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
