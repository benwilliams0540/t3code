export type RoomsPrincipalId = `h:${string}` | `a:${string}` | `m:${string}`;
export type RoomsEntityKind =
  | "fixture"
  | "room"
  | "channel"
  | "thread"
  | "task"
  | "document"
  | "revision"
  | "workflow"
  | "stage"
  | "evidence"
  | "feed-item"
  | "atlas";
export type RoomsEntityId = `${RoomsEntityKind}:${string}`;
export type RoomsRole = "observer" | "operator" | "admin";
export type RoomsRunStatus = "queued" | "running" | "blocked" | "completed" | "failed";

export interface RoomsWorkspaceContract {
  readonly id: "rooms.workspace-read";
  readonly version: 1;
  readonly schema_uri: "https://rooms.local/contracts/workspace-read/v1/schema.json";
  readonly fixture_id: RoomsEntityId;
  readonly captured_at: string;
}

export interface RoomsWorkspaceSemantics {
  readonly pagination: {
    readonly order: "global_seq_ascending";
    readonly cursor: "exclusive_after_seq";
    readonly snapshot: "first_page_pins_snapshot_head_seq";
    readonly next_cursor: "last_item_seq_or_request_after_seq";
    readonly has_more: "matching_item_exists_through_snapshot_head";
    readonly stale_cursor: "error_with_restart_cursor";
  };
  readonly unread: {
    readonly scope: "member_and_stream";
    readonly cursor: "monotonic_read_through_seq";
    readonly count: "counted_items_after_read_through_through_latest_visible";
    readonly mark_read: "explicit_server_write_not_render_side_effect";
  };
  readonly authorization: {
    readonly layers: readonly ["authentication", "membership", "role_authorization"];
    readonly roles: readonly ["observer", "operator", "admin"];
    readonly reachable_is_membership: false;
  };
  readonly freshness: {
    readonly reachability: "independent_machine_fact";
    readonly mirror: "as_of_and_upstream_sequence";
    readonly disagreement: "surface_reachable_but_stale";
  };
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
}

