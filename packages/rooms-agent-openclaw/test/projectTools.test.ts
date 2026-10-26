// @effect-diagnostics nodeBuiltinImport:off - Real loopback requests and temporary credentials exercise the host adapter.
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import plugin, { projectToolNames, type ProjectTool } from "../src/index.ts";
import { parseConfig, type ProjectToolContext } from "../src/client.ts";

const project = {
  id: "demo",
  name: "Demo",
  host_id: "fixture-host",
  environment_id: "fixture-env",
  checkout_id: "fixture-checkout",
  include_untracked: false,
  sharing_revision: "grant-1",
};
const scope = {
  contract: { id: "rooms.shared-projects", version: 1 },
  room_id: "room:fixture",
  project,
  observation: {
    observed_at: "2026-10-26T20:00:00Z",
    base_revision: "abcdef",
    consistency: "individual_read",
    retention: "request_only",
  },
};
const context = {
  agentId: "main",
  sessionKey: "agent:main:rooms:019c0000-0000-7000-8000-000000000001",
  sessionId: "actual-session",
};

describe("resident agent shared project tools", () => {
  let temporary: string;
  let bearerFile: string;
  let origin: string;
  let server: NodeHttp.Server;
  let requests: { url: string; method: string; headers: NodeHttp.IncomingHttpHeaders }[];
  let handler: (request: NodeHttp.IncomingMessage, response: NodeHttp.ServerResponse) => void;
  let content: string;

  beforeEach(async () => {
    temporary = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "rooms-project-tools-"));
    bearerFile = NodePath.join(temporary, "credential");
    NodeFS.writeFileSync(bearerFile, "rag1.disposable-project-credential", { mode: 0o600 });
    requests = [];
    content = "export const greeting = 'current';\n";
    handler = (request, response) => {
      response.setHeader("Content-Type", "application/json");
      const url = new URL(request.url!, "http://localhost");
      const path = url.searchParams.get("path") ?? "";
      const body = url.pathname.endsWith("/file")
        ? { ...scope, path, content }
        : url.pathname.endsWith("/diff")
          ? { ...scope, path, staged: "", unstaged: "-old\n+current\n", untracked: null }
          : url.pathname.endsWith("/entries")
            ? {
                ...scope,
                directory: path,
                truncated: false,
                entries: [{ path: "src/a b.ts", kind: "file" }],
              }
            : url.pathname.endsWith("/changes")
              ? { ...scope, truncated: false, changes: [{ path: "src/a b.ts", status: " M" }] }
              : { contract: scope.contract, room_id: scope.room_id, projects: [project] };
      response.end(JSON.stringify(body));
    };
    server = NodeHttp.createServer((request, response) => {
      requests.push({ url: request.url!, method: request.method!, headers: request.headers });
      handler(request, response);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("loopback listener unavailable");
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    NodeFS.rmSync(temporary, { recursive: true, force: true });
  });

  function register(overrides: Record<string, unknown> = {}) {
    let factory: ((context: ProjectToolContext) => ProjectTool[] | null) | undefined;
    let registration: unknown;
    plugin.register({
      pluginConfig: {
        baseUrl: origin,
        bearerFile,
        roomId: scope.room_id,
        agentId: "main",
        ...overrides,
      },
      registerTool: (value, options) => {
        factory = value;
        registration = options;
      },
    });
    return { factory: factory!, registration };
  }

  function tools(ctx: ProjectToolContext = context) {
    const result = register().factory(ctx);
    if (!result) throw new Error("tools unavailable");
    return Object.fromEntries(result.map((tool) => [tool.name, tool]));
  }

  it("registers five optional read tools only for runtime-provided Rooms sessions", () => {
    const { factory, registration } = register();
    expect(registration).toEqual({ names: projectToolNames, optional: true });
    expect(factory(context)?.map((tool) => tool.name)).toEqual(projectToolNames);
    for (const ctx of [
      {},
      { ...context, agentId: "someone-else" },
      { ...context, sessionKey: "agent:main:main" },
      { ...context, sessionId: "" },
    ])
      expect(factory(ctx)).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it("reads the current file and diff through real HTTP using the configured room and actual session", async () => {
    const current = tools();
    const call = (op: string, args: Record<string, unknown>) =>
      current[`rooms_project_${op}`]!.execute("call-1", args);
    expect((await call("list", {})).details).toMatchObject({ projects: [project] });
    expect((await call("entries", { project_id: "demo" })).details).toMatchObject({
      entries: [{ path: "src/a b.ts" }],
    });
    expect((await call("changes", { project_id: "demo" })).details).toMatchObject({
      changes: [{ path: "src/a b.ts" }],
    });
    expect((await call("file", { project_id: "demo", path: "src/a b.ts" })).details).toMatchObject({
      content,
      project,
      observation: scope.observation,
    });
    content = "export const greeting = 'updated';\n";
    expect((await call("file", { project_id: "demo", path: "src/a b.ts" })).details).toMatchObject({
      content,
    });
    expect((await call("diff", { project_id: "demo", path: "src/a b.ts" })).details).toMatchObject({
      unstaged: "-old\n+current\n",
    });
    expect(requests.map((request) => request.url)).toEqual([
      "/agent/v2/runtime/projects",
      "/agent/v2/runtime/projects/demo/entries?path=",
      "/agent/v2/runtime/projects/demo/changes",
      "/agent/v2/runtime/projects/demo/file?path=src%2Fa+b.ts",
      "/agent/v2/runtime/projects/demo/file?path=src%2Fa+b.ts",
      "/agent/v2/runtime/projects/demo/diff?path=src%2Fa+b.ts",
    ]);
    for (const request of requests) {
      expect(request.method).toBe("GET");
      expect(request.headers).toMatchObject({
        authorization: "Bearer rag1.disposable-project-credential",
        "x-rooms-runtime-session-key": context.sessionKey,
        "x-rooms-runtime-session-id": context.sessionId,
        "x-rooms-runtime-agent-id": "main",
      });
      expect(request.url).not.toContain("credential");
    }
  });

  it("returns no retained content when the server revokes access and rereads rotated credentials", async () => {
    const tool = tools().rooms_project_file!;
    const input = { project_id: "demo", path: "README.md" };
    expect((await tool.execute("first", input)).isError).toBeUndefined();
    NodeFS.writeFileSync(bearerFile, "rag1.rotated-project-credential");
    handler = (_request, response) => {
      response.writeHead(403);
      response.end("private failure detail");
    };
    expect(await tool.execute("second", input)).toEqual({
      content: [{ type: "text", text: "project_tools_access_denied" }],
      details: { error: "project_tools_access_denied", retryable: false },
      isError: true,
    });
    expect(requests[1]!.headers.authorization).toBe("Bearer rag1.rotated-project-credential");
  });

  it("refuses model-supplied authority and unsafe paths before making an HTTP request", async () => {
    const tool = tools().rooms_project_file!;
    for (const input of [
      { project_id: "demo", path: "README.md", room_id: "other" },
      { project_id: "demo", path: "README.md", session_key: context.sessionKey },
      { project_id: "demo", path: "README.md", root: "/etc" },
      ...["../secret", "/etc/passwd", "a/../secret", "a\\b", "a//b", "a\u0000b"].map((path) => ({
        project_id: "demo",
        path,
      })),
    ])
      expect((await tool.execute("invalid", input)).details).toEqual({
        error: "project_tools_input_invalid",
        retryable: false,
      });
    expect(requests).toHaveLength(0);
  });

  it("refuses wrong room, project, path, version and retention responses", async () => {
    const tool = tools().rooms_project_file!;
    for (const patch of [
      { room_id: "other" },
      { project: { ...project, id: "other" } },
      { path: "other.txt" },
      { contract: { id: "rooms.shared-projects", version: 2 } },
      { observation: { ...scope.observation, retention: "permanent" } },
    ]) {
      handler = (_request, response) =>
        response.end(
          JSON.stringify({ ...scope, path: "README.md", content: "must not escape", ...patch }),
        );
      const result = await tool.execute("bad-scope", { project_id: "demo", path: "README.md" });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain("must not escape");
    }
  });

  it("uses the backend's UTF-8 byte path limit, including multibyte paths", async () => {
    const tool = tools().rooms_project_file!;
    for (const path of ["a".repeat(512), "é".repeat(256), "😀".repeat(128)]) {
      expect(
        (await tool.execute("boundary", { project_id: "demo", path })).isError,
      ).toBeUndefined();
    }
    const count = requests.length;
    for (const path of ["a".repeat(513), "é".repeat(257), "😀".repeat(129)]) {
      expect((await tool.execute("oversized", { project_id: "demo", path })).details).toEqual({
        error: "project_tools_input_invalid",
        retryable: false,
      });
    }
    expect(requests).toHaveLength(count);
  });

  it("distinguishes invalid input, denied, missing and retryable reads without exposing server detail", async () => {
    const cases = [
      [401, "project_tools_access_denied", false],
      [403, "project_tools_access_denied", false],
      [404, "project_tools_not_found", false],
      [409, "project_tools_read_conflict", true],
      [422, "project_tools_input_invalid", false],
      [503, "project_tools_read_unavailable", true],
    ] as const;
    const tool = tools().rooms_project_file!;
    for (const [status, error, retryable] of cases) {
      handler = (_request, response) => {
        response.writeHead(status);
        response.end("private configuration detail");
      };
      const result = await tool.execute("read-error", { project_id: "demo", path: "README.md" });
      expect(result.details).toEqual({ error, retryable });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain("private configuration detail");
    }
  });

  it("bounds responses and does not follow redirects", async () => {
    const tool = tools().rooms_project_list!;
    handler = (_request, response) => {
      response.writeHead(302, { location: `${origin}/redirected` });
      response.end();
    };
    expect((await tool.execute("redirect", {})).isError).toBe(true);
    expect(requests).toHaveLength(1);
    handler = (_request, response) => response.end("x".repeat(2 * 1024 * 1024 + 1));
    expect((await tool.execute("large", {})).details).toEqual({
      error: "project_tools_response_too_large",
      retryable: false,
    });
  });

  it("rejects public origins and unsafe credential files without exposing secret or file paths", async () => {
    for (const baseUrl of [
      "https://example.com",
      "http://127.0.0.1@evil.example",
      `${origin}/prefix`,
      `${origin}?token=secret`,
    ])
      expect(() => parseConfig({ baseUrl, bearerFile, roomId: "room", agentId: "main" })).toThrow();
    const tool = tools().rooms_project_list!;
    NodeFS.chmodSync(bearerFile, 0o644);
    expect((await tool.execute("bad-mode", {})).details).toEqual({
      error: "project_tools_credential_unavailable",
      retryable: false,
    });
    NodeFS.renameSync(bearerFile, `${bearerFile}.real`);
    NodeFS.symlinkSync(`${bearerFile}.real`, bearerFile);
    expect((await tool.execute("symlink", {})).details).toEqual({
      error: "project_tools_credential_unavailable",
      retryable: false,
    });
    expect(requests).toHaveLength(0);
  });

  it("honors cancellation and current invocation authority before returning content", async () => {
    const abort = new AbortController();
    abort.abort();
    expect((await tools().rooms_project_list!.execute("cancel", {}, abort.signal)).isError).toBe(
      true,
    );
    let checks = 0;
    const current = tools({
      ...context,
      assertInvocationCurrent() {
        if (++checks === 2) throw new Error("expired");
      },
    });
    expect(
      (
        await current.rooms_project_file!.execute("expired", {
          project_id: "demo",
          path: "README.md",
        })
      ).isError,
    ).toBe(true);
    expect(checks).toBe(2);
  });
});
