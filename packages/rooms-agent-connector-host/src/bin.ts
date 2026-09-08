#!/usr/bin/env node
// @effect-diagnostics globalConsole:off nodeBuiltinImport:off - This is the package's process entry point.
import * as NodeProcess from "node:process";

import { readResidentHostConfig } from "./config.ts";
import { ResidentConnectorHost, type SafeHostLog } from "./host.ts";

const Process = (NodeProcess as unknown as { readonly default: NodeJS.Process }).default;

interface CliOptions {
  readonly config: string;
  readonly check: boolean;
  readonly once: boolean;
}

const parseArguments = (arguments_: readonly string[]): CliOptions => {
  let config: string | undefined;
  let check = false;
  let once = false;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--config") {
      const value = arguments_[index + 1];
      if (!value || config !== undefined) throw new Error("cli_arguments_invalid");
      config = value;
      index += 1;
    } else if (argument === "--check" && !check) {
      check = true;
    } else if (argument === "--once" && !once) {
      once = true;
    } else {
      throw new Error("cli_arguments_invalid");
    }
  }
  if (!config || (check && once)) throw new Error("cli_arguments_invalid");
  return { config, check, once };
};

const write = (value: Readonly<Record<string, unknown>> | SafeHostLog): void => {
  Process.stdout.write(`${JSON.stringify(value)}\n`);
};

const safeCode = (error: unknown): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  if (error instanceof Error && error.message === "cli_arguments_invalid") {
    return "cli_arguments_invalid";
  }
  return "resident_host_failed";
};

const main = async (): Promise<void> => {
  let host: ResidentConnectorHost | undefined;
  let failed = false;
  const controller = new AbortController();
  const stop = () => controller.abort();
  Process.once("SIGINT", stop);
  Process.once("SIGTERM", stop);
  try {
    const options = parseArguments(Process.argv.slice(2));
    const config = readResidentHostConfig(options.config);
    host = new ResidentConnectorHost({ config, logger: write });
    if (options.check) {
      const readiness = await host.check(controller.signal);
      write({ event: "readiness", status: "ok", ...readiness });
      return;
    }
    await host.run(controller.signal, options.once);
  } catch (error) {
    write({ event: "resident_host", status: "failed", code: safeCode(error) });
    failed = true;
  } finally {
    host?.close();
    Process.removeListener("SIGINT", stop);
    Process.removeListener("SIGTERM", stop);
  }
  if (failed) Process.exit(1);
};

await main();
