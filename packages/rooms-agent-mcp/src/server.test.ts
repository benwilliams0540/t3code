import { expect, it } from "@effect/vitest";
import {
  RoomsAgentClient,
  roomsAgentToolNames,
  type RoomsAgentClientShape,
} from "@t3tools/rooms-agent-api";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpServer } from "effect/unstable/ai";

import { RoomsAgentToolkitRegistrationLive } from "./server.ts";

const client: RoomsAgentClientShape = {
  profile: "read_only",
  invoke: () => Effect.die("unused"),
};

const TestLayer = RoomsAgentToolkitRegistrationLive.pipe(
  Layer.provideMerge(McpServer.McpServer.layer),
  Layer.provide(Layer.succeed(RoomsAgentClient, client)),
);

it.effect("registers the exact shared Rooms catalog on the external stdio surface", () =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer;
    expect(server.tools.map(({ tool }) => tool.name)).toEqual(roomsAgentToolNames);
  }).pipe(Effect.provide(TestLayer)),
);
