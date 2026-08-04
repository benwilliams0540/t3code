// @effect-diagnostics nodeBuiltinImport:off - This executable owns a narrow local filesystem boundary.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

export const HOST_CONFIG_CONTRACT = {
  id: "rooms.resident-agent-host-config",
  version: 1,
} as const;

export interface ResidentHostConfig {
  readonly contract: typeof HOST_CONFIG_CONTRACT;
  readonly connector: {
    readonly id: string;
    readonly version: number;
    readonly configurationEpoch: number;
  };
  readonly rooms: {
    readonly baseUrl: string;
    readonly bearerTokenFile: string;
    readonly roomId: string;
    readonly channelId: string;
    readonly agentPrincipalId: string;
    readonly hostMachinePrincipalId: string;
  };
  readonly nativeT3: {
    readonly environmentId: string;
    readonly projectId: string;
    readonly threadId: string;
  };
  readonly openClaw: {
    readonly gatewayUrl: string;
    readonly configFile: string;
    readonly hostId: string;
    readonly agentId: string;
  };
  readonly stateDirectory: string;
  readonly delivery: {
    readonly initialCursor: number;
    readonly timeoutMs: number;
    readonly retryDelayMs: number;
  };
}

export class HostConfigurationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HostConfigurationError";
    this.code = code;
  }
}

