import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  CircleDashedIcon,
  FolderGit2Icon,
  FolderPlusIcon,
  MessageSquareTextIcon,
  PlusIcon,
  Settings2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { sidebarV2StatusPresentation } from "~/components/Sidebar.logic";
import { WorkingDuration } from "~/components/ThreadStatusIndicators";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/menu";
import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { cn } from "~/lib/utils";
import { useThreadShellsForProjectRefs } from "~/state/entities";
import { formatRelativeTimeLabel } from "~/timestampFormat";

import type { RoomsDataSourceMode, RoomsSourceRoom } from "../dataSource";
import type { RoomsWorkspaceNavigate } from "../shell/RoomsWorkspaceNavigation";
import type { RoomsWorkspaceSurface } from "../shell/navigation";
import { type PersistedRoomsProjectRef, useRoomProjectBindings } from "./roomProjectBindings";
import { selectRoomsNativeThreadEntries, type RoomsNativeThreadEntry } from "./roomsNativeThreads";

function projectRef(project: EnvironmentProject): PersistedRoomsProjectRef {
  return { environmentId: project.environmentId, projectId: project.id };
}

export function RoomsMenuGroup({
  children,
  label,
}: {
  readonly children: ReactNode;
  readonly label: string;
}) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  );
}

export function roomsProjectBindingMenuMode(input: {
  readonly availableProjectCount: number;
  readonly unresolvedBindingCount: number;
}): "create" | "manage" {
  return input.availableProjectCount === 0 && input.unresolvedBindingCount === 0
    ? "create"
    : "manage";
}

