// @effect-diagnostics nodeBuiltinImport:off globalFetch:off - The OpenClaw plugin owns its Node credential and HTTP boundaries.
import * as NodeFS from "node:fs";
import * as NodeProcess from "node:process";
import { roomsSharedProjectDecoders } from "@t3tools/client-runtime/rooms/shared-projects";

export type ProjectOperation = keyof typeof roomsSharedProjectDecoders;
export interface ProjectToolsConfig {
  readonly baseUrl: string;
  readonly bearerFile: string;
  readonly roomId: string;
  readonly agentId: string;
}
export interface ProjectToolContext {
  readonly agentId?: string;
  readonly sessionKey?: string;
  readonly sessionId?: string;
  readonly assertInvocationCurrent?: () => void;
}

export class ProjectReadError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, retryable = false) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}

const hasControl = (value: string) =>
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

export function parseConfig(value: unknown): ProjectToolsConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProjectReadError("project_tools_configuration_invalid");
  const config = value as Record<string, unknown>;
  const keys = ["baseUrl", "bearerFile", "roomId", "agentId"];
  if (
    Object.keys(config).length !== keys.length ||
    keys.some(
      (key) => typeof config[key] !== "string" || !config[key] || hasControl(config[key] as string),
    )
  )
    throw new ProjectReadError("project_tools_configuration_invalid");
  let url: URL;
  try {
    url = new URL(config.baseUrl as string);
  } catch {
    throw new ProjectReadError("project_tools_configuration_invalid");
  }
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    !(config.bearerFile as string).startsWith("/") ||
    !/^[a-zA-Z0-9_-]{1,128}$/u.test(config.agentId as string)
  )
    throw new ProjectReadError("project_tools_configuration_invalid");
  return {
    baseUrl: url.origin,
    bearerFile: config.bearerFile as string,
    roomId: config.roomId as string,
    agentId: config.agentId as string,
  };
}

export function hasRoomSession(config: ProjectToolsConfig, context: ProjectToolContext): boolean {
  return (
    context.agentId === config.agentId &&
    typeof context.sessionKey === "string" &&
    context.sessionKey.startsWith(`agent:${config.agentId}:rooms:`) &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      context.sessionKey.slice(`agent:${config.agentId}:rooms:`.length),
    ) &&
    typeof context.sessionId === "string" &&
    context.sessionId.length > 0 &&
    context.sessionId.length <= 256 &&
    !hasControl(context.sessionId)
  );
}

function readBearer(filename: string): string {
  let descriptor: number | undefined;
  try {
    descriptor = NodeFS.openSync(
      filename,
      NodeFS.constants.O_RDONLY | NodeFS.constants.O_NOFOLLOW | NodeFS.constants.O_NONBLOCK,
    );
    const info = NodeFS.fstatSync(descriptor);
    if (
      !info.isFile() ||
      info.uid !== NodeProcess.getuid?.() ||
      (info.mode & 0o077) !== 0 ||
      info.size > 4096
    )
      throw new Error("invalid credential file");
    const bytes = Buffer.alloc(4097);
    const count = NodeFS.readSync(descriptor, bytes, 0, bytes.length, 0);
    const token = bytes.subarray(0, count).toString("utf8").trim();
    if (count > 4096 || token.length < 16 || /\s/u.test(token))
      throw new Error("invalid credential");
    return token;
  } catch {
    throw new ProjectReadError("project_tools_credential_unavailable");
  } finally {
    if (descriptor !== undefined) NodeFS.closeSync(descriptor);
  }
}

function validPath(value: unknown, allowRoot = false): value is string {
  return (
    typeof value === "string" &&
    Buffer.byteLength(value, "utf8") <= 512 &&
    ((allowRoot && value === "") ||
      (value.length > 0 &&
        !hasControl(value) &&
        !value.includes("\\") &&
        !value.split("/").some((part) => ["", ".", ".."].includes(part))))
  );
}

export async function readProject(
  config: ProjectToolsConfig,
  context: ProjectToolContext,
  operation: ProjectOperation,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  if (!hasRoomSession(config, context))
    throw new ProjectReadError("project_tools_session_required");
  context.assertInvocationCurrent?.();
  const allowed =
    operation === "list" ? [] : operation === "changes" ? ["project_id"] : ["project_id", "path"];
  if (
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    (operation !== "list" &&
      (typeof input.project_id !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/u.test(input.project_id))) ||
    (["file", "diff"].includes(operation) && !validPath(input.path)) ||
    (operation === "entries" && input.path !== undefined && !validPath(input.path, true))
  )
    throw new ProjectReadError("project_tools_input_invalid");
  const path = operation === "entries" ? (input.path ?? "") : input.path;
  const url = new URL(
    `${config.baseUrl}/agent/v2/runtime/projects${operation === "list" ? "" : `/${encodeURIComponent(input.project_id as string)}/${operation}`}`,
  );
  if (path !== undefined) url.searchParams.set("path", path as string);
  const combined = AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]);
  let body: unknown;
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: combined,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${readBearer(config.bearerFile)}`,
        "x-rooms-runtime-session-key": context.sessionKey!,
        "x-rooms-runtime-session-id": context.sessionId!,
        "x-rooms-runtime-agent-id": config.agentId,
      },
    });
    // Never pass raw server errors, redirects, transport exceptions or credentials to a model.
    if (!response.ok) {
      await response.body?.cancel();
      switch (response.status) {
        case 401:
        case 403:
          throw new ProjectReadError("project_tools_access_denied");
        case 404:
          throw new ProjectReadError("project_tools_not_found");
        case 409:
          throw new ProjectReadError("project_tools_read_conflict", true);
        case 400:
        case 422:
          throw new ProjectReadError("project_tools_input_invalid");
        default:
          throw new ProjectReadError(
            "project_tools_read_unavailable",
            response.status === 408 || response.status === 429 || response.status >= 500,
          );
      }
    }
    if (!response.body) throw new ProjectReadError("project_tools_response_invalid");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 2 * 1024 * 1024) throw new ProjectReadError("project_tools_response_too_large");
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel();
    }
    body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch (error) {
    if (error instanceof ProjectReadError) throw error;
    throw new ProjectReadError("project_tools_read_unavailable");
  }
  let result: ReturnType<(typeof roomsSharedProjectDecoders)[ProjectOperation]>;
  try {
    result = roomsSharedProjectDecoders[operation](body);
  } catch {
    throw new ProjectReadError("project_tools_response_invalid");
  }
  if (
    result.room_id !== config.roomId ||
    ("project" in result && result.project.id !== input.project_id) ||
    ("path" in result && result.path !== path) ||
    ("directory" in result && result.directory !== path)
  )
    throw new ProjectReadError("project_tools_scope_mismatch");
  context.assertInvocationCurrent?.();
  return result;
}
