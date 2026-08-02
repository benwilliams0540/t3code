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

  it("carries the sidebar v2 status so a Rooms row reads the same as a v2 row", () => {
    const working = {
      ...thread("thread-working"),
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      session: { status: "running", updatedAt: "2026-07-31T12:00:30.000Z" },
      latestTurn: {
        completedAt: null,
        startedAt: "2026-07-31T12:00:05.000Z",
        requestedAt: "2026-07-31T12:00:00.000Z",
      },
    } as unknown as EnvironmentThreadShell;
    const awaitingApproval = {
      ...thread("thread-approval"),
      hasPendingApprovals: true,
      hasPendingUserInput: false,
      session: { status: "running", updatedAt: "2026-07-31T12:00:30.000Z" },
    } as unknown as EnvironmentThreadShell;
    const resting = {
      ...thread("thread-ready"),
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      session: null,
    } as unknown as EnvironmentThreadShell;

    const entries = selectRoomsNativeThreadEntries([working, awaitingApproval, resting], [project]);
    const byId = new Map(entries.map((entry) => [entry.threadId, entry]));

    expect(byId.get(ThreadId.make("thread-working"))?.status).toBe("working");
    expect(byId.get(ThreadId.make("thread-working"))?.workingStartedAt).toBe(
      "2026-07-31T12:00:05.000Z",
    );
    expect(byId.get(ThreadId.make("thread-approval"))?.status).toBe("approval");
    expect(byId.get(ThreadId.make("thread-ready"))?.status).toBe("ready");
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
