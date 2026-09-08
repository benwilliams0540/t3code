# App M3 story-to-native-thread handoff

## Immutable inputs

- App branch: `feat/rooms-m3-story-thread`
- App base / composer checkpoint: `9f1e871059dc972dfbde1cd30e73a6ecb3b3b55e`
- Server producer: `918c5b31f510fa065b246d8b9fb13c5505581838`
- Server branch publication head when consumption began: `1fadff3de404d234d904e6719de3d5fe16f6d270`
- App consumer source commit: `0b36ccf7a4f21a149a4f9330beda626fb3f46857`
- Contract: `rooms.local-stories` v1 at
  `contracts/rooms/local-stories/v1/schema.json`

This report is a documentation descendant of the consumer source commit so it
can name that immutable SHA without a circular self-reference.

## Consumer behavior

The existing loopback-only Rooms client now decodes and validates the v1 story
collection and supports:

- `GET /rooms/:room_id/stories`
- `POST /rooms/:room_id/stories`
- `POST /rooms/:room_id/stories/:story_id/thread`

Create and link commands use lowercase UUIDv7 request IDs. The UI retains the
same command object after an uncertain failure, blocks duplicate in-flight
submissions, and clears the command only after success or an explicit edit.
The transport preserves `Idempotency-Replayed` and the producer's actionable
error codes.

The Local Stories project surface replaces the prior unavailable placeholder.
It renders a server-authoritative zero state, an explicit feature-story create
action, story type/workflow/stage, and one durable native-thread association.
The link picker is populated only from current T3 thread shells whose projects
are actually bound to the Local room. Linking sends the exact T3 environment,
project, and thread IDs selected from that set.

For a resolved association, Rooms presents the server-owned story stage beside
the current T3-owned provider instance, shared working/approval/input/failure
status (or `Resting`), and shell update time. `Open thread` uses the existing
Rooms `native-thread` route and native `ChatView`. A persisted identity that no
longer resolves to an actual shell in a bound project renders
`Linked thread unavailable or stale`, includes the exact saved identity, and
offers no fallback Open action.

Stories reload after create/link, on explicit refresh, and after the existing
room-change reconciliation generation advances. A remount or app restart lists
the durable association from the server; no story or association is persisted
in browser storage, project-binding settings, fixtures, or a mirrored thread.

## Contract checks

The consumer rejects responses that contradict:

- the requested room;
- strict creation-sequence ordering;
- `task.created` schema 2 creation source and sequence;
- `task.thread-linked` schema 1 association source and sequence;
- room/story ownership on the association; or
- the story ID named by a link route.

The copied producer examples are decoder fixtures only. They never enter Local
runtime state.

## Files changed in the consumer source commit

- `apps/web/src/features/rooms/dataSource/RoomsDataSourceProvider.tsx`
- `apps/web/src/features/rooms/dataSource/fixtures/local-stories-v1-empty.json`
- `apps/web/src/features/rooms/dataSource/fixtures/local-stories-v1-story-with-thread.json`
- `apps/web/src/features/rooms/dataSource/localChannelsClient.ts`
- `apps/web/src/features/rooms/dataSource/localStoriesClient.test.ts`
- `apps/web/src/features/rooms/dataSource/localStoriesContract.test.ts`
- `apps/web/src/features/rooms/dataSource/localStoriesContract.ts`
- `apps/web/src/features/rooms/model/source.ts`
- `apps/web/src/features/rooms/shell/RoomsLocalWorkspaceSurface.test.tsx`
- `apps/web/src/features/rooms/shell/RoomsLocalWorkspaceSurface.tsx`
- `apps/web/src/features/rooms/stories/RoomsLocalStories.test.tsx`
- `apps/web/src/features/rooms/stories/RoomsLocalStories.tsx`
- `apps/web/src/features/rooms/threads/RoomsThreadNavigation.test.tsx`
- `apps/web/src/features/rooms/threads/roomsNativeThreads.test.ts`
- `apps/web/src/features/rooms/threads/roomsNativeThreads.ts`

## Focused evidence

All commands used bundled Node 24.14.0 with the checkout's existing `vp`
binary; no dependency bootstrap was performed.

- `vp test run --project unit src/features/rooms` from `apps/web`: 35 files,
  141 tests passed.
- `vp test run --project unit src/composer-logic.test.ts
src/components/settings/BetaSettingsPanel.test.ts
src/hooks/useSettings.test.ts` from `apps/web`: 3 files, 46 tests passed.
- `vp run --filter @t3tools/web typecheck`: passed.
- `vp lint --report-unused-disable-directives <13 changed TS/TSX paths>`:
  passed with no diagnostics.
- `vp fmt --check <13 changed TS/TSX paths>`: passed.
- `vp run --filter @t3tools/web build`: passed; 4,493 modules transformed in
  16.11 seconds. The build emitted the repository's bundle-size and plugin
  timing warnings but no failure.
- `git diff --check`: passed before the consumer commit.

The earlier composer checkpoint at `9f1e8710…` also passed its contracts, web,
desktop, and mobile typechecks and its focused settings/composer/channel tests;
see `reports/app-general-improvements-checkpoint.md` for those exact commands.

## Surface decisions and limits

- Web and desktop share this React surface. Desktop continues to reach only an
  HTTP loopback Rooms origin through its existing validated IPC bridge; the
  browser path continues to fetch its configured client-local loopback origin.
- No mobile-specific Rooms Local surface or transport exists in this checkout,
  so M3 did not invent one. Existing mobile composer behavior remains covered
  by the pinned composer checkpoint.
- Native transcript, drafts, turns, provider execution, diffs, checkpoints,
  and live status remain T3-owned and are not copied into Rooms.
- M3 adds no story transition, evidence, approval, or story-specific thread
  creation flow.
- Automated tests and a production build do not constitute real desktop
  acceptance. API restart/reconstruction and one integrated desktop pass remain
  Phase E evidence.

## Workspace hygiene

The pre-existing untracked
`reports/monroe-rooms-dogfood-agent-handoff.md` was not read, edited, staged, or
committed. The repository commit hook used its own temporary lint-staged backup
and removed it successfully; `git stash list` was empty afterward. No worktree,
PR, merge, rebase, force-push, deployment, personal T3 state, or unrelated
cleanup was used.
