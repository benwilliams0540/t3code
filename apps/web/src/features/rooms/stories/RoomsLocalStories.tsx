import {
  AlertTriangleIcon,
  Columns3Icon,
  ExternalLinkIcon,
  GitBranchIcon,
  HistoryIcon,
  LinkIcon,
  ListIcon,
  PlusIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  UploadIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { cn } from "~/lib/utils";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { formatRelativeTimeLabel } from "~/timestampFormat";

import { useRoomsDataSource } from "../dataSource";
import { isRoomsLocalClientError } from "../dataSource/localChannelsClient";
import type {
  RoomsLocalAttachEvidenceInput,
  RoomsLocalEvidenceKind,
  RoomsLocalStoriesResponse,
  RoomsLocalStory,
  RoomsLocalStoryV2,
} from "../dataSource/localStoriesContract";
import { isRoomsLocalStoryV2 } from "../dataSource/localStoriesContract";
import type { RoomsHumanStoriesResponse } from "../dataSource/humanSharedContract";
import type { RoomsDataSourceMode } from "../dataSource";
import { createLowercaseUuidV7 } from "../dataSource/uuidV7";
import {
  finishStableRoomsSubmission,
  prepareStableRoomsCommand,
  tryStartStableRoomsSubmission,
  type StableRoomsCommand,
} from "../channel/stableCommand";
import type { RoomsWorkspaceNavigate } from "../shell/RoomsWorkspaceNavigation";
import { RoomsThreadStatus } from "../threads/RoomsThreadNavigation";
import { useRoomProjectBindings } from "../threads/roomProjectBindings";
import {
  selectRoomsNativeThreadEntries,
  type RoomsNativeThreadEntry,
} from "../threads/roomsNativeThreads";
import {
  localStoryBlockingGroup,
  localStoryBlockingGroupLabel,
  localStoryEvidenceGate,
  localStoryNeedsCurrentHuman,
  localStoryNextAction,
  localStoryOwnerId,
  localStoryStageLabel,
  localStoryUpdatedAt,
  ROOMS_STORIES_VIEW_STORAGE_KEY,
  ROOMS_STORY_BLOCKING_GROUPS,
  ROOMS_STORY_STAGE_ORDER,
  RoomsStoriesView,
} from "./presentation";

export { localStoryStageLabel } from "./presentation";

interface LocalStoryError {
  readonly code: string;
  readonly message: string;
}

function localStoryError(
  cause: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): LocalStoryError {
  return isRoomsLocalClientError(cause)
    ? { code: cause.code, message: cause.message }
    : { code: fallbackCode, message: fallbackMessage };
}

export function resolveLocalStoryNativeThread(
  story: RoomsLocalStory,
  threads: readonly RoomsNativeThreadEntry[],
): RoomsNativeThreadEntry | null {
  const linked = story.native_thread;
  if (!linked) return null;
  return (
    threads.find(
      (thread) =>
        thread.environmentId === linked.environment_id &&
        thread.projectId === linked.project_id &&
        thread.threadId === linked.thread_id,
    ) ?? null
  );
}

export function localStoryNativeThreadTarget(thread: RoomsNativeThreadEntry) {
  return {
    kind: "native-thread" as const,
    environmentId: thread.environmentId,
    threadId: thread.threadId,
  };
}

export function RoomsLocalLinkedThreadStatus({
  navigate,
  resolvedThread,
  story,
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly resolvedThread: RoomsNativeThreadEntry | null;
  readonly story: RoomsLocalStory;
}) {
  if (!story.native_thread) return null;
  if (!resolvedThread) {
    return (
      <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200">
        <p className="flex items-center gap-2 text-sm font-medium">
          <AlertTriangleIcon className="size-4" />
          Linked thread unavailable or stale
        </p>
        <code className="mt-2 block break-all text-[10px]">
          {story.native_thread.environment_id}/{story.native_thread.project_id}/
          {story.native_thread.thread_id}
        </code>
        <p className="mt-2 text-xs">
          This durable association does not currently resolve to an actual thread shell in a bound
          project. No fallback thread was opened.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{resolvedThread.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {resolvedThread.projectTitle} · provider {resolvedThread.providerInstanceId}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {resolvedThread.status === "ready" ? (
              <span data-rooms-story-thread-status="ready">Resting</span>
            ) : (
              <RoomsThreadStatus thread={resolvedThread} />
            )}
            <span>as of {formatRelativeTimeLabel(resolvedThread.updatedAt)}</span>
          </div>
        </div>
        <Button
          onClick={() => navigate(localStoryNativeThreadTarget(resolvedThread))}
          size="sm"
          variant="outline"
        >
          <ExternalLinkIcon />
          Open thread
        </Button>
      </div>
    </div>
  );
}

export function RoomsLocalStoriesEmptyState({
  sourceLabel = "Local",
}: {
  readonly sourceLabel?: string;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center"
      data-rooms-local-stories-empty=""
    >
      <GitBranchIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
      <h2 className="mt-4 text-base font-semibold text-foreground">No {sourceLabel} stories yet</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Create the first durable story, then associate it with one actual thread from a bound T3
        project.
      </p>
    </div>
  );
}

function RoomsCreateStoryDialog({
  authorized,
  onCreated,
  onOpenChange,
  open,
  roomId,
  sourceLabel,
}: {
  readonly authorized: boolean;
  readonly onCreated: (story: RoomsLocalStory) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly roomId: string;
  readonly sourceLabel: string;
}) {
  const { createLocalStory } = useRoomsDataSource();
  const [title, setTitle] = useState("");
  const [command, setCommand] = useState<StableRoomsCommand<string> | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<LocalStoryError | null>(null);

  const reset = () => {
    setTitle("");
    setCommand(null);
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!authorized || title.trim() === "" || !tryStartStableRoomsSubmission(pendingRef)) return;
    const next = prepareStableRoomsCommand(command, title, createLowercaseUuidV7);
    setCommand(next);
    setPending(true);
    setError(null);
    try {
      const result = await createLocalStory(roomId, {
        requestId: next.requestId,
        title: next.payload,
        storyType: "feature",
      });
      reset();
      onOpenChange(false);
      onCreated(result.value);
    } catch (cause) {
      setError(localStoryError(cause, "unexpected_story_error", "Could not create the story."));
    } finally {
      finishStableRoomsSubmission(pendingRef);
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && pending) return;
        if (!nextOpen) reset();
        onOpenChange(nextOpen);
      }}
    >
      <DialogPopup className="max-w-md" showCloseButton={!pending}>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Create {sourceLabel} story</DialogTitle>
            <DialogDescription>
              Add one server-owned story at the initial backlog stage. You can link a native T3
              thread afterward.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="rooms-story-title">Title</Label>
              <Input
                autoFocus
                disabled={pending}
                id="rooms-story-title"
                maxLength={200}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setCommand(null);
                  setError(null);
                }}
                placeholder="Finish configurable composer send shortcuts"
                value={title}
              />
              <p className="text-xs text-muted-foreground">Type: feature · Workflow revision 1</p>
            </div>
            {error ? <RoomsLocalStoryError error={error} /> : null}
          </DialogPanel>
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={!authorized || pending || title.trim() === ""} type="submit">
              {pending ? "Creating…" : command ? "Retry creation" : "Create story"}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}

