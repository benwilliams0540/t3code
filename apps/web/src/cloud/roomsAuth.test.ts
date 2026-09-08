import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  __resetRoomsAuthenticationForTests,
  activateLocalRoomsSession,
  activateRoomsAuthentication,
  assertRoomsAuthenticationGeneration,
  deactivateLocalRoomsSession,
  deactivateRoomsAuthentication,
  markRoomsAuthenticationLoading,
  readRoomsAuthenticationSnapshot,
  readRoomsClerkToken,
  setRoomsAuthenticationOwner,
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

  it("publishes only the owner's session so a local server and Clerk never clobber each other", async () => {
    activateRoomsAuthentication("clerk-account", async () => "clerk-token");
    expect(readRoomsAuthenticationSnapshot()).toMatchObject({
      status: "signed-in",
      accountId: "clerk-account",
      source: "clerk",
    });

    setRoomsAuthenticationOwner("local");
    expect(readRoomsAuthenticationSnapshot().status).toBe("signed-out");
    activateLocalRoomsSession("acct:local", "rhs1_local-session-token");
    const localGeneration = readRoomsAuthenticationSnapshot().generation;
    expect(readRoomsAuthenticationSnapshot()).toMatchObject({
      status: "signed-in",
      accountId: "acct:local",
      source: "local",
    });
    expect(await readRoomsClerkToken(localGeneration)).toBe("rhs1_local-session-token");

    // Clerk transitions while a local server owns the session change nothing visible.
    markRoomsAuthenticationLoading();
    deactivateRoomsAuthentication();
    activateRoomsAuthentication("clerk-account-2", async () => "clerk-token-2");
    expect(readRoomsAuthenticationSnapshot().generation).toBe(localGeneration);
    expect(await readRoomsClerkToken(localGeneration)).toBe("rhs1_local-session-token");

    deactivateLocalRoomsSession();
    expect(readRoomsAuthenticationSnapshot().status).toBe("signed-out");
    await expect(readRoomsClerkToken(localGeneration)).rejects.toThrow("not active");

    // Handing ownership back republishes the latest Clerk intent.
    setRoomsAuthenticationOwner("clerk");
    expect(readRoomsAuthenticationSnapshot()).toMatchObject({
      status: "signed-in",
      accountId: "clerk-account-2",
      source: "clerk",
    });
    expect(await readRoomsClerkToken()).toBe("clerk-token-2");
  });
});
