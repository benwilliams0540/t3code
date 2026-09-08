import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  addRoomProjectBinding,
  removeRoomProjectBinding,
  resolvePersistedRoomProjectBindings,
  resolveRoomProjectBindings,
  type RoomsProjectBindings,
} from "./roomProjectBindings";

function project(environmentId: string, projectId: string, title: string): EnvironmentProject {
  return {
    environmentId: EnvironmentId.make(environmentId),
    id: ProjectId.make(projectId),
    title,
    workspaceRoot: `/work/${projectId}`,
  } as EnvironmentProject;
}

describe("local Rooms project bindings", () => {
  const roomsProject = project("environment-local", "project-rooms", "Rooms");
  const unrelatedProject = project("environment-local", "project-other", "Other");

  it("binds a room only through an exact real environment and project reference", () => {
    const bindings = addRoomProjectBinding({}, "room:rooms", roomsProject);
    const resolved = resolveRoomProjectBindings(bindings, "room:rooms", [
      roomsProject,
      unrelatedProject,
    ]);

    expect(resolved.boundProjectRefs).toEqual([
      { environmentId: "environment-local", projectId: "project-rooms" },
    ]);
    expect(resolved.availableProjects.map((candidate) => candidate.id)).toEqual(["project-other"]);
  });

  it("keeps room bindings isolated and reports stale exact references as unavailable", () => {
    const bindings: RoomsProjectBindings = {
      "room:rooms": [
        { environmentId: "environment-local", projectId: "project-rooms" },
        { environmentId: "missing-environment", projectId: "missing-project" },
      ],
      "room:other": [{ environmentId: "environment-local", projectId: "project-other" }],
    };

    expect(
      resolveRoomProjectBindings(bindings, "room:rooms", [roomsProject]).boundProjects,
    ).toEqual([roomsProject]);
    expect(
      resolveRoomProjectBindings(bindings, "room:rooms", [roomsProject]).unresolvedBindings,
    ).toEqual([{ environmentId: "missing-environment", projectId: "missing-project" }]);
    expect(
      resolveRoomProjectBindings(bindings, "room:other", [roomsProject]).boundProjects,
    ).toEqual([]);
  });

  it("removes only the requested room binding", () => {
    const initial = addRoomProjectBinding(
      addRoomProjectBinding({}, "room:rooms", roomsProject),
      "room:rooms",
      unrelatedProject,
    );
    const next = removeRoomProjectBinding(initial, "room:rooms", {
      environmentId: roomsProject.environmentId,
      projectId: roomsProject.id,
    });

    expect(
      resolveRoomProjectBindings(next, "room:rooms", [roomsProject, unrelatedProject])
        .boundProjects,
    ).toEqual([unrelatedProject]);
  });

  it("resolves Local bindings without interpreting Sample room ids", () => {
    const resolved = resolvePersistedRoomProjectBindings(
      [{ environmentId: "environment-local", projectId: "project-rooms" }],
      [roomsProject, unrelatedProject],
    );

    expect(resolved.boundProjects).toEqual([roomsProject]);
    expect(resolved.boundProjectRefs).toEqual([
      { environmentId: "environment-local", projectId: "project-rooms" },
    ]);
  });
});
