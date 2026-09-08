# APP-2C · Channel feed and structured activity

## Can Ben run it now?

**Not as a standalone unit branch.** The implementation and focused tests are complete, but
`APP-01` owns the shared slot registry and integrated desktop process. The shortest remaining step
is to cherry-pick this unit commit into `integrate/rooms-slice-1`, register
`RoomsChannelFeed` as `roomsWorkspaceSlots.channel`, and run the primary-owned integrated desktop
validation.

After that integration, the approved local command is:

```text
T3CODE_DEV_INSTANCE=rooms-slice-1 mise x node@24.16.0 -- pnpm exec vp run dev:desktop --home-dir /Users/brw/Developer/apps/t3code/.t3/rooms-slice-1
```

No dev server, browser, remote service, credential, or personal T3 home was used by this worker.

## Dependency pins

- Unit branch: `unit/app-2c-channel-feed`
- Exact unit base: `7608ddde75b86c480811ae41503f50abd0bd073c`
- Base commit: `feat(rooms): add workspace shell`
- Integrated L15A source SHA consumed through APP-2A:
  `082f85871125c780a9bb6cbdf78a6df83c622290`
- Contract: `rooms.workspace-read`, version `1`
- Checked-in fixture SHA-256:
  `33b4a4d066d75f2b95c7d9c567da6bec16f37821dd8b41e621beaed85d5ae699`
- Checked-in schema SHA-256:
  `79f0827c9199c9a0347dd3f99643cdd773d3857b88415c64ca3c4ff625cfbae9`

## Changed paths

```text
apps/web/src/features/rooms/activity/RoomsActivityItem.tsx
apps/web/src/features/rooms/activity/index.ts
apps/web/src/features/rooms/activity/projection.test.ts
apps/web/src/features/rooms/activity/projection.ts
apps/web/src/features/rooms/channel/RoomsChannelFeed.tsx
apps/web/src/features/rooms/channel/index.ts
apps/web/src/features/rooms/channel/projection.test.tsx
apps/web/src/features/rooms/channel/projection.ts
reports/unit-app-2c-channel-feed.md
```

No route, layout, shell, model, fixture, contract, client-runtime, composer, package, lockfile,
environment, or event-subscription file is part of this unit.

## Implemented boundary

- Projects the L15A feed in fixture order without creating a transcript model or mutating source
  items.
- Preserves and displays source sequence, event type, schema, page cursor, snapshot head, and next
  cursor metadata.
- Maps every fixture feed kind to an explicit card kind: message, reaction, run, story, evidence,
  and approval.
- Resolves actors from the shared principal list and gives human, agent, and machine principals
  separate semantics and visual shapes/tones.
- Keeps run detail in T3 by linking compact lifecycle cards to the existing
  `/$environmentId/$threadId` route.
- Renders the normal `infra` and `product` fixture feeds.
- Renders direct, clearly labeled local fixture states for `state-unauthorized`,
  `state-stale-cursor`, and `state-empty`, including the exact error/status/restart/page metadata.
- Renders a truthful missing-channel state instead of silently treating it as an empty feed.
- Uses semantic `main`, `header`, ordered-list, article, time, description-list, and native-anchor
  elements with visible keyboard focus on the thread link.

## Observed validation

All commands ran from `apps/web` with repository-compatible Node `24.16.0`.

```text
mise x node@24.16.0 -- pnpm exec vp test run --project unit \
  src/features/rooms/activity/projection.test.ts \
  src/features/rooms/channel/projection.test.tsx

Test Files  2 passed (2)
Tests       10 passed (10)
Duration    935ms
```

The tests prove:

- exact source sequences `[111, 112, 115]` for `# infra` and
  `[113, 114, 116, 117]` for `# product`;
- all six item/card-kind mappings;
- distinct human/agent/machine mappings;
- the exact detailed-thread route projection;
- exact fixture-state object selection and visible unauthorized, stale/restart, and empty-page
  metadata;
- ordered DOM semantics and a native keyboard-accessible thread link;
- truthful missing-channel behavior.

```text
mise x node@24.16.0 -- pnpm exec vp lint \
  src/features/rooms/activity src/features/rooms/channel --deny-warnings

exit 0, no diagnostics
```

`git diff --check` also exited `0` with no diagnostics. The focused test runner regenerated
`apps/web/src/routeTree.gen.ts`; it was restored exactly to `HEAD` and is excluded from this unit.

## Surface, provider, and connection matrix

| Dimension     | Status                                      | Evidence / reason                                                                |
| ------------- | ------------------------------------------- | -------------------------------------------------------------------------------- |
| Web           | Implemented                                 | React export and focused static-render/projection tests pass                     |
| Desktop       | Applicable through web shell                | Primary must wire and capture the integrated Electron pass                       |
| Native mobile | Deferred                                    | This unit owns only the web feature prefixes; no React Native route was assigned |
| Codex         | Provider-agnostic                           | Fixture includes an OpenAI Codex thread and route projection                     |
| Claude        | Provider-agnostic                           | Fixture includes an Anthropic Claude thread; no adapter-specific UI branch       |
| Cursor        | Provider-agnostic, inferred                 | No provider-specific branching; not present in fixture                           |
| Grok          | Provider-agnostic, inferred                 | No provider-specific branching; not present in fixture                           |
| OpenCode      | Provider-agnostic, inferred                 | No provider-specific branching; not present in fixture                           |
| Local         | Implemented against the exact local fixture | No server or credentials required                                                |
| Relay         | Presentation-equivalent, inferred           | Projection consumes supplied workspace data only; not exercised                  |
| Tunnel        | Presentation-equivalent, inferred           | Projection consumes supplied workspace data only; not exercised                  |

## Verified versus inferred

Verified locally:

- exact base and shared L15A source pins;
- ordered fixture projection and cursor metadata preservation;
- item/card and principal-type mapping;
- exact fixture-state selection and rendered metadata;
- detailed T3 thread href;
- focused tests, lint, formatting, and clean shared-file boundary.

Inferred pending primary integration:

- final appearance in both V1 and V2 sidebar configurations;
- browser keyboard navigation and Electron routing after slot registration;
- visual parity at desktop and narrow widths;
- relay/tunnel behavior and providers absent from the fixture.

## Interface requests and untested cases

No interface change is requested. APP-01 must perform the already-reserved slot registration; this
worker did not edit the shared registry.

Not exercised by this worker:

- shared web typecheck or web/desktop builds;
- live L15B data, authentication, membership, pagination fetch/restart, or read writes;
- browser screenshots, V1/V2 sidebar flags, narrow viewport, or Electron navigation;
- mobile-native UI;
- remote/relay/tunnel connections;
- any provider adapter behavior;
- a machine-authored feed item (the fixture has machine principals but no machine-authored feed
  event; mapping is unit-tested directly).

## Generated artifacts and disk

- New source/report footprint before commit: activity `24 KiB`, channel `28 KiB`, report small text.
- Existing lane `node_modules`: `5,879,500 KiB`; this unit installed nothing.
- Lane apparent size at measurement: `6,058,688 KiB`.
- Transient generated route tree: restored exactly; no generated artifact remains tracked or dirty.
- No screenshot, video, build, cache, database, or scratch-home artifact was created by this worker.
