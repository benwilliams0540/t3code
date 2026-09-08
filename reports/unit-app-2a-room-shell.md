# APP-2A · Room shell, rail, routes, and sidebar frame

RUNNABLE NOW: YES for the focused worker proof. From this lane:

```bash
cd /Users/brw/Developer/worktrees/t3code-lane-1/apps/web
mise x node@24.16.0 -- pnpm exec vp test run --project unit \
  src/features/rooms/fixtures/workspace-read-v1.test.ts \
  src/features/rooms/model/selection.test.ts \
  src/features/rooms/shell/navigation.test.ts \
  src/components/AppSidebarLayout.test.ts
```

Observed: 4 test files passed, 10 tests passed. The fixture-backed shell itself should be launched only after APP-01 integrates this commit and regenerates `apps/web/src/routeTree.gen.ts`. This worker did not start a dev server or browser.

## Exact inputs

- App base branch: `feat/subscribe-events`
- App base SHA: `a7fb78d86b281ea0ccba6276ec71d97ec18d7e8c`
- Worker branch: `unit/app-2a-room-shell`
- Integrated server source SHA: `082f85871125c780a9bb6cbdf78a6df83c622290`
- Contract: `rooms.workspace-read`
- Version: `1`
- Source schema SHA-256: `79f0827c9199c9a0347dd3f99643cdd773d3857b88415c64ca3c4ff625cfbae9`
- Source fixture SHA-256: `33b4a4d066d75f2b95c7d9c567da6bec16f37821dd8b41e621beaed85d5ae699`
- Source validator result: `Workspace fixture valid`; contract version 1, two rooms, six principals, four stories, and seven feed items.

The checked-in schema and fixture are byte-identical to the validated L15A files. The app source-pin constant preserves the integrated server SHA, contract id/version, and both hashes.

## Changed paths

Layout and focused layout test:

- `apps/web/src/components/AppSidebarLayout.tsx`
- `apps/web/src/components/AppSidebarLayout.test.ts`

Shared producer boundary:

- `apps/web/src/features/rooms/fixtures/index.ts`
- `apps/web/src/features/rooms/fixtures/workspace-read-v1.json`
- `apps/web/src/features/rooms/fixtures/workspace-read-v1.schema.json`
- `apps/web/src/features/rooms/fixtures/workspace-read-v1.test.ts`
- `apps/web/src/features/rooms/model/index.ts`
- `apps/web/src/features/rooms/model/selection.ts`
- `apps/web/src/features/rooms/model/selection.test.ts`
- `apps/web/src/features/rooms/model/source.ts`
- `apps/web/src/features/rooms/model/workspace.ts`

Shell and consumer slots:

- `apps/web/src/features/rooms/shell/index.ts`
- `apps/web/src/features/rooms/shell/navigation.ts`
- `apps/web/src/features/rooms/shell/navigation.test.ts`
- `apps/web/src/features/rooms/shell/RoomsWorkspaceNavigation.tsx`
- `apps/web/src/features/rooms/shell/RoomsWorkspaceRail.tsx`
- `apps/web/src/features/rooms/shell/RoomsWorkspaceShell.tsx`
- `apps/web/src/features/rooms/shell/RoomsWorkspaceSurface.tsx`
- `apps/web/src/features/rooms/shell/slots.ts`
- `apps/web/src/features/rooms/shell/useRoomsWorkspaceSelection.ts`

Authenticated Rooms routes:

- `apps/web/src/routes/_chat.rooms.tsx`
- `apps/web/src/routes/_chat.rooms.index.tsx`
- `apps/web/src/routes/_chat.rooms.$roomSlug.dashboard.tsx`
- `apps/web/src/routes/_chat.rooms.$roomSlug.channels.$channelSlug.tsx`
- `apps/web/src/routes/_chat.rooms.$roomSlug.threads.tsx`
- `apps/web/src/routes/_chat.rooms.$roomSlug.project.$projectSection.tsx`
- `apps/web/src/routes/_chat.rooms.$roomSlug.project.$projectSection_.$projectView.tsx`
- `apps/web/src/routes/_chat.rooms.$roomSlug.present.tsx`

Report:

- `reports/unit-app-2a-room-shell.md`

