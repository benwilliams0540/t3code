import { scopedProjectKey } from "@t3tools/client-runtime/environment";
import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import type { ScopedProjectRef } from "@t3tools/contracts";

import {
  resolveSidebarV2Status,
  resolveWorkingStartedAt,
  type SidebarV2Status,
} from "~/components/Sidebar.logic";

export interface RoomsNativeThreadEntry {
  readonly environmentId: EnvironmentThreadShell["environmentId"];
  readonly projectId: EnvironmentThreadShell["projectId"];
  readonly threadId: EnvironmentThreadShell["id"];
  readonly title: string;
  readonly projectTitle: string;
  readonly updatedAt: string;
  /** Same reading sidebar v2 gives a thread, so a row means the same thing in both. */
  readonly status: SidebarV2Status;
  readonly workingStartedAt: string | null;
}

function threadProjectKey(thread: EnvironmentThreadShell): string {
  return scopedProjectKey({
    environmentId: thread.environmentId,
    projectId: thread.projectId,
  });
}

export function isThreadBoundToRoom(
  thread: EnvironmentThreadShell,
  boundProjectRefs: ReadonlyArray<ScopedProjectRef>,
): boolean {
  const projectKey = threadProjectKey(thread);
  return boundProjectRefs.some((ref) => scopedProjectKey(ref) === projectKey);
}

export function selectRoomsNativeThreadEntries(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  boundProjects: ReadonlyArray<EnvironmentProject>,
): readonly RoomsNativeThreadEntry[] {
  const projectsByKey = new Map(
    boundProjects.map((project) => [
      scopedProjectKey({ environmentId: project.environmentId, projectId: project.id }),
      project,
    ]),
  );

  return threads
    .filter((thread) => thread.archivedAt === null)
    .flatMap((thread) => {
      const project = projectsByKey.get(threadProjectKey(thread));
      return project
        ? [
            {
              environmentId: thread.environmentId,
              projectId: thread.projectId,
              threadId: thread.id,
              title: thread.title,
              projectTitle: project.title,
              updatedAt: thread.updatedAt,
              status: resolveSidebarV2Status(thread),
              workingStartedAt: resolveWorkingStartedAt(thread),
            },
          ]
        : [];
    })
    .toSorted((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}
