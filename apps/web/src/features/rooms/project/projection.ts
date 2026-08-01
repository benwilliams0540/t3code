import type { RoomsWorkspace, RoomsWorkspaceReadFixture } from "../model/workspace";
import type { RoomsWorkspaceSurface } from "../shell/navigation";

export type RoomsProjectSection =
  | "index"
  | "vision"
  | "stories"
  | "evidence"
  | "audit-decisions"
  | "unknown";

export function resolveRoomsProjectSection(surface: RoomsWorkspaceSurface): RoomsProjectSection {
  if (surface.kind !== "project") return "unknown";
  if (surface.projectView && surface.projectView !== "document") return "unknown";
  if (surface.projectSection === "index" || surface.projectSection === "project") return "index";
  if (surface.projectSection === "vision") return "vision";
  if (surface.projectSection === "stories") return "stories";
  if (surface.projectSection === "evidence") return "evidence";
  if (
    surface.projectSection === "audit-decisions" ||
    surface.projectSection === "audit_decisions"
  ) {
    return "audit-decisions";
  }
  return "unknown";
}

export function projectRoomsProjectIndex(
  fixture: RoomsWorkspaceReadFixture,
  workspace: RoomsWorkspace,
) {
  return {
    navigation: workspace.navigation.filter((entry) =>
      ["vision", "stories", "evidence", "audit_decisions"].includes(entry.key),
    ),
    documents: workspace.documents.map((document) => ({
      document,
      currentRevision:
        document.revisions.find((revision) => revision.id === document.current_revision_id) ?? null,
      author:
        fixture.principals.find(
          (principal) =>
            principal.id ===
            document.revisions.find((revision) => revision.id === document.current_revision_id)
              ?.author_id,
        ) ?? null,
    })),
  };
}
