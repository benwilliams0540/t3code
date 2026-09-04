import {
  BotIcon,
  CircleHelpIcon,
  CircleUserRoundIcon,
  ExternalLinkIcon,
  FileCheck2Icon,
  ListChecksIcon,
  MessageCircleIcon,
  MonitorIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SmileIcon,
  UnplugIcon,
} from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "~/lib/utils";
import { roomsAgentTurnCopy } from "@t3tools/client-runtime/rooms/agent-turns";

import { resolveRoomsInternalHref } from "../shell/internalHref";
import type { RoomsActivityRow } from "./grouping";
import { principalPresentation, type RoomsProjectedActivity } from "./projection";

const cardCopy = {
  message: { label: "Message", icon: MessageCircleIcon },
  agent_turn: { label: "Agent turn", icon: BotIcon },
  reaction: { label: "Reaction", icon: SmileIcon },
  run: { label: "Agent run", icon: BotIcon },
  story: { label: "Story update", icon: ListChecksIcon },
  evidence: { label: "Evidence attached", icon: FileCheck2Icon },
  approval: { label: "Approval", icon: ShieldCheckIcon },
  gate: { label: "Human gate", icon: ShieldAlertIcon },
  unknown: { label: "Unknown event", icon: CircleHelpIcon },
  unavailable: { label: "Unavailable", icon: UnplugIcon },
} as const;

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(value),
  );
}

export function formatRoomsActivityDay(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  const startOfDay = (input: Date) =>
    new Date(input.getFullYear(), input.getMonth(), input.getDate()).getTime();
  const dayDelta = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (dayDelta === 0) return "Today";
  if (dayDelta === 1) return "Yesterday";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
}

function principalClasses(tone: ReturnType<typeof principalPresentation>["tone"]): string {
  switch (tone) {
    case "human":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "agent":
      return "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300";
    case "machine":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "unknown":
      return "border-border bg-muted text-muted-foreground";
  }
}

