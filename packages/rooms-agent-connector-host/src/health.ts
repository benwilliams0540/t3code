// @effect-diagnostics globalDate:off nodeBuiltinImport:off - The resident host owns this fixed local health probe.
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";

export interface ResidentServiceHealth {
  readonly active: boolean | null;
  readonly loadState: string;
  readonly state: string;
  readonly unitFileState: string;
  readonly restartCount: number | null;
}

export interface ResidentHostHealthSnapshot {
  readonly schemaVersion: 1;
  readonly observedAt: string;
  readonly node: {
    readonly hostname: string;
    readonly uptimeSeconds: number;
  };
  readonly services: {
    readonly tailscaled: ResidentServiceHealth;
    readonly openclawGateway: ResidentServiceHealth;
    readonly roomsClawConnector: ResidentServiceHealth;
  };
  readonly railsUp: {
    readonly ok: boolean;
    readonly httpStatus: number | null;
  };
}

type ServiceScope = "system" | "user";
type InspectService = (scope: ServiceScope, unit: string) => Promise<ResidentServiceHealth>;

const unknownService = (): ResidentServiceHealth => ({
  active: null,
  loadState: "unknown",
  state: "unknown",
  unitFileState: "unknown",
  restartCount: null,
});

const safeState = (value: string | undefined): string =>
  value !== undefined && /^[a-z0-9_-]{1,64}$/u.test(value) ? value : "unknown";

const parseSystemdProperties = (stdout: string): ResidentServiceHealth => {
  const properties = new Map(
    stdout
      .trim()
      .split("\n")
      .map((line) => line.split("=", 2) as [string, string]),
  );
  const loadState = properties.get("LoadState");
  const activeState = properties.get("ActiveState");
  const subState = properties.get("SubState");
  const unitFileState = properties.get("UnitFileState");
  if (loadState !== "loaded" || activeState === undefined || subState === undefined) {
    return unknownService();
  }
  const restartText = properties.get("NRestarts");
  const restartCount = restartText === undefined ? null : Number.parseInt(restartText, 10);
  return {
    active: activeState === "active",
    loadState,
    state: safeState(subState),
    unitFileState: safeState(unitFileState),
    restartCount:
      restartCount !== null && Number.isSafeInteger(restartCount) && restartCount >= 0
        ? restartCount
        : null,
  };
};

const inspectSystemdService: InspectService = async (scope, unit) => {
  const args = [
    ...(scope === "user" ? ["--user"] : []),
    "show",
    unit,
    "--property=ActiveState",
    "--property=LoadState",
    "--property=SubState",
    "--property=UnitFileState",
    "--property=NRestarts",
    "--no-pager",
  ];
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      NodeChildProcess.execFile(
        "/usr/bin/systemctl",
        args,
        { encoding: "utf8", timeout: 2_000, maxBuffer: 4_096, shell: false },
        (error, output) => (error ? reject(error) : resolve(output)),
      );
    });
    return parseSystemdProperties(stdout);
  } catch {
    return unknownService();
  }
};

export const collectResidentHostHealth = async (input: {
  readonly roomsBaseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly inspectService?: InspectService;
  readonly now?: () => Date;
  readonly hostname?: () => string;
  readonly uptimeSeconds?: () => number;
}): Promise<ResidentHostHealthSnapshot> => {
  const inspect = input.inspectService ?? inspectSystemdService;
  const fetch = input.fetch ?? globalThis.fetch;
  const [tailscaled, openclawGateway, roomsClawConnector, railsUp] = await Promise.all([
    inspect("system", "tailscaled.service"),
    inspect("user", "openclaw-gateway.service"),
    inspect("user", "rooms-claw-connector.service"),
    fetch(`${input.roomsBaseUrl}/up`, {
      method: "GET",
      signal: AbortSignal.timeout(2_000),
    })
      .then((response) => ({ ok: response.ok, httpStatus: response.status }))
      .catch(() => ({ ok: false, httpStatus: null })),
  ]);
  const rawHostname = (input.hostname ?? NodeOS.hostname)();
  const hostname = /^[a-z0-9][a-z0-9.-]{0,252}$/iu.test(rawHostname) ? rawHostname : "unknown";
  const rawUptime = (input.uptimeSeconds ?? NodeOS.uptime)();
  const uptimeSeconds = Number.isFinite(rawUptime) && rawUptime >= 0 ? Math.floor(rawUptime) : 0;
  return {
    schemaVersion: 1,
    observedAt: (input.now ?? (() => new Date()))().toISOString(),
    node: {
      hostname,
      uptimeSeconds,
    },
    services: { tailscaled, openclawGateway, roomsClawConnector },
    railsUp,
  };
};
