import { validateJsonSchema, type JsonSchemaIssue } from "./jsonSchema";
import type {
  RoomsAttribution,
  RoomsEntityId,
  RoomsFeedItem,
  RoomsPrincipal,
  RoomsPrincipalId,
  RoomsProjection,
  RoomsRoom,
  RoomsSourceEvent,
  RoomsStateExample,
  RoomsWorkspace,
  RoomsWorkspaceReadDocument,
  RoomsWorkspaceReadFixture,
  RoomsWorkspaceReadV1,
} from "./workspace";

const V1_SCHEMA_URI = "https://rooms.local/contracts/workspace-read/v1/schema.json";
const V2_SCHEMA_URI = "https://rooms.local/contracts/workspace-read/v2/schema.json";
const STAGE_KEYS = ["backlog", "in_progress", "human_qa", "done"] as const;
const NAVIGATION_KEYS = [
  "dashboard",
  "channels",
  "threads",
  "vision",
  "stories",
  "evidence",
  "audit_decisions",
  "present",
] as const;
const STATE_KINDS = [
  "authorized_workspace",
  "unauthenticated",
  "unauthorized",
  "empty",
  "stale_cursor",
  "reachable_but_stale",
  "unsupported_contract_version",
] as const;
const FEED_KINDS = [
  "human_message",
  "reaction",
  "story_lifecycle",
  "run_lifecycle",
  "evidence_attached",
  "approval_requested",
  "approval_decided",
  "human_gate",
  "unknown_schema",
  "unavailable",
] as const;

type UnknownObject = { readonly [key: string]: unknown };

export class RoomsWorkspaceDecodeError extends Error {
  readonly issues: readonly JsonSchemaIssue[];

  constructor(issues: readonly JsonSchemaIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
    this.name = "RoomsWorkspaceDecodeError";
    this.issues = issues;
  }
}

function isUnknownObject(value: unknown): value is UnknownObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contractBinding(document: unknown): {
  readonly version: unknown;
  readonly schemaUri: unknown;
} {
  if (!isUnknownObject(document) || !isUnknownObject(document.contract)) {
    return { version: undefined, schemaUri: undefined };
  }
  return { version: document.contract.version, schemaUri: document.contract.schema_uri };
}

function assertV1Schema(
  document: unknown,
  schema: unknown,
): asserts document is RoomsWorkspaceReadV1 {
  const issues = validateJsonSchema(schema, document);
  if (issues.length > 0) throw new RoomsWorkspaceDecodeError(issues);
}

function assertV2Schema(
  document: unknown,
  schema: unknown,
): asserts document is RoomsWorkspaceReadFixture {
  const issues = validateJsonSchema(schema, document);
  if (issues.length > 0) throw new RoomsWorkspaceDecodeError(issues);
}

function issue(path: string, message: string): JsonSchemaIssue {
  return { path, message };
}

function equalSourceEvent(left: RoomsSourceEvent, right: RoomsSourceEvent): boolean {
  return (
    left.seq === right.seq &&
    left.event_id === right.event_id &&
    left.type === right.type &&
    left.schema === right.schema
  );
}

function expectUnique<T>(
  values: readonly T[],
  path: string,
  key: (value: T) => string | number,
  issues: JsonSchemaIssue[],
): void {
  const seen = new Set<string | number>();
  for (const value of values) {
    const identity = key(value);
    if (seen.has(identity)) issues.push(issue(path, `duplicates ${String(identity)}`));
    seen.add(identity);
  }
}

function expectOrder(values: readonly number[], path: string, issues: JsonSchemaIssue[]): void {
  if (values.some((value, index) => index > 0 && value <= values[index - 1]!)) {
    issues.push(issue(path, "must be strictly ascending and unique"));
  }
}

function validateUnread(
  unread: RoomsRoom["unread"],
  path: string,
  issues: JsonSchemaIssue[],
): void {
  const sequences = unread.counted_event_seqs;
  if (unread.count !== sequences.length) {
    issues.push(issue(`${path}.count`, "must equal the number of counted event sequences"));
  }
  expectOrder(sequences, `${path}.counted_event_seqs`, issues);
  if (unread.latest_visible_seq < unread.read_through_seq) {
    issues.push(issue(`${path}.latest_visible_seq`, "must not precede read_through_seq"));
  }
  if (
    sequences.some(
      (sequence) => sequence <= unread.read_through_seq || sequence > unread.latest_visible_seq,
    )
  ) {
    issues.push(
      issue(
        `${path}.counted_event_seqs`,
        "must fall after read_through_seq through latest_visible_seq",
      ),
    );
  }
}

function equalStringSets(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = left.toSorted();
  const sortedRight = right.toSorted();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((value, index) => value === sortedRight[index])
  );
}

function principalById(
  principals: ReadonlyMap<RoomsPrincipalId, RoomsPrincipal>,
  principalId: RoomsPrincipalId,
  path: string,
  issues: JsonSchemaIssue[],
  expectedType?: RoomsPrincipal["type"],
): RoomsPrincipal | undefined {
  const principal = principals.get(principalId);
  if (!principal) {
    issues.push(issue(path, "must reference a declared principal"));
  } else if (expectedType && principal.type !== expectedType) {
    issues.push(issue(path, `must reference a ${expectedType} principal`));
  }
  return principal;
}

