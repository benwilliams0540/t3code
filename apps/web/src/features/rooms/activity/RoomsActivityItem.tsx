import {
  BotIcon,
  CircleUserRoundIcon,
  ExternalLinkIcon,
  FileCheck2Icon,
  ListChecksIcon,
  MessageCircleIcon,
  MonitorIcon,
  ShieldCheckIcon,
  SmileIcon,
} from "lucide-react";

import { cn } from "~/lib/utils";

import { resolveRoomsInternalHref } from "../shell/internalHref";
import type { RoomsProjectedActivity } from "./projection";

const cardCopy = {
  message: { label: "Message", icon: MessageCircleIcon },
  reaction: { label: "Reaction", icon: SmileIcon },
  run: { label: "Agent run", icon: BotIcon },
  story: { label: "Story update", icon: ListChecksIcon },
  evidence: { label: "Evidence attached", icon: FileCheck2Icon },
  approval: { label: "Approval decision", icon: ShieldCheckIcon },
} as const;

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function principalClasses(tone: RoomsProjectedActivity["principalPresentation"]["tone"]): string {
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
  const tone = activity.principalPresentation.tone;
  const className = cn(
    "flex size-9 shrink-0 items-center justify-center border text-xs font-semibold",
    tone === "human" && "rounded-full",
    tone === "agent" && "rounded-xl",
    tone === "machine" && "rounded-md",
    tone === "unknown" && "rounded-lg",
    principalClasses(tone),
  );
  return (
    <span aria-hidden className={className}>
      {tone === "agent" ? (
        <BotIcon className="size-4" />
      ) : tone === "machine" ? (
        <MonitorIcon className="size-4" />
      ) : tone === "unknown" ? (
        <CircleUserRoundIcon className="size-4" />
      ) : (
        (activity.principal?.display_name.charAt(0).toUpperCase() ?? "?")
      )}
    </span>
  );
}

function ActivityDetails({ activity }: { readonly activity: RoomsProjectedActivity }) {
  switch (activity.cardKind) {
    case "message":
      return <p className="mt-2 text-sm leading-6 text-foreground">{activity.item.summary}</p>;
    case "reaction":
      return (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-foreground">
          <span className="rounded-full border border-border bg-muted/45 px-2.5 py-1">
            {activity.emoji ?? "Reaction"}
          </span>
          <span>{activity.item.summary}</span>
          {activity.targetItemId ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              target {activity.targetItemId}
            </span>
          ) : null}
        </div>
      );
    case "run":
      return (
        <div className="mt-2 rounded-lg border border-violet-500/20 bg-violet-500/[0.06] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">
              {activity.thread?.title ?? "Linked T3 thread"}
            </p>
            {activity.status ? (
              <span className="rounded-full border border-violet-500/25 px-2 py-0.5 text-[10px] font-semibold text-violet-700 uppercase dark:text-violet-300">
                {activity.status}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{activity.item.summary}</p>
          {activity.thread ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {activity.thread.provider} · {activity.thread.environment.name}
            </p>
          ) : null}
          {activity.threadHref ? (
            <a
              className="mt-3 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-violet-700 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring dark:text-violet-300"
              href={resolveRoomsInternalHref(activity.threadHref)}
            >
              Open detailed T3 thread
              <ExternalLinkIcon aria-hidden className="size-3" />
            </a>
          ) : null}
        </div>
      );
    case "story":
      return (
        <div className="mt-2 rounded-lg border border-sky-500/20 bg-sky-500/[0.06] p-3">
          <p className="font-medium text-foreground">
            {activity.story?.title ?? activity.item.summary}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {activity.stage ? (
              <span className="rounded-full border border-border px-2 py-0.5">
                {activity.stage.name}
              </span>
            ) : null}
            {activity.story?.labels.map((label) => (
              <span className="rounded-full bg-muted px-2 py-0.5" key={label}>
                {label}
              </span>
            ))}
          </div>
        </div>
      );
    case "evidence":
      return (
        <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
          <p className="font-medium text-foreground">{activity.item.summary}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {activity.evidenceKind ? (
              <span className="rounded-full border border-emerald-500/25 px-2 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">
                {activity.evidenceKind}
              </span>
            ) : null}
            {activity.story ? <span>{activity.story.title}</span> : null}
            {activity.evidenceHash ? (
              <span className="font-mono" title={activity.evidenceHash}>
                sha256:{activity.evidenceHash.slice(0, 10)}…
              </span>
            ) : null}
          </div>
        </div>
      );
    case "approval":
      return (
        <div className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 uppercase dark:text-amber-300">
              {activity.decision?.replaceAll("_", " ") ?? "decision recorded"}
            </span>
            {activity.decisionScope ? (
              <span className="text-xs text-muted-foreground">
                scope · {activity.decisionScope}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-foreground">{activity.item.summary}</p>
          {activity.story ? (
            <p className="mt-1 text-xs text-muted-foreground">{activity.story.title}</p>
          ) : null}
        </div>
      );
  }
}

export function RoomsActivityItem({ activity }: { readonly activity: RoomsProjectedActivity }) {
  const copy = cardCopy[activity.cardKind];
  const Icon = copy.icon;
  const principalName = activity.principal?.display_name ?? activity.item.actor_id;

  return (
    <article
      aria-label={`${copy.label} from ${principalName}, source sequence ${activity.item.source_event.seq}`}
      className="flex gap-3 rounded-xl border border-border/75 bg-card/75 p-4 shadow-sm/5"
      data-rooms-activity-kind={activity.cardKind}
      data-rooms-principal-type={activity.principalPresentation.tone}
      data-source-seq={activity.item.source_event.seq}
    >
      <PrincipalMark activity={activity} />
      <div className="min-w-0 flex-1">
        <header className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-foreground">{principalName}</span>
          <span
            className={cn(
              "rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] uppercase",
              principalClasses(activity.principalPresentation.tone),
            )}
          >
            {activity.principalPresentation.label}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <Icon aria-hidden className="size-3" />
            {copy.label}
          </span>
          <time
            className="ml-auto text-[10px] text-muted-foreground tabular-nums"
            dateTime={activity.item.occurred_at}
          >
            {formatTime(activity.item.occurred_at)}
          </time>
        </header>
        <ActivityDetails activity={activity} />
        <footer className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] text-muted-foreground/75">
          <span>seq {activity.item.source_event.seq}</span>
          <span aria-hidden>·</span>
          <span>{activity.item.source_event.type}</span>
          <span aria-hidden>·</span>
          <span>schema {activity.item.source_event.schema}</span>
        </footer>
      </div>
    </article>
  );
}
