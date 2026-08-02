import { renderToStaticMarkup } from "react-dom/server";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { DropdownMenuLabel } from "~/components/ui/menu";

import { RoomsMenuGroup, RoomsNativeThreadNavItem } from "./RoomsThreadNavigation";

describe("Rooms thread menu groups", () => {
  it("keeps every group label inside the Base UI menu-group context", () => {
    expect(() => renderToStaticMarkup(<DropdownMenuLabel>Unwrapped</DropdownMenuLabel>)).toThrow(
      /MenuGroupContext is missing/,
    );

    const markup = renderToStaticMarkup(
      <RoomsMenuGroup label="Local room projects">
        <span>Rooms</span>
      </RoomsMenuGroup>,
    );

    expect(markup).toContain('data-slot="menu-group"');
    expect(markup).toContain('data-slot="menu-label"');
    expect(markup).toContain("Local room projects");
  });
});

describe("Rooms native thread navigation", () => {
  it("ellipsizes a long thread title while preserving the full title for hover", () => {
    const title = "Inspect t3rooms Application Environment Without Losing the End";
    const markup = renderToStaticMarkup(
      <RoomsNativeThreadNavItem
        active
        navigate={() => undefined}
        projectTitle="t3rooms"
        thread={{
          environmentId: EnvironmentId.make("environment-local"),
          projectId: ProjectId.make("project-rooms"),
          threadId: ThreadId.make("thread-long-title"),
          title,
          projectTitle: "t3rooms",
          updatedAt: "2026-08-01T13:30:00.000Z",
          status: "ready",
          workingStartedAt: null,
        }}
      />,
    );

    expect(markup).toContain(title);
    expect(markup).toContain(`title="${title} · t3rooms"`);
    expect(markup).toContain("overflow-hidden");
    expect(markup).toContain("truncate");
    expect(markup).not.toContain("break-words");
  });

  it("labels a working thread and leaves a resting one unlabeled", () => {
    const base = {
      environmentId: EnvironmentId.make("environment-local"),
      projectId: ProjectId.make("project-rooms"),
      threadId: ThreadId.make("thread-status"),
      title: "Status thread",
      projectTitle: "t3rooms",
      updatedAt: "2026-08-01T13:30:00.000Z",
      workingStartedAt: null,
    } as const;

    const working = renderToStaticMarkup(
      <RoomsNativeThreadNavItem
        active={false}
        navigate={() => undefined}
        projectTitle="t3rooms"
        thread={{ ...base, status: "working", workingStartedAt: "2026-08-01T13:29:00.000Z" }}
      />,
    );
    const ready = renderToStaticMarkup(
      <RoomsNativeThreadNavItem
        active={false}
        navigate={() => undefined}
        projectTitle="t3rooms"
        thread={{ ...base, status: "ready" }}
      />,
    );

    expect(working).toContain('data-rooms-thread-status="working"');
    expect(working).toContain("Working");
    expect(ready).not.toContain("data-rooms-thread-status");
  });
});
