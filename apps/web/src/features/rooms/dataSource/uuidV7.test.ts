import { describe, expect, it } from "vite-plus/test";

import { createLowercaseUuidV7 } from "./uuidV7";

describe("Rooms UUIDv7 request ids", () => {
  it("encodes the timestamp, version, variant, and lowercase random bytes", () => {
    const value = createLowercaseUuidV7(
      () => 0x019fb9f01000,
      (bytes) => bytes.fill(0xab),
    );
    expect(value).toBe("019fb9f0-1000-7bab-abab-abababababab");
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
