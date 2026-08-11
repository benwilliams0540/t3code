import * as Crypto from "expo-crypto";

export const uuidv4 = () => Crypto.randomUUID();

export function uuidv7(now: () => number = Date.now): string {
  const bytes = Crypto.getRandomBytes(16);
  const timestamp = BigInt(Math.floor(now()));
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

/** Random lowercase hex string of `byteLength` bytes (2 chars per byte). */
export const randomHex = (byteLength: number): string =>
  Array.from(Crypto.getRandomBytes(byteLength), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
