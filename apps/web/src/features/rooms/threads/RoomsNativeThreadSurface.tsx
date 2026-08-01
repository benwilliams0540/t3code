import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquareWarningIcon } from "lucide-react";
import { useEffect } from "react";

import ChatView from "~/components/ChatView";
import { threadHasStarted } from "~/components/ChatView.logic";
import { waitForDraftHeroTransition } from "~/components/chat/draftHeroTransition";
import { Spinner } from "~/components/ui/spinner";
import {
  DraftId,
  finalizePromotedDraftThreadByRef,
  markPromotedDraftThreadByRef,
  useComposerDraftStore,
} from "~/composerDraftStore";
import {
  useThread,
  useThreadDetail,
  useThreadRefs,
  useThreadShell,
  useThreadStatus,
} from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { environmentShell } from "~/state/shell";
import {
  buildServerThreadRouteDestination,
  resolveThreadRouteRef,
  resolveThreadRouteRenderState,
} from "~/threadRoutes";
import { resolveThreadSyncPhase } from "~/threadSync";

import type { RoomsWorkspaceSurface } from "../shell/navigation";
import { useRoomProjectBindings } from "./roomProjectBindings";
import { isThreadBoundToRoom } from "./roomsNativeThreads";

function NativeThreadUnavailable({ description }: { readonly description: string }) {
  return (
    <section
      className="flex min-h-full min-w-0 flex-1 items-center justify-center p-6"
      data-rooms-native-thread-unavailable=""
    >
      <div className="max-w-md rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <MessageSquareWarningIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
        <h1 className="mt-4 text-lg font-semibold text-foreground">T3 thread unavailable</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}

function NativeThreadLoading() {
  return (
    <section
      className="flex min-h-full min-w-0 flex-1 items-center justify-center"
      aria-label="Loading T3 thread"
    >
      <Spinner className="size-5 text-muted-foreground" />
    </section>
  );
}

function RoomsServerThreadSurface({
  roomId,
  roomSlug,
  surface,
}: {
  readonly roomId: string;
  readonly roomSlug: string;
  readonly surface: Extract<RoomsWorkspaceSurface, { kind: "native-thread" }>;
}) {
  const threadRef = resolveThreadRouteRef(surface);
  const { boundProjectRefs } = useRoomProjectBindings(roomId);
  const environmentIsBound =
    threadRef !== null &&
    boundProjectRefs.some((ref) => ref.environmentId === threadRef.environmentId);
  const candidateRef = environmentIsBound ? threadRef : null;
  const shell = useEnvironmentQuery(
    candidateRef === null ? null : environmentShell.stateAtom(candidateRef.environmentId),
  );
  const serverThreadShell = useThreadShell(candidateRef);
  const threadIsBound =
    serverThreadShell !== null && isThreadBoundToRoom(serverThreadShell, boundProjectRefs);
  const allowedRef = threadIsBound ? candidateRef : null;
  const serverThreadDetail = useThreadDetail(allowedRef);
  const serverThreadStatus = useThreadStatus(allowedRef);
  const bootstrapComplete = shell.data?.snapshot._tag === "Some";
  const draftThread = useComposerDraftStore((store) =>
    allowedRef ? store.getDraftThreadByRef(allowedRef) : null,
  );
  const draftThreadExists = draftThread !== null;
  const renderState = resolveThreadRouteRenderState({
    bootstrapComplete,
    serverThreadShellExists: serverThreadShell !== null,
    serverThreadDetailExists: serverThreadDetail !== null,
    serverThreadDetailDeleted: serverThreadStatus === "deleted",
    draftThreadExists,
  });
  const threadSyncPhase = resolveThreadSyncPhase({
    detailExists: serverThreadDetail !== null,
    shellExists: serverThreadShell !== null,
    status: serverThreadStatus,
  });
  const serverThreadStarted = threadHasStarted(serverThreadDetail);

  useEffect(() => {
    if (!allowedRef || !serverThreadStarted || !draftThread) return;
    finalizePromotedDraftThreadByRef(allowedRef);
  }, [allowedRef, draftThread, serverThreadStarted]);

  if (!threadRef || !environmentIsBound) {
    return (
      <NativeThreadUnavailable description="This route is not an exact thread identity inside a T3 project bound to the selected room." />
    );
  }
  if (bootstrapComplete && serverThreadShell && !threadIsBound) {
    return (
      <NativeThreadUnavailable description="This real T3 thread belongs to a project that is not bound to the selected room." />
    );
  }
  if (renderState === "missing") {
    return (
      <NativeThreadUnavailable description="No locally available T3 thread matches this route. Mirrored Rooms IDs are never used as native thread IDs." />
    );
  }
  if (
    allowedRef &&
    (renderState === "ready" || (renderState === "loading" && serverThreadShell !== null))
  ) {
    return (
      <ChatView
        environmentId={allowedRef.environmentId}
        threadId={allowedRef.threadId}
        routeKind="server"
        reserveTitleBarControlInset={false}
        roomsRoomSlug={roomSlug}
        threadSyncPhase={threadSyncPhase}
      />
    );
  }
  return <NativeThreadLoading />;
}

function RoomsDraftThreadSurface({
  roomId,
  roomSlug,
  surface,
}: {
  readonly roomId: string;
  readonly roomSlug: string;
  readonly surface: Extract<RoomsWorkspaceSurface, { kind: "native-draft" }>;
}) {
  const navigate = useNavigate();
  const draftId = DraftId.make(surface.draftId);
  const { boundProjectRefs } = useRoomProjectBindings(roomId);
  const draftSession = useComposerDraftStore((store) => store.getDraftSession(draftId));
  const draftProjectRef = draftSession
    ? scopeProjectRef(draftSession.environmentId, draftSession.projectId)
    : null;
  const draftIsBound =
    draftProjectRef !== null &&
    boundProjectRefs.some(
      (ref) =>
        ref.environmentId === draftProjectRef.environmentId &&
        ref.projectId === draftProjectRef.projectId,
    );
  const threadRefs = useThreadRefs();
  const inferredThreadRef =
    draftSession && draftIsBound
      ? (threadRefs.find(
          (ref) =>
            ref.environmentId === draftSession.environmentId &&
            ref.threadId === draftSession.threadId,
        ) ?? null)
      : null;
  const serverThreadRef = draftIsBound ? (draftSession?.promotedTo ?? inferredThreadRef) : null;
  const serverThread = useThread(serverThreadRef);
  const serverThreadStarted = threadHasStarted(serverThread);
  const canonicalThreadRef = serverThreadStarted ? serverThreadRef : null;

  useEffect(() => {
    if (!inferredThreadRef || draftSession?.promotedTo) return;
    markPromotedDraftThreadByRef(inferredThreadRef);
  }, [draftSession?.promotedTo, inferredThreadRef]);

  useEffect(() => {
    if (!canonicalThreadRef) return;
    let cancelled = false;
    void waitForDraftHeroTransition().then(() => {
      if (cancelled) return;
      const destination = buildServerThreadRouteDestination(canonicalThreadRef, roomSlug);
      if (destination.kind !== "rooms") return;
      void navigate({
        to: destination.to,
        params: destination.params,
        replace: true,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [canonicalThreadRef, navigate, roomSlug]);

  if (!draftSession) {
    return (
      <NativeThreadUnavailable description="This native T3 draft no longer exists. Rooms does not invent a replacement thread." />
    );
  }
  if (!draftIsBound) {
    return (
      <NativeThreadUnavailable description="This native T3 draft belongs to a project that is not bound to the selected room." />
    );
  }

  return (
    <ChatView
      draftId={draftId}
      environmentId={draftSession.environmentId}
      threadId={draftSession.threadId}
      routeKind="draft"
      reserveTitleBarControlInset={false}
      roomsRoomSlug={roomSlug}
      forceExpandedMobileComposer
    />
  );
}

export function RoomsNativeThreadSurface({
  roomId,
  roomSlug,
  surface,
}: {
  readonly roomId: string;
  readonly roomSlug: string;
  readonly surface: Extract<RoomsWorkspaceSurface, { kind: "native-thread" | "native-draft" }>;
}) {
  return surface.kind === "native-thread" ? (
    <RoomsServerThreadSurface roomId={roomId} roomSlug={roomSlug} surface={surface} />
  ) : (
    <RoomsDraftThreadSurface roomId={roomId} roomSlug={roomSlug} surface={surface} />
  );
}
