# Project impact — agents, work, and host footprint

## User idea

From the Kanban/project list, show how many agents are active in each project, what they are doing,
and what impact that project is having on its execution host: CPU, memory, heat/thermal pressure, and
other useful resource metrics. A project entry in the left sidebar can grow vertically to carry a
compact, configurable summary without covering the Kanban.

## Prototype

Throwaway branch: [`prototype/rooms-project-impact`](https://github.com/benwilliams0540/t3code/tree/prototype/rooms-project-impact)

The existing project sidebar accepts a development-only query parameter:

- `?project-impact=a` — **Pulse strip:** the smallest always-visible summary.
- `?project-impact=b` — **Agent roster:** prioritizes who is running and what each agent is doing.
- `?project-impact=c` — **Trend deck:** prioritizes CPU, memory, and heat sparklines.

Arrow keys or the floating prototype switcher cycle between the variants. All displayed values are
synthetic and explicitly marked as such. The prototype does not render in production builds.

### Revised UX direction

![Revised project-impact sidebar mock](https://raw.githubusercontent.com/benwilliams0540/t3code/prototype/rooms-project-impact/reports/assets/2026-08-28-19-02-39-rooms-project-impact-ux-v2.png)

The revised direction removes the right-side detail drawer as out of scope. The Kanban keeps its
full width. The expanded project entry contains the agent roster, current work, compact metrics,
and exactly one configurable sparkline.

## Recommended product shape

Use one expanded project row. It shows active agent count and current work, followed by selected
resource fields and no more than one small graph. Full process trees, a dedicated task-manager
drawer, stop/pause controls, and multi-chart history are not part of this feature.

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
- Exactly one optional sparkline selected by configuration.
- Compact shared/unattributed resource line.
- Stale/unavailable state when telemetry is missing.
- User preference to hide the impact row or show it only for active projects.

### Display configuration

Keep the first version configurable through the normal `settings.json` path rather than adding a
settings screen. Proposed shape (final names should follow the existing settings schema):

```json
{
  "projectImpact": {
    "enabled": true,
    "show": ["activeAgents", "currentWork", "cpu", "memory", "hostThermal", "shared"],
    "graph": "cpu"
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
- Subscribe/render only when the project summary is visible.
- Bucket the single sparkline history server-side; do not push raw high-frequency samples to every
  client.
- Avoid continuous animations and unnecessary sidebar-wide rerenders.

## Acceptance criteria

- With two agents working in one project and one in another, each sidebar entry shows the correct
  agent count and current-work labels.
- CPU/RAM/process totals include each project's owned provider process trees and exclude processes
  owned by another project.
- Shared overhead appears as shared/unattributed rather than being silently assigned.
- Thermal state is labeled as host-level context, not falsely presented as a project temperature.
- The expanded entry renders no more than one graph.
- `settings.json` can choose the visible fields, their order, and which single metric is graphed.
- Disabling the feature in `settings.json` restores the normal compact project row.
- Telemetry unavailable/stale states are visible and do not display plausible-looking zeroes.
- Collapsing or hiding the panel stops its UI subscription/render cost.
- Web and desktop behavior is defined; mobile is explicitly out of scope for this sidebar-first
  feature.

## Prototype verdict to seek

Validate the revised sidebar-only hierarchy and choose the default graph. The right-side drawer and
multi-chart task-manager view are deliberately out of scope.
