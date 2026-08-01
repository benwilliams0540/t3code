import type {
  RoomsEvidence,
  RoomsGate,
  RoomsPrincipal,
  RoomsStage,
  RoomsStory,
  RoomsWorkspace,
  RoomsWorkspaceReadFixture,
} from "../model/workspace";

export interface RoomsEvidenceProjectionItem {
  readonly evidence: RoomsEvidence;
  readonly story: RoomsStory;
  readonly producer: RoomsPrincipal;
}

export interface RoomsEvidenceGateFact {
  readonly story: RoomsStory;
  readonly stage: RoomsStage;
  readonly gate: RoomsGate;
  readonly attached: readonly RoomsEvidence[];
}

export interface RoomsEvidenceProjection {
  readonly items: readonly RoomsEvidenceProjectionItem[];
  readonly gateFacts: readonly RoomsEvidenceGateFact[];
}

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`Decoded workspace is missing ${description}.`);
  return value;
}

export function projectRoomsEvidence(
  fixture: RoomsWorkspaceReadFixture,
  workspace: RoomsWorkspace,
): RoomsEvidenceProjection {
  const stories = new Map(workspace.stories.map((story) => [story.id, story]));
  const principals = new Map(fixture.principals.map((principal) => [principal.id, principal]));
  const evidence = new Map(workspace.evidence.map((record) => [record.id, record]));
  const stages = new Map(
    workspace.workflows.flatMap((workflow) => workflow.stages).map((stage) => [stage.id, stage]),
  );
  return {
    items: workspace.evidence.map((record) => ({
      evidence: record,
      story: required(stories.get(record.story_id), `story ${record.story_id}`),
      producer: required(principals.get(record.producer_id), `producer ${record.producer_id}`),
    })),
    gateFacts: workspace.stories.flatMap((story) => {
      const stage = required(stages.get(story.stage_id), `stage ${story.stage_id}`);
      return stage.gate
        ? [
            {
              story,
              stage,
              gate: stage.gate,
              attached: story.evidence_ids.map((id) =>
                required(evidence.get(id), `evidence ${id}`),
              ),
            },
          ]
        : [];
    }),
  };
}
