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

import { cn } from "~/lib/utils";

import { resolveRoomsInternalHref } from "../shell/internalHref";
import { principalPresentation, type RoomsProjectedActivity } from "./projection";

const cardCopy = {
  message: { label: "Message", icon: MessageCircleIcon },
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

function ActivityDetails({ activity }: { readonly activity: RoomsProjectedActivity }) {
  switch (activity.cardKind) {
    case "message":
      return <p className="mt-2 text-sm leading-6 text-foreground">{activity.bodyMarkdown}</p>;
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

export function RoomsActivityItem({ activity }: { readonly activity: RoomsProjectedActivity }) {
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