function PrincipalMark({ activity }: { readonly activity: RoomsProjectedActivity }) {
  const writer = activity.attribution.writer;
  const tone = principalPresentation(writer).tone;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center border text-xs font-semibold",
        tone === "human" ? "rounded-full" : "rounded-xl",
        principalClasses(tone),
      )}
    >
      {tone === "agent" ? (
        <BotIcon className="size-4" />
      ) : tone === "machine" ? (
        <MonitorIcon className="size-4" />
      ) : tone === "unknown" ? (
        <CircleUserRoundIcon className="size-4" />
      ) : (
        writer.display_name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

function AttributionFacts({ activity }: { readonly activity: RoomsProjectedActivity }) {
  const { attribution } = activity;
  if (attribution.mode === "explicit_principal") {
    return (
      <p className="mt-1 text-xs text-muted-foreground">
        Explicit Rooms write · actor {attribution.actor?.display_name ?? "unresolved"}
      </p>
    );
  }
  const upstream = attribution.upstream;
  return (
    <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
      <p>
        Adapter writer {attribution.writer.display_name} · upstream{" "}
        {upstream?.status === "coarse"
          ? `${upstream.actor_kind} (${upstream.environment_id})`
          : `identity unavailable (${upstream?.reason ?? "no source metadata"})`}
      </p>
      {attribution.delegatedAgent || attribution.machine ? (
        <p>
          Delegated agent {attribution.delegatedAgent?.display_name ?? "none"} · machine{" "}
          {attribution.machine?.display_name ?? "none"}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Durable provenance stays in the DOM for every item, but only the record register keeps it on the
 * reading surface. Conversation rows fold it behind a disclosure so a channel reads as speech
 * without discarding the ledger facts that make it trustworthy.
 */
function ActivityProvenance({ activity }: { readonly activity: RoomsProjectedActivity }) {
  const { attribution, item } = activity;
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Absolute so a collapsed row contributes no height: a grouped block must read as one paragraph. */}
      <button
        aria-expanded={open}
        className="absolute top-1 right-2 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/70 opacity-0 transition-opacity group-hover/row:opacity-100 hover:text-muted-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        seq {item.source_event.seq} · details
      </button>
      <div
        className={cn(
          "mt-1.5 grid gap-0.5 rounded-lg border border-border/60 bg-muted/25 p-2.5 font-mono text-[10px] text-muted-foreground",
          open ? "" : "hidden",
        )}
        data-rooms-activity-provenance=""
      >
        <span>event {item.source_event.event_id}</span>
        <span>
          {item.source_event.type} · schema {item.source_event.schema} · seq {item.source_event.seq}
        </span>
        <span>writer {attribution.writer.id}</span>
        {attribution.actor ? <span>actor {attribution.actor.id}</span> : null}
        <span>attribution {attribution.mode}</span>
      </div>
    </>
  );
}

function ActivityDetails({ activity }: { readonly activity: RoomsProjectedActivity }) {
  switch (activity.cardKind) {
    case "message":
      return <ActivityMarkdown className="mt-2" markdown={activity.bodyMarkdown} />;
    case "reaction":
      return (
        <p className="mt-2 text-sm text-foreground">
          <span className="mr-2 rounded-full border border-border bg-muted/45 px-2.5 py-1">
            {activity.emoji}
          </span>
          {activity.item.summary} · target {activity.targetItemId}
        </p>
      );
    case "run":
      return (
        <div className="mt-2 rounded-lg border border-violet-500/20 bg-violet-500/[0.06] p-3">
          <p className="font-medium text-foreground">{activity.thread?.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {activity.thread?.provider} · {activity.thread?.environment_id} · {activity.status}
          </p>
          {activity.threadHref ? (
            <a
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300"
              href={resolveRoomsInternalHref(activity.threadHref)}
            >
              Open detailed T3 thread <ExternalLinkIcon aria-hidden className="size-3" />
            </a>
          ) : null}
        </div>
      );
    case "story":
      return (
        <div className="mt-2 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3">
          <p className="font-medium text-foreground">{activity.story?.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activity.stage?.name} · {activity.item.summary}
          </p>
        </div>
      );
    case "evidence":
      return (
        <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
          <p className="font-medium text-foreground">{activity.evidence?.kind}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activity.story?.title} · sha256:{activity.evidence?.cas.hash.slice(0, 12)}…
          </p>
        </div>
      );
    case "approval":
      return (
        <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-3">
          <p className="font-medium text-foreground">
            {activity.approval?.state.replaceAll("_", " ")} · {activity.approval?.scope}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{activity.story?.title}</p>
        </div>
      );
    case "gate":
      return (
        <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-3">
          <p className="font-medium text-foreground">{activity.gate?.state.replaceAll("_", " ")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activity.story?.title} · {activity.gate?.requiredEvidenceCount} required evidence ·{" "}
            {activity.gate?.reviewerCount} reviewers
          </p>
        </div>
      );
    case "unknown":
      return (
        <div className="mt-2 rounded-lg border border-dashed border-border p-3">
          <p className="font-medium text-foreground">Unknown schema retained</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activity.unknownSchema?.eventType} · schema {activity.unknownSchema?.eventSchema}
          </p>
        </div>
      );
    case "unavailable":
      return (
        <div className="mt-2 rounded-lg border border-destructive/25 bg-destructive/[0.04] p-3">
          <p className="font-medium text-foreground">
            {activity.unavailable?.resourceKind} unavailable
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activity.unavailable?.reason} · retryable {String(activity.unavailable?.retryable)}
          </p>
        </div>
      );
  }
}

function ActivityMarkdown({
  className,
  markdown,
}: {
  readonly className?: string;
  readonly markdown: string | null;
}) {
  if (markdown === null) return null;
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-foreground dark:prose-invert",
        "prose-p:my-1 prose-pre:my-2 prose-ul:my-1.5 prose-ol:my-1.5",
        "[&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

/**
 * The record and excerpt registers: a bordered card that keeps the durable facts visible, because
 * governance and lifecycle items are read as records rather than as speech.
 */
export function RoomsActivityItem({
  activity,
  currentPrincipalId,
}: {
  readonly activity: RoomsProjectedActivity;
  readonly currentPrincipalId?: string | undefined;
}) {
  const copy = cardCopy[activity.cardKind];
  const Icon = copy.icon;
  const writer = activity.attribution.writer;
  const writerPresentation = principalPresentation(writer);
  return (
    <article
      aria-label={`${copy.label} written by ${writer.display_name}, source sequence ${activity.item.source_event.seq}`}
      className="flex gap-3 rounded-xl border border-border/75 bg-card/75 p-4 shadow-sm/5"
      data-rooms-activity-kind={activity.cardKind}
      data-rooms-attribution-mode={activity.attribution.mode}
      data-source-seq={activity.item.source_event.seq}
    >
      <PrincipalMark activity={activity} />
      <div className="min-w-0 flex-1">
        <header className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">{writer.display_name}</span>
          {writer.id === currentPrincipalId ? (
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700 uppercase dark:text-blue-300">
              You
            </span>
          ) : null}
          <span
            className={cn(
              "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase",
              principalClasses(writerPresentation.tone),
            )}
          >
            Rooms writer · {writerPresentation.label}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Icon aria-hidden className="size-3" /> {copy.label}
          </span>
          <time
            className="ml-auto text-[10px] text-muted-foreground"
            dateTime={activity.item.occurred_at}
          >
            {formatTime(activity.item.occurred_at)}
          </time>
        </header>
        <AttributionFacts activity={activity} />
        <ActivityDetails activity={activity} />
        <footer className="mt-3 flex flex-wrap gap-2 font-mono text-[9px] text-muted-foreground/75">
          <span>seq {activity.item.source_event.seq}</span>
          <span>{activity.item.source_event.type}</span>
          <span>schema {activity.item.source_event.schema}</span>
        </footer>
      </div>
    </article>
  );
}

/**
 * The conversation register: speaker-grouped, unbordered, and anchored on what was said. Provenance
 * remains one disclosure away.
 */
export function RoomsConversationActivity({
  activity,
  currentPrincipalId,
  showHeader,
}: {
  readonly activity: RoomsProjectedActivity;
  readonly currentPrincipalId?: string | undefined;
  readonly showHeader: boolean;
}) {
  const copy = cardCopy[activity.cardKind];
  const writer = activity.attribution.writer;
  const writerPresentation = principalPresentation(writer);
  const isReaction = activity.cardKind === "reaction";
  const agentTurnCopy = activity.agentTurn
    ? roomsAgentTurnCopy(activity.agentTurn, writer.display_name)
    : null;
  return (
    <article
      aria-label={`${copy.label} written by ${writer.display_name}, source sequence ${activity.item.source_event.seq}`}
      className={cn(
        "group/row relative flex gap-3 rounded-lg px-2 py-px hover:bg-muted/25",
        showHeader ? "mt-3 first:mt-0" : "",
      )}
      data-rooms-activity-kind={activity.cardKind}
      data-rooms-activity-register="conversation"
      data-rooms-attribution-mode={activity.attribution.mode}
      data-rooms-grouped={showHeader ? undefined : ""}
      data-source-seq={activity.item.source_event.seq}
    >
      {showHeader ? (
        <PrincipalMark activity={activity} />
      ) : (
        <time
          className="w-9 shrink-0 pt-1 pr-1 text-right text-[10px] leading-4 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100"
          dateTime={activity.item.occurred_at}
        >
          {formatTime(activity.item.occurred_at)}
        </time>
      )}
      <div className="min-w-0 flex-1">
        {showHeader ? (
          <header className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <span className="font-semibold text-foreground">{writer.display_name}</span>
            {writer.id === currentPrincipalId ? (
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-px text-[9px] font-semibold text-blue-700 uppercase dark:text-blue-300">
                You
              </span>
            ) : null}
            {writerPresentation.tone === "human" ? null : (
              <span
                className={cn(
                  "rounded-full border px-1.5 py-px text-[9px] font-semibold uppercase",
                  principalClasses(writerPresentation.tone),
                )}
              >
                {writerPresentation.label}
              </span>
            )}
            <time
              className="text-[11px] text-muted-foreground"
              dateTime={activity.item.occurred_at}
            >
              {formatTime(activity.item.occurred_at)}
            </time>
          </header>
        ) : null}
        {agentTurnCopy ? (
          activity.agentTurn?.status === "replied" ? (
            <ActivityMarkdown markdown={activity.bodyMarkdown} />
          ) : (
            <div className="py-1" data-rooms-agent-turn-status={activity.agentTurn?.status}>
              <p className="text-sm font-medium text-foreground">{agentTurnCopy.title}</p>
              {agentTurnCopy.detail ? (
                <p className="mt-1 text-sm text-muted-foreground">{agentTurnCopy.detail}</p>
              ) : null}
            </div>
          )
        ) : isReaction ? (
          <p className="text-sm text-foreground">
            <span className="mr-2 rounded-full border border-border bg-muted/45 px-2.5 py-1">
              {activity.emoji}
            </span>
            {activity.item.summary}
          </p>
        ) : (
          <ActivityMarkdown markdown={activity.bodyMarkdown ?? activity.item.summary} />
        )}
        <ActivityProvenance activity={activity} />
      </div>
    </article>
  );
}

export function RoomsActivityDaySeparator({ isoDate }: { readonly isoDate: string }) {
  return (
    <div className="my-4 flex items-center gap-3" data-rooms-activity-day="">
      <span className="h-px flex-1 bg-border" />
      <time
        className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
        dateTime={isoDate}
      >
        {formatRoomsActivityDay(isoDate)}
      </time>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function RoomsActivityRowView({
  currentPrincipalId,
  row,
}: {
  readonly currentPrincipalId?: string | undefined;
  readonly row: RoomsActivityRow;
}) {
  if (row.kind === "day") return <RoomsActivityDaySeparator isoDate={row.isoDate} />;
  if (row.register === "conversation") {
    return (
      <RoomsConversationActivity
        activity={row.activity}
        currentPrincipalId={currentPrincipalId}
        showHeader={row.showHeader}
      />
    );
  }
  return (
    <div className="my-3">
      <RoomsActivityItem activity={row.activity} currentPrincipalId={currentPrincipalId} />
    </div>
  );
}
