import * as Schema from "effect/Schema";

/** Immutable producer pins reviewed for M5C. */
export const ROOMS_AGENT_PRODUCER_SHA = "68d1958b5b56a760b2e7df6dad03ed1cb8173292";
export const ROOMS_AGENT_REPORT_HEAD_SHA = "4d05e2654b500fd3aef94be8676ab35039cae8a8";

export const RoomsAgentProfile = Schema.Literals(["read_only", "read_write"]);
export type RoomsAgentProfile = typeof RoomsAgentProfile.Type;

const BoundedString = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512));
const Slug = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64),
  Schema.isPattern(/^[a-z][a-z0-9_-]{0,63}$/u),
);
const UuidV7 = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u),
);
const StoryId = Schema.String.check(
  Schema.isPattern(/^story:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u),
);
const PrincipalId = Schema.String.check(
  Schema.isPattern(/^[ham]:[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u),
);
const Cursor = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096));
const PageLimit50 = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }));

export const ContextInput = Schema.Record(Schema.String, Schema.Never);
export const StoryListInput = Schema.Struct({
  cursor: Schema.optionalKey(Cursor),
  limit: Schema.optionalKey(PageLimit50),
  filters: Schema.optionalKey(
    Schema.Struct({
      stage: Schema.optionalKey(Slug),
      story_type: Schema.optionalKey(Slug),
      created_by: Schema.optionalKey(PrincipalId),
      completion: Schema.optionalKey(Schema.Literals(["complete", "incomplete"])),
      native_thread_linked: Schema.optionalKey(Schema.Boolean),
    }),
  ),
});
export const StoryGetInput = Schema.Struct({
  story_id: StoryId,
  expand: Schema.optionalKey(Schema.Array(Schema.Literal("activity")).check(Schema.isMaxLength(1))),
  activity_limit: Schema.optionalKey(PageLimit50),
  activity_cursor: Schema.optionalKey(Cursor),
});
export const StorySearchInput = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  cursor: Schema.optionalKey(Cursor),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 }))),
});

export const StoryCreateInput = Schema.Struct({
  title: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200)),
  story_type: Slug,
  link_invoking_thread: Schema.Boolean,
});
export const StoryClaimInput = Schema.Struct({
  story_id: StoryId,
  expected_stage: Slug,
  lease_seconds: Schema.Int.check(Schema.isBetween({ minimum: 60, maximum: 3600 })),
});
export const StoryReleaseInput = Schema.Struct({
  story_id: StoryId,
  expected_stage: Slug,
});
export const StoryTransitionInput = Schema.Struct({
  story_id: StoryId,
  expected_stage: Slug,
  to: Slug,
});
export const StoryAttachEvidenceInput = Schema.Struct({
  story_id: StoryId,
  expected_stage: Slug,
  kind: Schema.Literals([
    "annotation",
    "artifact",
    "command-output",
    "diff",
    "link",
    "screenshot",
    "test-run",
  ]),
  cas: Schema.Struct({
    hash: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u)),
    bytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    media_type: BoundedString,
  }),
  note: Schema.NullOr(Schema.String.check(Schema.isMaxLength(1000))),
});
export const StoryRequestReviewInput = Schema.Struct({
  story_id: StoryId,
  expected_stage: Slug,
});
export const StoryCompleteInput = Schema.Struct({
  story_id: StoryId,
  expected_stage: Slug,
  evidence: Schema.Array(UuidV7).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(100),
    Schema.isUnique(),
  ),
});
export const ChannelContextInput = Schema.Struct({
  limit: Schema.optionalKey(PageLimit50),
});
export const ArchivedThreadSummaryInput = Schema.Struct({
  story_id: StoryId,
  thread_id: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
  limit: Schema.optionalKey(PageLimit50),
});

export class RoomsAgentToolError extends Schema.TaggedErrorClass<RoomsAgentToolError>()(
  "RoomsAgentToolError",
  {
    code: Schema.String,
    status: Schema.Int,
    message: Schema.String,
    retryable: Schema.Boolean,
    details: Schema.Record(Schema.String, Schema.Unknown),
    source: Schema.Literals(["client", "server"]),
  },
) {}

export const RoomsServerErrorBody = Schema.Struct({
  error: Schema.String,
  message: Schema.String,
  retryable: Schema.Boolean,
  details: Schema.Record(Schema.String, Schema.Unknown),
});

export const RoomsReadContractResponse = Schema.Struct({
  contract: Schema.Struct({
    id: Schema.Literal("rooms.agent-stories"),
    version: Schema.Literal(2),
  }),
  tool_catalog_version: Schema.Literal(2),
});

export const RoomsWorkContractResponse = Schema.Struct({
  contract: Schema.Struct({
    id: Schema.Literal("rooms.agent-work"),
    version: Schema.Literal(1),
  }),
});

export const readToolNames = [
  "rooms_context_get",
  "rooms_story_list",
  "rooms_story_get",
  "rooms_story_search",
] as const;

export const workToolNames = [
  "rooms_story_create",
  "rooms_story_claim",
  "rooms_story_release",
  "rooms_story_transition",
  "rooms_story_attach_evidence",
  "rooms_story_request_review",
  "rooms_story_complete",
  "rooms_channel_context_get",
  "rooms_archived_thread_summary_get",
] as const;

export const roomsAgentToolNames = [...readToolNames, ...workToolNames] as const;
export type RoomsAgentToolName = (typeof roomsAgentToolNames)[number];

export const roomsAgentCatalog = {
  contracts: {
    reads: { id: "rooms.agent-stories", version: 2, catalogVersion: 2 },
    work: { id: "rooms.agent-work", version: 1 },
  },
  authenticationProfiles: ["read_only", "read_write"],
  tools: roomsAgentToolNames,
  absentCapabilityClasses: [
    "governance",
    "membership",
    "roles",
    "keys",
    "enrollment",
    "workflow_definition",
    "generic_event_append",
    "generic_channel_message",
    "connector_control",
    "native_t3_control",
    "projection_regeneration",
  ],
} as const;

const expectedReadTools = new Set<string>(readToolNames);
const expectedWorkTools = new Set<string>(workToolNames);

export const isReadTool = (name: RoomsAgentToolName): boolean => expectedReadTools.has(name);
export const isWorkTool = (name: RoomsAgentToolName): boolean => expectedWorkTools.has(name);

export const assertRoomsAgentCatalog = (catalog: typeof roomsAgentCatalog): void => {
  const reads = catalog.tools.filter((name) => expectedReadTools.has(name));
  const work = catalog.tools.filter((name) => expectedWorkTools.has(name));
  if (
    catalog.contracts.reads.id !== "rooms.agent-stories" ||
    catalog.contracts.reads.version !== 2 ||
    catalog.contracts.reads.catalogVersion !== 2 ||
    catalog.contracts.work.id !== "rooms.agent-work" ||
    catalog.contracts.work.version !== 1 ||
    reads.length !== readToolNames.length ||
    work.length !== workToolNames.length ||
    new Set(catalog.tools).size !== roomsAgentToolNames.length
  ) {
    throw new Error("Rooms Agent catalog drifted from the pinned producer contracts.");
  }
};

assertRoomsAgentCatalog(roomsAgentCatalog);
