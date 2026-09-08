export type RoomsPrincipalId = `h:${string}` | `a:${string}` | `m:${string}`;
export type RoomsEntityKind =
  | "fixture"
  | "room"
  | "workspace"
  | "channel"
  | "thread"
  | "run"
  | "task"
  | "document"
  | "revision"
  | "workflow"
  | "stage"
  | "evidence"
  | "decision"
  | "audit"
  | "feed-item"
  | "atlas"
  | "attention"
  | "activity"
  | "approval"
  | "source";
export type RoomsEntityId = `${RoomsEntityKind}:${string}`;
export type RoomsRole = "observer" | "operator" | "admin";
export type RoomsRunStatus = "queued" | "running" | "blocked" | "completed" | "failed";
export type RoomsFreshness = "fresh" | "stale" | "unknown";

export interface RoomsWorkspaceContractV1 {
  readonly id: "rooms.workspace-read";
  readonly version: 1;
  readonly schema_uri: "https://rooms.local/contracts/workspace-read/v1/schema.json";
  readonly fixture_id: RoomsEntityId;
  readonly captured_at: string;
}

export interface RoomsWorkspaceReadV1 {
  readonly contract: RoomsWorkspaceContractV1;
}

export interface RoomsWorkspaceContract {
  readonly id: "rooms.workspace-read";
  readonly version: 2;
  readonly schema_uri: "https://rooms.local/contracts/workspace-read/v2/schema.json";
  readonly fixture_id: RoomsEntityId;
  readonly captured_at: string;
}

export interface RoomsWorkspaceSemantics {
  readonly room_selection: "one_complete_workspace_per_declared_room";
  readonly pagination: "global_seq_ascending_exclusive_cursor_pinned_snapshot";
  readonly unread: "member_and_stream_monotonic_server_cursor";
  readonly authorization: "authentication_then_membership_then_role";
  readonly attribution: "rooms_writer_distinct_from_upstream_source_actor";
  readonly freshness: "reachability_independent_from_mirror_and_source_freshness";
}

export interface RoomsUnread {
  readonly read_through_seq: number;
  readonly latest_visible_seq: number;
  readonly count: number;
  readonly counted_event_seqs: readonly number[];
}

export interface RoomsPrincipal {
  readonly id: RoomsPrincipalId;
  readonly type: "human" | "agent" | "machine";
  readonly display_name: string;
  readonly machine_id?: RoomsPrincipalId;
  readonly agent_kind?: "execution" | "adapter";
}

export interface RoomsRoom {
  readonly id: RoomsEntityId;
  readonly slug: string;
  readonly name: string;
  readonly locality: "local_only" | "shared";
  readonly declared_by: RoomsPrincipalId;
  readonly membership: {
    readonly status: "member";
    readonly role: RoomsRole;
  };
  readonly unread: RoomsUnread;
}

export interface RoomsAuthorization {
  readonly status: "authorized";
  readonly principal_id: RoomsPrincipalId;
  readonly membership: "member";
  readonly role: RoomsRole;
}

export type RoomsEvidenceKind =
  | "command-output"
  | "diff"
  | "test-run"
  | "artifact"
  | "screenshot"
  | "annotation"
  | "link";

export interface RoomsGate {
  readonly evidence: {
    readonly mode: "any" | "all";
    readonly kinds: readonly RoomsEvidenceKind[];
  };
  readonly reviewer: {
    readonly required: boolean;
    readonly allowed_principal_types: readonly ("human" | "agent" | "machine")[];
    readonly minimum_reviewers: number;
    readonly forbid_self_review: boolean;
  };
}

export interface RoomsStage {
  readonly id: RoomsEntityId;
  readonly key: "backlog" | "in_progress" | "human_qa" | "done";
  readonly name: string;
  readonly position: number;
  readonly gate: RoomsGate | null;
}

export interface RoomsWorkflow {
  readonly id: RoomsEntityId;
  readonly story_type: "feature" | "security";
  readonly version: number;
  readonly stages: readonly RoomsStage[];
}

export interface RoomsStory {
  readonly id: RoomsEntityId;
  readonly room_id: RoomsEntityId;
  readonly title: string;
  readonly story_type: "feature" | "security";
  readonly workflow_id: RoomsEntityId;
  readonly workflow_version: number;
  readonly stage_id: RoomsEntityId;
  readonly owner_id: RoomsPrincipalId;
  readonly delegate: null | {
    readonly agent_id: RoomsPrincipalId;
    readonly thread_id: RoomsEntityId;
    readonly run_id: RoomsEntityId;
    readonly run_status: RoomsRunStatus;
  };
  readonly labels: readonly string[];
  readonly evidence_ids: readonly RoomsEntityId[];
  readonly gate_state: "not_applicable" | "waiting_for_evidence" | "waiting_for_review" | "passed";
}

