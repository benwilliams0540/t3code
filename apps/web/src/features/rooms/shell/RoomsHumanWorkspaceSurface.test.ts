import * as Schema from "effect/Schema";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { RoomsHumanWorkspace } from "../dataSource/humanSharedContract";
import {
  resolveRoomsHumanWorkspaceActions,
  roomsHumanInviteClipboardPayload,
} from "./RoomsHumanWorkspaceSurface";
import { RoomsInteractivePresent } from "./RoomsInteractivePresent";

const base = {
  contract: {
    id: "rooms.human-shared",
    version: 1,
    schema_uri: "contracts/rooms/human-shared/v1/schema.json",
  },
  status: "ready",
  room: {
    id: "room:0198f7e2-1234-789a-8abc-123456789abc",
    slug: "shared",
    name: "Shared",
    locality: "shared",
  },
  principal: {
    id: "h:0198f7e2-1234-789a-8abc-123456789abc",
    type: "human",
    display_name: "Observer",
    role: "observer",
  },
  principals: [],
  channels: [],
} as const;

const capabilities = {
  "workspace.read": true,
  "channel.read": true,
  "channel.create": false,
  "message.create": true,
  "work.read": true,
  "work.create": false,
  "work.link_thread": false,
  "work.attach_evidence": false,
  "work.review": false,
  "work.complete": false,
  "membership.manage": false,
  "role.manage": false,
} as const;
const decodeWorkspace = Schema.decodeUnknownSync(RoomsHumanWorkspace);

describe("shared Rooms capability UI", () => {
  it("derives observer, operator, and admin controls only from server capabilities", () => {
    const observer = decodeWorkspace({ ...base, capabilities });
    expect(resolveRoomsHumanWorkspaceActions(observer)).toEqual({
      canCreateChannel: false,
      canSendMessage: true,
      canCreateStory: false,
      canManageMembers: false,
      canManageRoles: false,
    });
    const operator = decodeWorkspace({
      ...base,
      principal: { ...base.principal, display_name: "Operator", role: "operator" },
      capabilities: {
        ...capabilities,
        "channel.create": true,
        "work.create": true,
        "work.link_thread": true,
        "work.attach_evidence": true,
      },
    });
    expect(resolveRoomsHumanWorkspaceActions(operator)).toEqual({
      canCreateChannel: true,
      canSendMessage: true,
      canCreateStory: true,
      canManageMembers: false,
      canManageRoles: false,
    });
    const admin = decodeWorkspace({
      ...base,
      principal: { ...base.principal, display_name: "Admin", role: "admin" },
      capabilities: Object.fromEntries(Object.keys(capabilities).map((key) => [key, true])),
    });
    expect(resolveRoomsHumanWorkspaceActions(admin)).toEqual({
      canCreateChannel: true,
      canSendMessage: true,
      canCreateStory: true,
      canManageMembers: true,
      canManageRoles: true,
    });
  });

  it("copies only the room identifier and opaque invite needed for redemption", () => {
    expect(
      JSON.parse(
        roomsHumanInviteClipboardPayload({
          roomId: base.room.id,
          token: "rhi1_opaque",
        }),
      ),
    ).toEqual({ room_id: base.room.id, invite_token: "rhi1_opaque" });
  });

  it("marks exactly the authenticated principal as You", () => {
    const workspace = decodeWorkspace({
      ...base,
      capabilities,
      principals: [
        { ...base.principal },
        {
          id: "h:0198f7e2-1234-789a-8abc-123456789abd",
          type: "human",
          display_name: "Another member",
          role: "admin",
        },
      ],
    });
    const markup = renderToStaticMarkup(createElement(RoomsInteractivePresent, { workspace }));
    expect(markup.match(/>You</g)).toHaveLength(1);
  });
});