function RoomsLocalStoryError({ error }: { readonly error: LocalStoryError }) {
  return (
    <div
      aria-live="polite"
      className="rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive"
    >
      <p>{error.message}</p>
      <code className="mt-1 block text-[10px]">{error.code}</code>
    </div>
  );
}

export const ROOMS_LOCAL_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
const BASE64_CHUNK_SIZE = 0x8000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE));
  }
  return btoa(binary);
}

export async function encodeRoomsLocalEvidenceFile(file: Blob): Promise<{
  readonly bodyBase64: string;
  readonly mediaType: string;
}> {
  if (file.size === 0) throw new Error("Choose a non-empty evidence file.");
  if (file.size > ROOMS_LOCAL_EVIDENCE_MAX_BYTES) {
    throw new Error("Evidence files are limited to 5 MiB.");
  }
  return {
    bodyBase64: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
    mediaType: file.type || "application/octet-stream",
  };
}

export function localStoryCompletionEvidence(story: RoomsLocalStoryV2): readonly string[] {
  const approvedId = story.gate?.approved_review_id;
  if (!approvedId) return [];
  return story.reviews.find((review) => review.id === approvedId)?.evidence ?? [];
}

export function RoomsLocalStoryGateStatus({
  onApproveAndComplete,
  pending,
  story,
}: {
  readonly onApproveAndComplete: () => void;
  readonly pending: boolean;
  readonly story: RoomsLocalStoryV2;
}) {
  if (!story.gate) return null;
  const canApprove =
    story.gate.approved_review_id !== null ||
    (story.allowed_actions.review && story.gate.evidence_satisfied && story.gate.reviewer_allowed);
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheckIcon className="size-4" />
            Human QA decision
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Requires {story.gate.required_evidence.mode} of{" "}
            {story.gate.required_evidence.kinds.join(", ")}.
            {story.gate.approved_review_id
              ? " Approval is persisted; completing will use that exact evidence set."
              : " Approval records you as reviewer, then completes with the same evidence."}
          </p>
        </div>
        <Button
          data-rooms-story-review="approved"
          disabled={pending || !canApprove}
          onClick={onApproveAndComplete}
          size="sm"
        >
          <ShieldCheckIcon />
          {pending
            ? "Approving…"
            : story.gate.approved_review_id
              ? "Complete story"
              : "Approve and complete"}
        </Button>
      </div>
      {!story.gate.reviewer_allowed && !story.gate.approved_review_id ? (
        <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">
          {!story.gate.evidence_satisfied
            ? "Attach a qualifying screenshot or artifact before approval."
            : "You cannot review evidence you produced when this workflow forbids self-review."}
        </p>
      ) : null}
    </div>
  );
}

