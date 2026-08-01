import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { roomsWorkspaceFixture } from "../fixtures";
import { isThreadBoundToRoom, selectRoomsNativeThreadEntries } from "./roomsNativeThreads";

const environmentId = EnvironmentId.make("environment-local");
const projectId = ProjectId.make("project-rooms");

const project = {
  environmentId,
  id: projectId,
  title: "Rooms",
  workspaceRoot: "/work/rooms",
} as EnvironmentProject;

function thread(
  id: string,
  options: { archivedAt?: string | null; projectId?: ProjectId; updatedAt?: string } = {},
): EnvironmentThreadShell {
  return {
    environmentId,
    id: ThreadId.make(id),
    projectId: options.projectId ?? projectId,
    title: `Native ${id}`,
    archivedAt: options.archivedAt ?? null,
    updatedAt: options.updatedAt ?? "2026-07-31T12:00:00.000Z",
  } as EnvironmentThreadShell;
}

describe("Rooms native T3 thread entries", () => {
  it("uses real T3 thread shells rather than mirrored workspace thread records", () => {
    const entries = selectRoomsNativeThreadEntries([thread("thread-native")], [project]);
    const mirroredFixtureIds = roomsWorkspaceFixture.workspaces.flatMap((workspace) =>
      workspace.threads.map((mirrored) => mirrored.id),
    );

    expect(entries.map((entry) => entry.threadId)).toEqual(["thread-native"]);
    expect(mirroredFixtureIds).not.toContain(entries[0]!.threadId);
  });

  it("omits archived threads and shells outside the room's exact bound projects", () => {
    const unrelatedProjectId = ProjectId.make("project-unrelated");
    const entries = selectRoomsNativeThreadEntries(
      [
        thread("thread-current"),
        thread("thread-archived", { archivedAt: "2026-07-31T11:00:00.000Z" }),
        thread("thread-unrelated", { projectId: unrelatedProjectId }),
      ],
      [project],
    );

    expect(entries.map((entry) => entry.threadId)).toEqual(["thread-current"]);
  });

  it("rejects fake or unresolved thread identities unless their actual shell project is bound", () => {
    const actualThread = thread("thread-native");

    expect(isThreadBoundToRoom(actualThread, [])).toBe(false);
    expect(
      isThreadBoundToRoom(actualThread, [
        { environmentId, projectId: ProjectId.make("fixture-project") },
      ]),
    ).toBe(false);
    expect(isThreadBoundToRoom(actualThread, [{ environmentId, projectId }])).toBe(true);
  });
});