No package manifest, lockfile, generated route tree, existing sidebar implementation, B2 composer path, contract/client-runtime path, or orchestration event-subscription path is changed.

## Implemented boundary

- The exact L15A schema and fixture are checked in without importing Rails.
- Model types mirror contract v1 and remain read-only to consumer views.
- Selection stores a declared room id under `t3code.rooms.selected-room-id.v1`. It never derives identity from a logical project.
- Invalid persisted ids fall back to the fixture-selected declared id.
- Cmd/Ctrl+1–9 follows declaration order and ignores text-entry/keybinding-capture targets.
- `RoomsWorkspaceRail` is a distinct component and a sibling of the existing Sidebar/SidebarV2 choice. T3's resize/toggle `SidebarRail` remains unchanged.
- The shell mounts through children of the authenticated `_chat` route and every surface uses `SidebarInset`.
- Route state covers Dashboard, channel detail, Your Threads, project sections, Atlas/detail views, and Present.
- Browser back/forward controls and nested breadcrumbs use the route history.
- Dashboard, channel, project, and Atlas have typed slots in `roomsWorkspaceSlots` for APP-01 to wire after consumer commits.
- Your Threads renders provider, environment, status, as-of, reachability, and freshness facts. Present separates humans, agents, and machines.
- L15A declares two rooms but supplies detailed workspace data only for its selected Rooms room. Selecting Camera Team swaps away from Rooms data and shows an explicit unavailable-fixture state rather than inventing or leaking a second workspace.

## Both-sidebar and settings behavior

The rail mounts before and outside the existing `Sidebar` container, so it does not pick V1 or V2. The existing resolved sidebar behavior remains:

- pre-hydration or disabled V2: V1 implementation and V1 theme;
- enabled V2 outside Settings: V2 implementation and V2 theme;
- Settings while V2 is enabled: V1 Settings navigation remains mounted with the V2 theme.

The fixed desktop sidebar is offset by the new 3.5rem rail. Workspace controls add the rail width to both ordinary safe-area and macOS traffic-light offsets. Focused tests cover all three sidebar-resolution cases. Runtime visual validation remains primary-owned.

## Commands and observed results

L15A validation:

```text
/Users/brw/Developer/ai-projects/t3rooms/bin/validate-workspace-fixture
Workspace fixture valid
contract=rooms.workspace-read version=1 fixture_id=fixture:019fb900-0000-7000-8000-000000000001
rooms=2 principals=6 stories=4 feed_items=7
```

Exact source-byte verification:

```text
shasum -a 256 apps/web/src/features/rooms/fixtures/workspace-read-v1.schema.json \
  apps/web/src/features/rooms/fixtures/workspace-read-v1.json
79f0827c9199c9a0347dd3f99643cdd773d3857b88415c64ca3c4ff625cfbae9  ...schema.json
33b4a4d066d75f2b95c7d9c567da6bec16f37821dd8b41e621beaed85d5ae699  ...workspace-read-v1.json
```

Focused unit tests, final run:

```text
cd apps/web
mise x node@24.16.0 -- pnpm exec vp test run --project unit \
  src/features/rooms/fixtures/workspace-read-v1.test.ts \
  src/features/rooms/model/selection.test.ts \
  src/features/rooms/shell/navigation.test.ts \
  src/components/AppSidebarLayout.test.ts

Test Files  4 passed (4)
Tests       10 passed (10)
Duration    2.04s
```

The first invocation from the repository root reported `No projects matched the filter "unit"` because the named unit project is defined in `apps/web/vite.config.ts`. Re-running the same focused set from `apps/web` passed as shown above.

Focused lint, final run:

```bash
mise x node@24.16.0 -- pnpm exec vp lint \
  apps/web/src/components/AppSidebarLayout.tsx \
  apps/web/src/components/AppSidebarLayout.test.ts \
  apps/web/src/features/rooms/fixtures/index.ts \
  apps/web/src/features/rooms/fixtures/workspace-read-v1.test.ts \
  apps/web/src/features/rooms/model \
  apps/web/src/features/rooms/shell \
  'apps/web/src/routes/_chat.rooms*.tsx'
```

Observed: exit 0 with no findings. The first lint pass identified three repository-specific namespace import findings in the hash test; those imports were corrected and the final command passed.

