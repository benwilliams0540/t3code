import type {
  RoomsDocument,
  RoomsPrincipal,
  RoomsWorkspace,
  RoomsWorkspaceReadFixture,
} from "../model/workspace";

export interface RoomsRevisionProjection {
  readonly revision: RoomsDocument["revisions"][number];
  readonly author: RoomsPrincipal | null;
  readonly isCurrent: boolean;
}

export interface RoomsDocumentProjection {
  readonly document: RoomsDocument;
  readonly currentRevision: RoomsDocument["revisions"][number];
  readonly revisions: readonly RoomsRevisionProjection[];
  readonly isStale: boolean;
}

export function projectRoomsVisionDocument(
  fixture: RoomsWorkspaceReadFixture,
  workspace: RoomsWorkspace,
): RoomsDocumentProjection | null {
  const document = workspace.documents.find(
    (candidate) => candidate.id === workspace.vision.document_id,
  );
  if (!document) return null;

  const currentRevision = document.revisions.find(
    (revision) => revision.id === document.current_revision_id,
  );
  if (!currentRevision) return null;

  return {
    document,
    currentRevision,
    revisions: document.revisions.map((revision) => ({
      revision,
      author: fixture.principals.find((principal) => principal.id === revision.author_id) ?? null,
      isCurrent: revision.id === document.current_revision_id,
    })),
    isStale:
      document.freshness.state === "stale" ||
      document.source.sha !== document.freshness.source_head ||
      document.atlas.state === "stale",
  };
}
