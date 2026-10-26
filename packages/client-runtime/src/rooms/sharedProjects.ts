import * as Schema from "effect/Schema";

const Contract = Schema.Struct({
  id: Schema.Literal("rooms.shared-projects"),
  version: Schema.Literal(1),
});
const Project = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  host_id: Schema.String,
  environment_id: Schema.String,
  checkout_id: Schema.String,
  include_untracked: Schema.Boolean,
  sharing_revision: Schema.String,
});
const Observation = Schema.Struct({
  observed_at: Schema.String,
  base_revision: Schema.NullOr(Schema.String),
  consistency: Schema.Literal("individual_read"),
  retention: Schema.Literal("request_only"),
});
const List = Schema.Struct({
  contract: Contract,
  room_id: Schema.String,
  projects: Schema.Array(Project),
});
const Scope = {
  contract: Contract,
  room_id: Schema.String,
  project: Project,
  observation: Observation,
};
const Entries = Schema.Struct({
  ...Scope,
  directory: Schema.String,
  truncated: Schema.Boolean,
  entries: Schema.Array(
    Schema.Struct({ path: Schema.String, kind: Schema.Literals(["file", "directory"]) }),
  ),
});
const File = Schema.Struct({ ...Scope, path: Schema.String, content: Schema.String });
const Changes = Schema.Struct({
  ...Scope,
  truncated: Schema.Boolean,
  changes: Schema.Array(Schema.Struct({ path: Schema.String, status: Schema.String })),
});
const Diff = Schema.Struct({
  ...Scope,
  path: Schema.String,
  staged: Schema.String,
  unstaged: Schema.String,
  untracked: Schema.NullOr(Schema.String),
});
export type RoomsSharedProject = typeof Project.Type;
export type RoomsProjectEntries = typeof Entries.Type;
export type RoomsProjectChanges = typeof Changes.Type;
export type RoomsProjectFile = typeof File.Type;
export type RoomsProjectDiff = typeof Diff.Type;

export class RoomsProjectScopeError extends Error {
  constructor() {
    super("The project response does not match the selected room, project or path.");
  }
}

export function createRoomsSharedProjectsClient(
  request: <T>(
    path: string,
    method: "GET" | "POST",
    decode: (input: unknown) => T,
    body?: Readonly<Record<string, unknown>>,
  ) => Promise<T>,
) {
  const root = (room: string) => `/rooms/human/v2/rooms/${encodeURIComponent(room)}/projects`;
  async function observe<
    T extends { readonly room_id: string; readonly project: RoomsSharedProject },
  >(
    room: string,
    project: string,
    operation: string,
    decode: (input: unknown) => T,
    path?: string,
  ): Promise<T> {
    const query = path === undefined ? "" : `?${new URLSearchParams({ path })}`;
    const result = await request(
      `${root(room)}/${encodeURIComponent(project)}/${operation}${query}`,
      "GET",
      decode,
    );
    if (
      result.room_id !== room ||
      result.project.id !== project ||
      (path !== undefined &&
        ("path" in result
          ? result.path !== path
          : "directory" in result && result.directory !== path))
    )
      throw new RoomsProjectScopeError();
    return result;
  }
  return {
    list: async (room: string) => {
      const result = await request(root(room), "GET", Schema.decodeUnknownSync(List));
      if (result.room_id !== room) throw new RoomsProjectScopeError();
      return result;
    },
    entries: (room: string, project: string, path = "") =>
      observe(room, project, "entries", Schema.decodeUnknownSync(Entries), path),
    file: (room: string, project: string, path: string) =>
      observe(room, project, "file", Schema.decodeUnknownSync(File), path),
    changes: (room: string, project: string) =>
      observe(room, project, "changes", Schema.decodeUnknownSync(Changes)),
    diff: (room: string, project: string, path: string) =>
      observe(room, project, "diff", Schema.decodeUnknownSync(Diff), path),
  };
}
export type RoomsSharedProjectsClient = ReturnType<typeof createRoomsSharedProjectsClient>;
