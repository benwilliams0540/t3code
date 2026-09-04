import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  ROOMS_HUMAN_CONTRACT_ID,
  ROOMS_HUMAN_CONTRACT_VERSION,
  ROOMS_HUMAN_FEED_SERVER_PRODUCER_SHA,
  ROOMS_HUMAN_SCHEMA_URI,
  ROOMS_HUMAN_SERVER_PRODUCER_SHA,
  RoomsHumanFeed,
  RoomsHumanSession,
  RoomsHumanWorkspace,
} from "./humanSharedContract";

const contract = {
  id: ROOMS_HUMAN_CONTRACT_ID,
  version: ROOMS_HUMAN_CONTRACT_VERSION,
  schema_uri: ROOMS_HUMAN_SCHEMA_URI,
};
const roomId = "room:0198f7e2-1234-789a-8abc-123456789abc";
const principalId = "h:0198f7e2-1234-789a-8abc-123456789abc";
const decodeSession = Schema.decodeUnknownSync(RoomsHumanSession);
const decodeWorkspace = Schema.decodeUnknownSync(RoomsHumanWorkspace);
const decodeFeed = Schema.decodeUnknownSync(RoomsHumanFeed);

describe("rooms.human-shared v1 consumer contract", () => {
  it("pins the immutable server producer and accepts a role-free session principal", () => {
    const session = decodeSession({
      contract,
      status: "ready",
      principal: { id: principalId, type: "human", display_name: "Human A" },
      rooms: [
        { id: roomId, slug: "shared-room", name: "Shared room", locality: "shared", role: "admin" },
      ],
    });

    expect(ROOMS_HUMAN_SERVER_PRODUCER_SHA).toBe("ee381424993ec4a892a9a722e44ced593b2e35e9");
    expect(session.rooms[0]?.role).toBe("admin");
  });

  it("decodes server-derived role, capabilities, and principal directory", () => {
    const capabilities = Object.fromEntries(
      [
        "workspace.read",
        "channel.read",
        "channel.create",
        "message.create",
        "work.read",
        "work.create",
        "work.link_thread",
        "work.attach_evidence",
        "work.review",
        "work.complete",
        "membership.manage",
        "role.manage",
      ].map((name) => [name, name !== "role.manage"]),
    );
    const workspace = decodeWorkspace({
      contract,
      status: "ready",
      room: { id: roomId, slug: "shared-room", name: "Shared room", locality: "shared" },
      principal: { id: principalId, type: "human", display_name: "Human A", role: "admin" },
      capabilities,
      principals: [
        { id: principalId, type: "human", display_name: "Human A", role: "admin" },
        {
          id: "h:0198f7e2-1234-789a-8abc-123456789abd",
          type: "human",
          display_name: "Human B",
          role: "operator",
        },
      ],
      channels: [],
    });

    expect(workspace.principal.role).toBe("admin");
    expect(workspace.capabilities["role.manage"]).toBe(false);
    expect(workspace.principals.map((principal) => principal.display_name)).toEqual([
      "Human A",
      "Human B",
    ]);
    expect(() =>
      decodeWorkspace({
        ...workspace,
        principal: { id: principalId, type: "human", display_name: "Human A" },
      }),
    ).toThrow();
  });

  it("decodes v2 Agent invocation updates without widening the v1 workspace contract", () => {
    expect(ROOMS_HUMAN_FEED_SERVER_PRODUCER_SHA).toBe("0147f353190f2568dd42032677229a0d74eb5610");
    const event = (seq: number, type: string) => ({
      seq,
      event_id: `event-${seq}`,
      type,
      schema: 1,
    });
    const feed = decodeFeed({
      contract: {
        id: ROOMS_HUMAN_CONTRACT_ID,
        version: 2,
        schema_uri: "contracts/rooms/human-shared/v2/schema.json",
      },
      room_id: roomId,
      channel_id: "channel:one",
      page_info: {
        after_seq: 0,
        limit: 100,
        snapshot_head_seq: 2,
        next_cursor: 2,
        has_more: false,
      },
      items: [
        {
          id: "feed-2",
          room_id: roomId,
          channel_id: "channel:one",
          kind: "agent_invocation_update",
          occurred_at: "2026-09-04T12:00:02.000Z",
          summary: "Agent invocation running",
          source_event: event(2, "agent.invocation-started"),
          attribution: {
            mode: "explicit_principal",
            writer_principal_id: "a:claw",
            actor_principal_id: "a:claw",
          },
          payload: {
            invocation_id: "invocation:one",
            triggering_message: event(1, "message.created"),
            status: "running",
            safe_error_code: null,
            reply_source_event: null,
          },
        },
      ],
    });
    expect(feed.items[0]).toMatchObject({
      kind: "agent_invocation_update",
      payload: { invocation_id: "invocation:one", status: "running" },
    });
  });
});