function validateAttribution(
  attribution: RoomsAttribution,
  workspace: RoomsWorkspace,
  principals: ReadonlyMap<RoomsPrincipalId, RoomsPrincipal>,
  sources: ReadonlyMap<RoomsEntityId, RoomsWorkspace["sources"][number]>,
  path: string,
  issues: JsonSchemaIssue[],
): void {
  const writer = principalById(
    principals,
    attribution.writer_principal_id,
    `${path}.writer_principal_id`,
    issues,
  );
  if (attribution.mode === "explicit_principal") {
    principalById(principals, attribution.actor_principal_id, `${path}.actor_principal_id`, issues);
    if (attribution.writer_principal_id !== attribution.actor_principal_id) {
      issues.push(issue(path, "explicit writer and actor principals must be identical"));
    }
    if (writer?.type === "agent" && writer.agent_kind === "adapter") {
      issues.push(
        issue(`${path}.writer_principal_id`, "adapter agents must use mirrored attribution"),
      );
    }
    return;
  }

  if (writer?.type !== "agent" || writer.agent_kind !== "adapter") {
    issues.push(
      issue(`${path}.writer_principal_id`, "mirrored attribution requires an adapter agent"),
    );
  }
  const source = sources.get(attribution.upstream.source_id);
  if (!source || source.room_id !== workspace.room_id || source.kind !== "t3_environment") {
    issues.push(issue(`${path}.upstream.source_id`, "must reference this workspace's T3 source"));
  }
}

function validateProjection(
  projection: RoomsProjection,
  canonicalStageOrder: readonly RoomsEntityId[],
  stories: ReadonlyMap<RoomsEntityId, RoomsWorkspace["stories"][number]>,
  path: string,
  issues: JsonSchemaIssue[],
): Map<RoomsEntityId, RoomsEntityId> {
  if (
    projection.stage_order.length !== canonicalStageOrder.length ||
    projection.stage_order.some((stageId, index) => stageId !== canonicalStageOrder[index])
  ) {
    issues.push(
      issue(`${path}.stage_order`, "must equal the canonical feature workflow stage order"),
    );
  }
  if (
    projection.groups.length !== canonicalStageOrder.length ||
    projection.groups.some((group, index) => group.stage_id !== canonicalStageOrder[index])
  ) {
    issues.push(issue(`${path}.groups`, "must exhaust the canonical stage order"));
  }
  const mapping = new Map<RoomsEntityId, RoomsEntityId>();
  for (const group of projection.groups) {
    for (const storyId of group.story_ids) {
      const story = stories.get(storyId);
      if (!story) issues.push(issue(`${path}.groups`, `references unknown story ${storyId}`));
      if (story && story.stage_id !== group.stage_id) {
        issues.push(issue(`${path}.groups`, `projects ${storyId} into the wrong stage`));
      }
      if (mapping.has(storyId)) issues.push(issue(`${path}.groups`, `duplicates story ${storyId}`));
      mapping.set(storyId, group.stage_id);
    }
  }
  for (const storyId of stories.keys()) {
    if (!mapping.has(storyId)) issues.push(issue(`${path}.groups`, `omits story ${storyId}`));
  }
  return mapping;
}

function validateFeedPayload(
  item: RoomsFeedItem,
  feedItemChannels: ReadonlyMap<RoomsEntityId, RoomsEntityId>,
  stories: ReadonlyMap<RoomsEntityId, RoomsWorkspace["stories"][number]>,
  stages: ReadonlyMap<RoomsEntityId, RoomsWorkspace["workflows"][number]["stages"][number]>,
  runs: ReadonlySet<RoomsEntityId>,
  threads: ReadonlyMap<RoomsEntityId, RoomsWorkspace["threads"][number]>,
  evidence: ReadonlyMap<RoomsEntityId, RoomsWorkspace["evidence"][number]>,
  principals: ReadonlyMap<RoomsPrincipalId, RoomsPrincipal>,
  approvals: Set<RoomsEntityId>,
  path: string,
  issues: JsonSchemaIssue[],
): void {
  switch (item.kind) {
    case "human_message":
    case "unknown_schema":
    case "unavailable":
      return;
    case "reaction": {
      const targetChannel = feedItemChannels.get(item.payload.target_feed_item_id);
      if (!targetChannel) {
        issues.push(
          issue(`${path}.payload.target_feed_item_id`, "must reference a workspace feed item"),
        );
      } else if (targetChannel !== item.channel_id) {
        issues.push(
          issue(`${path}.payload.target_feed_item_id`, "must remain in the same channel feed"),
        );
      }
      return;
    }
    case "story_lifecycle":
      if (!stories.has(item.payload.story_id)) {
        issues.push(issue(`${path}.payload.story_id`, "must reference a workspace story"));
      }
      if (item.payload.from_stage_id && !stages.has(item.payload.from_stage_id)) {
        issues.push(issue(`${path}.payload.from_stage_id`, "must reference a workspace stage"));
      }
      if (!stages.has(item.payload.to_stage_id)) {
        issues.push(issue(`${path}.payload.to_stage_id`, "must reference a workspace stage"));
      }
      return;
    case "run_lifecycle":
      if (!threads.has(item.payload.thread_id)) {
        issues.push(issue(`${path}.payload.thread_id`, "must reference a workspace thread"));
      }
      if (!runs.has(item.payload.run_id)) {
        issues.push(issue(`${path}.payload.run_id`, "must reference a workspace run"));
      }
      return;
    case "evidence_attached": {
      const record = evidence.get(item.payload.evidence_id);
      if (!record || record.story_id !== item.payload.story_id) {
        issues.push(
          issue(`${path}.payload.evidence_id`, "must reference evidence for the named story"),
        );
      }
      return;
    }
    case "approval_requested":
    case "approval_decided":
      approvals.add(item.payload.approval_id);
      if (!stories.has(item.payload.story_id)) {
        issues.push(issue(`${path}.payload.story_id`, "must reference a workspace story"));
      }
      return;
    case "human_gate":
      if (!stories.has(item.payload.story_id)) {
        issues.push(issue(`${path}.payload.story_id`, "must reference a workspace story"));
      }
      if (!stages.has(item.payload.stage_id)) {
        issues.push(issue(`${path}.payload.stage_id`, "must reference a workspace stage"));
      }
      for (const evidenceId of item.payload.required_evidence_ids) {
        if (!evidence.has(evidenceId)) {
          issues.push(
            issue(`${path}.payload.required_evidence_ids`, `references unknown ${evidenceId}`),
          );
        }
      }
      for (const reviewerId of item.payload.reviewer_ids) {
        principalById(principals, reviewerId, `${path}.payload.reviewer_ids`, issues, "human");
      }
      return;
  }
}

