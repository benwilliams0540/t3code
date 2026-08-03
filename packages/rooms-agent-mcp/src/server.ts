import {
  RoomsAgentClient,
  RoomsAgentToolkit,
  RoomsAgentToolkitHandlersLive,
  layerFromEnv as RoomsAgentClientLive,
} from "@t3tools/rooms-agent-api";
import * as Layer from "effect/Layer";
import { McpServer } from "effect/unstable/ai";
import { FetchHttpClient } from "effect/unstable/http";

export const RoomsAgentToolkitRegistrationLive = McpServer.toolkit(RoomsAgentToolkit).pipe(
  Layer.provide(RoomsAgentToolkitHandlersLive),
);

const StdioTransportLive = McpServer.layerStdio({
  name: "Rooms Agent (local)",
  version: "0.1.0",
});

export const layer = RoomsAgentToolkitRegistrationLive.pipe(
  Layer.provideMerge(StdioTransportLive),
  Layer.provide(RoomsAgentClientLive.pipe(Layer.provide(FetchHttpClient.layer))),
);

export { RoomsAgentClient };