export interface RoomsChannel {
  readonly id: RoomsEntityId;
  readonly room_id: RoomsEntityId;
  readonly name: string;
  readonly purpose: string;
  readonly unread: RoomsUnread;
}

export interface RoomsSourceEvent {
  readonly seq: number;
  readonly event_id: string;
  readonly type: string;
  readonly schema: number;
}

export interface RoomsUpstreamCoarse {
  readonly status: "coarse";
  readonly source_id: RoomsEntityId;
  readonly environment_id: string;
  readonly event_id: string;
  readonly sequence: number;
  readonly actor_kind: "human" | "assistant" | "system" | "tool" | "unknown";
}

export interface RoomsUpstreamUnavailable {
  readonly status: "unavailable";
  readonly source_id: RoomsEntityId;
  readonly environment_id: string;
  readonly event_id: string;
  readonly sequence: number;
  readonly reason: string;
}

export type RoomsUpstreamAttribution = RoomsUpstreamCoarse | RoomsUpstreamUnavailable;

export interface RoomsExplicitAttribution {
  readonly mode: "explicit_principal";
  readonly writer_principal_id: RoomsPrincipalId;
  readonly actor_principal_id: RoomsPrincipalId;
}

export interface RoomsMirroredAttribution {
  readonly mode: "mirrored_source";
  readonly writer_principal_id: RoomsPrincipalId;
  readonly upstream: RoomsUpstreamAttribution;
}

export type RoomsAttribution = RoomsExplicitAttribution | RoomsMirroredAttribution;

interface RoomsFeedBase<Kind extends string, Payload> {
  readonly id: RoomsEntityId;
  readonly room_id: RoomsEntityId;
  readonly channel_id: RoomsEntityId;
  readonly kind: Kind;
  readonly occurred_at: string;
  readonly summary: string;
  readonly source_event: RoomsSourceEvent;
  readonly attribution: RoomsAttribution;
  readonly payload: Payload;
}

export type RoomsFeedItem =
  | RoomsFeedBase<"human_message", { readonly body_markdown: string }>
  | RoomsFeedBase<
      "reaction",
      {
        readonly emoji: string;
        readonly target_feed_item_id: RoomsEntityId;
        readonly operation: "added" | "removed";
      }
    >
  | RoomsFeedBase<
      "story_lifecycle",
      {
        readonly story_id: RoomsEntityId;
        readonly from_stage_id: RoomsEntityId | null;
        readonly to_stage_id: RoomsEntityId;
      }
    >
  | RoomsFeedBase<
      "run_lifecycle",
      {
        readonly thread_id: RoomsEntityId;
        readonly run_id: RoomsEntityId;
        readonly status: RoomsRunStatus;
      }
    >
  | RoomsFeedBase<
      "evidence_attached",
      { readonly story_id: RoomsEntityId; readonly evidence_id: RoomsEntityId }
    >
  | RoomsFeedBase<
      "approval_requested" | "approval_decided",
      {
        readonly approval_id: RoomsEntityId;
        readonly story_id: RoomsEntityId;
        readonly state: "requested" | "approved" | "needs_changes" | "rejected";
        readonly scope: "once" | "session";
      }
    >
  | RoomsFeedBase<
      "human_gate",
      {
        readonly story_id: RoomsEntityId;
        readonly stage_id: RoomsEntityId;
        readonly state: "waiting_for_evidence" | "waiting_for_review" | "passed";
        readonly required_evidence_ids: readonly RoomsEntityId[];
        readonly reviewer_ids: readonly RoomsPrincipalId[];
      }
    >
  | RoomsFeedBase<
      "unknown_schema",
      {
        readonly event_type: string;
        readonly event_schema: number;
        readonly display: "unknown_event";
      }
    >
  | RoomsFeedBase<
      "unavailable",
      {
        readonly resource_kind: "source_event" | "evidence" | "document" | "thread";
        readonly reason: string;
        readonly retryable: boolean;
      }
    >;

export interface RoomsPageInfo {
  readonly after_seq: number | null;
  readonly limit: number;
  readonly snapshot_head_seq: number;
  readonly next_cursor: number | null;
  readonly has_more: boolean;
}

export interface RoomsFeed {
  readonly room_id: RoomsEntityId;
  readonly channel_id: RoomsEntityId;
  readonly page_info: RoomsPageInfo;
  readonly items: readonly RoomsFeedItem[];
}

export interface RoomsSource {
  readonly id: RoomsEntityId;
  readonly room_id: RoomsEntityId;
  readonly kind: "t3_environment" | "git_repository";
  readonly name: string;
  readonly revision: {
    readonly pinned_revision: string;
    readonly observed_head: string;
    readonly observed_at: string;
  };
  readonly reachability: {
    readonly state: "reachable" | "unreachable" | "unknown";
    readonly checked_at: string;
  };
  readonly mirror: {
    readonly freshness: RoomsFreshness;
    readonly as_of: string;
    readonly upstream_sequence: number;
  };
}

