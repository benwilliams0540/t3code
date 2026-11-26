// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Request identity for idempotent Rooms writes.
import * as NodeCrypto from "node:crypto";

/** Lowercase UUIDv7, the request identity Rooms requires for idempotent writes. */
export function createUuidV7(
  now: () => number = Date.now,
  fillRandom: (bytes: Uint8Array) => void = (bytes) => {
    NodeCrypto.randomFillSync(bytes);
  },
): string {
  const bytes = new Uint8Array(16);
  fillRandom(bytes);
  const timestamp = BigInt(Math.floor(now()));
  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Number((timestamp >> BigInt(8 * (5 - index))) & 0xffn);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
