import type {
  RoomsAudit,
  RoomsDecision,
  RoomsPrincipal,
  RoomsSourceEvent,
  RoomsStage,
  RoomsStory,
  RoomsWorkflow,
  RoomsWorkspace,
  RoomsWorkspaceReadFixture,
} from "../model/workspace";

export interface RoomsAuditEvent {
  readonly audit: RoomsAudit;
  readonly actor: RoomsPrincipal;
  readonly sourceEvent: RoomsSourceEvent;
}

export interface RoomsDecisionEvent {
  readonly decision: RoomsDecision;
  readonly author: RoomsPrincipal;
  readonly story: RoomsStory | null;
}

export interface RoomsGateFact {
  readonly workflow: RoomsWorkflow;
  readonly stage: RoomsStage;
}

export interface RoomsAuditProjection {
  readonly events: readonly RoomsAuditEvent[];
  readonly decisions: readonly RoomsDecisionEvent[];
  readonly gateFacts: readonly RoomsGateFact[];
}

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`Decoded workspace is missing ${description}.`);
  return value;
}

export function projectRoomsAudit(
  fixture: RoomsWorkspaceReadFixture,
  workspace: RoomsWorkspace,
): RoomsAuditProjection {
  const principals = new Map(fixture.principals.map((principal) => [principal.id, principal]));
  const stories = new Map(workspace.stories.map((story) => [story.id, story]));
  const sourceEvents = new Map(workspace.source_events.map((event) => [event.event_id, event]));
  return {
    events: workspace.audit.map((audit) => ({
      audit,
      actor: required(principals.get(audit.actor_id), `audit actor ${audit.actor_id}`),
      sourceEvent: required(
        sourceEvents.get(audit.source_event_id),
        `source event ${audit.source_event_id}`,
      ),
    })),
    decisions: workspace.decisions.map((decision) => ({
      decision,
      author: required(principals.get(decision.author_id), `decision author ${decision.author_id}`),
      story: decision.story_id ? (stories.get(decision.story_id) ?? null) : null,
    })),
    gateFacts: workspace.workflows.flatMap((workflow) =>
      workflow.stages.flatMap((stage) => (stage.gate ? [{ workflow, stage }] : [])),
    ),
  };
}