export interface RoomsThread {
  readonly id: RoomsEntityId;
  readonly room_id: RoomsEntityId;
  readonly title: string;
  readonly delegated_agent_id: RoomsPrincipalId;
  readonly machine_id: RoomsPrincipalId;
  readonly source_id: RoomsEntityId;
  readonly provider: string;
  readonly environment_id: string;
  readonly status: RoomsRunStatus | "archived";
  readonly as_of: string;
  readonly mirror: {
    readonly adapter_principal_id: RoomsPrincipalId;
    readonly upstream_actor: RoomsUpstreamAttribution;
    readonly upstream_sequence: number;
    readonly last_synced_at: string;
    readonly freshness: RoomsFreshness;
  };
  readonly machine: { readonly reachable: boolean; readonly checked_at: string };
}

export interface RoomsCas {
  readonly hash: string;
  readonly bytes: number;
  readonly media_type: string;
}

export interface RoomsEvidence {
  readonly id: RoomsEntityId;
  readonly room_id: RoomsEntityId;
  readonly story_id: RoomsEntityId;
  readonly run_id: RoomsEntityId | null;
  readonly producer_id: RoomsPrincipalId;
  readonly kind: RoomsEvidenceKind;
  readonly cas: RoomsCas;
  readonly note: string | null;
  readonly occurred_at: string;
}

export interface RoomsDecision {
  readonly id: RoomsEntityId;
  readonly room_id: RoomsEntityId;
  readonly story_id: RoomsEntityId | null;
  readonly author_id: RoomsPrincipalId;
  readonly status: "proposed" | "accepted" | "rejected" | "superseded";
  readonly title: string;
  readonly rationale_markdown: string;
  readonly occurred_at: string;
}

export interface RoomsAudit {
  readonly id: RoomsEntityId;
  readonly room_id: RoomsEntityId;
  readonly actor_id: RoomsPrincipalId;
  readonly action:
    | "story_changed"
    | "evidence_recorded"
    | "decision_recorded"
    | "approval_recorded"
    | "mirror_observed";
  readonly subject: {
    readonly kind: "story" | "evidence" | "decision" | "thread" | "document" | "approval";
    readonly id: RoomsEntityId;
  };
  readonly source_event_id: string;
  readonly summary: string;
  readonly occurred_at: string;
}

export interface RoomsDocumentRevision {
  readonly id: RoomsEntityId;
  readonly author_id: RoomsPrincipalId;
  readonly state: "current" | "queued" | "superseded";
  readonly created_at: string;
  readonly source_revision: string;
  readonly body_markdown: string;
}

export interface RoomsDocument {
  readonly id: RoomsEntityId;
  readonly room_id: RoomsEntityId;
  readonly title: string;
  readonly current_revision_id: RoomsEntityId;
  readonly source: {
    readonly remote_url: string;
    readonly pinned_revision: string;
    readonly observed_head: string;
  };
  readonly freshness: {
    readonly state: "current" | "queued" | "stale";
    readonly compared_at: string;
    readonly observed_head: string;
  };
  readonly revisions: readonly RoomsDocumentRevision[];
  readonly atlas: {
    readonly id: RoomsEntityId;
    readonly revision_id: RoomsEntityId;
    readonly state: "current" | "queued" | "stale";
    readonly route: string;
  };
  readonly linked_story_ids: readonly RoomsEntityId[];
  readonly linked_decision_ids: readonly RoomsEntityId[];
}

export type RoomsAttention =
  | {
      readonly id: RoomsEntityId;
      readonly kind: "human_gate_pending";
      readonly priority: number;
      readonly story_id: RoomsEntityId;
      readonly stage_id: RoomsEntityId;
      readonly reason: string;
    }
  | {
      readonly id: RoomsEntityId;
      readonly kind: "blocked_run";
      readonly priority: number;
      readonly thread_id: RoomsEntityId;
      readonly reason: string;
    }
  | {
      readonly id: RoomsEntityId;
      readonly kind: "stale_mirror";
      readonly priority: number;
      readonly source_id: RoomsEntityId;
      readonly reason: string;
    };

export interface RoomsActivity {
  readonly id: RoomsEntityId;
  readonly rank: number;
  readonly feed_item_id: RoomsEntityId;
  readonly reason: "latest_room_activity" | "latest_human_activity" | "latest_work_activity";
}

export interface RoomsProjection {
  readonly kind: "desktop_board" | "mobile_vertical_stages";
  readonly stage_order: readonly RoomsEntityId[];
  readonly groups: readonly {
    readonly stage_id: RoomsEntityId;
    readonly story_ids: readonly RoomsEntityId[];
  }[];
}

