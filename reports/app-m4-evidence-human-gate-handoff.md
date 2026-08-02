# App M4 evidence and Human QA consumer handoff

Date: 2026-08-02 (America/New_York)

## Immutable inputs

- Repository: `/Users/brw/Developer/apps/t3code`
- Branch: `feat/rooms-m4-evidence-gate`
- App base: `6e7aa05592b992c20d97615dafb7bf3c2cb06613`
- Server producer: `67b20ef49cb9584af60f6c4e810659b7c77ce286`
- Server branch publication head when consumption began:
  `96368a20e6675f14fa696a8b50962010da52c5e3`
- `M4_APP_CONSUMER_SHA=365e0ba67211690f6c14951d21a437bd197c5d2e`
- Consumer commit: `feat(rooms): add Human QA evidence flow`
- Contract: `rooms.local-stories` v2 at
  `contracts/rooms/local-stories/v2/schema.json`

This report is a documentation-only descendant of the immutable consumer
commit so it can name that SHA without a circular self-reference.

## Consumer behavior

The Local Stories source continues to parse version 1 during rollout and now
parses and validates version 2. New M4 lifecycle commands require a version-2
story response. The app pins the exact producer implementation SHA above,
rather than the server's later documentation head.

The consumer adds:

- `GET /rooms/:room_id/stories/:story_id`;
- bounded raw-byte `POST /cas` upload;
- `POST /rooms/:room_id/stories/:story_id/evidence`;
- `POST /rooms/:room_id/stories/:story_id/transitions`;
- `POST /rooms/:room_id/stories/:story_id/reviews`.

The Electron IPC bridge still permits only HTTP loopback. Its boundary now
allows the exact `POST /cas` path in addition to `/rooms/*`, accepts declared
media type plus base64 bytes, rejects invalid base64/header injection, and
enforces a 5 MiB decoded limit. It does not permit another route namespace or
remote host. The browser fallback sends the same bytes and media type to its
configured loopback origin.

## Native workflow surface

Every version-2 story card renders the server-owned stage and scope/global
heads, allowed transitions, evidence, Human QA gate, and ordered workflow
activity. The familiar persisted native-thread association and exact
`Open thread` route remain intact.

The evidence control accepts one non-empty artifact or screenshot up to 5 MiB.
It uploads bytes to Local CAS first, then attaches the returned exact
`(hash, bytes, media_type)` tuple with the story's current `scope_head_seq`.
After an uncertain attachment response, Retry reuses the same CAS tuple,
request ID, expected head, evidence kind, and note. Editing the selected file,
kind, or note deliberately clears that retry identity.

Lifecycle buttons come only from `allowed_next_transitions`. Backlog and
in-progress advancement sends no invented evidence. At the pinned Human QA
gate, `Approve Human QA` is an explicit durable human decision over the
server-provided eligible evidence IDs. The UI intentionally has no
request-changes action because feature-v1 declares no such path. After an
approval response, completion remains a separate explicit button and sends
the exact evidence IDs recorded by the approved review.

The app never auto-approves or auto-completes. For the real runtime story,
automation may prepare attachment and advance to `Human QA`; Ben must click the
approval and completion actions himself.

## Reconciliation and errors

The UI shows the producer's message and exact error code. It preserves
authorization, CAS, gate, replay/conflict, wrong-reviewer, and protected-gate
errors instead of replacing them with generic copy. On `stale_scope_head`, it
discards the now-stale stable command and immediately attempts a fresh detail
read; the existing room-change loop and explicit Refresh remain fallbacks.

Successful commands do not become client-owned optimistic truth. They trigger
a collection reload, and live room changes trigger the existing reconciliation
generation. A restart therefore obtains stage, evidence, review, completion,
audit, and native-thread identity from Rails rather than localStorage or a
fixture.

The v2 invariant check rejects contradictions in room/story/link identity,
creation and link event provenance, scope/global heads, SHA-256 CAS tuples,
evidence/review/completion event identity and sequence, referenced gate or
completion evidence, approved-review identity, or audit ordering.

## Files changed in the consumer source commit

- `packages/contracts/src/ipc.ts`
- `apps/desktop/src/ipc/methods/roomsLocal.ts`
- `apps/desktop/src/ipc/methods/roomsLocal.test.ts`
- `apps/web/src/localApi.ts`
- `apps/web/src/features/rooms/model/source.ts`
- `apps/web/src/features/rooms/dataSource/RoomsDataSourceProvider.tsx`
- `apps/web/src/features/rooms/dataSource/localChannelsClient.ts`
- `apps/web/src/features/rooms/dataSource/localStoriesContract.ts`
- `apps/web/src/features/rooms/dataSource/localStoriesClient.test.ts`
- `apps/web/src/features/rooms/dataSource/localStoriesContract.test.ts`
- `apps/web/src/features/rooms/dataSource/fixtures/local-stories-v2-empty.json`
- `apps/web/src/features/rooms/dataSource/fixtures/local-stories-v2-story-at-human-qa.json`
- `apps/web/src/features/rooms/stories/RoomsLocalStories.tsx`
- `apps/web/src/features/rooms/stories/RoomsLocalStories.test.tsx`

## Exact automated evidence

All commands used the checkout's existing Node/vp dependencies; no bootstrap
or dependency mutation was required.

| Validation                                                                 | Result                                |
| -------------------------------------------------------------------------- | ------------------------------------- |
| v1/v2 contract, client, Human QA UI, Local data/change/shell/channel focus | PASS — 12 files / 59 tests            |
| Desktop loopback/CAS IPC and client-settings focus                         | PASS — 2 files / 20 tests             |
| contracts, web, and desktop typechecks                                     | PASS                                  |
| Focused lint over 12 changed TS/TSX paths                                  | PASS — no diagnostics                 |
| Focused format over all 14 changed source/fixture paths                    | PASS                                  |
| contracts and production web build                                         | PASS — 4,493 modules in 15.13 seconds |
| `git diff --check` before consumer commit                                  | PASS                                  |

The production build emitted the repository's existing chunk-size and plugin
timing warnings but no failure.

## Honest limits and manual gate

- Automated client and server tests prove the command protocol, rendering,
  retry identity, error preservation, and native-link routing. They do not
  constitute Ben's Human QA decision or physical keyboard-feel assessment.
- The final isolated runtime must retain the real story at `Human QA` with a
  real bounded artifact attached. Ben's approval, completion click, native
  thread open, shortcut feel, and post-restart verification remain manual.
- A story has no persisted channel association in the current producer. The
  story's ordered Workflow activity is the honest audit surface; the app does
  not select or mutate an arbitrary channel to simulate ownership.
- M4 adds no remote exposure, agent API, provider invocation, new generic
  realtime framework, transcript mirror, PR, deploy, or mobile Rooms surface.

Until the manual actions pass, the correct status is:

`M4 IMPLEMENTED — HUMAN QA PENDING`

## Workspace hygiene

The pre-existing untracked
`reports/monroe-rooms-dogfood-agent-handoff.md` was not read, edited, staged, or
committed. The existing M3 T3 desktop/backend/Vite runtime and scratch state
were not stopped or repurposed. No worktree, PR, merge, rebase, force-push,
deployment, personal T3 state, or unrelated cleanup was used.