export function RoomsProjectBindingMenu({
  compact,
  roomId,
  sourceMode,
}: {
  readonly compact: boolean;
  readonly roomId: string;
  readonly sourceMode: RoomsDataSourceMode;
}) {
  const { availableProjects, bindProject, boundProjects, unresolvedBindings, unbindProject } =
    useRoomProjectBindings(roomId, sourceMode);
  const projects = useMemo(
    () =>
      [...boundProjects, ...availableProjects].toSorted((left, right) =>
        left.title.localeCompare(right.title),
      ),
    [availableProjects, boundProjects],
  );
  const boundKeys = new Set(
    boundProjects.map((project) => `${project.environmentId}:${project.id}`),
  );
  const triggerClassName = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
    compact ? "size-6" : "h-8 px-2.5 text-xs font-medium",
  );
  const openCreateProject = () => openCommandPalette({ open: "add-project" });

  if (
    roomsProjectBindingMenuMode({
      availableProjectCount: projects.length,
      unresolvedBindingCount: unresolvedBindings.length,
    }) === "create"
  ) {
    return (
      <button
        aria-label={compact ? "Create T3 project" : undefined}
        className={triggerClassName}
        onClick={openCreateProject}
        type="button"
      >
        <FolderPlusIcon className="size-3.5" />
        {compact ? null : "Create a T3 project"}
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={compact ? "Manage room T3 projects" : undefined}
        className={triggerClassName}
      >
        {compact ? <Settings2Icon className="size-3.5" /> : <FolderPlusIcon className="size-3.5" />}
        {compact ? null : projects.length === 0 ? "Manage T3 projects" : "Add a T3 project"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <RoomsMenuGroup label="Local room projects">
          {projects.map((project) => {
            const key = `${project.environmentId}:${project.id}`;
            return (
              <DropdownMenuCheckboxItem
                checked={boundKeys.has(key)}
                key={key}
                onCheckedChange={(checked) => {
                  if (checked) bindProject(project);
                  else unbindProject(projectRef(project));
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{project.title}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {project.workspaceRoot}
                  </span>
                </span>
              </DropdownMenuCheckboxItem>
            );
          })}
        </RoomsMenuGroup>
        {unresolvedBindings.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <RoomsMenuGroup label="Unavailable bindings">
              {unresolvedBindings.map((ref) => (
                <DropdownMenuItem
                  key={`${ref.environmentId}:${ref.projectId}`}
                  onClick={() => unbindProject(ref)}
                  variant="destructive"
                >
                  <TriangleAlertIcon />
                  <span className="min-w-0">
                    <span className="block truncate">Remove unavailable project</span>
                    <span className="block truncate text-[10px] opacity-75">
                      {ref.environmentId}:{ref.projectId}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
            </RoomsMenuGroup>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={openCreateProject}>
          <FolderPlusIcon />
          Create a new T3 project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NewThreadControl({
  boundProjects,
  compact,
  roomSlug,
}: {
  readonly boundProjects: readonly EnvironmentProject[];
  readonly compact: boolean;
  readonly roomSlug: string;
}) {
  const handleNewThread = useNewThreadHandler({ roomsRoomSlug: roomSlug });
  const startThread = (project: EnvironmentProject) => {
    void handleNewThread(scopeProjectRef(project.environmentId, project.id));
  };
  const className = cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
    compact ? "size-6" : "h-8 px-2.5 text-xs font-medium",
  );

  if (boundProjects.length === 0) return null;
  if (boundProjects.length === 1) {
    return (
      <button
        aria-label={compact ? "New T3 thread" : undefined}
        className={className}
        onClick={() => startThread(boundProjects[0]!)}
        type="button"
      >
        <PlusIcon className="size-3.5" />
        {compact ? null : "New T3 thread"}
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={compact ? "New T3 thread" : undefined} className={className}>
        <PlusIcon className="size-3.5" />
        {compact ? null : "New T3 thread"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <RoomsMenuGroup label="New thread in">
          {boundProjects.map((project) => (
            <DropdownMenuItem
              key={`${project.environmentId}:${project.id}`}
              onClick={() => startThread(project)}
            >
              <FolderGit2Icon />
              <span className="truncate">{project.title}</span>
            </DropdownMenuItem>
          ))}
        </RoomsMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The same status reading sidebar v2 shows, so "is this thread doing work right now" does not
 * depend on which sidebar you happen to be in.
 */
export function RoomsThreadStatus({ thread }: { readonly thread: RoomsNativeThreadEntry }) {
  const presentation = sidebarV2StatusPresentation(thread.status);
  if (!presentation) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-[10px] font-medium",
        presentation.className,
      )}
      data-rooms-thread-status={thread.status}
    >
      {presentation.icon === "working" ? (
        <CircleDashedIcon aria-hidden className="size-3 shrink-0" />
      ) : null}
      <span role="status">{presentation.label}</span>
      {thread.status === "working" ? (
        <span aria-hidden>
          <WorkingDuration startedAt={thread.workingStartedAt} />
        </span>
      ) : null}
    </span>
  );
}

export function RoomsNativeThreadNavItem({
  active,
  navigate,
  projectTitle,
  thread,
}: {
  readonly active: boolean;
  readonly navigate: RoomsWorkspaceNavigate;
  readonly projectTitle: string;
  readonly thread: RoomsNativeThreadEntry;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left text-sm text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground",
        active && "bg-sidebar-row-selected text-sidebar-foreground",
      )}
      data-rooms-native-thread-id={thread.threadId}
      onClick={() =>
        navigate({
          kind: "native-thread",
          environmentId: thread.environmentId,
          threadId: thread.threadId,
        })
      }
      title={`${thread.title} · ${projectTitle}`}
      type="button"
    >
      <MessageSquareTextIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{thread.title}</span>
      <RoomsThreadStatus thread={thread} />
    </button>
  );
}

export function RoomsYourThreadsNavigation({
  navigate,
  room,
  surface,
  sourceMode,
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly room: RoomsSourceRoom;
  readonly surface: RoomsWorkspaceSurface;
  readonly sourceMode: RoomsDataSourceMode;
}) {
  const { boundProjectRefs, boundProjects, unresolvedBindings } = useRoomProjectBindings(
    room.id,
    sourceMode,
  );
  const shells = useThreadShellsForProjectRefs(boundProjectRefs);
  const threads = useMemo(
    () => selectRoomsNativeThreadEntries(shells, boundProjects),
    [boundProjects, shells],
  );

  return (
    <section aria-label="Your Threads" className="min-w-0" data-rooms-native-threads="">
      <div className="mb-1 mt-5 flex items-center gap-1 px-2">
        <p className="min-w-0 flex-1 text-[10px] font-semibold tracking-[0.12em] text-sidebar-muted-foreground/65 uppercase">
          Your Threads
        </p>
        <NewThreadControl boundProjects={boundProjects} compact roomSlug={room.slug} />
        <RoomsProjectBindingMenu compact roomId={room.id} sourceMode={sourceMode} />
      </div>
      {surface.kind === "native-draft" ? (
        <div className="flex w-full min-w-0 items-center gap-2 rounded-md bg-sidebar-row-selected px-2 py-1.5 text-sm text-sidebar-foreground">
          <MessageSquareTextIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">New T3 thread</span>
        </div>
      ) : null}
      {threads.map((thread) => (
        <RoomsNativeThreadNavItem
          active={
            surface.kind === "native-thread" &&
            surface.environmentId === thread.environmentId &&
            surface.threadId === thread.threadId
          }
          key={`${thread.environmentId}:${thread.threadId}`}
          navigate={navigate}
          projectTitle={thread.projectTitle}
          thread={thread}
        />
      ))}
      {boundProjects.length === 0 ? (
        <div className="px-2 py-1.5">
          <p className="mb-2 text-xs leading-relaxed text-sidebar-muted-foreground">
            Bind this local-only room to a real T3 project.
          </p>
          <RoomsProjectBindingMenu compact={false} roomId={room.id} sourceMode={sourceMode} />
        </div>
      ) : threads.length === 0 && surface.kind !== "native-draft" ? (
        <p className="px-2 py-1.5 text-xs text-sidebar-muted-foreground">No T3 threads yet.</p>
      ) : null}
      {unresolvedBindings.length > 0 ? (
        <p className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <TriangleAlertIcon className="size-3 shrink-0" />
          {unresolvedBindings.length} project binding
          {unresolvedBindings.length === 1 ? "" : "s"} unavailable
        </p>
      ) : null}
    </section>
  );
}

export function RoomsThreadsSurface({
  navigate,
  room,
  sourceMode,
}: {
  readonly navigate: RoomsWorkspaceNavigate;
  readonly room: RoomsSourceRoom;
  readonly sourceMode: RoomsDataSourceMode;
}) {
  const { boundProjectRefs, boundProjects, unresolvedBindings } = useRoomProjectBindings(
    room.id,
    sourceMode,
  );
  const shells = useThreadShellsForProjectRefs(boundProjectRefs);
  const threads = useMemo(
    () => selectRoomsNativeThreadEntries(shells, boundProjects),
    [boundProjects, shells],
  );

  if (boundProjects.length === 0) {
    return (
      <section
        className="flex min-h-full items-center justify-center p-6"
        data-rooms-threads-unbound=""
      >
        <div className="max-w-md rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
          <FolderPlusIcon aria-hidden className="mx-auto size-6 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold text-foreground">Add a T3 project</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your Threads comes from real T3 project state. This association is local to this app
            instance and is not shared room data.
          </p>
          <div className="mt-4 flex justify-center">
            <RoomsProjectBindingMenu compact={false} roomId={room.id} sourceMode={sourceMode} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl p-5 sm:p-8" data-rooms-native-thread-index="">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            Your Threads
          </p>
          <h1 className="mt-1 text-xl font-semibold text-foreground">Native T3 threads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {boundProjects.map((project) => project.title).join(", ")}
          </p>
        </div>
        <NewThreadControl boundProjects={boundProjects} compact={false} roomSlug={room.slug} />
        <RoomsProjectBindingMenu compact roomId={room.id} sourceMode={sourceMode} />
      </div>
      {unresolvedBindings.length > 0 ? (
        <p className="mt-4 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <TriangleAlertIcon className="size-3.5 shrink-0" />
          An exact saved project reference is unavailable. Manage projects to remove it.
        </p>
      ) : null}
      <div className="mt-5 grid gap-3">
        {threads.map((thread) => (
          <button
            className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/40"
            key={`${thread.environmentId}:${thread.threadId}`}
            onClick={() =>
              navigate({
                kind: "native-thread",
                environmentId: thread.environmentId,
                threadId: thread.threadId,
              })
            }
            type="button"
          >
            <span className="flex items-center gap-2">
              <MessageSquareTextIcon aria-hidden className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {thread.title}
              </span>
              <RoomsThreadStatus thread={thread} />
              <span className="text-xs text-muted-foreground">
                {formatRelativeTimeLabel(thread.updatedAt)}
              </span>
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{thread.projectTitle}</span>
          </button>
        ))}
        {threads.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium text-foreground">No T3 threads in this room yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Start one through the native T3 draft and composer flow.
            </p>
            <div className="mt-3 flex justify-center">
              <NewThreadControl
                boundProjects={boundProjects}
                compact={false}
                roomSlug={room.slug}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
