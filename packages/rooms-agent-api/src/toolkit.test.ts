import { expect, it } from "@effect/vitest";
import { Tool } from "effect/unstable/ai";

import { roomsAgentToolNames } from "./contracts.ts";
import { RoomsAgentToolkit } from "./toolkit.ts";

const collectStrings = (value: unknown, output: Array<string>): void => {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectStrings(child, output);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    output.push(key);
    collectStrings(child, output);
  }
};

it("exports exactly the pinned catalog with no credential or authority parameters", () => {
  const tools = Object.values(RoomsAgentToolkit.tools);
  expect(tools.map((tool) => tool.name)).toEqual(roomsAgentToolNames);
  for (const tool of tools) {
    const schema = Tool.getJsonSchema(tool) as { readonly type?: unknown };
    expect(schema.type, `${tool.name} must have an object input`).toBe("object");
    const strings: Array<string> = [];
    collectStrings(schema, strings);
    for (const forbidden of [
      "bearerToken",
      "authorization",
      "credential",
      "invocation_id",
      "tool_call_id",
      "connector_id",
      "configuration_epoch",
      "room_id",
      "agent_id",
      "principal_id",
    ]) {
      expect(strings, `${tool.name} must not expose ${forbidden}`).not.toContain(forbidden);
    }
  }
});