function validateWorkspaceReadV2(document: RoomsWorkspaceReadFixture): readonly JsonSchemaIssue[] {
  const issues: JsonSchemaIssue[] = [];
  const principalMap = new Map(document.principals.map((principal) => [principal.id, principal]));
  const roomMap = new Map(document.rooms.map((room) => [room.id, room]));
  expectUnique(document.principals, "$.principals", (principal) => principal.id, issues);
  expectUnique(document.rooms, "$.rooms", (room) => room.id, issues);
  expectUnique(document.rooms, "$.rooms", (room) => room.slug, issues);

  const principalTypes = new Set(document.principals.map((principal) => principal.type));
  for (const type of ["human", "agent", "machine"] as const) {
    if (!principalTypes.has(type)) issues.push(issue("$.principals", `must include a ${type}`));
  }
  for (const principal of document.principals) {
    const expectedPrefix =
      principal.type === "human" ? "h:" : principal.type === "agent" ? "a:" : "m:";
    if (!principal.id.startsWith(expectedPrefix)) {
      issues.push(issue("$.principals", `${principal.id} has the wrong principal namespace`));
    }
    if (principal.type === "agent") {
      if (!principal.machine_id || principalMap.get(principal.machine_id)?.type !== "machine") {
        issues.push(issue("$.principals", `${principal.id} must reference a machine principal`));
      }
    } else if (principal.machine_id !== undefined || principal.agent_kind !== undefined) {
      issues.push(issue("$.principals", `${principal.id} must not carry agent fields`));
    }
  }

  for (const room of document.rooms) {
    validateUnread(room.unread, `$.rooms.${room.id}.unread`, issues);
    principalById(
      principalMap,
      room.declared_by,
      `$.rooms.${room.id}.declared_by`,
      issues,
      "human",
    );
  }

  expectUnique(document.workspaces, "$.workspaces", (workspace) => workspace.id, issues);
  expectUnique(document.workspaces, "$.workspaces", (workspace) => workspace.room_id, issues);
  const workspaceById = new Map(document.workspaces.map((workspace) => [workspace.id, workspace]));
  const workspaceByRoom = new Map(
    document.workspaces.map((workspace) => [workspace.room_id, workspace]),
  );
  const allFeedSequences: number[] = [];
  for (const room of document.rooms) {
    if (!workspaceByRoom.has(room.id))
      issues.push(issue("$.workspaces", `missing workspace for ${room.id}`));
  }
  for (const workspace of document.workspaces) {
    const workspacePath = `$.workspaces.${workspace.id}`;
    const room = roomMap.get(workspace.room_id);
    if (!room) issues.push(issue(`${workspacePath}.room_id`, "must reference a declared room"));
    principalById(
      principalMap,
      workspace.authorization.principal_id,
      `${workspacePath}.authorization.principal_id`,
      issues,
      "human",
    );
    if (room && workspace.authorization.role !== room.membership.role) {
      issues.push(issue(`${workspacePath}.authorization.role`, "must match room membership"));
    }

    const workflowMap = new Map(workspace.workflows.map((workflow) => [workflow.id, workflow]));
    expectUnique(
      workspace.workflows,
      `${workspacePath}.workflows`,
      (workflow) => workflow.id,
      issues,
    );
    expectUnique(
      workspace.workflows,
      `${workspacePath}.workflows`,
      (workflow) => workflow.story_type,
      issues,
    );
    const stageMap = new Map<
      RoomsEntityId,
      RoomsWorkspace["workflows"][number]["stages"][number]
    >();
    for (const workflow of workspace.workflows) {
      workflow.stages.forEach((stage, index) => {
        if (stage.key !== STAGE_KEYS[index] || stage.position !== index) {
          issues.push(
            issue(
              `${workspacePath}.workflows.${workflow.id}.stages`,
              "must use the canonical four-stage order",
            ),
          );
        }
        const existing = stageMap.get(stage.id);
        if (
          existing &&
          (existing.key !== stage.key ||
            existing.name !== stage.name ||
            existing.position !== stage.position)
        ) {
          issues.push(
            issue(
              `${workspacePath}.workflows.${workflow.id}.stages`,
              "shared stage ids must be identical",
            ),
          );
        }
        stageMap.set(stage.id, stage);
        if ((stage.key === "backlog" || stage.key === "in_progress") && stage.gate !== null) {
          issues.push(
            issue(
              `${workspacePath}.workflows.${workflow.id}.stages`,
              "early stages cannot carry gates",
            ),
          );
        }
        if ((stage.key === "human_qa" || stage.key === "done") && stage.gate === null) {
          issues.push(
            issue(
              `${workspacePath}.workflows.${workflow.id}.stages`,
              "QA and done stages require gates",
            ),
          );
        }
        if (stage.gate !== null) {
          const featurePolicy =
            stage.gate.evidence.mode === "any" &&
            equalStringSets(stage.gate.evidence.kinds, ["artifact", "screenshot"]) &&
            equalStringSets(stage.gate.reviewer.allowed_principal_types, ["human"]) &&
            stage.gate.reviewer.required &&
            stage.gate.reviewer.minimum_reviewers === 1 &&
            !stage.gate.reviewer.forbid_self_review;
          const securityPolicy =
            stage.gate.evidence.mode === "all" &&
            equalStringSets(stage.gate.evidence.kinds, ["test-run"]) &&
            equalStringSets(stage.gate.reviewer.allowed_principal_types, ["human", "agent"]) &&
            stage.gate.reviewer.required &&
            stage.gate.reviewer.minimum_reviewers === 1 &&
            stage.gate.reviewer.forbid_self_review;
          if (
            (workflow.story_type === "feature" && !featurePolicy) ||
            (workflow.story_type === "security" && !securityPolicy)
          ) {
            issues.push(
              issue(
                `${workspacePath}.workflows.${workflow.id}.stages.${stage.id}.gate`,
                `${workflow.story_type} evidence and reviewer policy must remain exact`,
              ),
            );
          }
        }
      });
    }

    const storyMap = new Map(workspace.stories.map((story) => [story.id, story]));
    const runs = new Set<RoomsEntityId>();
    expectUnique(workspace.stories, `${workspacePath}.stories`, (story) => story.id, issues);
    for (const story of workspace.stories) {
      if (story.room_id !== workspace.room_id)
        issues.push(issue(`${workspacePath}.stories`, `${story.id} crosses rooms`));
      principalById(
        principalMap,
        story.owner_id,
        `${workspacePath}.stories.${story.id}.owner_id`,
        issues,
        "human",
      );
      const workflow = workflowMap.get(story.workflow_id);
      if (
        !workflow ||
        workflow.story_type !== story.story_type ||
        workflow.version !== story.workflow_version ||
        !workflow.stages.some((stage) => stage.id === story.stage_id)
      ) {
        issues.push(
          issue(
            `${workspacePath}.stories.${story.id}`,
            "must bind to its pinned workflow and stage",
          ),
        );
      }
      if (story.delegate) {
        runs.add(story.delegate.run_id);
        const agent = principalById(
          principalMap,
          story.delegate.agent_id,
          `${workspacePath}.stories.${story.id}.delegate.agent_id`,
          issues,
          "agent",
        );
        if (agent?.agent_kind !== "execution") {
          issues.push(
            issue(
              `${workspacePath}.stories.${story.id}.delegate.agent_id`,
              "must be an execution agent",
            ),
          );
        }
      }
    }

    const channelMap = new Map(workspace.channels.map((channel) => [channel.id, channel]));
    expectUnique(workspace.channels, `${workspacePath}.channels`, (channel) => channel.id, issues);
    for (const channel of workspace.channels) {
      if (channel.room_id !== workspace.room_id)
        issues.push(issue(`${workspacePath}.channels`, `${channel.id} crosses rooms`));
      validateUnread(channel.unread, `${workspacePath}.channels.${channel.id}.unread`, issues);
    }

    const sourceMap = new Map(workspace.sources.map((source) => [source.id, source]));
    expectUnique(workspace.sources, `${workspacePath}.sources`, (source) => source.id, issues);
    for (const source of workspace.sources) {
      if (source.room_id !== workspace.room_id)
        issues.push(issue(`${workspacePath}.sources`, `${source.id} crosses rooms`));
    }

    const sourceEventMap = new Map(workspace.source_events.map((event) => [event.event_id, event]));
    expectUnique(
      workspace.source_events,
      `${workspacePath}.source_events`,
      (event) => event.event_id,
      issues,
    );
    expectUnique(
      workspace.source_events,
      `${workspacePath}.source_events`,
      (event) => event.seq,
      issues,
    );

    const threadMap = new Map(workspace.threads.map((thread) => [thread.id, thread]));
    expectUnique(workspace.threads, `${workspacePath}.threads`, (thread) => thread.id, issues);
    for (const thread of workspace.threads) {
      if (thread.room_id !== workspace.room_id)
        issues.push(issue(`${workspacePath}.threads`, `${thread.id} crosses rooms`));
      const agent = principalById(
        principalMap,
        thread.delegated_agent_id,
        `${workspacePath}.threads.${thread.id}.delegated_agent_id`,
        issues,
        "agent",
      );
      const machine = principalById(
        principalMap,
        thread.machine_id,
        `${workspacePath}.threads.${thread.id}.machine_id`,
        issues,
        "machine",
      );
      if (agent?.agent_kind !== "execution" || agent.machine_id !== machine?.id) {
        issues.push(
          issue(
            `${workspacePath}.threads.${thread.id}`,
            "must preserve delegated agent and machine identity",
          ),
        );
      }
      const adapter = principalById(
        principalMap,
        thread.mirror.adapter_principal_id,
        `${workspacePath}.threads.${thread.id}.mirror.adapter_principal_id`,
        issues,
        "agent",
      );
      if (adapter?.agent_kind !== "adapter") {
        issues.push(
          issue(
            `${workspacePath}.threads.${thread.id}.mirror.adapter_principal_id`,
            "must be an adapter agent",
          ),
        );
      }
      if (!sourceMap.has(thread.source_id)) {
        issues.push(
          issue(
            `${workspacePath}.threads.${thread.id}.source_id`,
            "must reference a workspace source",
          ),
        );
      }
      if (thread.as_of !== thread.mirror.last_synced_at) {
        issues.push(
          issue(`${workspacePath}.threads.${thread.id}.as_of`, "must equal mirror last_synced_at"),
        );
      }
      validateAttribution(
        {
          mode: "mirrored_source",
          writer_principal_id: thread.mirror.adapter_principal_id,
          upstream: thread.mirror.upstream_actor,
        },
        workspace,
        principalMap,
        sourceMap,
        `${workspacePath}.threads.${thread.id}.mirror`,
        issues,
      );
    }
    for (const story of workspace.stories) {
      if (!story.delegate) continue;
      const thread = threadMap.get(story.delegate.thread_id);
      if (!thread || thread.delegated_agent_id !== story.delegate.agent_id) {
        issues.push(
          issue(
            `${workspacePath}.stories.${story.id}.delegate`,
            "must reference its delegated workspace thread",
          ),
        );
      }
    }

    const evidenceMap = new Map(workspace.evidence.map((record) => [record.id, record]));
    expectUnique(workspace.evidence, `${workspacePath}.evidence`, (record) => record.id, issues);
    for (const record of workspace.evidence) {
      if (record.room_id !== workspace.room_id || !storyMap.has(record.story_id)) {
        issues.push(
          issue(`${workspacePath}.evidence.${record.id}`, "must remain local to a workspace story"),
        );
      }
      if (record.run_id && !runs.has(record.run_id)) {
        issues.push(
          issue(`${workspacePath}.evidence.${record.id}.run_id`, "must reference a workspace run"),
        );
      }
      principalById(
        principalMap,
        record.producer_id,
        `${workspacePath}.evidence.${record.id}.producer_id`,
        issues,
      );
    }
    for (const story of workspace.stories) {
      for (const evidenceId of story.evidence_ids) {
        if (evidenceMap.get(evidenceId)?.story_id !== story.id) {
          issues.push(
            issue(
              `${workspacePath}.stories.${story.id}.evidence_ids`,
              `invalid evidence ${evidenceId}`,
            ),
          );
        }
      }
    }

    const decisionMap = new Map(workspace.decisions.map((decision) => [decision.id, decision]));
    expectUnique(
      workspace.decisions,
      `${workspacePath}.decisions`,
      (decision) => decision.id,
      issues,
    );
    for (const decision of workspace.decisions) {
      if (
        decision.room_id !== workspace.room_id ||
        (decision.story_id && !storyMap.has(decision.story_id))
      ) {
        issues.push(
          issue(`${workspacePath}.decisions.${decision.id}`, "must remain local to this workspace"),
        );
      }
      principalById(
        principalMap,
        decision.author_id,
        `${workspacePath}.decisions.${decision.id}.author_id`,
        issues,
        "human",
      );
    }

    const documentMap = new Map(workspace.documents.map((document) => [document.id, document]));
    expectUnique(
      workspace.documents,
      `${workspacePath}.documents`,
      (document) => document.id,
      issues,
    );
    for (const document of workspace.documents) {
      const revision = document.revisions.find(
        (candidate) => candidate.id === document.current_revision_id,
      );
      if (document.room_id !== workspace.room_id || !revision || revision.state !== "current") {
        issues.push(
          issue(`${workspacePath}.documents.${document.id}`, "must have a current local revision"),
        );
      }
      if (revision && revision.source_revision !== document.source.pinned_revision) {
        issues.push(
          issue(
            `${workspacePath}.documents.${document.id}.source`,
            "pinned revision must equal rendered revision",
          ),
        );
      }
      if (document.freshness.observed_head !== document.source.observed_head) {
        issues.push(
          issue(
            `${workspacePath}.documents.${document.id}.freshness`,
            "must preserve independently observed head",
          ),
        );
      }
      if (
        document.freshness.state === "current" &&
        document.source.pinned_revision !== document.source.observed_head
      ) {
        issues.push(
          issue(
            `${workspacePath}.documents.${document.id}.freshness`,
            "current source revisions must agree",
          ),
        );
      }
      if (
        document.freshness.state === "stale" &&
        document.source.pinned_revision === document.source.observed_head
      ) {
        issues.push(
          issue(
            `${workspacePath}.documents.${document.id}.freshness`,
            "stale source revisions must disagree",
          ),
        );
      }
      if (!document.revisions.some((candidate) => candidate.id === document.atlas.revision_id)) {
        issues.push(
          issue(
            `${workspacePath}.documents.${document.id}.atlas`,
            "must bind to a document revision",
          ),
        );
      }
      for (const storyId of document.linked_story_ids) {
        if (!storyMap.has(storyId))
          issues.push(
            issue(
              `${workspacePath}.documents.${document.id}.linked_story_ids`,
              `unknown ${storyId}`,
            ),
          );
      }
      for (const decisionId of document.linked_decision_ids) {
        if (!decisionMap.has(decisionId))
          issues.push(
            issue(
              `${workspacePath}.documents.${document.id}.linked_decision_ids`,
              `unknown ${decisionId}`,
            ),
          );
      }
    }

    if (!documentMap.has(workspace.dashboard.vision.document_id)) {
      issues.push(
        issue(
          `${workspacePath}.dashboard.vision.document_id`,
          "must reference a workspace document",
        ),
      );
    }

    const feedItemChannels = new Map<RoomsEntityId, RoomsEntityId>();
    for (const feed of workspace.feeds) {
      for (const item of feed.items) {
        if (feedItemChannels.has(item.id))
          issues.push(issue(`${workspacePath}.feeds`, `duplicates feed item ${item.id}`));
        feedItemChannels.set(item.id, feed.channel_id);
      }
    }
    const feedItemMap = new Map<RoomsEntityId, RoomsFeedItem>();
    const approvals = new Set<RoomsEntityId>();
    const workspaceFeedSequences: number[] = [];
    expectUnique(workspace.feeds, `${workspacePath}.feeds`, (feed) => feed.channel_id, issues);
    for (const feed of workspace.feeds) {
      if (feed.room_id !== workspace.room_id || !channelMap.has(feed.channel_id)) {
        issues.push(
          issue(`${workspacePath}.feeds.${feed.channel_id}`, "must belong to a workspace channel"),
        );
      }
      const sequences = feed.items.map((item) => item.source_event.seq);
      expectOrder(sequences, `${workspacePath}.feeds.${feed.channel_id}.items`, issues);
      if (
        sequences.some(
          (sequence) =>
            (feed.page_info.after_seq !== null && sequence <= feed.page_info.after_seq) ||
            sequence > feed.page_info.snapshot_head_seq,
        )
      ) {
        issues.push(
          issue(
            `${workspacePath}.feeds.${feed.channel_id}.items`,
            "must honor the exclusive cursor and pinned snapshot",
          ),
        );
      }
      if (sequences.length > feed.page_info.limit) {
        issues.push(
          issue(`${workspacePath}.feeds.${feed.channel_id}.items`, "must not exceed page limit"),
        );
      }
      if (feed.page_info.next_cursor !== (sequences.at(-1) ?? feed.page_info.after_seq)) {
        issues.push(
          issue(
            `${workspacePath}.feeds.${feed.channel_id}.page_info.next_cursor`,
            "must equal the last item sequence or request cursor",
          ),
        );
      }
      for (const item of feed.items) {
        const itemPath = `${workspacePath}.feeds.${feed.channel_id}.${item.id}`;
        feedItemMap.set(item.id, item);
        workspaceFeedSequences.push(item.source_event.seq);
        allFeedSequences.push(item.source_event.seq);
        if (item.room_id !== workspace.room_id || item.channel_id !== feed.channel_id) {
          issues.push(issue(itemPath, "must remain in its workspace and channel"));
        }
        const registered = sourceEventMap.get(item.source_event.event_id);
        if (!registered) {
          issues.push(
            issue(
              `${itemPath}.source_event`,
              "must resolve in the workspace source-event registry",
            ),
          );
        } else if (!equalSourceEvent(registered, item.source_event)) {
          issues.push(
            issue(`${itemPath}.source_event`, "must exactly equal its registered source event"),
          );
        }
        validateAttribution(
          item.attribution,
          workspace,
          principalMap,
          sourceMap,
          `${itemPath}.attribution`,
          issues,
        );
        validateFeedPayload(
          item,
          feedItemChannels,
          storyMap,
          stageMap,
          runs,
          threadMap,
          evidenceMap,
          principalMap,
          approvals,
          itemPath,
          issues,
        );
      }
    }
    for (const channelId of channelMap.keys()) {
      if (!workspace.feeds.some((feed) => feed.channel_id === channelId)) {
        issues.push(issue(`${workspacePath}.feeds`, `missing feed for ${channelId}`));
      }
    }

    const auditSubjectMaps = {
      story: storyMap,
      evidence: evidenceMap,
      decision: decisionMap,
      thread: threadMap,
      document: documentMap,
    };
    expectUnique(workspace.audit, `${workspacePath}.audit`, (record) => record.id, issues);
    for (const record of workspace.audit) {
      if (record.room_id !== workspace.room_id)
        issues.push(issue(`${workspacePath}.audit.${record.id}`, "crosses rooms"));
      principalById(
        principalMap,
        record.actor_id,
        `${workspacePath}.audit.${record.id}.actor_id`,
        issues,
      );
      if (record.subject.kind === "approval") {
        if (!approvals.has(record.subject.id))
          issues.push(
            issue(`${workspacePath}.audit.${record.id}.subject`, "references unknown approval"),
          );
      } else if (!auditSubjectMaps[record.subject.kind].has(record.subject.id)) {
        issues.push(
          issue(
            `${workspacePath}.audit.${record.id}.subject`,
            "must reference a workspace subject",
          ),
        );
      }
      if (!sourceEventMap.has(record.source_event_id)) {
        issues.push(
          issue(
            `${workspacePath}.audit.${record.id}.source_event_id`,
            "must resolve in this workspace registry",
          ),
        );
      }
    }

    const priorities = workspace.dashboard.needs_attention.map((attention) => attention.priority);
    expectOrder(priorities, `${workspacePath}.dashboard.needs_attention`, issues);
    for (const attention of workspace.dashboard.needs_attention) {
      if (attention.kind === "human_gate_pending") {
        if (!storyMap.has(attention.story_id) || !stageMap.has(attention.stage_id)) {
          issues.push(
            issue(
              `${workspacePath}.dashboard.needs_attention`,
              "human gate must reference local story and stage",
            ),
          );
        }
      } else if (attention.kind === "blocked_run") {
        if (threadMap.get(attention.thread_id)?.status !== "blocked") {
          issues.push(
            issue(
              `${workspacePath}.dashboard.needs_attention`,
              "blocked run must reference a blocked thread",
            ),
          );
        }
      } else if (sourceMap.get(attention.source_id)?.mirror.freshness !== "stale") {
        issues.push(
          issue(
            `${workspacePath}.dashboard.needs_attention`,
            "stale mirror must reference a stale source",
          ),
        );
      }
    }

    const ranks = workspace.dashboard.recent_activity.map((activity) => activity.rank);
    expectOrder(ranks, `${workspacePath}.dashboard.recent_activity`, issues);
    for (const activity of workspace.dashboard.recent_activity) {
      if (!feedItemMap.has(activity.feed_item_id)) {
        issues.push(
          issue(
            `${workspacePath}.dashboard.recent_activity`,
            `references non-local feed item ${activity.feed_item_id}`,
          ),
        );
      }
    }

    if (
      workspace.navigation.some((entry, index) => entry.key !== NAVIGATION_KEYS[index]) ||
      workspace.navigation.some((entry) => !entry.route.startsWith(`/rooms/${room?.slug ?? ""}`))
    ) {
      issues.push(
        issue(
          `${workspacePath}.navigation`,
          "must use the exhaustive room-scoped navigation order",
        ),
      );
    }
    for (const [key, expectedType] of [
      ["human_ids", "human"],
      ["agent_ids", "agent"],
      ["machine_ids", "machine"],
    ] as const) {
      expectUnique(workspace.presence[key], `${workspacePath}.presence.${key}`, (id) => id, issues);
      for (const id of workspace.presence[key]) {
        principalById(principalMap, id, `${workspacePath}.presence.${key}`, issues, expectedType);
      }
    }

    const featureWorkflow = workspace.workflows.find(
      (workflow) => workflow.story_type === "feature",
    );
    const canonicalStageOrder = featureWorkflow?.stages.map((stage) => stage.id) ?? [];
    expectUnique(
      workspace.projections,
      `${workspacePath}.projections`,
      (projection) => projection.kind,
      issues,
    );
    const mappings = workspace.projections.map((projection, index) =>
      validateProjection(
        projection,
        canonicalStageOrder,
        storyMap,
        `${workspacePath}.projections[${index}]`,
        issues,
      ),
    );
    if (mappings.length === 2) {
      for (const [storyId, stageId] of mappings[0]!) {
        if (mappings[1]!.get(storyId) !== stageId) {
          issues.push(
            issue(
              `${workspacePath}.projections`,
              "desktop and narrow projections must be identical",
            ),
          );
        }
      }
    }

    const unreadSequences = workspace.channels
      .flatMap((channel) => channel.unread.counted_event_seqs)
      .toSorted((a, b) => a - b);
    const roomUnread = room?.unread.counted_event_seqs ?? [];
    const feedSequences = workspaceFeedSequences.toSorted((a, b) => a - b);
    if (
      roomUnread.length !== unreadSequences.length ||
      roomUnread.some((seq, index) => seq !== unreadSequences[index]) ||
      unreadSequences.some((seq, index) => seq !== feedSequences[index])
    ) {
      issues.push(
        issue(`${workspacePath}.channels`, "room, channel, feed, and unread sequences must agree"),
      );
    }
  }

  const allSourceEvents = document.workspaces.flatMap((workspace) => workspace.source_events);
  expectUnique(allSourceEvents, "$.workspaces.source_events", (event) => event.event_id, issues);
  expectUnique(allSourceEvents, "$.workspaces.source_events", (event) => event.seq, issues);
  expectUnique(
    allFeedSequences,
    "$.workspaces.feeds.source_event.seq",
    (sequence) => sequence,
    issues,
  );
  const allFeedKinds = new Set(
    document.workspaces.flatMap((workspace) =>
      workspace.feeds.flatMap((feed) => feed.items.map((item) => item.kind)),
    ),
  );
  for (const kind of FEED_KINDS) {
    if (!allFeedKinds.has(kind))
      issues.push(issue("$.workspaces.feeds", `must include typed ${kind} item`));
  }

  expectUnique(document.states, "$.states", (state) => state.kind, issues);
  for (const stateKind of STATE_KINDS) {
    if (!document.states.some((state) => state.kind === stateKind)) {
      issues.push(issue("$.states", `must include ${stateKind}`));
    }
  }
  validateStates(document.states, roomMap, workspaceById, workspaceByRoom, issues);
  return issues;
}

