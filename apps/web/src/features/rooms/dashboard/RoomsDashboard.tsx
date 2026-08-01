import type { ReactNode } from "react";
import {
  ArrowUpRightIcon,
  BotIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  Clock3Icon,
  FileCheck2Icon,
  HistoryIcon,
  LayoutDashboardIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from "lucide-react";

import type { RoomsStage, RoomsStateExample } from "../model/workspace";
import { resolveRoomsInternalHref } from "../shell/internalHref";
import type { RoomsWorkspaceSlotProps } from "../shell/slots";
import {
  buildRoomsDashboardProjection,
  dashboardFallbackFromState,
  type RoomsDashboardActivityItem,
  type RoomsDashboardAttentionItem,
  type RoomsDashboardProjection,
  type RoomsDashboardStageGroup,
  type RoomsDashboardStory,
} from "./projection";

export interface RoomsDashboardProps extends RoomsWorkspaceSlotProps {
  readonly state?: RoomsStateExample | null;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const gateStateLabels = {
  not_applicable: "No active gate",
  waiting_for_evidence: "Waiting for evidence",
  waiting_for_review: "Waiting for review",
  passed: "Gate passed",
} as const;

function shortHash(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function Chip({
  children,
  tone = "neutral",
}: {
  readonly children: ReactNode;
  readonly tone?: "attention" | "good" | "neutral" | "run";
}) {
  const toneClass =
    tone === "attention"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : tone === "good"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
        : tone === "run"
          ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
          : "border-border bg-muted/40 text-muted-foreground";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${toneClass}`}>
      {children}
    </span>
  );
}

function DashboardState({
  code,
  message,
  name,
  status,
}: {
  readonly code: string | null;
  readonly message: string;
  readonly name: string;
  readonly status: "empty" | "error";
}) {
  const Icon = status === "error" ? CircleAlertIcon : LayoutDashboardIcon;
  return (
    <div
      className="flex min-h-[24rem] items-center justify-center p-6"
      data-rooms-dashboard-state={status}
    >
      <div className="max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <Icon
          aria-hidden
          className={
            status === "error"
              ? "mx-auto size-7 text-destructive"
              : "mx-auto size-7 text-muted-foreground"
          }
        />
        <p className="mt-4 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {humanize(name)}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          {status === "error" ? "Workspace unavailable" : "Nothing to show yet"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
        {code ? <code className="mt-4 block text-xs text-muted-foreground">{code}</code> : null}
      </div>
    </div>
  );
}

function VisionCard({ projection }: { readonly projection: RoomsDashboardProjection }) {
  const { document, headline, revision, route, summary } = projection.vision;
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <FileCheck2Icon aria-hidden className="size-4 text-muted-foreground" />
            <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              Shared vision · {document.title}
            </p>
            <Chip tone={document.freshness.state === "current" ? "good" : "attention"}>
              {document.freshness.state}
            </Chip>
          </div>
          <h2 className="mt-2 text-lg font-semibold text-foreground">{headline}</h2>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">{summary}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip>{revision.state} revision</Chip>
            <Chip>{dateTimeFormatter.format(new Date(revision.created_at))}</Chip>
            <Chip>source {shortHash(revision.source_revision)}</Chip>
            <Chip tone={document.atlas.state === "current" ? "good" : "attention"}>
              atlas {document.atlas.state}
            </Chip>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="inline-flex items-center gap-2 rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background"
            href={resolveRoomsInternalHref(route)}
          >
            Open vision
            <ArrowUpRightIcon aria-hidden className="size-3.5" />
          </a>
          <a
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground"
            href={resolveRoomsInternalHref(document.atlas.route)}
          >
            Atlas
          </a>
        </div>
      </div>
    </section>
  );
}

function GateMetadata({ stage }: { readonly stage: RoomsStage }) {
  if (!stage.gate) return null;
  return (
    <div className="mt-3 border-t border-border/70 pt-3 text-[11px] leading-relaxed text-muted-foreground">
      <p>
        Review: {stage.gate.reviewer.allowed_principal_types.join(", ")} · minimum{" "}
        {stage.gate.reviewer.minimum_reviewers} · self review{" "}
        {stage.gate.reviewer.forbid_self_review ? "forbidden" : "allowed"}
      </p>
      <p>
        Gate requires {stage.gate.evidence.mode}:{" "}
        {stage.gate.evidence.kinds.map(humanize).join(", ")}
      </p>
    </div>
  );
}

function StoryCard({
  dashboardStory,
  stage,
}: {
  readonly dashboardStory: RoomsDashboardStory;
  readonly stage: RoomsStage;
}) {
  const { delegate, owner, story } = dashboardStory;
  return (
    <article
      className="rounded-xl border border-border bg-card p-4 shadow-sm"
      data-story-id={story.id}
    >
      <div className="flex flex-wrap gap-1.5">
        {story.labels.map((label) => (
          <Chip key={label}>{label}</Chip>
        ))}
        <Chip
          tone={
            story.gate_state === "passed"
              ? "good"
              : story.gate_state === "not_applicable"
                ? "neutral"
                : "attention"
          }
        >
          {gateStateLabels[story.gate_state]}
        </Chip>
      </div>
      <h3 className="mt-3 text-sm font-semibold leading-snug text-foreground">{story.title}</h3>
      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
        <p className="flex items-center gap-2">
          <UserRoundIcon aria-hidden className="size-3.5" />
          Owner: {owner.display_name}
        </p>
        {delegate ? (
          <p className="flex items-center gap-2">
            <BotIcon aria-hidden className="size-3.5" />
            {delegate.agent.display_name} · {delegate.thread.provider} ·{" "}
            {story.delegate?.run_status}
          </p>
        ) : (
          <p className="flex items-center gap-2">
            <BotIcon aria-hidden className="size-3.5" />
            No delegated run
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {stage.gate?.evidence.kinds.map((kind) => (
          <Chip key={kind}>requires {humanize(kind)}</Chip>
        ))}
        <Chip tone={story.evidence_ids.length > 0 ? "good" : "attention"}>
          {story.evidence_ids.length} attached
        </Chip>
        {delegate ? <Chip tone="run">run {story.delegate?.run_status}</Chip> : null}
      </div>
      <GateMetadata stage={stage} />
    </article>
  );
}

function StageGroup({ group }: { readonly group: RoomsDashboardStageGroup }) {
  return (
    <section data-stage-id={group.stage.id}>
      <div className="mb-3 flex items-center gap-2">
        {group.stage.gate ? (
          <ShieldCheckIcon aria-hidden className="size-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <CircleCheckIcon aria-hidden className="size-4 text-muted-foreground" />
        )}
        <h2 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          {group.stage.name}
        </h2>
        <span className="text-xs text-muted-foreground">{group.stories.length}</span>
      </div>
      <div className="grid gap-3">
        {group.stories.length > 0 ? (
          group.stories.map((story) => (
            <StoryCard dashboardStory={story} key={story.story.id} stage={group.stage} />
          ))
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            No stories in this fixture stage.
          </p>
        )}
      </div>
    </section>
  );
}

function AttentionItem({ item }: { readonly item: RoomsDashboardAttentionItem }) {
  return (
    <article className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{item.context}</p>
        </div>
        <Chip tone="attention">priority {item.fact.priority}</Chip>
      </div>
    </article>
  );
}

function NeedsAttention({ projection }: { readonly projection: RoomsDashboardProjection }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <CircleAlertIcon aria-hidden className="size-4 text-amber-600 dark:text-amber-400" />
        <h2 className="text-sm font-semibold text-foreground">Needs attention</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {projection.needsAttention.length}
        </span>
      </div>
      <div className="grid gap-2.5">
        {projection.needsAttention.length > 0 ? (
          projection.needsAttention.map((item) => <AttentionItem item={item} key={item.fact.id} />)
        ) : (
          <p className="text-sm text-muted-foreground">No fixture stories need attention.</p>
        )}
      </div>
    </section>
  );
}

function ActivityItem({ activity }: { readonly activity: RoomsDashboardActivityItem }) {
  const projected = activity.activity;
  return (
    <li className="flex gap-3 border-b border-border/70 py-3 last:border-b-0">
      <HistoryIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">{projected.item.summary}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          rank {activity.fact.rank} · {humanize(activity.fact.reason)} · writer{" "}
          {projected.attribution.writer.display_name} · seq {projected.item.source_event.seq} ·{" "}
          {dateTimeFormatter.format(new Date(projected.item.occurred_at))}
        </p>
      </div>
    </li>
  );
}

function RecentActivity({ projection }: { readonly projection: RoomsDashboardProjection }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Clock3Icon aria-hidden className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
      </div>
      {projection.recentActivity.length > 0 ? (
        <ol>
          {projection.recentActivity.map((activity) => (
            <ActivityItem activity={activity} key={activity.fact.id} />
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No fixture activity was returned.</p>
      )}
    </section>
  );
}

function DashboardHeader({ projection }: { readonly projection: RoomsDashboardProjection }) {
  return (
    <header
      className="flex flex-wrap items-end gap-3"
      data-rooms-dashboard-header={projection.sourceProjection.kind}
    >
      <div>
        <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
          {projection.room.name} workspace
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fixture projection · {humanize(projection.sourceProjection.kind)}
        </p>
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        <Chip>{humanize(projection.room.locality)}</Chip>
        <Chip tone="good">{projection.room.membership.role}</Chip>
      </div>
    </header>
  );
}

function NarrowDashboard({ projection }: { readonly projection: RoomsDashboardProjection }) {
  return (
    <div className="grid gap-5 min-[900px]:hidden" data-rooms-dashboard-layout="narrow-vertical">
      <NeedsAttention projection={projection} />
      <VisionCard projection={projection} />
      <div className="grid gap-6" data-rooms-dashboard-board="vertical-stages">
        {projection.stages.map((group) => (
          <StageGroup group={group} key={group.stage.id} />
        ))}
      </div>
      <RecentActivity projection={projection} />
    </div>
  );
}

function DesktopDashboard({ projection }: { readonly projection: RoomsDashboardProjection }) {
  return (
    <div
      className="hidden min-[900px]:grid min-[900px]:gap-5"
      data-rooms-dashboard-layout="desktop-columns"
    >
      <VisionCard projection={projection} />
      <div className="grid grid-cols-4 items-start gap-3" data-rooms-dashboard-board="columns">
        {projection.stages.map((group) => (
          <StageGroup group={group} key={group.stage.id} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <NeedsAttention projection={projection} />
        <RecentActivity projection={projection} />
      </div>
    </div>
  );
}

export function RoomsDashboard({ fixture, room, state, workspace }: RoomsDashboardProps) {
  const fallback = dashboardFallbackFromState(state);
  if (fallback) return <DashboardState {...fallback} />;

  const desktop = buildRoomsDashboardProjection(fixture, room, workspace, "desktop");
  const narrow = buildRoomsDashboardProjection(fixture, room, workspace, "narrow");
  if (desktop.status === "error") {
    return (
      <DashboardState
        code="invalid_workspace_projection"
        message={desktop.message}
        name="fixture"
        status="error"
      />
    );
  }
  if (narrow.status === "error") {
    return (
      <DashboardState
        code="invalid_workspace_projection"
        message={narrow.message}
        name="fixture"
        status="error"
      />
    );
  }

  return (
    <section className="mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8" data-rooms-dashboard="">
      <div className="min-[900px]:hidden">
        <DashboardHeader projection={narrow} />
      </div>
      <div className="hidden min-[900px]:block">
        <DashboardHeader projection={desktop} />
      </div>
      <div className="mt-6">
        <NarrowDashboard projection={narrow} />
        <DesktopDashboard projection={desktop} />
      </div>
    </section>
  );
}
