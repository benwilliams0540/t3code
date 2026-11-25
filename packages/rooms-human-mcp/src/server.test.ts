import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpServer, Tool } from "effect/unstable/ai";

import type { RoomsHumanClient } from "./client.ts";
import { RoomsHumanToolkitRegistrationLive } from "./server.ts";
import { RoomsHuman, RoomsHumanToolkit, roomsHumanToolNames } from "./toolkit.ts";

const TestLayer = RoomsHumanToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provide(Layer.succeed(RoomsHuman, {} as RoomsHumanClient)),
);

it.effect("registers the ThreadSpace human tools on the stdio surface", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    expect(server.tools.map(({ tool }) => tool.name)).toEqual(roomsHumanToolNames);
    expect(roomsHumanToolNames).toEqual([
      "threadspace_session",
      "threadspace_room",
      "threadspace_list_conversations",
      "threadspace_start_conversation",
      "threadspace_send_message",
      "threadspace_read_conversation",
      "threadspace_wait_for_reply",
      "threadspace_read_channel",
    ]);
  }).pipe(Effect.provide(TestLayer)),
);

it("keeps credentials and identity out of every tool's arguments", () => {
  for (const tool of Object.values(RoomsHumanToolkit.tools)) {
    const schema = JSON.stringify(Tool.getJsonSchema(tool));
    for (const forbidden of ["token", "bearer", "authorization", "principal_id", "base_url"]) {
      expect(schema.toLowerCase(), `${tool.name} exposes ${forbidden}`).not.toContain(
        `"${forbidden}`,
      );
    }
  }
});
