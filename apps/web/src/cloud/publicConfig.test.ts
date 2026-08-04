import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  CloudPublicConfigMissingError,
  hasCloudPublicConfig,
  hasRoomsPublicConfig,
  normalizeRoomsApiUrl,
  resolveRoomsClerkTokenOptions,
  resolveRelayClerkTokenOptions,
  shouldMountClerkProvider,
} from "./publicConfig.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Rooms public configuration", () => {
  it("mounts Clerk for complete Rooms config without managed Relay", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "");
    vi.stubEnv("VITE_T3CODE_RELAY_URL", "");
    vi.stubEnv("VITE_ROOMS_API_URL", "http://127.0.0.1:33102");
    vi.stubEnv("VITE_ROOMS_CLERK_JWT_TEMPLATE", "t3-rooms");

    expect(hasCloudPublicConfig()).toBe(false);
    expect(hasRoomsPublicConfig()).toBe(true);
    expect(shouldMountClerkProvider()).toBe(true);
    expect(resolveRoomsClerkTokenOptions()).toEqual({ template: "t3-rooms" });
  });

  it("keeps the relay and Rooms templates independent", () => {
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "t3-relay");
    vi.stubEnv("VITE_ROOMS_CLERK_JWT_TEMPLATE", "t3-rooms");
    expect(resolveRelayClerkTokenOptions()).toEqual({ template: "t3-relay", skipCache: true });
    expect(resolveRoomsClerkTokenOptions()).toEqual({ template: "t3-rooms" });
  });

  it("accepts only credential-free HTTP loopback Rooms origins", () => {
    expect(normalizeRoomsApiUrl("http://127.0.0.1:33102")).toBe("http://127.0.0.1:33102");
    expect(normalizeRoomsApiUrl("http://localhost:33102/")).toBe("http://localhost:33102");
    expect(normalizeRoomsApiUrl("https://rooms.example.test")).toBeNull();
    expect(normalizeRoomsApiUrl("http://user:secret@127.0.0.1:33102")).toBeNull();
    expect(normalizeRoomsApiUrl("http://127.0.0.1:33102/rooms")).toBeNull();
  });

  it("reports a missing dedicated Rooms template", () => {
    vi.stubEnv("VITE_ROOMS_CLERK_JWT_TEMPLATE", "");
    expect(() => resolveRoomsClerkTokenOptions()).toThrowError(
      new CloudPublicConfigMissingError({ key: "T3CODE_ROOMS_CLERK_JWT_TEMPLATE" }),
    );
  });
});

describe("hasCloudPublicConfig", () => {
  it("requires both public cloud values", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "");
    vi.stubEnv("VITE_T3CODE_RELAY_URL", "");
    expect(hasCloudPublicConfig()).toBe(false);

    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    expect(hasCloudPublicConfig()).toBe(false);

    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "t3-relay");
    expect(hasCloudPublicConfig()).toBe(false);

    vi.stubEnv("VITE_T3CODE_RELAY_URL", "https://relay.example.test");
    expect(hasCloudPublicConfig()).toBe(true);
  });

  it("rejects an insecure relay URL", () => {
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "pk_test_example");
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "t3-relay");
    vi.stubEnv("VITE_T3CODE_RELAY_URL", "http://relay.example.test");

    expect(hasCloudPublicConfig()).toBe(false);
  });

  it("reports the missing Clerk JWT template as structured configuration", () => {
    vi.stubEnv("VITE_CLERK_JWT_TEMPLATE", "");

    expect(() => resolveRelayClerkTokenOptions()).toThrowError(
      new CloudPublicConfigMissingError({ key: "T3CODE_CLERK_JWT_TEMPLATE" }),
    );
  });
});
