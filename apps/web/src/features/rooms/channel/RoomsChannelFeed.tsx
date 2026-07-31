import {
  AlertTriangleIcon,
  HashIcon,
  InboxIcon,
  LockKeyholeIcon,
  RefreshCwIcon,
} from "lucide-react";

import type { RoomsWorkspaceSlotProps } from "../shell/slots";
import { RoomsActivityItem } from "../activity/RoomsActivityItem";
import { projectRoomsChannel } from "./projection";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function recordString(record: Readonly<Record<string, unknown>>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function recordNumber(record: Readonly<Record<string, unknown>>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" ? value : null;
}

function recordBoolean(record: Readonly<Record<string, unknown>>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function FixtureStateSurface({
  result,
  stateName,
}: {
  readonly result: Readonly<Record<string, unknown>>;
  readonly stateName: string;
}) {
  const message = recordString(result, "message");
  const code = recordString(result, "code");
  const httpStatus = recordNumber(result, "http_status");
  if (stateName === "unauthorized") {
    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-6">
        <LockKeyholeIcon aria-hidden className="size-6 text-red-600 dark:text-red-400" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">Room membership required</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        <dl className="mt-4 flex flex-wrap gap-2 text-xs">
          <div className="rounded-full border border-red-500/25 px-2 py-1">
            <dt className="sr-only">HTTP status</dt>
            <dd>{httpStatus}</dd>
          </div>
          <div className="rounded-full border border-red-500/25 px-2 py-1 font-mono">
            <dt className="sr-only">Error code</dt>
            <dd>{code}</dd>
          </div>
        </dl>
      </div>
    );
  }

  if (stateName === "stale_cursor") {
    const retainedFrom = recordNumber(result, "retained_from_seq");
    const restartAfter = recordNumber(result, "restart_after_seq");
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-6">
        <RefreshCwIcon aria-hidden className="size-6 text-amber-600 dark:text-amber-400" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">Feed cursor is stale</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
        <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/55 p-3">
            <dt className="text-muted-foreground">HTTP status</dt>
            <dd className="mt-1 font-mono text-foreground">{httpStatus}</dd>
          </div>
          <div className="rounded-lg border border-border bg-background/55 p-3">
            <dt className="text-muted-foreground">Retained from</dt>
            <dd className="mt-1 font-mono text-foreground">seq {retainedFrom}</dd>
          </div>
          <div className="rounded-lg border border-border bg-background/55 p-3">
            <dt className="text-muted-foreground">Restart after</dt>
            <dd className="mt-1 font-mono text-foreground">seq {restartAfter}</dd>
          </div>
        </dl>
      </div>
    );
  }

  const page = isRecord(result.page_info) ? result.page_info : {};
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-7 text-center">
      <InboxIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-semibold text-foreground">No activity in this page</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The exact fixture response contains zero items after seq {recordNumber(page, "after_seq")}.
      </p>
      <p className="mt-3 font-mono text-[10px] text-muted-foreground">
        snapshot {recordNumber(page, "snapshot_head_seq")} · next{" "}
        {recordNumber(page, "next_cursor")} · has more {String(recordBoolean(page, "has_more"))}
      </p>
    </div>
  );
}

export function RoomsChannelFeed({ fixture, room, surface, workspace }: RoomsWorkspaceSlotProps) {
  if (surface.kind !== "channel") {
    return (
      <section className="flex min-h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">This export only renders channel surfaces.</p>
      </section>
    );
  }

  const projection = projectRoomsChannel(fixture, workspace, surface.channelSlug);
  if (projection.kind === "fixture_state") {
    return (
      <main
        className="mx-auto w-full max-w-4xl p-5 sm:p-8"
        data-rooms-channel-state={projection.state.name}
      >
        <div className="mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-amber-700 uppercase dark:text-amber-300">
              Fixture state
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">workspace-read v1</span>
          </div>
          <h1 className="mt-2 text-xl font-semibold text-foreground"># {surface.channelSlug}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Direct local validation state · not an authorization bypass
          </p>
        </div>
        <FixtureStateSurface result={projection.state.result} stateName={projection.state.name} />
      </main>
    );
  }

  if (projection.kind === "missing") {
    return (
      <main
        className="flex min-h-full items-center justify-center p-6"
        data-rooms-channel-state="missing"
      >
        <div className="max-w-lg rounded-2xl border border-border bg-card p-7 text-center">
          <AlertTriangleIcon
            aria-hidden
            className="mx-auto size-6 text-amber-600 dark:text-amber-400"
          />
          <h1 className="mt-4 text-lg font-semibold text-foreground">Channel not in fixture</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            # {projection.slug} is not declared for {room.name}. Available channels:{" "}
            {projection.availableChannelNames.join(", ")}.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl p-5 sm:p-8" data-rooms-channel-state="feed">
      <header className="mb-5 border-b border-border pb-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/45">
            <HashIcon aria-hidden className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-foreground">{projection.channel.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{projection.channel.purpose}</p>
          </div>
          <span className="ml-auto rounded-full border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {projection.channel.unread.count} unread
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
          <span>after {projection.feed.page_info.after_seq ?? "start"}</span>
          <span>snapshot {projection.feed.page_info.snapshot_head_seq}</span>
          <span>next {projection.feed.page_info.next_cursor ?? "none"}</span>
          <span>{projection.feed.page_info.has_more ? "more available" : "snapshot complete"}</span>
        </div>
      </header>
      <ol aria-label={`Ordered ${projection.channel.name} activity`} className="grid gap-3">
        {projection.items.map((activity) => (
          <li key={activity.item.id}>
            <RoomsActivityItem activity={activity} />
          </li>
        ))}
      </ol>
    </main>
  );
}