`git diff --check` passed. The test runner regenerated `apps/web/src/routeTree.gen.ts` and proved all eight route files were recognized; the generated file was then restored to the exact base blob. `git diff --exit-code -- apps/web/src/routeTree.gen.ts` passed.

The first commit-hook formatting pass normalized the two checked-in JSON source artifacts. The post-commit hash test caught that byte drift immediately; both files were restored from the authoritative L15A paths, the exact hashes above passed again, and the single commit was amended without rerunning the formatter over those immutable source artifacts.

Per the worker gate, no shared typecheck, web build, desktop build, dev server, browser, or screenshot process ran.

## Generated artifacts and disk

- Lane apparent size: 6,058,624 KiB.
- Existing `node_modules`: 5,879,500 KiB.
- No `dist`, `dist-electron`, `build`, or `.vite` directory was generated within the checkout scan depth.
- The route tree regeneration was transient and fully restored.
- Canonical `.env` and `apps/server/.env` sources remain absent; no credentials or replacement configuration were introduced.

## Surface, provider, and connection applicability

- Web: in scope. The checked-in fixture, routing, persistence boundary, responsive navigation, and shell are web client code.
- Desktop: in scope through the shared web renderer. macOS titlebar/traffic-light offset logic includes the Rooms rail. Electron visual behavior is untested pending the primary-owned screenshot pass.
- Native mobile: no mobile files are changed. Contract v1's `mobile_vertical_stages` projection is preserved for APP-2B, but a native Rooms navigation surface is deferred because this slice is explicitly desktop/web-first. Existing mobile thread behavior is unaffected.
- Providers: the shell is provider-agnostic and does not invoke an adapter. Codex, Claude, Cursor, Grok, and OpenCode behavior is unchanged. The fixture's Codex/Claude provider strings are rendered as source facts, not provider capabilities.
- Local, relay, and tunnel: fixture mode performs no room transport and bakes in no origin. The same authenticated web route can render in all three connection modes, but live API/auth/freshness behavior is deferred to Wave 3 and is not claimed here.
- Hosted static: the Rooms children inherit the existing `_chat` allowance for authenticated or hosted-static state. No live Rooms authorization is inferred from reachability.

## Verified versus inferred

Verified directly:

- exact app base and server source SHAs;
- source fixture validator pass and exact checked-in byte hashes;
- declared-id fallback, room shortcut mapping, workspace isolation, breadcrumb structure;
- V1/V2/Settings resolution behavior;
- focused test and lint results;
- generated route recognition and exact route-tree restoration;
- no forbidden tracked path changed.

Inferred or awaiting integrated proof:

- visual parity, narrow-width ergonomics, focus order, and screen-reader behavior;
- actual browser back/forward and local-storage behavior in a running app;
- macOS traffic-light placement and desktop resize behavior;
- screenshot states under both sidebar flags;
- consumer slot composition after APP-2B, APP-2C, and APP-2D;
- native mobile presentation and all live local/relay/tunnel behavior.

## Interface requests and remaining integration work

No L15A contract change is requested.

APP-01 must:

1. integrate this commit before consumer work;
2. regenerate and own `apps/web/src/routeTree.gen.ts`;
3. record the resulting exact integration SHA;
4. reset both consumer lanes to that SHA;
5. wire APP-2B, APP-2C, and APP-2D exports into `roomsWorkspaceSlots` after their commits return;
6. run shared typecheck/build/regressions and the permission-gated V1/V2/narrow screenshot pass.

Consumers should import from `features/rooms/model` and `features/rooms/fixtures` without editing those producer paths.

## Untested cases

- live L15B/API reads, pagination mutation, mark-read writes, and authorization enforcement;
- desktop/browser visual layout, motion, and screenshots;
- command shortcut conflicts in a real editor/terminal focus stack;
- persistence across a real application restart;
- consumer dashboard/channel/project slot rendering;
- native-mobile Rooms navigation;
- shared typecheck, web build, and desktop build, which are integration-owned.

## Final repository state

One scoped commit is expected on `unit/app-2a-room-shell` with only the owned paths above. Final `git status --short` is empty; this is verified again in the worker handoff after commit. The lane remains available for APP-01 integration and must not be removed by this worker.
