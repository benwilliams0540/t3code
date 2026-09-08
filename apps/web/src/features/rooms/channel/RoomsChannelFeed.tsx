import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  HashIcon,
  InboxIcon,
  LockKeyholeIcon,
  RefreshCwIcon,
  ServerCrashIcon,
  WifiIcon,
} from "lucide-react";

import { RoomsActivityFeed } from "../activity/RoomsActivityFeed";
import type { RoomsStateExample } from "../model/workspace";
import type { RoomsWorkspaceSlotProps } from "../shell/slots";
import { roomsChannelDisplayName } from "./channelName";
import { projectRoomsChannel } from "./projection";

function ErrorState({
  state,
}: {
  readonly state: Extract<RoomsStateExample, { result: { status: "error" } }>;
}) {
  return (
    <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-6">
      <LockKeyholeIcon aria-hidden className="size-6 text-red-600 dark:text-red-400" />
      <h2 className="mt-4 text-lg font-semibold text-foreground">
        {state.kind.replaceAll("_", " ")}
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{state.result.message}</p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-red-500/25 px-2 py-1">
          HTTP {state.result.http_status}
        </span>
        <code className="rounded-full border border-red-500/25 px-2 py-1">{state.result.code}</code>
      </div>
    </div>
  );
}

function FixtureStateSurface({ state }: { readonly state: RoomsStateExample }) {
  switch (state.kind) {
    case "authorized_workspace":
      return (
        <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-6">
          <CheckCircle2Icon aria-hidden className="size-6 text-emerald-600 dark:text-emerald-400" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Authorized workspace</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {state.result.workspace_id} resolves exactly to {state.result.room_id}.
          </p>
        </div>
      );
    case "unauthenticated":
    case "unauthorized":
      return <ErrorState state={state} />;
    case "empty":
      return (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-7 text-center">
          <InboxIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">No activity in this page</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Zero items after seq {state.result.page_info.after_seq}; snapshot{" "}
            {state.result.page_info.snapshot_head_seq}; next {state.result.page_info.next_cursor};
            has more {String(state.result.page_info.has_more)}.
          </p>
        </div>
      );
    case "stale_cursor":
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-6">
          <RefreshCwIcon aria-hidden className="size-6 text-amber-600 dark:text-amber-400" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Feed cursor is stale</h2>
          <p className="mt-2 text-sm text-muted-foreground">{state.result.message}</p>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            retained from {state.result.retained_from_seq} · restart after{" "}
            {state.result.restart_after_seq}
          </p>
        </div>
      );
    case "reachable_but_stale":
      return (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-6">
          <WifiIcon aria-hidden className="size-6 text-amber-600 dark:text-amber-400" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">Reachable, mirror stale</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Machine reachable at {state.result.machine_checked_at}; mirror remains stale as of{" "}
            {state.result.mirror_as_of} at upstream sequence {state.result.upstream_sequence}.
          </p>
        </div>
      );
    case "unsupported_contract_version":
      return (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-6">
          <ServerCrashIcon aria-hidden className="size-6 text-red-600 dark:text-red-400" />
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            Unsupported contract version
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">{state.result.message}</p>
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            requested {state.result.requested_version} · supported{" "}
            {state.result.supported_versions.join(", ")}
          </p>
        </div>
      );
  }
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
        data-rooms-channel-state={projection.state.kind}
      >
        <div className="mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.1em] text-amber-700 uppercase dark:text-amber-300">
              Fixture state
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">workspace-read v2</span>
          </div>
          <h1 className="mt-2 text-xl font-semibold text-foreground"># {surface.channelSlug}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Closed typed result · no authorization or read-side effects
          </p>
        </div>
        <FixtureStateSurface state={projection.state} />
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
            <h1 className="text-xl font-semibold text-foreground">
              {roomsChannelDisplayName(projection.channel.name)}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{projection.channel.purpose}</p>
          </div>
          <span className="ml-auto rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">
            {projection.channel.unread.count} unread
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 font-mono text-[10px] text-muted-foreground">
          <span>after {projection.feed.page_info.after_seq ?? "start"}</span>
          <span>snapshot {projection.feed.page_info.snapshot_head_seq}</span>
          <span>next {projection.feed.page_info.next_cursor ?? "none"}</span>
          <span>{projection.feed.page_info.has_more ? "more available" : "snapshot complete"}</span>
        </div>
      </header>
      <RoomsActivityFeed
        activities={projection.items}
        label={`Ordered ${roomsChannelDisplayName(projection.channel.name)} activity`}
      />
    </main>
  );
}
