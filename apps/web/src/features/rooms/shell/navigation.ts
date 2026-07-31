import type { RoomsRoom } from "../model/workspace";

export type RoomsWorkspaceSurface =
  | { readonly kind: "dashboard" }
  | { readonly kind: "channel"; readonly channelSlug: string }
  | { readonly kind: "threads" }
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
