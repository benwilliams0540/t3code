import { describe, expect, it } from "vite-plus/test";
import { createRoomsSharedProjectsClient, RoomsProjectScopeError } from "./sharedProjects.ts";

const project = {
  id: "demo",
  name: "Demo",
  host_id: "host",
  environment_id: "env",
  checkout_id: "checkout",
  include_untracked: false,
  sharing_revision: "grant1",
};
const scope = {
  contract: { id: "rooms.shared-projects", version: 1 },
  room_id: "room",
  project,
  observation: {
    observed_at: "2026-10-26T12:00:00Z",
    base_revision: "abc123",
    consistency: "individual_read",
    retention: "request_only",
  },
};

describe("shared current project reads", () => {
  it("decodes actual content through the authenticated transport with exact path encoding", async () => {
    const paths: string[] = [];
    const client = createRoomsSharedProjectsClient(async (path, method, decode) => {
      paths.push(path);
      expect(method).toBe("GET");
      return decode(
        path.includes("/file?")
          ? { ...scope, path: "src/a b.ts", content: "current content" }
          : { contract: scope.contract, room_id: "room", projects: [project] },
      );
    });
    expect((await client.list("room")).projects).toEqual([project]);
    expect((await client.file("room", "demo", "src/a b.ts")).content).toBe("current content");
    expect(paths).toEqual([
      "/rooms/human/v2/rooms/room/projects",
      "/rooms/human/v2/rooms/room/projects/demo/file?path=src%2Fa+b.ts",
    ]);
  });
  it("rejects a response for another room, project or file", async () => {
    for (const patch of [
      { room_id: "other" },
      { project: { ...project, id: "other" } },
      { path: "private.txt" },
    ]) {
      const client = createRoomsSharedProjectsClient(async (_path, _method, decode) =>
        decode({ ...scope, path: "src/main.ts", content: "value", ...patch }),
      );
      await expect(client.file("room", "demo", "src/main.ts")).rejects.toBeInstanceOf(
        RoomsProjectScopeError,
      );
    }
  });
  it("rejects malformed or retained observations instead of accepting another wire contract", async () => {
    const client = createRoomsSharedProjectsClient(async (_path, _method, decode) =>
      decode({
        ...scope,
        path: "src/main.ts",
        content: "value",
        observation: { ...scope.observation, retention: "permanent" },
      }),
    );
    await expect(client.file("room", "demo", "src/main.ts")).rejects.toThrow();
  });
});
