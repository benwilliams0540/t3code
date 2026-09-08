import { scopedProjectKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { ScopedProjectRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useCallback, useMemo } from "react";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useProjects } from "~/state/entities";

import {
  PersistedRoomsProjectRef as PersistedRoomsProjectRefSchema,
  type PersistedRoomsProjectRef as PersistedRoomsProjectRefType,
  type RoomsDataSourceMode,
} from "../dataSource/model";
import { useRoomsDataSource } from "../dataSource/RoomsDataSourceProvider";

export const ROOMS_PROJECT_BINDINGS_STORAGE_KEY = "t3code:rooms-project-bindings:v1";

export const RoomsProjectBindings = Schema.Record(
  Schema.String,
  Schema.Array(PersistedRoomsProjectRefSchema),
);
export type RoomsProjectBindings = typeof RoomsProjectBindings.Type;
export type PersistedRoomsProjectRef = PersistedRoomsProjectRefType;

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
): ReturnType<typeof resolvePersistedRoomProjectBindings> {
  return resolvePersistedRoomProjectBindings(bindings[roomId] ?? [], projects);
}

export function resolvePersistedRoomProjectBindings(
  persistedRefs: readonly PersistedRoomsProjectRef[],
  projects: ReadonlyArray<EnvironmentProject>,
): {
  readonly boundProjects: readonly EnvironmentProject[];
  readonly boundProjectRefs: readonly ScopedProjectRef[];
  readonly availableProjects: readonly EnvironmentProject[];
  readonly unresolvedBindings: readonly PersistedRoomsProjectRef[];
} {
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

export function useRoomProjectBindings(roomId: string, sourceMode: RoomsDataSourceMode) {
  const projects = useProjects();
  const [sampleBindings, setSampleBindings] = useLocalStorage(
    ROOMS_PROJECT_BINDINGS_STORAGE_KEY,
    EMPTY_ROOMS_PROJECT_BINDINGS,
    RoomsProjectBindings,
  );
  const { localConfig, setLocalConfig } = useRoomsDataSource();
  const persistedRefs =
    sourceMode === "local"
      ? localConfig?.roomId === roomId
        ? localConfig.projectBindings
        : []
      : (sampleBindings[roomId] ?? []);
  const resolved = useMemo(
    () => resolvePersistedRoomProjectBindings(persistedRefs, projects),
    [persistedRefs, projects],
  );
  const bindProject = useCallback(
    (project: EnvironmentProject) => {
      if (sourceMode === "local") {
        setLocalConfig((current) => {
          if (current === null || current.roomId !== roomId) return current;
          const projectKey = environmentProjectKey(project);
          if (current.projectBindings.some((ref) => persistedProjectKey(ref) === projectKey)) {
            return current;
          }
          return {
            ...current,
            projectBindings: [
              ...current.projectBindings,
              { environmentId: project.environmentId, projectId: project.id },
            ],
          };
        });
        return;
      }
      setSampleBindings((current) => addRoomProjectBinding(current, roomId, project));
    },
    [roomId, setLocalConfig, setSampleBindings, sourceMode],
  );
  const unbindProject = useCallback(
    (projectRef: PersistedRoomsProjectRef) => {
      if (sourceMode === "local") {
        setLocalConfig((current) => {
          if (current === null || current.roomId !== roomId) return current;
          const key = persistedProjectKey(projectRef);
          return {
            ...current,
            projectBindings: current.projectBindings.filter(
              (candidate) => persistedProjectKey(candidate) !== key,
            ),
          };
        });
        return;
      }
      setSampleBindings((current) => removeRoomProjectBinding(current, roomId, projectRef));
    },
    [roomId, setLocalConfig, setSampleBindings, sourceMode],
  );

  return { ...resolved, bindProject, unbindProject };
}
