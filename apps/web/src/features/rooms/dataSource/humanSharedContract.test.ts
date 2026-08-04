import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  ROOMS_HUMAN_CONTRACT_ID,
  ROOMS_HUMAN_CONTRACT_VERSION,
  ROOMS_HUMAN_SCHEMA_URI,
  ROOMS_HUMAN_SERVER_PRODUCER_SHA,
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

    expect(ROOMS_HUMAN_SERVER_PRODUCER_SHA).toBe("5c58c843ede9f77a13010645736ddc0abf36eef5");
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
});
