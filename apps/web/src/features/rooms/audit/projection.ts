import type {
  RoomsFeedItem,
  RoomsPrincipal,
  RoomsStage,
  RoomsWorkspace,
  RoomsWorkspaceReadFixture,
} from "../model/workspace";

export interface RoomsAuditEvent {
  readonly item: RoomsFeedItem;
  readonly actor: RoomsPrincipal | null;
}

export interface RoomsDecisionEvent extends RoomsAuditEvent {
  readonly decision: string | null;
  readonly scope: string | null;
  readonly taskId: string | null;
}

export interface RoomsGateFact {
  readonly stage: RoomsStage;
  readonly kind: "workflow_definition";
}

export interface RoomsAuditProjection {
  readonly events: readonly RoomsAuditEvent[];
  readonly decisions: readonly RoomsDecisionEvent[];
  readonly gateFacts: readonly RoomsGateFact[];
}

function stringField(data: Readonly<Record<string, unknown>>, key: string): string | null {
  return typeof data[key] === "string" ? data[key] : null;
}

export function projectRoomsAudit(
  fixture: RoomsWorkspaceReadFixture,
  workspace: RoomsWorkspace,
): RoomsAuditProjection {
  const events = workspace.feeds
    .flatMap((feed) => feed.items)
    .map((item) => ({
      item,
      actor: fixture.principals.find((principal) => principal.id === item.actor_id) ?? null,
    }))
    .sort((left, right) => left.item.source_event.seq - right.item.source_event.seq);

  return {
    events,
    decisions: events.flatMap((event) => {
      if (event.item.kind !== "approval_decided") return [];
      return [
        {
          ...event,
          decision: stringField(event.item.data, "decision"),
          scope: stringField(event.item.data, "scope"),
          taskId: stringField(event.item.data, "task_id"),
        },
      ];
    }),
    gateFacts: workspace.workflow.stages.flatMap((stage) =>
      stage.gate ? [{ stage, kind: "workflow_definition" as const }] : [],
    ),
  };
}
