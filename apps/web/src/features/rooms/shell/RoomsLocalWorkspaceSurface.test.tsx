import * as Schema from "effect/Schema";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import zeroWorkspaceDocument from "../dataSource/fixtures/local-channels-v1-zero-workspace.json";
import {
  reconcileLocalWorkspaceConfig,
  resolveLocalRoomsDataSourceState,
} from "../dataSource/local";
import { RoomsLocalWorkspace } from "../dataSource/localChannelsContract";
import { roomsProjectNavigationItems } from "./RoomsWorkspaceNavigation";
import { RoomsLocalUnavailableSurface } from "./RoomsLocalWorkspaceSurface";
import { RoomsLocalStoriesEmptyState } from "../stories/RoomsLocalStories";

const decodeWorkspace = Schema.decodeUnknownSync(RoomsLocalWorkspace);

const SAMPLE_ONLY_MARKERS = [
  "room:019fb920-1000-7000-8000-000000000001",
  "Camera Team",
  "Maya",
  "Freeze the workspace read fixture",
  "The adapter is reachable again; verify mirror freshness separately.",
  "Fixture · workspace-read v2",
];

describe("Rooms Local source isolation", () => {
  it("renders honest unavailable IA surfaces without Sample workspace content", () => {
    const workspace = decodeWorkspace(zeroWorkspaceDocument);
    const config = reconcileLocalWorkspaceConfig(null, workspace);
    const localState = resolveLocalRoomsDataSourceState(workspace, config);
    const surfaces = [
      { kind: "project", projectSection: "vision" },
      { kind: "project", projectSection: "evidence" },
      { kind: "project", projectSection: "audit-decisions" },
      { kind: "present" },
    ] as const;
    const output = JSON.stringify({
      localState,
      navigation: roomsProjectNavigationItems("local", null),
      markup: surfaces.map((surface) =>
        renderToStaticMarkup(<RoomsLocalUnavailableSurface surface={surface} />),
      ),
      storiesMarkup: renderToStaticMarkup(<RoomsLocalStoriesEmptyState />),
    });

    expect(output).toContain("Local workspace");
    expect(output).toContain("No vision revisions yet.");
    expect(output).toContain("No Local stories yet");
    for (const marker of SAMPLE_ONLY_MARKERS) expect(output).not.toContain(marker);
  });
});
