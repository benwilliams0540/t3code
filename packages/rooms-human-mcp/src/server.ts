import { HostProcessEnvironment, HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpServer } from "effect/unstable/ai";

import { createRoomsHumanClient } from "./client.ts";
import { loadRoomsHumanMcpConfig } from "./config.ts";
import { RoomsHuman, RoomsHumanToolkit, RoomsHumanToolkitHandlersLive } from "./toolkit.ts";

export const RoomsHumanToolkitRegistrationLive = McpServer.toolkit(RoomsHumanToolkit).pipe(
  Layer.provide(RoomsHumanToolkitHandlersLive),
);

const StdioTransportLive = McpServer.layerStdio({
  name: "ThreadSpace (human)",
  version: "0.1.0",
});

/** Reads configuration once at startup so a bad token file fails before serving. */
export const RoomsHumanFromEnvLive = Layer.effect(
  RoomsHuman,
  Effect.gen(function* () {
    const env = yield* HostProcessEnvironment;
    const platform = yield* HostProcessPlatform;
    return createRoomsHumanClient(loadRoomsHumanMcpConfig({ env, platform }));
  }),
);

export const layer = RoomsHumanToolkitRegistrationLive.pipe(
  Layer.provideMerge(StdioTransportLive),
  Layer.provide(RoomsHumanFromEnvLive),
);

export { RoomsHuman, RoomsHumanToolkit };