export interface RoomsRoom {
  readonly id: RoomsEntityId;
  readonly slug: string;
  readonly name: string;
  readonly locality: "local_only" | "shared";
  readonly declared_by: RoomsPrincipalId;
  readonly membership: {
    readonly status: "member" | "not_member";
    readonly role: RoomsRole | null;
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

export interface RoomsStage {
  readonly id: RoomsEntityId;
  readonly key: "backlog" | "in_progress" | "human_qa" | "done";
  readonly name: string;
  readonly position: number;
  readonly gate: null | {
    readonly allowed_principal_types: readonly ("human" | "agent" | "machine")[];
    readonly required_evidence_kinds: readonly RoomsEvidenceKind[];
    readonly self_review: "allowed" | "forbidden";
  };
}

export interface RoomsStory {
  readonly id: RoomsEntityId;
  readonly title: string;
  readonly story_type: string;
  readonly stage_id: RoomsEntityId;
  readonly owner_id: RoomsPrincipalId;
  readonly delegate: null | {
    readonly agent_id: RoomsPrincipalId;
    readonly thread_id: RoomsEntityId;
    readonly run_status: RoomsRunStatus;
  };
  readonly labels: readonly string[];
  readonly evidence: {
    readonly required_kinds: readonly RoomsEvidenceKind[];
    readonly attached_ids: readonly RoomsEntityId[];
  };
  readonly gate_state: "not_applicable" | "waiting_for_evidence" | "waiting_for_review" | "passed";
}

export interface RoomsChannel {
  readonly id: RoomsEntityId;
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

export interface RoomsFeedItem {
  readonly id: RoomsEntityId;
  readonly kind:
    | "human_message"
    | "reaction"
    | "story_lifecycle"
    | "run_lifecycle"
    | "evidence_attached"
    | "approval_decided";
  readonly actor_id: RoomsPrincipalId;
  readonly occurred_at: string;
  readonly summary: string;
  readonly source_event: RoomsSourceEvent;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface RoomsFeed {
  readonly room_id: RoomsEntityId;
  readonly channel_id: RoomsEntityId;
  readonly page_info: {
    readonly after_seq: number | null;
    readonly limit: number;
    readonly snapshot_head_seq: number;
    readonly next_cursor: number | null;
    readonly has_more: boolean;
  };
  readonly items: readonly RoomsFeedItem[];
}

export interface RoomsThread {
  readonly id: RoomsEntityId;
  readonly title: string;
  readonly agent_id: RoomsPrincipalId;
  readonly machine_id: RoomsPrincipalId;
  readonly provider: string;
  readonly environment: { readonly id: string; readonly name: string };
  readonly status: RoomsRunStatus | "archived";
  readonly as_of: string;
  readonly mirror: {
    readonly upstream_sequence: number;
    readonly last_synced_at: string;
    readonly freshness: "fresh" | "stale" | "unknown";
  };
  readonly machine: { readonly reachable: boolean; readonly checked_at: string };
}

export interface RoomsDocument {
  readonly id: RoomsEntityId;
  readonly title: string;
  readonly current_revision_id: RoomsEntityId;
  readonly source: {
    readonly remote_url: string;
    readonly sha: string;
    readonly source_head: string;
  };
  readonly freshness: {
    readonly state: "current" | "queued" | "stale";
    readonly compared_at: string;
    readonly source_head: string;
  };
  readonly revisions: readonly {
    readonly id: RoomsEntityId;
    readonly author_id: RoomsPrincipalId;
    readonly state: "current" | "queued" | "superseded";
    readonly created_at: string;
    readonly source_hash: string;
    readonly body_markdown: string;
  }[];
  readonly atlas: {
    readonly id: RoomsEntityId;
    readonly revision_id: RoomsEntityId;
    readonly state: "current" | "queued" | "stale";
    readonly route: string;
  };
}

export interface RoomsProjection {
  readonly kind: "desktop_board" | "mobile_vertical_stages";
  readonly stage_order: readonly RoomsEntityId[];
  readonly groups: readonly {
    readonly stage_id: RoomsEntityId;
    readonly story_ids: readonly RoomsEntityId[];
  }[];
}

export interface RoomsWorkspace {
  readonly selected_room_id: RoomsEntityId;
  readonly authorization: RoomsAuthorization;
  readonly vision: {
    readonly document_id: RoomsEntityId;
    readonly headline: string;
    readonly summary: string;
  };
  readonly workflow: {
    readonly id: RoomsEntityId;
    readonly story_type: string;
    readonly version: number;
    readonly stages: readonly RoomsStage[];
  };
  readonly stories: readonly RoomsStory[];
  readonly channels: readonly RoomsChannel[];
  readonly feeds: readonly RoomsFeed[];
  readonly threads: readonly RoomsThread[];
  readonly project_navigation: readonly {
    readonly key: "vision" | "stories" | "evidence" | "audit_decisions";
    readonly label: string;
    readonly route: string;
  }[];
  readonly documents: readonly RoomsDocument[];
  readonly presence: {
    readonly human_ids: readonly RoomsPrincipalId[];
    readonly agent_ids: readonly RoomsPrincipalId[];
    readonly machine_ids: readonly RoomsPrincipalId[];
  };
  readonly projections: readonly RoomsProjection[];
}

export interface RoomsStateExample {
  readonly name:
    | "unauthenticated"
    | "unauthorized"
    | "empty"
    | "stale_cursor"
    | "reachable_but_stale";
  readonly request: Readonly<Record<string, unknown>>;
  readonly result: Readonly<Record<string, unknown>>;
}

export interface RoomsWorkspaceReadFixture {
  readonly contract: RoomsWorkspaceContract;
  readonly semantics: RoomsWorkspaceSemantics;
  readonly principals: readonly RoomsPrincipal[];
  readonly rooms: readonly RoomsRoom[];
  readonly workspace: RoomsWorkspace;
  readonly states: readonly RoomsStateExample[];
}