function validateStates(
  states: readonly RoomsStateExample[],
  rooms: ReadonlyMap<RoomsEntityId, RoomsRoom>,
  workspaces: ReadonlyMap<RoomsEntityId, RoomsWorkspace>,
  workspacesByRoom: ReadonlyMap<RoomsEntityId, RoomsWorkspace>,
  issues: JsonSchemaIssue[],
): void {
  for (const state of states) {
    const path = `$.states.${state.kind}`;
    switch (state.kind) {
      case "authorized_workspace": {
        const workspace = workspaces.get(state.result.workspace_id);
        if (
          !workspace ||
          state.request.contract_version !== 2 ||
          workspace.room_id !== state.request.room_id ||
          state.result.room_id !== state.request.room_id ||
          workspace.authorization.principal_id !== state.request.principal_id
        ) {
          issues.push(issue(path, "must resolve the requested authorized workspace"));
        }
        break;
      }
      case "unauthenticated":
        if (
          !rooms.has(state.request.room_id) ||
          state.result.http_status !== 401 ||
          state.result.code !== "authorization_context_missing"
        ) {
          issues.push(issue(path, "must preserve the unauthenticated result"));
        }
        break;
      case "unauthorized":
        if (
          !rooms.has(state.request.room_id) ||
          state.result.http_status !== 403 ||
          state.result.code !== "room_membership_required"
        ) {
          issues.push(issue(path, "must preserve the unauthorized result"));
        }
        break;
      case "empty": {
        const workspace = workspacesByRoom.get(state.request.room_id);
        if (
          !workspace?.channels.some((channel) => channel.id === state.request.channel_id) ||
          state.result.items.length !== 0 ||
          state.result.page_info.after_seq !== state.request.after_seq ||
          state.result.page_info.next_cursor !== state.request.after_seq ||
          state.result.page_info.has_more
        ) {
          issues.push(issue(path, "must preserve an empty workspace-local page"));
        }
        break;
      }
      case "stale_cursor": {
        const workspace = workspacesByRoom.get(state.request.room_id);
        if (
          !workspace?.channels.some((channel) => channel.id === state.request.channel_id) ||
          state.request.after_seq >= state.result.retained_from_seq ||
          state.result.restart_after_seq !== state.result.retained_from_seq - 1
        ) {
          issues.push(issue(path, "must preserve the stale cursor restart boundary"));
        }
        break;
      }
      case "reachable_but_stale": {
        const thread = [...workspaces.values()]
          .flatMap((workspace) => workspace.threads)
          .find((candidate) => candidate.id === state.request.thread_id);
        if (
          !thread ||
          !thread.machine.reachable ||
          thread.mirror.freshness !== "stale" ||
          state.result.thread_id !== thread.id ||
          state.result.machine_checked_at !== thread.machine.checked_at ||
          state.result.mirror_as_of !== thread.as_of ||
          state.result.upstream_sequence !== thread.mirror.upstream_sequence
        ) {
          issues.push(issue(path, "must preserve reachable-but-stale thread facts"));
        }
        break;
      }
      case "unsupported_contract_version":
        if (
          state.result.requested_version !== state.request.contract_version ||
          state.result.supported_versions.length !== 2 ||
          state.result.supported_versions[0] !== 1 ||
          state.result.supported_versions[1] !== 2 ||
          state.result.supported_versions.includes(state.request.contract_version)
        ) {
          issues.push(issue(path, "must preserve explicit version rejection"));
        }
        break;
    }
  }
}

