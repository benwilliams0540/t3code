import * as NodeCrypto from "node:crypto";
import { describe, expect, it } from "vite-plus/test";

import { ROOMS_WORKSPACE_READ_SOURCE } from "../model/source";
import { RoomsWorkspaceDecodeError, decodeRoomsWorkspaceReadV2 } from "../model/workspace-v2";
import { roomsWorkspaceFixture, rawWorkspaceReadV2Schema } from ".";
import rawWorkspaceReadV2Document from "./workspace-read-v2.json";
import rawWorkspaceReadV2 from "./workspace-read-v2.json?raw";
import rawWorkspaceReadV2SchemaText from "./workspace-read-v2.schema.json?raw";

function sha256(value: string): string {
  return NodeCrypto.createHash("sha256").update(value).digest("hex");
}

function decode(document: unknown) {
  return decodeRoomsWorkspaceReadV2(document, rawWorkspaceReadV2Schema);
}

function expectRejected(document: unknown, message: RegExp): void {
  expect(() => decode(document)).toThrow(RoomsWorkspaceDecodeError);
  expect(() => decode(document)).toThrow(message);
}

describe("workspace-read v2 checked boundary", () => {
  it("pins and decodes the certified producer artifacts", () => {
    expect(ROOMS_WORKSPACE_READ_SOURCE).toMatchObject({
      repositorySha: "ec952f2b3ad57147f77885adb46b651c22723799",
      contractVersion: 2,
      schemaSha256: "d97341464e1478b3393c074cec9d09576fbd88c629fc6a333b4b1481b5590a24",
      fixtureSha256: "ee65fd50124d992a8fb9a6ddb100467118b5b96d223721d3a003044bbd31ada1",
    });
    expect(sha256(rawWorkspaceReadV2SchemaText)).toBe(ROOMS_WORKSPACE_READ_SOURCE.schemaSha256);
    expect(sha256(rawWorkspaceReadV2)).toBe(ROOMS_WORKSPACE_READ_SOURCE.fixtureSha256);
    expect(roomsWorkspaceFixture.workspaces.map((workspace) => workspace.room_id)).toEqual(
      roomsWorkspaceFixture.rooms.map((room) => room.id),
    );
  });

  it("rejects a version and schema URI mismatch before exposure", () => {
    const malformed = structuredClone(rawWorkspaceReadV2Document);
    malformed.contract.schema_uri = "https://rooms.local/contracts/workspace-read/v1/schema.json";
    expectRejected(malformed, /jointly identify/);
  });

  it("rejects non-RFC-3339 timestamps at the schema boundary", () => {
    const malformed = structuredClone(rawWorkspaceReadV2Document);
    malformed.contract.captured_at = "2026";
    expectRejected(malformed, /RFC 3339 date-time/);
  });

  it("rejects closed-union payload drift", () => {
    const malformed = structuredClone(rawWorkspaceReadV2Document);
    const reaction = malformed.workspaces[0]!.feeds[0]!.items[1]!;
    Object.assign(reaction.payload, { body_markdown: "not a reaction field" });
    expectRejected(malformed, /closed object|closed union/);
  });

  it("rejects duplicate global source-event identities and sequences", () => {
    const malformed = structuredClone(rawWorkspaceReadV2Document);
    malformed.workspaces[1]!.source_events[0] = structuredClone(
      malformed.workspaces[0]!.source_events[0]!,
    );
    expectRejected(malformed, /source_events.*duplicates/);
  });

  it("rejects unresolved and mismatched feed source events", () => {
    const unresolved = structuredClone(rawWorkspaceReadV2Document);
    unresolved.workspaces[0]!.feeds[0]!.items[0]!.source_event.event_id =
      unresolved.workspaces[1]!.source_events[0]!.event_id;
    expectRejected(unresolved, /must resolve in the workspace source-event registry/);

    const mismatched = structuredClone(rawWorkspaceReadV2Document);
    mismatched.workspaces[0]!.feeds[0]!.items[0]!.source_event.schema += 1;
    expectRejected(mismatched, /must exactly equal its registered source event/);
  });

  it("rejects reaction targets outside the channel feed", () => {
    const malformed = structuredClone(rawWorkspaceReadV2Document);
    const reaction = malformed.workspaces[0]!.feeds[0]!.items[1]!;
    if (reaction.kind !== "reaction") throw new Error("Certified fixture reaction moved.");
    Reflect.set(
      reaction.payload,
      "target_feed_item_id",
      malformed.workspaces[0]!.feeds[1]!.items[0]!.id,
    );
    expectRejected(malformed, /same channel feed/);
  });

  it("rejects Recent Activity references from another workspace", () => {
    const malformed = structuredClone(rawWorkspaceReadV2Document);
    malformed.workspaces[0]!.dashboard.recent_activity[0]!.feed_item_id =
      malformed.workspaces[1]!.feeds[0]!.items[0]!.id;
    expectRejected(malformed, /non-local feed item/);
  });

  it("rejects audit provenance from another workspace registry", () => {
    const malformed = structuredClone(rawWorkspaceReadV2Document);
    malformed.workspaces[0]!.audit[0]!.source_event_id =
      malformed.workspaces[1]!.source_events[0]!.event_id;
    expectRejected(malformed, /audit.*source_event_id.*resolve/);
  });

  it("rejects explicit and mirrored attribution conflation", () => {
    const malformed = structuredClone(rawWorkspaceReadV2Document);
    const mirrored = malformed.workspaces[0]!.feeds[0]!.items.find(
      (item) => item.attribution.mode === "mirrored_source",
    );
    if (!mirrored) throw new Error("Certified fixture mirrored item moved.");
    mirrored.attribution.writer_principal_id = "a:019fb920-0003-7000-8000-000000000001";
    expectRejected(malformed, /mirrored attribution requires an adapter agent/);
  });

  it("rejects drift from the frozen feature and security gate policies", () => {
    const featureDrift = structuredClone(rawWorkspaceReadV2Document);
    const featureWorkflow = featureDrift.workspaces[0]!.workflows.find(
      (workflow) => workflow.story_type === "feature",
    );
    const featureGate = featureWorkflow?.stages.find((stage) => stage.key === "human_qa")?.gate;
    if (!featureGate) throw new Error("Certified fixture feature gate moved.");
    Reflect.set(featureGate.evidence, "mode", "all");
    expectRejected(featureDrift, /feature evidence and reviewer policy must remain exact/);

    const securityDrift = structuredClone(rawWorkspaceReadV2Document);
    const securityWorkflow = securityDrift.workspaces[0]!.workflows.find(
      (workflow) => workflow.story_type === "security",
    );
    const securityGate = securityWorkflow?.stages.find((stage) => stage.key === "done")?.gate;
    if (!securityGate) throw new Error("Certified fixture security gate moved.");
    Reflect.set(securityGate.reviewer, "forbid_self_review", false);
    expectRejected(securityDrift, /security evidence and reviewer policy must remain exact/);
  });

  it("rejects unread cursor/count drift", () => {
    const malformed = structuredClone(rawWorkspaceReadV2Document);
    malformed.rooms[0]!.unread.count -= 1;
    expectRejected(malformed, /number of counted event sequences/);
  });

  it("rejects feed items outside the exclusive cursor and pinned snapshot", () => {
    const malformed = structuredClone(rawWorkspaceReadV2Document);
    malformed.workspaces[0]!.feeds[0]!.page_info.snapshot_head_seq = 308;
    expectRejected(malformed, /exclusive cursor and pinned snapshot/);
  });

  it("rejects an incomplete declared-room workspace set", () => {
    const malformed = structuredClone(rawWorkspaceReadV2Document);
    malformed.workspaces.pop();
    expectRejected(malformed, /at least 2 items|missing workspace/);
  });
});
