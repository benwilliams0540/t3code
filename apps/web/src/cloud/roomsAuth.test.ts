import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  __resetRoomsAuthenticationForTests,
  activateRoomsAuthentication,
  assertRoomsAuthenticationGeneration,
  deactivateRoomsAuthentication,
  readRoomsAuthenticationSnapshot,
  readRoomsClerkToken,
} from "./roomsAuth";

afterEach(__resetRoomsAuthenticationForTests);

describe("Rooms authentication", () => {
  it("issues tokens just in time and invalidates an old account generation", async () => {
    let reads = 0;
    activateRoomsAuthentication("account-a", async () => `token-${++reads}`);
    const generation = readRoomsAuthenticationSnapshot().generation;

    expect(await readRoomsClerkToken(generation)).toBe("token-1");
    expect(await readRoomsClerkToken(generation)).toBe("token-2");

    deactivateRoomsAuthentication();
    activateRoomsAuthentication("account-b", async () => "token-b");
    await expect(readRoomsClerkToken(generation)).rejects.toThrow("not active");
    expect(() => assertRoomsAuthenticationGeneration(generation)).toThrow("not active");
  });

  it("rejects missing, oversized, and header-breaking credentials", async () => {
    for (const invalid of [null, "", "token\r\nforwarded", "x".repeat(16 * 1024 + 1)]) {
      activateRoomsAuthentication("account", async () => invalid);
      await expect(readRoomsClerkToken()).rejects.toThrow(
        invalid === null ? "session expired" : "token is invalid",
      );
    }
  });
});
