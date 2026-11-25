import { describe, expect, it } from "vite-plus/test";

import { loadRoomsHumanMcpConfig } from "./config.ts";

const TOKEN = `rha1_${"b".repeat(43)}`;
const load = (overrides: {
  env?: Record<string, string | undefined>;
  contents?: string;
  mode?: number;
  platform?: NodeJS.Platform;
}) =>
  loadRoomsHumanMcpConfig({
    env: {
      ROOMS_HUMAN_BASE_URL: "https://fcf.example.ts.net",
      ROOMS_HUMAN_TOKEN_FILE: "/secure/token",
      ...overrides.env,
    },
    readFile: () => overrides.contents ?? `${TOKEN}\n`,
    fileMode: () => overrides.mode ?? 0o100600,
    platform: overrides.platform ?? "linux",
  });

describe("rooms human MCP configuration", () => {
  it("reads one trimmed token from a private file and an HTTPS origin", () => {
    expect(load({})).toEqual({ baseUrl: "https://fcf.example.ts.net", token: TOKEN });
    expect(load({ env: { ROOMS_HUMAN_BASE_URL: "http://127.0.0.1:3000" } }).baseUrl).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it("rejects remote HTTP, paths and credentials in the server origin", () => {
    for (const value of [
      "http://fcf.example.ts.net",
      "https://fcf.example.ts.net/rooms",
      "https://u:p@fcf.example.ts.net",
      "",
    ]) {
      expect(() => load({ env: { ROOMS_HUMAN_BASE_URL: value } })).toThrow(
        expect.objectContaining({ code: "rooms_human_base_url_invalid" }),
      );
    }
  });

  it("refuses a group- or world-readable token file", () => {
    expect(() => load({ mode: 0o100644 })).toThrow(
      expect.objectContaining({ code: "rooms_human_token_file_exposed" }),
    );
    expect(() => load({ mode: 0o100640 })).toThrow(
      expect.objectContaining({ code: "rooms_human_token_file_exposed" }),
    );
  });

  it("refuses other secrets without echoing them", () => {
    const other = `rhs1_${"c".repeat(43)}`;
    let error: unknown;
    try {
      load({ contents: other });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "rooms_human_token_malformed" });
    expect(String((error as Error).message)).not.toContain(other);
    expect(() => load({ env: { ROOMS_HUMAN_TOKEN_FILE: undefined } })).toThrow(
      expect.objectContaining({ code: "rooms_human_token_file_missing" }),
    );
  });
});