export function decodeRoomsWorkspaceReadV1(
  document: unknown,
  schema: unknown,
): RoomsWorkspaceReadV1 {
  const binding = contractBinding(document);
  if (binding.version !== 1 || binding.schemaUri !== V1_SCHEMA_URI) {
    throw new RoomsWorkspaceDecodeError([
      issue("$.contract", "must jointly identify rooms.workspace-read v1 and its v1 schema URI"),
    ]);
  }
  assertV1Schema(document, schema);
  return document;
}

export function decodeRoomsWorkspaceReadV2(
  document: unknown,
  schema: unknown,
): RoomsWorkspaceReadFixture {
  const binding = contractBinding(document);
  if (binding.version !== 2 || binding.schemaUri !== V2_SCHEMA_URI) {
    throw new RoomsWorkspaceDecodeError([
      issue("$.contract", "must jointly identify rooms.workspace-read v2 and its v2 schema URI"),
    ]);
  }
  assertV2Schema(document, schema);
  const issues = validateWorkspaceReadV2(document);
  if (issues.length > 0) throw new RoomsWorkspaceDecodeError(issues);
  return document;
}

export function decodeRoomsWorkspaceRead(
  document: unknown,
  schemas: { readonly v1: unknown; readonly v2: unknown },
): RoomsWorkspaceReadDocument {
  const binding = contractBinding(document);
  if (binding.version === 1 && binding.schemaUri === V1_SCHEMA_URI) {
    return decodeRoomsWorkspaceReadV1(document, schemas.v1);
  }
  if (binding.version === 2 && binding.schemaUri === V2_SCHEMA_URI) {
    return decodeRoomsWorkspaceReadV2(document, schemas.v2);
  }
  throw new RoomsWorkspaceDecodeError([
    issue("$.contract", "version and schema_uri must select the same supported contract revision"),
  ]);
}
