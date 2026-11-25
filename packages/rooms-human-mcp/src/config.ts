// @effect-diagnostics nodeBuiltinImport:off - This executable owns a narrow local token-file boundary.
import * as NodeFS from "node:fs";

import { normalizeRoomsOrigin } from "@t3tools/shared/roomsTransport";

export const ACCESS_TOKEN_PATTERN = /^rha1_[A-Za-z0-9_-]{43}$/;

export interface RoomsHumanMcpConfig {
  readonly baseUrl: string;
  readonly token: string;
}

export class RoomsHumanConfigError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RoomsHumanConfigError";
    this.code = code;
  }
}

export interface ConfigSources {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly readFile?: (path: string) => string;
  readonly fileMode?: (path: string) => number;
  readonly platform: NodeJS.Platform;
}

/**
 * Reads the server origin and the delegated access token. The token comes only
 * from a file path, never from the environment or tool arguments, and the file
 * must not be readable by group or others.
 */
export function loadRoomsHumanMcpConfig(sources: ConfigSources): RoomsHumanMcpConfig {
  const rawBase = sources.env.ROOMS_HUMAN_BASE_URL?.trim() ?? "";
  const baseUrl = normalizeRoomsOrigin("shared", rawBase);
  if (baseUrl === null) {
    throw new RoomsHumanConfigError(
      "rooms_human_base_url_invalid",
      "ROOMS_HUMAN_BASE_URL must be an HTTPS origin (or HTTP loopback) with no path or credentials.",
    );
  }
  const tokenFile = sources.env.ROOMS_HUMAN_TOKEN_FILE?.trim() ?? "";
  if (tokenFile === "") {
    throw new RoomsHumanConfigError(
      "rooms_human_token_file_missing",
      "ROOMS_HUMAN_TOKEN_FILE must name a file holding the delegated access token.",
    );
  }
  const platform = sources.platform;
  const fileMode = sources.fileMode ?? ((path) => NodeFS.statSync(path).mode);
  const readFile = sources.readFile ?? ((path) => NodeFS.readFileSync(path, "utf8"));
  let mode: number;
  let contents: string;
  try {
    mode = fileMode(tokenFile);
    contents = readFile(tokenFile);
  } catch {
    throw new RoomsHumanConfigError(
      "rooms_human_token_file_unreadable",
      "The access token file could not be read.",
    );
  }
  if (platform !== "win32" && (mode & 0o077) !== 0) {
    throw new RoomsHumanConfigError(
      "rooms_human_token_file_exposed",
      "The access token file must not be readable by group or others (chmod 600).",
    );
  }
  const token = contents.trim();
  if (!ACCESS_TOKEN_PATTERN.test(token)) {
    // Never echo the file contents: a mistaken file may hold another secret.
    throw new RoomsHumanConfigError(
      "rooms_human_token_malformed",
      "The access token file must hold exactly one rha1_ delegated access token.",
    );
  }
  return { baseUrl, token };
}