const record = (value: unknown, label: string): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HostConfigurationError("configuration_invalid", `${label} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
};

const exact = (
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new HostConfigurationError(
      "configuration_invalid",
      `${label} does not match the frozen configuration contract.`,
    );
  }
};

const text = (value: unknown, label: string, max = 512): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new HostConfigurationError("configuration_invalid", `${label} is invalid.`);
  }
  return value;
};

const identifier = (value: unknown, label: string, pattern: RegExp): string => {
  const result = text(value, label, 128);
  if (!pattern.test(result)) {
    throw new HostConfigurationError("configuration_invalid", `${label} is invalid.`);
  }
  return result;
};

const integer = (value: unknown, label: string, minimum: number, maximum: number): number => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new HostConfigurationError("configuration_invalid", `${label} is invalid.`);
  }
  return Number(value);
};

const absolutePath = (value: unknown, label: string): string => {
  const path = text(value, label, 4_096);
  if (!NodePath.isAbsolute(path)) {
    throw new HostConfigurationError("configuration_invalid", `${label} must be absolute.`);
  }
  return NodePath.normalize(path);
};

const loopbackUrl = (value: unknown, protocol: "http:" | "ws:", label: string): string => {
  let url: URL;
  try {
    url = new URL(text(value, label));
  } catch {
    throw new HostConfigurationError("configuration_invalid", `${label} is invalid.`);
  }
  const host = url.hostname.toLowerCase();
  const loopback =
    host === "localhost" ||
    host === "[::1]" ||
    host === "::1" ||
    /^127(?:\.\d{1,3}){3}$/u.test(host);
  if (
    url.protocol !== protocol ||
    !loopback ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.pathname !== "" && url.pathname !== "/")
  ) {
    throw new HostConfigurationError(
      "configuration_local_only_required",
      `${label} must be a credential-free loopback origin.`,
    );
  }
  return url.origin;
};

export const parseResidentHostConfig = (value: unknown): ResidentHostConfig => {
  const root = record(value, "configuration");
  exact(
    root,
    ["contract", "connector", "rooms", "nativeT3", "openClaw", "stateDirectory", "delivery"],
    "configuration",
  );
  const contract = record(root.contract, "configuration.contract");
  exact(contract, ["id", "version"], "configuration.contract");
  if (
    contract.id !== HOST_CONFIG_CONTRACT.id ||
    contract.version !== HOST_CONFIG_CONTRACT.version
  ) {
    throw new HostConfigurationError(
      "configuration_contract_unsupported",
      "Resident host configuration contract is unsupported.",
    );
  }
  const connector = record(root.connector, "configuration.connector");
  exact(connector, ["id", "version", "configurationEpoch"], "configuration.connector");
  const rooms = record(root.rooms, "configuration.rooms");
  exact(
    rooms,
    [
      "baseUrl",
      "bearerTokenFile",
      "roomId",
      "channelId",
      "agentPrincipalId",
      "hostMachinePrincipalId",
    ],
    "configuration.rooms",
  );
  const nativeT3 = record(root.nativeT3, "configuration.nativeT3");
  exact(nativeT3, ["environmentId", "projectId", "threadId"], "configuration.nativeT3");
  const openClaw = record(root.openClaw, "configuration.openClaw");
  exact(openClaw, ["gatewayUrl", "configFile", "hostId", "agentId"], "configuration.openClaw");
  const delivery = record(root.delivery, "configuration.delivery");
  exact(delivery, ["initialCursor", "timeoutMs", "retryDelayMs"], "configuration.delivery");

  return {
    contract: HOST_CONFIG_CONTRACT,
    connector: {
      id: text(connector.id, "connector.id", 128),
      version: integer(connector.version, "connector.version", 1, 2_147_483_647),
      configurationEpoch: integer(
        connector.configurationEpoch,
        "connector.configurationEpoch",
        1,
        2_147_483_647,
      ),
    },
    rooms: {
      baseUrl: loopbackUrl(rooms.baseUrl, "http:", "rooms.baseUrl"),
      bearerTokenFile: absolutePath(rooms.bearerTokenFile, "rooms.bearerTokenFile"),
      roomId: identifier(rooms.roomId, "rooms.roomId", /^room:[0-9a-f-]{36}$/u),
      channelId: identifier(rooms.channelId, "rooms.channelId", /^channel:[0-9a-f-]{36}$/u),
      agentPrincipalId: identifier(
        rooms.agentPrincipalId,
        "rooms.agentPrincipalId",
        /^a:[0-9a-f-]{36}$/u,
      ),
      hostMachinePrincipalId: identifier(
        rooms.hostMachinePrincipalId,
        "rooms.hostMachinePrincipalId",
        /^m:[0-9a-f-]{36}$/u,
      ),
    },
    nativeT3: {
      environmentId: text(nativeT3.environmentId, "nativeT3.environmentId"),
      projectId: text(nativeT3.projectId, "nativeT3.projectId"),
      threadId: text(nativeT3.threadId, "nativeT3.threadId"),
    },
    openClaw: {
      gatewayUrl: loopbackUrl(openClaw.gatewayUrl, "ws:", "openClaw.gatewayUrl"),
      configFile: absolutePath(openClaw.configFile, "openClaw.configFile"),
      hostId: text(openClaw.hostId, "openClaw.hostId", 128),
      agentId: text(openClaw.agentId, "openClaw.agentId", 128),
    },
    stateDirectory: absolutePath(root.stateDirectory, "stateDirectory"),
    delivery: {
      initialCursor: integer(
        delivery.initialCursor,
        "delivery.initialCursor",
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      timeoutMs: integer(delivery.timeoutMs, "delivery.timeoutMs", 1_000, 30_000),
      retryDelayMs: integer(delivery.retryDelayMs, "delivery.retryDelayMs", 250, 60_000),
    },
  };
};

export const readResidentHostConfig = (filename: string): ResidentHostConfig => {
  const path = absolutePath(filename, "configuration path");
  try {
    return parseResidentHostConfig(JSON.parse(NodeFS.readFileSync(path, "utf8")) as unknown);
  } catch (error) {
    if (error instanceof HostConfigurationError) throw error;
    throw new HostConfigurationError("configuration_unreadable", "Configuration cannot be read.");
  }
};

const safeOwnedFile = (filename: string, label: string): void => {
  let stats: NodeFS.Stats;
  try {
    stats = NodeFS.lstatSync(filename);
  } catch {
    throw new HostConfigurationError("secret_unavailable", `${label} is unavailable.`);
  }
  const uid = process.getuid?.();
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    (uid !== undefined && stats.uid !== uid) ||
    (stats.mode & 0o777) !== 0o600
  ) {
    throw new HostConfigurationError(
      "secret_permissions_invalid",
      `${label} must be a regular owner-only mode-0600 file.`,
    );
  }
};

export const readRoomsBearer = (filename: string): string => {
  safeOwnedFile(filename, "Rooms bearer file");
  const value = NodeFS.readFileSync(filename, "utf8").trim();
  if (value.length < 16 || value.length > 4_096 || /[\r\n]/u.test(value)) {
    throw new HostConfigurationError("secret_invalid", "Rooms bearer file is invalid.");
  }
  return value;
};

export const readOpenClawGatewayToken = (filename: string): string => {
  safeOwnedFile(filename, "OpenClaw configuration file");
  let parsed: unknown;
  try {
    parsed = JSON.parse(NodeFS.readFileSync(filename, "utf8")) as unknown;
  } catch {
    throw new HostConfigurationError(
      "gateway_credential_unavailable",
      "OpenClaw configuration cannot be parsed.",
    );
  }
  const root = record(parsed, "OpenClaw configuration");
  const gateway = record(root.gateway, "OpenClaw gateway configuration");
  const auth = record(gateway.auth, "OpenClaw gateway authentication");
  const token = auth.token;
  if (typeof token !== "string" || token.length < 16 || token.length > 4_096) {
    throw new HostConfigurationError(
      "gateway_credential_unavailable",
      "OpenClaw Gateway token is unavailable.",
    );
  }
  return token;
};

export const ensureStateDirectory = (path: string): void => {
  NodeFS.mkdirSync(path, { recursive: true, mode: 0o700 });
  const stats = NodeFS.lstatSync(path);
  const uid = process.getuid?.();
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    (uid !== undefined && stats.uid !== uid) ||
    (stats.mode & 0o777) !== 0o700
  ) {
    throw new HostConfigurationError(
      "state_permissions_invalid",
      "State directory must be an owner-only mode-0700 directory.",
    );
  }
};
