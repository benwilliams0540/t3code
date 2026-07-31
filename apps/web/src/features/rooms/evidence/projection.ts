import type {
  RoomsEvidenceKind,
  RoomsPrincipal,
  RoomsSourceEvent,
  RoomsStory,
  RoomsWorkspace,
  RoomsWorkspaceReadFixture,
} from "../model/workspace";

export interface RoomsEvidenceDetail {
  readonly kind: string;
  readonly hash: string;
  readonly bytes: number;
  readonly mediaType: string;
  readonly attachedAt: string;
  readonly actorId: RoomsPrincipal["id"];
  readonly actor: RoomsPrincipal | null;
  readonly sourceEvent: RoomsSourceEvent;
}

export interface RoomsEvidenceProjectionItem {
  readonly id: string;
  readonly stories: readonly RoomsStory[];
  readonly detail: RoomsEvidenceDetail | null;
  readonly fidelity: "full_metadata" | "reference_only";
}

export interface RoomsMissingEvidenceRequirement {
  readonly story: RoomsStory;
  readonly kinds: readonly RoomsEvidenceKind[];
}

export interface RoomsEvidenceProjection {
  readonly items: readonly RoomsEvidenceProjectionItem[];
  readonly missingRequirements: readonly RoomsMissingEvidenceRequirement[];
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function detailFromFeedItem(
  fixture: RoomsWorkspaceReadFixture,
  item: RoomsWorkspace["feeds"][number]["items"][number],
): { readonly evidenceId: string; readonly detail: RoomsEvidenceDetail } | null {
  if (item.kind !== "evidence_attached") return null;
  const evidenceId = typeof item.data.evidence_id === "string" ? item.data.evidence_id : null;
  const kind = typeof item.data.kind === "string" ? item.data.kind : null;
  const cas = asRecord(item.data.cas);
  const hash = typeof cas?.hash === "string" ? cas.hash : null;
  const bytes = typeof cas?.bytes === "number" ? cas.bytes : null;
  const mediaType = typeof cas?.media_type === "string" ? cas.media_type : null;
  if (!evidenceId || !kind || !hash || bytes === null || !mediaType) return null;

  return {
    evidenceId,
    detail: {
      kind,
      hash,
      bytes,
      mediaType,
      attachedAt: item.occurred_at,
      actorId: item.actor_id,
      actor: fixture.principals.find((principal) => principal.id === item.actor_id) ?? null,
      sourceEvent: item.source_event,
    },
  };
}

export function projectRoomsEvidence(
  fixture: RoomsWorkspaceReadFixture,
  workspace: RoomsWorkspace,
): RoomsEvidenceProjection {
  const detailsById = new Map<string, RoomsEvidenceDetail>();
  for (const feed of workspace.feeds) {
    for (const item of feed.items) {
      const projected = detailFromFeedItem(fixture, item);
      if (projected) detailsById.set(projected.evidenceId, projected.detail);
    }
  }

  const storiesByEvidenceId = new Map<string, RoomsStory[]>();
  for (const story of workspace.stories) {
    for (const evidenceId of story.evidence.attached_ids) {
      const stories = storiesByEvidenceId.get(evidenceId) ?? [];
      stories.push(story);
      storiesByEvidenceId.set(evidenceId, stories);
    }
  }

  const evidenceIds = new Set([...storiesByEvidenceId.keys(), ...detailsById.keys()]);
  const items = [...evidenceIds].map((id) => {
    const detail = detailsById.get(id) ?? null;
    return {
      id,
      stories: storiesByEvidenceId.get(id) ?? [],
      detail,
      fidelity: detail ? ("full_metadata" as const) : ("reference_only" as const),
    };
  });

  return {
    items,
    missingRequirements: workspace.stories.flatMap((story) => {
      if (story.evidence.required_kinds.length === 0 || story.evidence.attached_ids.length > 0) {
        return [];
      }
      return [{ story, kinds: story.evidence.required_kinds }];
    }),
  };
}
