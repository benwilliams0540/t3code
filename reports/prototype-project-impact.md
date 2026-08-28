# Project impact — agents, work, and host footprint

## User idea

From the Kanban/project list, show how many agents are active in each project, what they are doing,
and what impact that project is having on its execution host: CPU, memory, heat/thermal pressure, and
other useful resource metrics. Each project remains a compact sidebar row and can add one
configurable impact/status line below its title, allowing several projects to remain visible at
once without covering the Kanban.

## Prototype

Throwaway branch: [`prototype/rooms-project-impact`](https://github.com/benwilliams0540/t3code/tree/prototype/rooms-project-impact)

The initial interactive prototype accepts a development-only query parameter:

- `?project-impact=a` — **Pulse strip:** the smallest always-visible summary.
- `?project-impact=b` — **Agent roster:** prioritizes who is running and what each agent is doing.
- `?project-impact=c` — **Trend deck:** prioritizes CPU, memory, and heat sparklines.

Arrow keys or the floating prototype switcher cycle between the variants. All displayed values are
synthetic and explicitly marked as such. The prototype does not render in production builds.
These expanded variants are preserved as exploration history but are superseded by the compact
direction below.

### Current UX direction

![Compact multi-project impact rows](https://raw.githubusercontent.com/benwilliams0540/t3code/prototype/rooms-project-impact/reports/assets/2026-08-28-19-11-47-compact-project-impact-ux-v3.png)

The current direction removes the project-impact card entirely. Each normal project row gets a
small second line such as `3 agents · CPU 38% · 2.4 GB · host 67°`. Five or more projects can remain
visible at typical desktop sidebar height. There is no graph by default. The Kanban keeps its full
width.

## Recommended product shape

Treat project impact as optional metadata on the existing project row, not a dashboard. The first
line stays unchanged. The second line contains a small activity dot and a few selected values. A
user may enable one tiny graph, but the default is no graph. Full process trees, agent task lists, a
dedicated task-manager drawer, stop/pause controls, and multi-chart history are not part of this
feature.

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

- One compact second line beneath every visible project title.
- Active/resting/waiting agent count, current CPU, resident memory, and host thermal tone as
  configurable fields.
- No graph by default; at most one tiny optional sparkline selected by configuration.
- Compact shared/unattributed resource value when enabled.
- Stale/unavailable state when telemetry is missing.
- User preference to hide the second line, show it for active projects only, or show it for every
  project.

### Display configuration

Keep the first version configurable through the normal `settings.json` path rather than adding a
settings screen. Proposed shape (final names should follow the existing settings schema):

```json
{
  "projectImpact": {
    "enabled": true,
    "visibility": "allProjects",
    "show": ["activeAgents", "cpu", "memory", "hostThermal"],
    "graph": null
  }
}
```

`graph` accepts one supported metric or `null`. `show` controls row order and visibility. Invalid
or unsupported fields should be ignored with a diagnostic rather than breaking the sidebar.

### Attribution model

- Associate provider subprocess roots with their durable thread and project identities at spawn.
- Roll descendant processes into the same project while preserving process-tree inspection.
- Keep shared T3/Electron/server overhead separate unless a documented allocation rule exists.
- Preserve agent identity separately from process identity; one agent may own multiple processes.
- Never leak another project's task title or process details across room/environment boundaries.

### Performance

- Reuse the existing resource telemetry sampling stream.
- Subscribe/render only for project rows currently visible in the sidebar.
- If a graph is enabled, bucket its history server-side; do not push raw high-frequency samples to
  every client.
- Avoid continuous animations and unnecessary sidebar-wide rerenders.

## Acceptance criteria

- With activity across several projects, each sidebar entry shows the correct project-scoped agent
  count and configured metrics.
- At least five two-line project rows remain visible in a 768-pixel-tall desktop sidebar before
  scrolling, excluding expanded thread lists.
- CPU/RAM/process totals include each project's owned provider process trees and exclude processes
  owned by another project.
- Shared overhead appears as shared/unattributed rather than being silently assigned.
- Thermal state is labeled as host-level context, not falsely presented as a project temperature.
- The default configuration renders no graphs.
- Enabling a graph renders no more than one tiny graph per configured row.
- `settings.json` can choose the visible fields, their order, and which single metric is graphed.
- Disabling the feature in `settings.json` restores the original one-line project row.
- Telemetry unavailable/stale states are visible and do not display plausible-looking zeroes.
- Hiding the second line stops its UI subscription/render cost.
- Web and desktop behavior is defined; mobile is explicitly out of scope for this sidebar-first
  feature.

## Prototype verdict to seek

Validate that the second status line stays useful without making the sidebar feel like a dashboard.
Default to no graph. The prior expanded card, right-side drawer, agent task list, and multi-chart
task-manager view are deliberately out of scope.