export interface RoomsNavigationEntry {
  readonly key:
    | "dashboard"
    | "channels"
    | "threads"
    | "vision"
    | "stories"
    | "evidence"
    | "audit_decisions"
    | "present";
  readonly label: string;
  readonly route: string;
}

export interface RoomsWorkspace {
  readonly id: RoomsEntityId;
  readonly room_id: RoomsEntityId;
  readonly authorization: RoomsAuthorization;
  readonly dashboard: {
    readonly vision: {
      readonly document_id: RoomsEntityId;
      readonly headline: string;
      readonly summary: string;
    };
    readonly needs_attention: readonly RoomsAttention[];
    readonly recent_activity: readonly RoomsActivity[];
  };
  readonly workflows: readonly RoomsWorkflow[];
  readonly stories: readonly RoomsStory[];
  readonly channels: readonly RoomsChannel[];
  readonly feeds: readonly RoomsFeed[];
  readonly threads: readonly RoomsThread[];
  readonly documents: readonly RoomsDocument[];
  readonly evidence: readonly RoomsEvidence[];
  readonly decisions: readonly RoomsDecision[];
  readonly audit: readonly RoomsAudit[];
  readonly navigation: readonly RoomsNavigationEntry[];
  readonly presence: {
    readonly human_ids: readonly RoomsPrincipalId[];
    readonly agent_ids: readonly RoomsPrincipalId[];
    readonly machine_ids: readonly RoomsPrincipalId[];
  };
  readonly sources: readonly RoomsSource[];
  readonly source_events: readonly RoomsSourceEvent[];
  readonly projections: readonly RoomsProjection[];
}

interface RoomsWorkspaceRequest {
  readonly room_id: RoomsEntityId;
  readonly principal_id: RoomsPrincipalId;
  readonly contract_version: number;
}

interface RoomsErrorResult {
  readonly status: "error";
  readonly http_status: number;
  readonly code: string;
  readonly message: string;
}

export type RoomsStateExample =
  | {
      readonly kind: "authorized_workspace";
      readonly request: RoomsWorkspaceRequest;
      readonly result: {
        readonly status: "ok";
        readonly workspace_id: RoomsEntityId;
        readonly room_id: RoomsEntityId;
      };
    }
  | {
      readonly kind: "unauthenticated";
      readonly request: { readonly room_id: RoomsEntityId; readonly contract_version: number };
      readonly result: RoomsErrorResult;
    }
  | {
      readonly kind: "unauthorized";
      readonly request: RoomsWorkspaceRequest;
      readonly result: RoomsErrorResult;
    }
  | {
      readonly kind: "empty";
      readonly request: {
        readonly room_id: RoomsEntityId;
        readonly channel_id: RoomsEntityId;
        readonly after_seq: number;
        readonly limit: number;
      };
      readonly result: {
        readonly status: "ok";
        readonly page_info: RoomsPageInfo;
        readonly items: readonly [];
      };
    }
  | {
      readonly kind: "stale_cursor";
      readonly request: {
        readonly room_id: RoomsEntityId;
        readonly channel_id: RoomsEntityId;
        readonly after_seq: number;
        readonly limit: number;
      };
      readonly result: RoomsErrorResult & {
        readonly http_status: 409;
        readonly code: "stale_cursor";
        readonly retained_from_seq: number;
        readonly restart_after_seq: number;
      };
    }
  | {
      readonly kind: "reachable_but_stale";
      readonly request: { readonly thread_id: RoomsEntityId };
      readonly result: {
        readonly status: "ok";
        readonly thread_id: RoomsEntityId;
        readonly machine_reachable: true;
        readonly machine_checked_at: string;
        readonly mirror_freshness: "stale";
        readonly mirror_as_of: string;
        readonly upstream_sequence: number;
      };
    }
  | {
      readonly kind: "unsupported_contract_version";
      readonly request: RoomsWorkspaceRequest;
      readonly result: RoomsErrorResult & {
        readonly http_status: 406;
        readonly code: "unsupported_contract_version";
        readonly requested_version: number;
        readonly supported_versions: readonly number[];
      };
    };

export interface RoomsWorkspaceReadFixture {
  readonly contract: RoomsWorkspaceContract;
  readonly semantics: RoomsWorkspaceSemantics;
  readonly principals: readonly RoomsPrincipal[];
  readonly rooms: readonly RoomsRoom[];
  readonly workspaces: readonly RoomsWorkspace[];
  readonly states: readonly RoomsStateExample[];
}

export type RoomsWorkspaceReadDocument = RoomsWorkspaceReadV1 | RoomsWorkspaceReadFixture;

export function assertNever(value: never): never {
  throw new Error(`Unhandled Threadspace contract variant: ${String(value)}`);
}
