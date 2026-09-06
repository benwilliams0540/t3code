import { describe, expect, it } from "vite-plus/test";

import {
  collectRoomsUpstreamReport,
  formatRoomsUpstreamReport,
  parseRevListCount,
  type RunGit,
} from "./rooms-upstream-report.ts";

function stubGit(outputs: Readonly<Record<string, string>>): RunGit {
  return (args) => {
    const key = args.join(" ");
    const output = outputs[key];
    if (output === undefined) throw new Error(`Unexpected git command: ${key}`);
    return output;
  };
}

describe("Rooms upstream report", () => {
  it("reports divergence and the exact shared changed paths", () => {
    const report = collectRoomsUpstreamReport(
      stubGit({
        "merge-base origin/main upstream/main": "base-sha\n",
        "rev-list --left-right --count origin/main...upstream/main": "0\t1343\n",
        "rev-list --left-right --count origin/main...origin/integrate/rooms-current": "0\t92\n",
        "diff --name-only base-sha..origin/integrate/rooms-current":
          "apps/web/src/components/AppSidebarLayout.tsx\nscripts/build-desktop-artifact.ts\ndocs/rooms/foundations.md\n",
        "diff --name-only base-sha..upstream/main":
          "scripts/build-desktop-artifact.ts\napps/web/src/components/AppSidebarLayout.tsx\nREADME.md\n",
        "rev-parse origin/main": "fork-sha\n",
        "rev-parse origin/integrate/rooms-current": "rooms-sha\n",
        "rev-parse upstream/main": "upstream-sha\n",
      }),
    );

    expect(report.forkDivergence).toEqual({ forkOnly: 0, upstreamOnly: 1343 });
    expect(report.roomsDivergence).toEqual({ forkOnly: 0, roomsOnly: 92 });
    expect(report.sharedChangedPaths).toEqual([
      "apps/web/src/components/AppSidebarLayout.tsx",
      "scripts/build-desktop-artifact.ts",
    ]);
    expect(formatRoomsUpstreamReport(report)).toContain("shared changed paths: 2");
  });

  it("rejects malformed revision counts without echoing command output", () => {
    expect(() => parseRevListCount("1343")).toThrow(
      "Expected two non-negative git revision counts, received 4 bytes.",
    );
    expect(() => parseRevListCount("0 nope")).toThrow(
      "Expected two non-negative git revision counts, received 6 bytes.",
    );
  });
});
