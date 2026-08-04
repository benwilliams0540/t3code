import type { RoomsDataSourceMode } from "../dataSource";

export const ROOMS_SIDEBAR_OPEN_STORAGE_KEY = "t3code:rooms-workspace-sidebar-open:v1";
export const ROOMS_LAST_ROUTE_STORAGE_KEY = "t3code:rooms-last-route:v1";

export type RoomsWorkspaceSurface =
  | { readonly kind: "dashboard" }
  | { readonly kind: "channel"; readonly channelSlug: string }
  | { readonly kind: "threads" }
  | {
      readonly kind: "native-thread";
      readonly environmentId: string;
      readonly threadId: string;
    }
  | { readonly kind: "native-draft"; readonly draftId: string }
  | {
      readonly kind: "project";
      readonly projectSection: string;
      readonly projectView?: string;
    }
  | { readonly kind: "present" };

export type RoomsNavigationTarget =
  | { readonly kind: "dashboard" }
  | { readonly kind: "channel"; readonly channelSlug: string }
  | { readonly kind: "threads" }
  | {
      readonly kind: "native-thread";
      readonly environmentId: string;
      readonly threadId: string;
    }
  | { readonly kind: "project"; readonly projectSection: string }
  | {
      readonly kind: "project-view";
      readonly projectSection: string;
      readonly projectView: string;
    }
  | { readonly kind: "present" };

export interface RoomsBreadcrumb {
  readonly label: string;
  readonly target?: RoomsNavigationTarget;
}

export function isRoomsWorkspaceEnabled(sidebarVariant: "v1" | "v2" | "v3"): boolean {
  return sidebarVariant === "v3";
}

export function shouldUseRoomsWorkspaceLanding(sidebarVariant: "v1" | "v2" | "v3"): boolean {
  return isRoomsWorkspaceEnabled(sidebarVariant);
}

export function channelSlugFromName(channelName: string): string {
  return channelName.replace(/^#\s*/, "");
}

export function projectSectionSlug(key: string): string {
  return key.replaceAll("_", "-");
}

export function projectSectionLabel(projectSection: string): string {
  if (projectSection === "audit-decisions") return "Audit & Decisions";
  return projectSection.charAt(0).toUpperCase() + projectSection.slice(1).replaceAll("-", " ");
}

export function roomsSurfaceSourceLabel(
  surface: RoomsWorkspaceSurface,
  sourceMode: RoomsDataSourceMode,
): string {
  if (sourceMode === "local") return "Local T3 only";
  if (sourceMode === "shared") return "Shared Rooms";
  return surface.kind === "native-thread" || surface.kind === "native-draft"
    ? "Local T3 thread"
    : surface.kind === "threads"
      ? "Local T3 projects"
      : "Fixture · workspace-read v2";
}

export function buildRoomsBreadcrumbs(
  room: { readonly name: string },
  surface: RoomsWorkspaceSurface,
): readonly RoomsBreadcrumb[] {
  const roomCrumb = { label: room.name, target: { kind: "dashboard" } as const };
  switch (surface.kind) {
    case "dashboard":
      return [roomCrumb, { label: "Dashboard" }];
    case "channel":
      return [roomCrumb, { label: "Channels" }, { label: `# ${surface.channelSlug}` }];
    case "threads":
      return [roomCrumb, { label: "Your Threads" }];
    case "native-thread":
      return [
        roomCrumb,
        { label: "Your Threads", target: { kind: "threads" } },
        { label: "T3 Thread" },
      ];
    case "native-draft":
      return [
        roomCrumb,
        { label: "Your Threads", target: { kind: "threads" } },
        { label: "New T3 Thread" },
      ];
    case "project": {
      const sectionLabel = projectSectionLabel(surface.projectSection);
      return [
        roomCrumb,
        { label: "Project" },
        ...(surface.projectView
          ? [
              {
                label: sectionLabel,
                target: {
                  kind: "project",
                  projectSection: surface.projectSection,
                } as const,
              },
              { label: projectSectionLabel(surface.projectView) },
            ]
          : [{ label: sectionLabel }]),
      ];
    }
    case "present":
      return [roomCrumb, { label: "Present" }];
  }
}

export function roomsRoutePath(roomSlug: string, surface: RoomsWorkspaceSurface): string {
  const roomBase = `/rooms/${encodeURIComponent(roomSlug)}`;
  switch (surface.kind) {
    case "dashboard":
      return `${roomBase}/dashboard`;
    case "channel":
      return `${roomBase}/channels/${encodeURIComponent(surface.channelSlug)}`;
    case "threads":
      return `${roomBase}/threads`;
    case "native-thread":
      return `${roomBase}/threads/${encodeURIComponent(surface.environmentId)}/${encodeURIComponent(surface.threadId)}`;
    case "native-draft":
      return `${roomBase}/draft/${encodeURIComponent(surface.draftId)}`;
    case "project": {
      const base = `${roomBase}/project/${encodeURIComponent(surface.projectSection)}`;
      return surface.projectView ? `${base}/${encodeURIComponent(surface.projectView)}` : base;
    }
    case "present":
      return `${roomBase}/present`;
  }
}
