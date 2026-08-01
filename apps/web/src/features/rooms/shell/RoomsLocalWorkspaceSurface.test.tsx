import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  createRoomsLocalWorkspaceConfig,
  resolveLocalRoomsDataSourceState,
} from "../dataSource/local";
import { roomsProjectNavigationItems } from "./RoomsWorkspaceNavigation";
import { RoomsLocalUnavailableSurface } from "./RoomsLocalWorkspaceSurface";

const SAMPLE_ONLY_MARKERS = [
  "room:019fb920-1000-7000-8000-000000000001",
  "Camera Team",
  "Maya",
  "Freeze the workspace read fixture",
  "The adapter is reachable again; verify mirror freshness separately.",
  "Fixture · workspace-read v2",
];

describe("Rooms Local source isolation", () => {
  it("renders honest IA placeholders without Sample workspace content", () => {
    const config = createRoomsLocalWorkspaceConfig(() => "no-fixture-leak");
    const localState = resolveLocalRoomsDataSourceState(config);
    const surfaces = [
      { kind: "channel", channelSlug: "local" },
      { kind: "project", projectSection: "vision" },
      { kind: "project", projectSection: "stories" },
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
    });

    expect(output).toContain("Local workspace");
    expect(output).toContain("Channel messaging isn’t connected yet.");
    expect(output).toContain("No vision revisions yet.");
    for (const marker of SAMPLE_ONLY_MARKERS) expect(output).not.toContain(marker);
  });
});
