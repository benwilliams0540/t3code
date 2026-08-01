import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import type { DraftId } from "./composerDraftStore";

export type ThreadRouteTarget =
  | {
      kind: "server";
      threadRef: ScopedThreadRef;
    }
  | {
      kind: "draft";
      draftId: DraftId;
    };

type DraftThreadRouteState = {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  promotedTo?: ScopedThreadRef | null;
};

export type ThreadRouteRenderState = "loading" | "ready" | "missing";

export type NewThreadDraftRouteScope =
  | { readonly kind: "native" }
  | { readonly kind: "rooms"; readonly roomSlug: string };

export type DraftThreadRouteDestination =
  | {
      readonly kind: "native";
      readonly params: { readonly draftId: DraftId };
      readonly to: "/draft/$draftId";
    }
  | {
      readonly kind: "rooms";
      readonly params: { readonly draftId: DraftId; readonly roomSlug: string };
      readonly to: "/rooms/$roomSlug/draft/$draftId";
    };

export type ServerThreadRouteDestination =
  | {
      readonly kind: "native";
      readonly params: { readonly environmentId: EnvironmentId; readonly threadId: ThreadId };
      readonly to: "/$environmentId/$threadId";
    }
  | {
      readonly kind: "rooms";
      readonly params: {
        readonly environmentId: EnvironmentId;
        readonly roomSlug: string;
        readonly threadId: ThreadId;
      };
      readonly to: "/rooms/$roomSlug/threads/$environmentId/$threadId";
    };

export function resolveNewThreadDraftRouteScope(
  params: Partial<
    Record<"draftId" | "environmentId" | "roomSlug" | "threadId", string | undefined>
  >,
  explicitRoomsRoomSlug?: string,
): NewThreadDraftRouteScope {
  const roomSlug = explicitRoomsRoomSlug ?? params.roomSlug;
  return roomSlug ? { kind: "rooms", roomSlug } : { kind: "native" };
}

export function buildDraftThreadRouteDestination(
  scope: NewThreadDraftRouteScope,
  draftId: DraftId,
): DraftThreadRouteDestination {
  return scope.kind === "rooms"
    ? {
        kind: "rooms",
        to: "/rooms/$roomSlug/draft/$draftId",
        params: { roomSlug: scope.roomSlug, draftId },
      }
    : { kind: "native", to: "/draft/$draftId", params: { draftId } };
}

export function buildServerThreadRouteDestination(
  ref: ScopedThreadRef,
  roomsRoomSlug?: string,
): ServerThreadRouteDestination {
  return roomsRoomSlug
    ? {
        kind: "rooms",
        to: "/rooms/$roomSlug/threads/$environmentId/$threadId",
        params: {
          roomSlug: roomsRoomSlug,
          environmentId: ref.environmentId,
          threadId: ref.threadId,
        },
      }
    : {
        kind: "native",
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(ref),
      };
}

export function resolveThreadRouteRenderState(input: {
  bootstrapComplete: boolean;
  serverThreadShellExists: boolean;
  serverThreadDetailExists: boolean;
  serverThreadDetailDeleted: boolean;
  draftThreadExists: boolean;
}): ThreadRouteRenderState {
  if (!input.bootstrapComplete) {
    return "loading";
  }
  if (input.serverThreadDetailExists || input.draftThreadExists) {
    return "ready";
  }
  if (input.serverThreadDetailDeleted) {
    return "missing";
  }
  return input.serverThreadShellExists ? "loading" : "missing";
}

export function buildThreadRouteParams(ref: ScopedThreadRef): {
  environmentId: EnvironmentId;
  threadId: ThreadId;
} {
  return {
    environmentId: ref.environmentId,
    threadId: ref.threadId,
  };
}

export function buildDraftThreadRouteParams(draftId: DraftId): {
  draftId: DraftId;
} {
  return { draftId };
}

export function resolveThreadRouteRef(
  params: Partial<Record<"environmentId" | "threadId", string | undefined>>,
): ScopedThreadRef | null {
  if (!params.environmentId || !params.threadId) {
    return null;
  }

  return scopeThreadRef(params.environmentId as EnvironmentId, params.threadId as ThreadId);
}

export function resolveThreadRouteTarget(
  params: Partial<Record<"environmentId" | "threadId" | "draftId", string | undefined>>,
): ThreadRouteTarget | null {
  if (params.environmentId && params.threadId) {
    return {
      kind: "server",
      threadRef: scopeThreadRef(params.environmentId as EnvironmentId, params.threadId as ThreadId),
    };
  }

  if (!params.draftId) {
    return null;
  }

  return {
    kind: "draft",
    draftId: params.draftId as DraftId,
  };
}

/**
 * Resolves the thread represented by either a canonical thread route or a
 * draft route whose promotion to a server thread has been recorded.
 */
export function resolveActiveThreadRouteRef(
  target: ThreadRouteTarget | null,
  draftThread: DraftThreadRouteState | null,
): ScopedThreadRef | null {
  if (target?.kind === "server") {
    return target.threadRef;
  }
  if (target?.kind !== "draft" || !draftThread?.promotedTo) {
    return null;
  }
  return draftThread.promotedTo;
}
