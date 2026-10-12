// @effect-diagnostics nodeBuiltinImport:off - Producer fixtures pin the actual v2 wire boundary without a server.
import * as NodeFS from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { RoomsInvocationHttpClient } from "../src/roomsServerConsumer.ts";

const fixture = JSON.parse(
  NodeFS.readFileSync(new URL("./fixtures/conversation-runtime-v2.json", import.meta.url), "utf8"),
);
const wire = fixture.start.invocation;
const scope = {
  connectorId: wire.connector.id,
  configurationEpoch: wire.connector.configuration_epoch,
};
const client = (response: unknown, inspect?: (url: string, init?: RequestInit) => void) =>
  new RoomsInvocationHttpClient({
    baseUrl: "http://127.0.0.1:3000",
    bearerToken: "disposable-fixture-bearer",
    fetch: async (input, init) => {
      inspect?.(String(input), init);
      return new Response(JSON.stringify(response), { status: 200 });
    },
  });

describe("service-produced continuing conversation fixtures", () => {
  it("decodes actual binding/start/terminal responses and sends no native IDs", async () => {
    const ready = await client(fixture.binding).reserve({
      ...scope,
      conversationId: wire.conversation_id,
      hostId: wire.runtime_target.host_id,
      agentId: wire.runtime_target.agent_id,
    });
    expect(ready.reference?.sessionId).toBe(fixture.binding.binding.runtime_reference.session_id);
    const started = await client(fixture.start, (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers).not.toHaveProperty("x-rooms-environment-id");
      expect(headers).not.toHaveProperty("x-rooms-project-id");
      expect(headers).not.toHaveProperty("x-rooms-thread-id");
      expect(JSON.parse(String(init?.body))).toEqual({
        binding_id: ready.id,
        channel_id: ready.channelId,
        context_cutoff_seq: 11,
        source_head_seq: 11,
      });
    }).startTurn({
      ...scope,
      bindingId: ready.id,
      channelId: ready.channelId,
      deliveryId: "stable-delivery",
      contextCutoffSequence: 11,
      sourceHeadSequence: 11,
    });
    expect(started.invocation.invokingThread).toBeNull();
    expect(started.invocation.turnState).toBe("ready");
    const settled = await client(fixture.terminal).getTurn(started.invocation.id);
    expect(settled.invocation.status).toBe("succeeded");
    expect(settled.invocation.outbox?.terminalStatus).toBe("succeeded");
  });
  it("reads the service's filtered pinned context with actual message attribution", async () => {
    const start = await client(fixture.start).getTurn(wire.id);
    const messages = await client(fixture.context, (url) => {
      const query = new URL(url).searchParams;
      expect(query.get("context_cutoff_seq")).toBe("11");
      expect(query.get("source_head_seq")).toBe("11");
    }).context(start.invocation);
    expect(messages).toEqual([
      {
        roomId: wire.room_id,
        channelId: wire.channel_id,
        sourceMessageId: fixture.context.feed.items[0].source_event.event_id,
        sequence: 11,
        authorPrincipalId: fixture.context.feed.items[0].attribution.actor_principal_id,
        bodyMarkdown: "@Claw continue",
        occurredAt: fixture.context.feed.items[0].occurred_at,
      },
    ]);
  });
  it("rejects a changed binding receipt, unsupported runtime or ambiguous dispatch receipt", async () => {
    const changed = structuredClone(fixture.binding);
    changed.binding.runtime_reference.session_key = "personal-session";
    await expect(
      client(changed).reserve({
        ...scope,
        conversationId: wire.conversation_id,
        hostId: "fixture-host",
        agentId: "main",
      }),
    ).rejects.toMatchObject({ code: "rooms_server_contract_drift" });
    const native = structuredClone(fixture.start);
    native.invocation.runtime_target = {
      kind: "native_t3",
      host_id: "host",
      environment_id: "real-environment",
      project_id: "real-project",
      thread_id: "real-thread",
    };
    await expect(client(native).getTurn(wire.id)).rejects.toMatchObject({
      code: "rooms_runtime_unsupported",
    });
    await expect(
      client({ ...fixture.start, dispatch_allowed: "true" }).dispatch({
        invocationId: wire.id,
        ...scope,
      }),
    ).rejects.toMatchObject({ code: "rooms_server_contract_drift" });
  });
  it("rejects advancing context scope/head and non-advancing cursor rather than looping", async () => {
    const start = await client(fixture.start).getTurn(wire.id);
    const foreign = structuredClone(fixture.context);
    foreign.conversation.id = "conversation:other";
    await expect(client(foreign).context(start.invocation)).rejects.toMatchObject({
      code: "rooms_server_contract_drift",
    });
    const stalled = structuredClone(fixture.context);
    stalled.feed.page_info.has_more = true;
    stalled.feed.page_info.next_cursor = 0;
    await expect(client(stalled).context(start.invocation)).rejects.toMatchObject({
      code: "rooms_server_contract_drift",
    });
  });
});
