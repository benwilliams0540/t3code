import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { buildRoomsDiagnostics } from "./diagnostics";
import zeroWorkspaceDocument from "./fixtures/local-channels-v1-zero-workspace.json";
import { reconcileLocalWorkspaceConfig, resolveLocalRoomsDataSourceState } from "./local";
import { RoomsLocalWorkspace } from "./localChannelsContract";

const decodeWorkspace = Schema.decodeUnknownSync(RoomsLocalWorkspace);

describe("Rooms diagnostics", () => {
  it("includes only whitelisted source, contract, and project reference fields", () => {
    const workspace = decodeWorkspace(zeroWorkspaceDocument);
    const cleanConfig = reconcileLocalWorkspaceConfig(null, workspace);
    const localConfig = {
      ...cleanConfig,
      projectBindings: [{ environmentId: "environment-local", projectId: "project-local" }],
      workspaceRoot: "/private/secret/workspace",
      prompt: "never copy this prompt",
      credential: "never-copy-token",
    };
    const diagnostics = buildRoomsDiagnostics({
      mode: "local",
      state: resolveLocalRoomsDataSourceState(workspace, localConfig),
      selectedBySource: { sample: null, local: localConfig.roomId },
      selectedRoomId: localConfig.roomId,
      localConfig,
      sampleBindings: {},
      lastRoomsRoute: `/rooms/${localConfig.slug}/dashboard`,
      localApiBaseUrl: "http://127.0.0.1:3101",
    });

    expect(diagnostics).toContain('"mode": "local"');
    expect(diagnostics).toContain('"projectId": "project-local"');
    expect(diagnostics).toContain("http://127.0.0.1:3101");
    expect(diagnostics).toContain(`/rooms/${localConfig.slug}/dashboard`);
    expect(diagnostics).not.toContain("/private/secret/workspace");
    expect(diagnostics).not.toContain("never copy this prompt");
    expect(diagnostics).not.toContain("never-copy-token");
  });
});
