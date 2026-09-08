import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";

import { layer } from "./server.ts";

const MainLayer = layer.pipe(
  Layer.provide(NodeServices.layer),
  Layer.provide(Layer.succeed(Logger.LogToStderr, true)),
);

if (import.meta.main) {
  Layer.launch(MainLayer).pipe(Effect.scoped, NodeRuntime.runMain);
}
