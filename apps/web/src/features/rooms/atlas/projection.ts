import type {
  RoomsChannel,
  RoomsPrincipal,
  RoomsRoom,
  RoomsStage,
  RoomsWorkspace,
  RoomsWorkspaceReadFixture,
} from "../model/workspace";
import { projectRoomsVisionDocument } from "../documents";

export interface RoomsAtlasProjection {
  readonly room: RoomsRoom;
  readonly document: NonNullable<ReturnType<typeof projectRoomsVisionDocument>>["document"];
  readonly boundRevision: NonNullable<
    ReturnType<typeof projectRoomsVisionDocument>
  >["currentRevision"];
  readonly channels: readonly RoomsChannel[];
  readonly stages: readonly RoomsStage[];
  readonly presence: {
    readonly humans: readonly RoomsPrincipal[];
    readonly agents: readonly RoomsPrincipal[];
    readonly machines: readonly RoomsPrincipal[];
  };
  readonly isStale: boolean;
}

function principalsForIds(
  fixture: RoomsWorkspaceReadFixture,
  ids: readonly RoomsPrincipal["id"][],
): readonly RoomsPrincipal[] {
  return ids.flatMap((id) => {
    const principal = fixture.principals.find((candidate) => candidate.id === id);
    return principal ? [principal] : [];
  });
}

export function projectRoomsAtlas(
  fixture: RoomsWorkspaceReadFixture,
  room: RoomsRoom,
  workspace: RoomsWorkspace,
): RoomsAtlasProjection | null {
  const vision = projectRoomsVisionDocument(fixture, workspace);
  if (!vision) return null;
  const boundRevision = vision.document.revisions.find(
    (revision) => revision.id === vision.document.atlas.revision_id,
  );
  if (!boundRevision) return null;

  return {
    room,
    document: vision.document,
    boundRevision,
    channels: workspace.channels,
    stages:
      workspace.workflows
        .find((workflow) => workflow.story_type === "feature")
        ?.stages.toSorted((left, right) => left.position - right.position) ?? [],
    presence: {
      humans: principalsForIds(fixture, workspace.presence.human_ids),
      agents: principalsForIds(fixture, workspace.presence.agent_ids),
      machines: principalsForIds(fixture, workspace.presence.machine_ids),
    },
    isStale: vision.document.atlas.state === "stale",
  };
}
