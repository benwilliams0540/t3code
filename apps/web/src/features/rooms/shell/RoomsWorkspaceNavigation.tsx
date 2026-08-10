import {
  FileTextIcon,
  HashIcon,
  LayoutDashboardIcon,
  PlusIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { SidebarChromeFooter } from "~/components/sidebar/SidebarChrome";

import type { RoomsDataSourceMode, RoomsSourceRoom } from "../dataSource";
import type { RoomsInteractiveWorkspace } from "../dataSource/humanSharedContract";
import { RoomsAddChannelDialog } from "../channel/RoomsAddChannelDialog";
import {
  channelSlugFromName,
  projectSectionSlug,
  type RoomsNavigationTarget,
  type RoomsWorkspaceSurface,
} from "./navigation";
import type { RoomsWorkspace } from "../model/workspace";
import { RoomsYourThreadsNavigation } from "../threads/RoomsThreadNavigation";

export type RoomsWorkspaceNavigate = (target: RoomsNavigationTarget) => void;

const LOCAL_PROJECT_NAVIGATION = [
  { key: "vision", label: "Vision" },
  { key: "stories", label: "Stories" },
  { key: "evidence", label: "Evidence" },
  { key: "audit_decisions", label: "Audit & Decisions" },
] as const;

export function roomsProjectNavigationItems(
  sourceMode: RoomsDataSourceMode,
  workspace: RoomsWorkspace | null,
): readonly { readonly key: string; readonly label: string }[] {
  if (sourceMode !== "sample") return LOCAL_PROJECT_NAVIGATION;
  return (
    workspace?.navigation.filter((item) =>
      ["vision", "stories", "evidence", "audit_decisions"].includes(item.key),
    ) ?? []
  );
}

function WorkspaceNavItem({
  active,
  badge,
  icon: Icon,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly badge?: number | undefined;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        active && "bg-sidebar-row-selected text-sidebar-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      {badge !== undefined && badge > 0 ? (
        <span className="ml-auto rounded-full bg-sidebar-muted-foreground/15 px-1.5 text-[10px] font-semibold text-sidebar-muted-foreground">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function RoomsWorkspaceNavigation({
  localLiveUpdatesReconnecting,
  navigate,
  localWorkspace,
  room,
  sourceMode,
  surface,
  workspace,
}: {
  readonly localLiveUpdatesReconnecting: boolean;
  readonly navigate: RoomsWorkspaceNavigate;
  readonly localWorkspace: RoomsInteractiveWorkspace | null;
  readonly room: RoomsSourceRoom;
  readonly sourceMode: RoomsDataSourceMode;
  readonly surface: RoomsWorkspaceSurface;
  readonly workspace: RoomsWorkspace | null;
}) {
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  return (
    <nav
      aria-label={room.name + " workspace"}
      className="flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden"
    >
      <div className="border-b border-sidebar-border px-3 py-3">
        <p className="truncate text-sm font-semibold text-sidebar-foreground">{room.name}</p>
        <p className="mt-0.5 text-[11px] text-sidebar-muted-foreground">
          {sourceMode === "local"
            ? "Local T3 only"
            : sourceMode === "shared"
              ? `T3 Connect · ${room.membershipRole}`
              : `${room.locality === "local_only" ? "Local-only room" : "Shared room"} · ${room.membershipRole}`}
        </p>
        {sourceMode === "local" && localLiveUpdatesReconnecting ? (
          <p
            className="mt-1 text-[11px] text-amber-700 dark:text-amber-300"
            data-rooms-local-live-state="reconnecting"
          >
            Live updates reconnecting
          </p>
        ) : null}
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-2 py-3">
        <WorkspaceNavItem
          active={surface.kind === "dashboard"}
          badge={room.unreadCount ?? undefined}
          icon={LayoutDashboardIcon}
          label="Dashboard"
          onClick={() => navigate({ kind: "dashboard" })}
        />

        <div className="mb-1 mt-5 flex items-center px-2">
          <p className="text-[10px] font-semibold tracking-[0.12em] text-sidebar-muted-foreground/65 uppercase">
            Channels
          </p>
          {sourceMode !== "sample" ? (
            <button
              aria-label="Add channel"
              className="ml-auto rounded p-0.5 text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!localWorkspace?.capabilities["channel.create"]}
              onClick={() => setAddChannelOpen(true)}
              title="Add channel"
              type="button"
            >
              <PlusIcon aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </div>
        {sourceMode !== "sample" ? (
          localWorkspace?.channels.length ? (
            localWorkspace.channels.map((channel) => (
              <WorkspaceNavItem
                active={surface.kind === "channel" && surface.channelSlug === channel.slug}
                icon={HashIcon}
                key={channel.id}
                label={channel.slug}
                onClick={() => navigate({ kind: "channel", channelSlug: channel.slug })}
              />
            ))
          ) : (
            <p className="px-2 py-1.5 text-xs leading-relaxed text-sidebar-muted-foreground">
              No channels yet. Add one to begin.
            </p>
          )
        ) : workspace ? (
          workspace.channels.map((channel) => {
            const channelSlug = channelSlugFromName(channel.name);
            return (
              <WorkspaceNavItem
                active={surface.kind === "channel" && surface.channelSlug === channelSlug}
                badge={channel.unread.count}
                icon={HashIcon}
                key={channel.id}
                label={channelSlug}
                onClick={() => navigate({ kind: "channel", channelSlug })}
              />
            );
          })
        ) : (
          <p className="px-2 py-1.5 text-xs text-sidebar-muted-foreground">No channel fixture.</p>
        )}

        <RoomsYourThreadsNavigation
          navigate={navigate}
          room={room}
          sourceMode={sourceMode}
          surface={surface}
        />

        <p className="mb-1 mt-5 px-2 text-[10px] font-semibold tracking-[0.12em] text-sidebar-muted-foreground/65 uppercase">
          Project
        </p>
        {roomsProjectNavigationItems(sourceMode, workspace).map((item) => {
          const projectSection = projectSectionSlug(item.key);
          return (
            <WorkspaceNavItem
              active={surface.kind === "project" && surface.projectSection === projectSection}
              icon={FileTextIcon}
              key={item.key}
              label={item.label}
              onClick={() => navigate({ kind: "project", projectSection })}
            />
          );
        })}
        {sourceMode === "sample" && !workspace ? (
          <p className="px-2 py-1.5 text-xs text-sidebar-muted-foreground">No project fixture.</p>
        ) : null}

        <p className="mb-1 mt-5 px-2 text-[10px] font-semibold tracking-[0.12em] text-sidebar-muted-foreground/65 uppercase">
          Present
        </p>
        <WorkspaceNavItem
          active={surface.kind === "present"}
          badge={
            sourceMode === "sample" && workspace
              ? workspace.presence.human_ids.length +
                workspace.presence.agent_ids.length +
                workspace.presence.machine_ids.length
              : undefined
          }
          icon={UsersIcon}
          label="People and machines"
          onClick={() => navigate({ kind: "present" })}
        />
      </div>
      <SidebarChromeFooter />
      {sourceMode !== "sample" ? (
        <RoomsAddChannelDialog
          onCreated={(channel) => navigate({ kind: "channel", channelSlug: channel.slug })}
          onOpenChange={setAddChannelOpen}
          open={addChannelOpen}
        />
      ) : null}
    </nav>
  );
}
