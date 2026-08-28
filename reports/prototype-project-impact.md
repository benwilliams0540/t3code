# Project impact — agents, work, and host footprint

## User idea

From the Kanban/project list, show how many agents are active in each project, what they are doing,
and what impact that project is having on its execution host: CPU, memory, heat/thermal pressure, and
other useful resource metrics. A project entry in the left sidebar can grow vertically to carry a
compact summary, with a deeper task-manager view and optional charts.

## Prototype

Throwaway branch: [`prototype/rooms-project-impact`](https://github.com/benwilliams0540/t3code/tree/prototype/rooms-project-impact)

The existing project sidebar accepts a development-only query parameter:

- `?project-impact=a` — **Pulse strip:** the smallest always-visible summary.
- `?project-impact=b` — **Agent roster:** prioritizes who is running and what each agent is doing.
- `?project-impact=c` — **Trend deck:** prioritizes CPU, memory, and heat sparklines.

Arrow keys or the floating prototype switcher cycle between the variants. All displayed values are
synthetic and explicitly marked as such. The prototype does not render in production builds.

## Recommended product shape

Use a two-level disclosure model:

1. A compact project row shows active agent count, current project CPU/RAM, thermal tone, and the
   highest-priority active task.
2. Clicking the impact summary opens a project task-manager view with an agent/process roster,
   current work, charts, attribution confidence, and a selectable time window.

The compact summary should remain scannable. Full process trees and long histories belong in the
detail view, not permanently in the sidebar.

## Existing foundation

T3 already has a native resource telemetry pipeline with process CPU, RSS, I/O, process history,
host thermal/power state, and a diagnostics UI. This story should extend that foundation rather
than build a second monitor.

The missing seam is project attribution. Current resource telemetry can describe the T3 process
tree and host state, but it does not yet assign subprocess cost to a project/thread/agent. Shared
server and Electron overhead also cannot be honestly charged to one project without an explicit
rule.

## Backlog scope

### Sidebar summary

- Active/resting/waiting agent count per project.
- Concise current-work label for active agents.
- Current CPU, resident memory, and host thermal tone.
- Stale/unavailable state when telemetry is missing.
- User preference to hide the impact row or show it only for active projects.

### Project task-manager view

- Agent roster with provider, thread/story, status, elapsed time, and current operation.
- CPU, memory, I/O, process count, and project share of the host.
- Charts for useful windows such as 1 minute, 15 minutes, 1 hour, and session lifetime.
- Machine identity and local/remote scope when a project spans environments.
- Attribution confidence and an explicit “shared/unattributed” bucket.
- Read-only first release. Stop/pause/limit controls are a separate authorization-sensitive story.

### Attribution model

- Associate provider subprocess roots with their durable thread and project identities at spawn.
- Roll descendant processes into the same project while preserving process-tree inspection.
- Keep shared T3/Electron/server overhead separate unless a documented allocation rule exists.
- Preserve agent identity separately from process identity; one agent may own multiple processes.
- Never leak another project's task title or process details across room/environment boundaries.

### Performance

- Reuse the existing resource telemetry sampling stream.
- Subscribe/render only when the project summary or detail view is visible.
- Bucket chart history server-side; do not push raw high-frequency samples to every client.
- Avoid continuous animations and unnecessary sidebar-wide rerenders.

## Acceptance criteria

- With two agents working in one project and one in another, each sidebar entry shows the correct
  agent count and current-work labels.
- CPU/RAM/process totals include each project's owned provider process trees and exclude processes
  owned by another project.
- Shared overhead appears as shared/unattributed rather than being silently assigned.
- Thermal state is labeled as host-level context, not falsely presented as a project temperature.
- The detail view charts at least CPU and memory over a selectable recent window.
- Telemetry unavailable/stale states are visible and do not display plausible-looking zeroes.
- Collapsing or hiding the panel stops its UI subscription/render cost.
- Web and desktop behavior is defined; mobile receives a separate compact/detail treatment rather
  than inheriting a desktop sidebar assumption.

## Prototype verdict to seek

Choose the default information hierarchy, not the colors:

- Is the pulse strip enough for the always-visible row?
- Does the agent roster deserve the most space?
- Are trend charts useful in the sidebar, or should they live only in the deeper task-manager view?
