import type { RoomsRoom } from "../model/workspace";

export const ROOMS_SIDEBAR_OPEN_STORAGE_KEY = "t3code:rooms-workspace-sidebar-open:v1";

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

export function roomsSurfaceSourceLabel(surface: RoomsWorkspaceSurface): string {
  return surface.kind === "native-thread" || surface.kind === "native-draft"
    ? "Local T3 thread"
    : surface.kind === "threads"
      ? "Local T3 projects"
      : "Fixture · workspace-read v2";
}

export function buildRoomsBreadcrumbs(
  room: RoomsRoom,
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
