import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { ScopedProjectRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useCallback, useMemo } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useProjects } from "~/state/entities";

export const ROOMS_PROJECT_BINDINGS_STORAGE_KEY = "t3code:rooms-project-bindings:v1";

const PersistedRoomsProjectRef = Schema.Struct({
  environmentId: Schema.String,
  projectId: Schema.String,
});

export const RoomsProjectBindings = Schema.Record(
  Schema.String,
  Schema.Array(PersistedRoomsProjectRef),
);
export type RoomsProjectBindings = typeof RoomsProjectBindings.Type;
export type PersistedRoomsProjectRef = typeof PersistedRoomsProjectRef.Type;

const EMPTY_ROOMS_PROJECT_BINDINGS: RoomsProjectBindings = Object.freeze({});

function persistedProjectKey(ref: PersistedRoomsProjectRef): string {
  return `${ref.environmentId}:${ref.projectId}`;
}

function environmentProjectKey(project: EnvironmentProject): string {
  return scopedProjectKey(scopeProjectRef(project.environmentId, project.id));
}

export function addRoomProjectBinding(
  bindings: RoomsProjectBindings,
  roomId: string,
  project: EnvironmentProject,
): RoomsProjectBindings {
  const current = bindings[roomId] ?? [];
  const projectKey = environmentProjectKey(project);
  if (current.some((ref) => persistedProjectKey(ref) === projectKey)) return bindings;
  return {
    ...bindings,
    [roomId]: [...current, { environmentId: project.environmentId, projectId: project.id }],
  };
}

export function removeRoomProjectBinding(
  bindings: RoomsProjectBindings,
  roomId: string,
  projectRef: PersistedRoomsProjectRef,
): RoomsProjectBindings {
  const current = bindings[roomId] ?? [];
  const projectKey = persistedProjectKey(projectRef);
  const next = current.filter((ref) => persistedProjectKey(ref) !== projectKey);
  if (next.length === current.length) return bindings;
  if (next.length > 0) return { ...bindings, [roomId]: next };
  const { [roomId]: _removed, ...remaining } = bindings;
  return remaining;
}

export function resolveRoomProjectBindings(
  bindings: RoomsProjectBindings,
  roomId: string,
  projects: ReadonlyArray<EnvironmentProject>,
): {
  readonly boundProjects: readonly EnvironmentProject[];
  readonly boundProjectRefs: readonly ScopedProjectRef[];
  readonly availableProjects: readonly EnvironmentProject[];
  readonly unresolvedBindings: readonly PersistedRoomsProjectRef[];
} {
  const persistedRefs = bindings[roomId] ?? [];
  const projectsByKey = new Map(
    projects.map((project) => [environmentProjectKey(project), project]),
  );
  const boundProjects: EnvironmentProject[] = [];
  const unresolvedBindings: PersistedRoomsProjectRef[] = [];

  for (const persistedRef of persistedRefs) {
    const project = projectsByKey.get(persistedProjectKey(persistedRef));
    if (project) boundProjects.push(project);
    else unresolvedBindings.push(persistedRef);
  }

  const boundKeys = new Set(boundProjects.map(environmentProjectKey));
  return {
    boundProjects,
    boundProjectRefs: boundProjects.map((project) =>
      scopeProjectRef(project.environmentId, project.id),
    ),
    availableProjects: projects.filter((project) => !boundKeys.has(environmentProjectKey(project))),
    unresolvedBindings,
  };
}

export function useRoomProjectBindings(roomId: string) {
  const projects = useProjects();
  const [bindings, setBindings] = useLocalStorage(
    ROOMS_PROJECT_BINDINGS_STORAGE_KEY,
    EMPTY_ROOMS_PROJECT_BINDINGS,
    RoomsProjectBindings,
  );
  const resolved = useMemo(
    () => resolveRoomProjectBindings(bindings, roomId, projects),
    [bindings, projects, roomId],
  );
  const bindProject = useCallback(
    (project: EnvironmentProject) => {
      setBindings((current) => addRoomProjectBinding(current, roomId, project));
    },
    [roomId, setBindings],
  );
  const unbindProject = useCallback(
    (projectRef: PersistedRoomsProjectRef) => {
      setBindings((current) => removeRoomProjectBinding(current, roomId, projectRef));
    },
    [roomId, setBindings],
  );

  return { ...resolved, bindProject, unbindProject };
}
