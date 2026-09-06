#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalProcess:off - This read-only host utility shells out to git and prints a maintainer report.

import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";

export interface RoomsUpstreamReport {
  readonly refs: {
    readonly forkMain: string;
    readonly roomsCurrent: string;
    readonly upstreamMain: string;
  };
  readonly tips: {
    readonly forkMain: string;
    readonly roomsCurrent: string;
    readonly upstreamMain: string;
    readonly mergeBase: string;
  };
  readonly forkDivergence: {
    readonly forkOnly: number;
    readonly upstreamOnly: number;
  };
  readonly roomsDivergence: {
    readonly forkOnly: number;
    readonly roomsOnly: number;
  };
  readonly sharedChangedPaths: ReadonlyArray<string>;
}

export type RunGit = (args: ReadonlyArray<string>) => string;

const DEFAULT_REFS = {
  forkMain: "origin/main",
  roomsCurrent: "origin/integrate/rooms-current",
  upstreamMain: "upstream/main",
} as const;

function nonEmptyLines(output: string): ReadonlyArray<string> {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function parseRevListCount(output: string): readonly [number, number] {
  const values = output.trim().split(/\s+/).map(Number);
  if (values.length !== 2 || values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error(
      `Expected two non-negative git revision counts, received ${output.length} bytes.`,
    );
  }
  return [values[0]!, values[1]!];
}

function intersectSorted(left: ReadonlyArray<string>, right: ReadonlyArray<string>) {
  const rightPaths = new Set(right);
  return [...new Set(left)].filter((path) => rightPaths.has(path)).toSorted();
}

export function collectRoomsUpstreamReport(
  runGit: RunGit,
  refs: RoomsUpstreamReport["refs"] = DEFAULT_REFS,
): RoomsUpstreamReport {
  const mergeBase = runGit(["merge-base", refs.forkMain, refs.upstreamMain]).trim();
  const [forkOnly, upstreamOnly] = parseRevListCount(
    runGit(["rev-list", "--left-right", "--count", `${refs.forkMain}...${refs.upstreamMain}`]),
  );
  const [forkOnlySinceRooms, roomsOnly] = parseRevListCount(
    runGit(["rev-list", "--left-right", "--count", `${refs.forkMain}...${refs.roomsCurrent}`]),
  );
  const roomsChangedPaths = nonEmptyLines(
    runGit(["diff", "--name-only", `${mergeBase}..${refs.roomsCurrent}`]),
  );
  const upstreamChangedPaths = nonEmptyLines(
    runGit(["diff", "--name-only", `${mergeBase}..${refs.upstreamMain}`]),
  );

  return {
    refs,
    tips: {
      forkMain: runGit(["rev-parse", refs.forkMain]).trim(),
      roomsCurrent: runGit(["rev-parse", refs.roomsCurrent]).trim(),
      upstreamMain: runGit(["rev-parse", refs.upstreamMain]).trim(),
      mergeBase,
    },
    forkDivergence: { forkOnly, upstreamOnly },
    roomsDivergence: { forkOnly: forkOnlySinceRooms, roomsOnly },
    sharedChangedPaths: intersectSorted(roomsChangedPaths, upstreamChangedPaths),
  };
}

export function formatRoomsUpstreamReport(report: RoomsUpstreamReport): string {
  const paths =
    report.sharedChangedPaths.length === 0
      ? "  (none)"
      : report.sharedChangedPaths.map((path) => `  ${path}`).join("\n");
  return [
    "Rooms upstream sync report",
    `fork main: ${report.refs.forkMain} @ ${report.tips.forkMain}`,
    `upstream main: ${report.refs.upstreamMain} @ ${report.tips.upstreamMain}`,
    `Rooms integration: ${report.refs.roomsCurrent} @ ${report.tips.roomsCurrent}`,
    `merge base: ${report.tips.mergeBase}`,
    `fork divergence: ${report.forkDivergence.forkOnly} fork-only, ${report.forkDivergence.upstreamOnly} upstream-only`,
    `Rooms divergence from fork main: ${report.roomsDivergence.roomsOnly} Rooms-only, ${report.roomsDivergence.forkOnly} fork-main-only`,
    `shared changed paths: ${report.sharedChangedPaths.length}`,
    paths,
  ].join("\n");
}

function runGit(args: ReadonlyArray<string>): string {
  return NodeChildProcess.execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === NodeURL.pathToFileURL(entrypoint).href) {
  try {
    console.log(formatRoomsUpstreamReport(collectRoomsUpstreamReport(runGit)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not inspect Rooms divergence.");
    process.exitCode = 1;
  }
}