interface StoryTransitionPayload {
  readonly expectedHeadSeq: number;
  readonly to: string;
  readonly evidence: readonly string[];
}

interface StoryReviewPayload {
  readonly expectedHeadSeq: number;
  readonly evidence: readonly string[];
}

function RoomsLocalStoryLifecycle({
  onUpdated,
  roomId,
  story,
}: {
  readonly onUpdated: (story: RoomsLocalStory) => void;
  readonly roomId: string;
  readonly story: RoomsLocalStoryV2;
}) {
  const {
    attachLocalStoryEvidence,
    loadLocalStory,
    reviewLocalStory,
    transitionLocalStory,
    uploadLocalCas,
  } = useRoomsDataSource();
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<RoomsLocalEvidenceKind>("artifact");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<LocalStoryError | null>(null);
  const [evidenceCommand, setEvidenceCommand] = useState<StableRoomsCommand<
    Omit<RoomsLocalAttachEvidenceInput, "requestId">
  > | null>(null);
  const [transitionCommand, setTransitionCommand] =
    useState<StableRoomsCommand<StoryTransitionPayload> | null>(null);
  const [reviewCommand, setReviewCommand] = useState<StableRoomsCommand<StoryReviewPayload> | null>(
    null,
  );

  const recoverStaleStory = async (cause: unknown): Promise<void> => {
    if (!isRoomsLocalClientError(cause) || cause.code !== "stale_scope_head") return;
    setEvidenceCommand(null);
    setTransitionCommand(null);
    setReviewCommand(null);
    try {
      onUpdated(await loadLocalStory(roomId, story.id));
    } catch {
      // Keep the original stale-head error visible. The surrounding live-change loop and
      // explicit Refresh action remain available if this immediate reconciliation also fails.
    }
  };

  const attachEvidence = async () => {
    if ((!file && !evidenceCommand) || !story.allowed_actions.attach_evidence) return;
    if (!tryStartStableRoomsSubmission(pendingRef)) return;
    setPending("evidence");
    setError(null);
    try {
      let next = evidenceCommand;
      if (!next) {
        const encoded = await encodeRoomsLocalEvidenceFile(file!);
        const cas = await uploadLocalCas(encoded);
        next = prepareStableRoomsCommand(
          null,
          {
            expectedHeadSeq: story.scope_head_seq,
            kind,
            cas,
            note: note.trim() === "" ? null : note,
          },
          createLowercaseUuidV7,
        );
        setEvidenceCommand(next);
      }
      const result = await attachLocalStoryEvidence(roomId, story.id, {
        requestId: next.requestId,
        ...next.payload,
      });
      setEvidenceCommand(null);
      setFile(null);
      setNote("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onUpdated(result.value);
    } catch (cause) {
      await recoverStaleStory(cause);
      setError(
        localStoryError(cause, "unexpected_evidence_error", "Could not attach the evidence."),
      );
    } finally {
      finishStableRoomsSubmission(pendingRef);
      setPending(null);
    }
  };

  const transition = async (to: string, terminal: boolean) => {
    if (!tryStartStableRoomsSubmission(pendingRef)) return;
    const evidence = terminal ? localStoryCompletionEvidence(story) : [];
    const payload = { expectedHeadSeq: story.scope_head_seq, to, evidence };
    const next = prepareStableRoomsCommand(transitionCommand, payload, createLowercaseUuidV7);
    setTransitionCommand(next);
    setPending(`transition:${to}`);
    setError(null);
    try {
      const result = await transitionLocalStory(roomId, story.id, {
        requestId: next.requestId,
        ...next.payload,
      });
      setTransitionCommand(null);
      onUpdated(result.value);
    } catch (cause) {
      await recoverStaleStory(cause);
      setError(
        localStoryError(cause, "unexpected_transition_error", "Could not change story stage."),
      );
    } finally {
      finishStableRoomsSubmission(pendingRef);
      setPending(null);
    }
  };

  const approveAndComplete = async () => {
    if (
      !story.gate ||
      (!story.gate.approved_review_id && !story.allowed_actions.review) ||
      !tryStartStableRoomsSubmission(pendingRef)
    ) {
      return;
    }
    setPending("review-complete");
    setError(null);
    try {
      let approvedStory = story;
      if (!story.gate.approved_review_id) {
        const payload = {
          expectedHeadSeq: story.scope_head_seq,
          evidence: story.gate.eligible_evidence,
        };
        const nextReview = prepareStableRoomsCommand(reviewCommand, payload, createLowercaseUuidV7);
        setReviewCommand(nextReview);
        const reviewed = await reviewLocalStory(roomId, story.id, {
          requestId: nextReview.requestId,
          expectedHeadSeq: nextReview.payload.expectedHeadSeq,
          decision: "approved",
          evidence: nextReview.payload.evidence,
        });
        approvedStory = reviewed.value;
        setReviewCommand(null);
        // Keep the durable review visible even if the separate completion command fails.
        onUpdated(approvedStory);
      }

      const completion = approvedStory.allowed_next_transitions.find(
        (candidate) => candidate.terminal && candidate.to === "done",
      );
      if (!completion?.allowed) {
        onUpdated(approvedStory);
        throw new Error("The approved story is not ready for its declared terminal transition.");
      }
      const completionPayload = {
        expectedHeadSeq: approvedStory.scope_head_seq,
        to: completion.to,
        evidence: localStoryCompletionEvidence(approvedStory),
      };
      const nextTransition = prepareStableRoomsCommand(
        transitionCommand,
        completionPayload,
        createLowercaseUuidV7,
      );
      setTransitionCommand(nextTransition);
      const completed = await transitionLocalStory(roomId, story.id, {
        requestId: nextTransition.requestId,
        ...nextTransition.payload,
      });
      setTransitionCommand(null);
      onUpdated(completed.value);
    } catch (cause) {
      await recoverStaleStory(cause);
      setError(
        localStoryError(
          cause,
          "unexpected_review_completion_error",
          "The review or completion could not be finished. Refresh to see any decision that was already recorded.",
        ),
      );
    } finally {
      finishStableRoomsSubmission(pendingRef);
      setPending(null);
    }
  };

  return (
    <div className="mt-5 grid gap-4 border-t border-border pt-5" data-rooms-story-lifecycle="v2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">Persisted workflow</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Room head {story.scope_head_seq} · ledger as of {story.as_of_seq}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {story.allowed_next_transitions
            .filter((candidate) => !candidate.terminal)
            .map((candidate) => {
              const reviewGate = candidate.to === "human-qa" ? localStoryEvidenceGate(story) : null;
              const allowed = candidate.allowed && (reviewGate?.satisfied ?? true);
              return (
                <Button
                  data-rooms-story-transition={candidate.to}
                  disabled={pending !== null || !allowed}
                  key={`${candidate.from}:${candidate.to}`}
                  onClick={() => void transition(candidate.to, candidate.terminal)}
                  size="sm"
                  title={reviewGate?.unavailableReason ?? candidate.unavailable_reason ?? undefined}
                  variant="outline"
                >
                  {pending === `transition:${candidate.to}`
                    ? "Saving…"
                    : candidate.to === "in-progress"
                      ? "Claim and start"
                      : candidate.to === "human-qa"
                        ? "Request review"
                        : `Move to ${candidate.label}`}
                </Button>
              );
            })}
        </div>
      </div>

      {story.stage === "in-progress" && !localStoryEvidenceGate(story).satisfied ? (
        <p
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200"
          data-rooms-story-review-gate="blocked"
        >
          {localStoryEvidenceGate(story).unavailableReason} The review action unlocks here after the
          evidence is attached.
        </p>
      ) : null}

      {story.allowed_actions.attach_evidence || story.evidence.length > 0 ? (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <UploadIcon className="size-4" />
            Evidence
          </p>
          {story.evidence.length > 0 ? (
            <ul className="mt-3 grid gap-2 text-xs text-muted-foreground">
              {story.evidence.map((evidence) => (
                <li
                  className="rounded-lg border border-border bg-background px-3 py-2"
                  key={evidence.id}
                >
                  <span className="font-medium text-foreground">{evidence.kind}</span>
                  {evidence.note ? ` · ${evidence.note}` : ""}
                  <code className="mt-1 block break-all text-[10px]">
                    sha256:{evidence.cas.hash} · {evidence.cas.bytes} bytes · seq{" "}
                    {evidence.attached_seq}
                  </code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">No evidence is attached yet.</p>
          )}
          {story.allowed_actions.attach_evidence ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <div className="grid gap-1.5">
                <Label htmlFor={`rooms-story-evidence-${story.id}`}>Artifact or screenshot</Label>
                <Input
                  accept="image/*,.json,.log,.md,.txt,.zip"
                  disabled={pending !== null}
                  id={`rooms-story-evidence-${story.id}`}
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    setFile(selected);
                    setKind(selected?.type.startsWith("image/") ? "screenshot" : "artifact");
                    setEvidenceCommand(null);
                    setError(null);
                  }}
                  ref={fileInputRef}
                  type="file"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`rooms-story-evidence-kind-${story.id}`}>Kind</Label>
                <select
                  className="h-9 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
                  disabled={pending !== null}
                  id={`rooms-story-evidence-kind-${story.id}`}
                  onChange={(event) => {
                    setKind(event.target.value as RoomsLocalEvidenceKind);
                    setEvidenceCommand(null);
                  }}
                  value={kind}
                >
                  <option value="artifact">Artifact</option>
                  <option value="screenshot">Screenshot</option>
                </select>
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor={`rooms-story-evidence-note-${story.id}`}>Note</Label>
                <Input
                  disabled={pending !== null}
                  id={`rooms-story-evidence-note-${story.id}`}
                  maxLength={1000}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setEvidenceCommand(null);
                  }}
                  placeholder="What this bounded file proves"
                  value={note}
                />
              </div>
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">
                  Maximum 5 MiB. Bytes are stored in Local CAS.
                </p>
                <Button
                  disabled={pending !== null || (!file && !evidenceCommand)}
                  onClick={() => void attachEvidence()}
                  size="sm"
                >
                  <UploadIcon />
                  {pending === "evidence"
                    ? "Uploading…"
                    : evidenceCommand
                      ? "Retry attachment"
                      : "Attach evidence"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <RoomsLocalStoryGateStatus
        onApproveAndComplete={() => void approveAndComplete()}
        pending={pending === "review-complete"}
        story={story}
      />

      {error ? <RoomsLocalStoryError error={error} /> : null}

      <details className="rounded-xl border border-border bg-muted/10 p-4">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
          <HistoryIcon className="size-4" />
          Workflow activity ({story.audit.length})
        </summary>
        <ol className="mt-3 grid gap-2 text-xs text-muted-foreground">
          {story.audit.map((entry) => (
            <li key={entry.source_event.event_id}>
              <code>#{entry.source_event.seq}</code> {entry.source_event.type} · {entry.actor}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function nativeThreadKey(thread: RoomsNativeThreadEntry): string {
  return JSON.stringify([thread.environmentId, thread.projectId, thread.threadId]);
}

function RoomsLocalStoryCard({
  canLink,
  navigate,
  onUpdated,
  roomId,
  story,
  threads,
}: {
  readonly canLink: boolean;
  readonly navigate: RoomsWorkspaceNavigate;
  readonly onUpdated: (story: RoomsLocalStory) => void;
  readonly roomId: string;
  readonly story: RoomsLocalStory;
  readonly threads: readonly RoomsNativeThreadEntry[];
}) {
  const { linkLocalStoryThread } = useRoomsDataSource();
  const resolvedThread = resolveLocalStoryNativeThread(story, threads);
  const [selectedKey, setSelectedKey] = useState("");
  const [command, setCommand] = useState<StableRoomsCommand<RoomsNativeThreadEntry> | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState<LocalStoryError | null>(null);

  const link = async () => {
    const selected = threads.find((thread) => nativeThreadKey(thread) === selectedKey);
    if (!selected || !canLink || !tryStartStableRoomsSubmission(pendingRef)) return;
    const next = prepareStableRoomsCommand(command, selected, createLowercaseUuidV7);
    setCommand(next);
    setPending(true);
    setError(null);
    try {
      const result = await linkLocalStoryThread(roomId, story.id, {
        requestId: next.requestId,
        environmentId: next.payload.environmentId,
        projectId: next.payload.projectId,
        threadId: next.payload.threadId,
      });
      setCommand(null);
      onUpdated(result.value);
    } catch (cause) {
      setError(localStoryError(cause, "unexpected_link_error", "Could not link the T3 thread."));
    } finally {
      finishStableRoomsSubmission(pendingRef);
      setPending(false);
    }
  };

  return (
    <article
      className="rounded-2xl border border-border bg-card p-5"
      data-rooms-story-id={story.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {story.story_type} · workflow {story.workflow_version}
          </p>
          <h2 className="mt-1 text-base font-semibold text-foreground">{story.title}</h2>
        </div>
        <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-foreground">
          {localStoryStageLabel(story.stage)}
        </span>
      </div>

      <section className="mt-5 border border-amber-500/35 bg-amber-500/[0.07] p-4">
        <p className="font-mono text-[10px] font-semibold tracking-[0.14em] text-[var(--threadspace-amber)] uppercase">
          Next human action
        </p>
        <p className="mt-2 text-sm font-semibold text-foreground">{localStoryNextAction(story)}</p>
      </section>

      {story.native_thread ? (
        <RoomsLocalLinkedThreadStatus
          navigate={navigate}
          resolvedThread={resolvedThread}
          story={story}
        />
      ) : (
        <div className="mt-5 grid gap-3 rounded-xl border border-dashed border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor={`rooms-story-thread-${story.id}`}>Actual bound T3 thread</Label>
            <select
              className="h-9 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground disabled:opacity-64"
              disabled={pending || threads.length === 0}
              id={`rooms-story-thread-${story.id}`}
              onChange={(event) => {
                setSelectedKey(event.target.value);
                setCommand(null);
                setError(null);
              }}
              value={selectedKey}
            >
              <option value="">Choose one actual thread</option>
              {threads.map((thread) => (
                <option key={nativeThreadKey(thread)} value={nativeThreadKey(thread)}>
                  {thread.title} · {thread.projectTitle}
                </option>
              ))}
            </select>
            {threads.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Bind a local T3 project with an active thread before linking.
              </p>
            ) : null}
          </div>
          <Button disabled={!canLink || pending || selectedKey === ""} onClick={() => void link()}>
            <LinkIcon />
            {pending ? "Linking…" : command ? "Retry link" : "Link thread"}
          </Button>
          {error ? (
            <div className="sm:col-span-2">
              <RoomsLocalStoryError error={error} />
            </div>
          ) : null}
        </div>
      )}

      {isRoomsLocalStoryV2(story) ? (
        <RoomsLocalStoryLifecycle onUpdated={onUpdated} roomId={roomId} story={story} />
      ) : (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200">
          This server returned local-stories v1. Upgrade the Local Rails producer to use evidence,
          Human QA, and completion controls.
        </div>
      )}
    </article>
  );
}

function RoomsStorySummaryCard({
  currentPrincipalId,
  displayPrincipal,
  onSelect,
  selected,
  story,
  threads,
}: {
  readonly currentPrincipalId: string | null;
  readonly displayPrincipal: (principalId: string) => string;
  readonly onSelect: () => void;
  readonly selected: boolean;
  readonly story: RoomsLocalStory;
  readonly threads: readonly RoomsNativeThreadEntry[];
}) {
  const ownerId = localStoryOwnerId(story);
  const thread = resolveLocalStoryNativeThread(story, threads);
  const needsYou = currentPrincipalId
    ? localStoryNeedsCurrentHuman(story, currentPrincipalId)
    : false;
  const blockingLabel = localStoryBlockingGroupLabel(
    localStoryBlockingGroup(story, currentPrincipalId),
  );
  const evidenceCount = isRoomsLocalStoryV2(story) ? story.evidence.length : 0;
  const threadState = !story.native_thread
    ? "thread not linked"
    : !thread
      ? "thread missing"
      : thread.status === "working"
        ? "thread working"
        : thread.status === "failed"
          ? "thread stopped"
          : `thread ${thread.status}`;
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "w-full rounded-xl border bg-card p-4 text-left transition-colors hover:border-foreground/25 hover:bg-muted/25",
        selected ? "border-foreground/35 bg-muted/25" : "border-border",
        needsYou && "border-amber-500/40",
      )}
      data-rooms-story-summary={story.id}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={cn(
            "size-2 rounded-full",
            story.stage === "done"
              ? "bg-emerald-400"
              : story.stage === "human-qa"
                ? "bg-amber-400"
                : story.stage === "in-progress"
                  ? "bg-blue-400"
                  : "bg-muted-foreground/55",
          )}
        />
        <span>{localStoryStageLabel(story.stage)}</span>
        <span className="border-l border-border pl-2 font-mono text-[9px] tracking-[0.08em] uppercase">
          Blocking · {blockingLabel}
        </span>
        <time className="ml-auto" dateTime={localStoryUpdatedAt(story)}>
          {formatRelativeTimeLabel(localStoryUpdatedAt(story))}
        </time>
      </div>
      <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">{story.title}</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        {ownerId ? `${displayPrincipal(ownerId)} owns` : "Unassigned"} · {threadState} ·{" "}
        {evidenceCount} evidence
      </p>
      <p className="mt-3 border-t border-border/70 pt-3 text-xs font-medium text-amber-700 dark:text-amber-300">
        {localStoryNextAction(story)}
      </p>
    </button>
  );
}

type RoomsStoryListFilter = "needs-you" | "active" | "mine" | "all";

function RoomsStoryViewToggle({
  onChange,
  view,
}: {
  readonly onChange: (view: RoomsStoriesView) => void;
  readonly view: RoomsStoriesView;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5" role="group">
      <Button
        aria-pressed={view === "board"}
        onClick={() => onChange("board")}
        size="sm"
        type="button"
        variant={view === "board" ? "secondary" : "ghost"}
      >
        <Columns3Icon /> Board
      </Button>
      <Button
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
        size="sm"
        type="button"
        variant={view === "list" ? "secondary" : "ghost"}
      >
        <ListIcon /> List
      </Button>
    </div>
  );
}

function RoomsStoriesBoard({
  currentPrincipalId,
  displayPrincipal,
  onSelect,
  selectedStoryId,
  stories,
  threads,
}: {
  readonly currentPrincipalId: string | null;
  readonly displayPrincipal: (principalId: string) => string;
  readonly onSelect: (storyId: string) => void;
  readonly selectedStoryId: string | null;
  readonly stories: readonly RoomsLocalStory[];
  readonly threads: readonly RoomsNativeThreadEntry[];
}) {
  const [stageFilter, setStageFilter] = useState<string>("all");
  return (
    <div className="grid flex-1 content-start gap-3" data-rooms-stories-layout="board">
      <div className="flex flex-wrap items-center gap-2 border border-border bg-muted/15 p-2">
        <span className="px-1 font-mono text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
          Stage
        </span>
        {["all", ...ROOMS_STORY_STAGE_ORDER].map((stage) => (
          <Button
            aria-pressed={stageFilter === stage}
            key={stage}
            onClick={() => setStageFilter(stage)}
            size="sm"
            type="button"
            variant={stageFilter === stage ? "secondary" : "ghost"}
          >
            {stage === "all" ? "All" : localStoryStageLabel(stage)}
          </Button>
        ))}
      </div>
      {ROOMS_STORY_BLOCKING_GROUPS.map((group) => {
        const groupStories = stories.filter(
          (story) =>
            (stageFilter === "all" || story.stage === stageFilter) &&
            localStoryBlockingGroup(story, currentPrincipalId) === group.key,
        );
        return (
          <section
            className="threadspace-panel border border-border bg-muted/10"
            data-rooms-blocking-group={group.key}
            key={group.key}
          >
            <header className="flex items-center gap-3 border-b border-border px-3 py-2.5">
              <div>
                <h2 className="text-xs font-semibold tracking-[0.08em] text-foreground uppercase">
                  {group.label}
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{group.detail}</p>
              </div>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {groupStories.length}
              </span>
            </header>
            {groupStories.length > 0 ? (
              <div className="grid gap-2.5 p-2.5 xl:grid-cols-2">
                {groupStories.map((story) => (
                  <RoomsStorySummaryCard
                    currentPrincipalId={currentPrincipalId}
                    displayPrincipal={displayPrincipal}
                    key={story.id}
                    onSelect={() => onSelect(story.id)}
                    selected={selectedStoryId === story.id}
                    story={story}
                    threads={threads}
                  />
                ))}
              </div>
            ) : (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                No stories in this blocking group.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function RoomsLocalStoriesSurface({
  navigate,
  roomId,
  sourceMode = "local",
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly roomId: string;
  readonly sourceMode?: Extract<RoomsDataSourceMode, "local" | "shared">;
}) {
  const { loadLocalStories, localFeedRefreshGeneration, state } = useRoomsDataSource();
  const { boundProjectRefs, boundProjects } = useRoomProjectBindings(roomId, sourceMode);
  const shells = useThreadShellsForProjectRefs(boundProjectRefs);
  const threads = useMemo(
    () => selectRoomsNativeThreadEntries(shells, boundProjects),
    [boundProjects, shells],
  );
  const [response, setResponse] = useState<
    RoomsLocalStoriesResponse | RoomsHumanStoriesResponse | null
  >(null);
  const [error, setError] = useState<LocalStoryError | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [filter, setFilter] = useState<RoomsStoryListFilter>("all");
  const [view, setView] = useLocalStorage(
    ROOMS_STORIES_VIEW_STORAGE_KEY,
    "board",
    RoomsStoriesView,
  );
  const sourceLabel = sourceMode === "shared" ? "Shared" : "Local";
  const loadGeneration = useRef(0);
  const interactiveWorkspace =
    state.status === "ready" && state.mode !== "sample" ? state.workspace : null;
  const currentPrincipalId = interactiveWorkspace?.principal.id ?? null;
  const displayPrincipal = useCallback(
    (principalId: string) => {
      if (!interactiveWorkspace) return principalId;
      if (interactiveWorkspace.principal.id === principalId) {
        return interactiveWorkspace.principal.display_name ?? "Current person";
      }
      if ("principals" in interactiveWorkspace) {
        return (
          interactiveWorkspace.principals.find((principal) => principal.id === principalId)
            ?.display_name ?? principalId
        );
      }
      return principalId;
    },
    [interactiveWorkspace],
  );

  const refresh = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loadLocalStories(roomId);
      if (generation === loadGeneration.current) setResponse(next);
    } catch (cause) {
      if (generation === loadGeneration.current) {
        setError(localStoryError(cause, "unexpected_story_load_error", "Could not load stories."));
      }
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [loadLocalStories, roomId]);

  useEffect(() => {
    void refresh();
    return () => {
      loadGeneration.current += 1;
    };
  }, [localFeedRefreshGeneration, refresh]);

  useEffect(() => {
    const stories = response?.stories ?? [];
    if (stories.length === 0) {
      setSelectedStoryId(null);
      return;
    }
    if (!selectedStoryId || !stories.some((story) => story.id === selectedStoryId)) {
      setSelectedStoryId(stories[0]!.id);
    }
  }, [response?.stories, selectedStoryId]);

  const acceptStory = (story: RoomsLocalStory) => {
    setSelectedStoryId(story.id);
    void refresh();
  };

  const stories = response?.stories ?? [];
  const visibleStories = stories.filter((story) => {
    if (filter === "all") return true;
    if (filter === "active") return story.stage !== "backlog" && story.stage !== "done";
    if (filter === "mine") return localStoryOwnerId(story) === currentPrincipalId;
    return currentPrincipalId ? localStoryNeedsCurrentHuman(story, currentPrincipalId) : false;
  });
  const selectedStory = stories.find((story) => story.id === selectedStoryId) ?? null;
  const canLinkStories = response?.capabilities["work.link_thread"] ?? false;

  return (
    <section
      className={cn(
        "mx-auto w-full p-5 sm:p-8",
        view === "board" ? "flex min-h-full max-w-[1600px] flex-col" : "max-w-5xl",
      )}
      data-rooms-local-stories=""
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="threadspace-technical font-mono text-[10px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Fig. 02 · Work board · {sourceLabel}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">Stories</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Threadspace keeps stage and blocking context separate. T3 remains the source of live
            thread, provider, and execution status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RoomsStoryViewToggle onChange={setView} view={view} />
          <Button disabled={loading} onClick={() => void refresh()} size="sm" variant="outline">
            <RefreshCwIcon />
            Refresh
          </Button>
          <Button
            disabled={!response?.capabilities["work.create"]}
            onClick={() => setCreateOpen(true)}
            size="sm"
          >
            <PlusIcon />
            Create story
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-6">
          <RoomsLocalStoryError error={error} />
        </div>
      ) : null}
      {loading && !response ? (
        <p className="mt-8 text-sm text-muted-foreground" role="status">
          Loading {sourceLabel} stories…
        </p>
      ) : response?.stories.length === 0 ? (
        <div className="mt-8">
          <RoomsLocalStoriesEmptyState sourceLabel={sourceLabel} />
        </div>
      ) : (
        <div className={cn("mt-6", view === "board" && "flex min-h-0 flex-1 flex-col")}>
          {view === "board" ? (
            <div className="flex min-h-0 flex-1 pb-3">
              <RoomsStoriesBoard
                currentPrincipalId={currentPrincipalId}
                displayPrincipal={displayPrincipal}
                onSelect={(storyId) => {
                  setSelectedStoryId(storyId);
                  setView("list");
                }}
                selectedStoryId={selectedStoryId}
                stories={stories}
                threads={threads}
              />
            </div>
          ) : (
            <div data-rooms-stories-layout="list-detail">
              <div className="mb-4 flex flex-wrap gap-2">
                {(
                  [
                    ["needs-you", "Needs you"],
                    ["active", "Active"],
                    ["mine", "Mine"],
                    ["all", "All"],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    aria-pressed={filter === value}
                    key={value}
                    onClick={() => setFilter(value)}
                    size="sm"
                    type="button"
                    variant={filter === value ? "secondary" : "outline"}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="grid gap-4 min-[1100px]:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
                <div className="grid content-start gap-2.5">
                  {visibleStories.length > 0 ? (
                    visibleStories.map((story) => (
                      <RoomsStorySummaryCard
                        currentPrincipalId={currentPrincipalId}
                        displayPrincipal={displayPrincipal}
                        key={story.id}
                        onSelect={() => setSelectedStoryId(story.id)}
                        selected={selectedStoryId === story.id}
                        story={story}
                        threads={threads}
                      />
                    ))
                  ) : (
                    <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                      No stories match this view.
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  {selectedStory ? (
                    <RoomsLocalStoryCard
                      canLink={canLinkStories}
                      key={selectedStory.id}
                      navigate={navigate}
                      onUpdated={acceptStory}
                      roomId={roomId}
                      story={selectedStory}
                      threads={threads}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <RoomsCreateStoryDialog
        authorized={response?.capabilities["work.create"] ?? false}
        onCreated={acceptStory}
        onOpenChange={setCreateOpen}
        open={createOpen}
        roomId={roomId}
        sourceLabel={sourceLabel}
      />
    </section>
  );
}
