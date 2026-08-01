import { describe, expect, it } from "vite-plus/test";

import { createRoomsLocalWorkspaceConfig, resolveLocalRoomsDataSourceState } from "./local";
import { buildRoomsDiagnostics } from "./diagnostics";

describe("Rooms diagnostics", () => {
  it("includes only whitelisted source and project reference fields", () => {
    const localConfig = {
      ...createRoomsLocalWorkspaceConfig(() => "diagnostic-room"),
      projectBindings: [{ environmentId: "environment-local", projectId: "project-local" }],
      workspaceRoot: "/private/secret/workspace",
      prompt: "never copy this prompt",
      credential: "never-copy-token",
    };
    const diagnostics = buildRoomsDiagnostics({
      mode: "local",
      state: resolveLocalRoomsDataSourceState(localConfig),
      selectedBySource: { sample: null, local: localConfig.roomId },
      selectedRoomId: localConfig.roomId,
      localConfig,
      sampleBindings: {},
      lastRoomsRoute: `/rooms/${localConfig.slug}/dashboard`,
    });

    expect(diagnostics).toContain('"mode": "local"');
    expect(diagnostics).toContain('"projectId": "project-local"');
    expect(diagnostics).toContain(`/rooms/${localConfig.slug}/dashboard`);
    expect(diagnostics).not.toContain("/private/secret/workspace");
    expect(diagnostics).not.toContain("never copy this prompt");
    expect(diagnostics).not.toContain("never-copy-token");
  });
});
