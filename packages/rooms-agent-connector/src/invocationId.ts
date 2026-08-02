import * as NodeCrypto from "node:crypto";

import {
  RESIDENT_AGENT_INVOCATION_CONTRACT,
  RESIDENT_AGENT_CONTRACT_VERSION,
} from "./contracts.ts";

export function deriveInvocationId(connectorId: string, sourceMessageId: string): string {
  const digest = NodeCrypto.createHash("sha256")
    .update(
      `${RESIDENT_AGENT_INVOCATION_CONTRACT}/v${RESIDENT_AGENT_CONTRACT_VERSION}\n${connectorId}\n${sourceMessageId}`,
      "utf8",
    )
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
