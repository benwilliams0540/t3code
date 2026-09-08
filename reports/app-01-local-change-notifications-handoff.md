# APP-01 local change notifications handoff

Date: 2026-08-01

## Scope and revisions

- Control repository: `/Users/brw/Developer/ai-projects/rooms`
  - Branch: `docs/night-summary`
  - Input and verified unchanged SHA: `3f8a06884459ec61e50a0c5630004d583af5e6b0`
- Server repository: `/Users/brw/Developer/ai-projects/t3rooms`
  - Branch: `integrate/rooms-slice-1`
  - Published producer SHA: `3d480fc927676786c5b16249822453aecc5feaa5`
- App repository: `/Users/brw/Developer/apps/t3code`
  - Branch: `integrate/rooms-slice-1`
  - Input SHA: `cfa73d2c80e50ec32e02d160d69670b55d818bbf`
  - Final app SHA: the Git commit containing this report. A tracked file cannot contain its own
    Git object ID; the exact pushed SHA is recorded in the final APP-01 delivery and must match
    both local `HEAD` and `origin/integrate/rooms-slice-1`.

No source files were written in the control or server repositories. The app change is limited to
the existing Rooms Local data source, feed, shell status, focused tests, pinned examples, one
desktop IPC transport comment, and this report.

## Contract consumed

The app pins `rooms.local-changes` v1 separately from `rooms.local-channels`:

- Producer SHA: `3d480fc927676786c5b16249822453aecc5feaa5`
- Contract ID: `rooms.local-changes`
- Version: `1`
- Schema URI: `contracts/rooms/local-changes/v1/schema.json`
- Request: `GET /rooms/:room_id/changes?after_seq=<sequence>&timeout_ms=<milliseconds>`

The typed client distinguishes advanced and ordinary-timeout `200` responses, preserves both
cursors from `409 change_cursor_ahead`, and distinguishes retryable
`503 local_change_wait_cancelled`, transport failure, malformed JSON, schema failure, and
request/response cursor contradictions. The invalidation response is never treated as Rooms
workspace or feed truth.

The existing one-shot desktop HTTP/IPC bridge is retained. Its loopback-host and `/rooms/`
namespace guards are unchanged, and it deliberately adds no timeout shorter than the server's
bounded 30-second maximum wait.

## App behavior

- One `RoomsLocalChangeLoop` is owned by the data-source provider.
- Only one physical wait is in flight per app process. Strict Mode/lifecycle restarts
  generation-invalidate stale work; the old one-shot request may finish, but its response cannot
  mutate state or start an additional loop.
- Ordinary 25-second timeouts immediately reissue without changing visible state.
- Advanced responses invalidate the selected feed and old pinned pagination first, then refetch
  the authoritative workspace, reconcile selection, and reload a fresh feed generation.
- Cursor-ahead recovery refreshes authoritative state before adopting the returned head.
- Transport and `503` failures retain the last valid workspace/feed, show the restrained
  `Live updates reconnecting` label, and retry with bounded 500 ms through 5 s exponential
  backoff.
- Feed items are deduplicated by durable feed-item ID, making explicit command refreshes and
  notification refreshes idempotent together.
- Leaving Local mode, changing the API base/room, or unmounting invalidates the active generation.

## Automated validation

| Validation                                                                                     | Result                                                                       |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Exact pinned advanced, timeout, and cursor-ahead example bytes compared with producer fixtures | PASS                                                                         |
| Rooms web and sidebar suite                                                                    | PASS, 31 files / 122 tests                                                   |
| Desktop Rooms IPC suite                                                                        | PASS, 1 file / 10 tests                                                      |
| Contracts suite                                                                                | PASS, 16 files / 214 tests                                                   |
| Web typecheck                                                                                  | PASS                                                                         |
| Desktop typecheck                                                                              | PASS; two unrelated pre-existing suggestions only                            |
| Contracts typecheck                                                                            | PASS                                                                         |
| Lint                                                                                           | PASS; 12 unrelated pre-existing warnings, no new warning                     |
| Production desktop build                                                                       | PASS                                                                         |
| Scoped formatting and `git diff --check`                                                       | PASS                                                                         |
| Repository-wide `pnpm fmt:check`                                                               | Expected pre-existing failure in four untouched certified workspace fixtures |

The repository-wide formatting exceptions are:

- `apps/web/src/features/rooms/fixtures/workspace-read-v1.json`
- `apps/web/src/features/rooms/fixtures/workspace-read-v1.schema.json`
- `apps/web/src/features/rooms/fixtures/workspace-read-v2.json`
- `apps/web/src/features/rooms/fixtures/workspace-read-v2.schema.json`

They were not rewritten because they are unrelated to this change and outside the APP-01 change
set.

The focused tests cover contract provenance/examples, exact query encoding, malformed and
contradictory responses, one physical wait, timeout reissue, advanced reconciliation, pinned-page
invalidation, durable-ID deduplication, stale lifecycle responses, cursor-ahead recovery,
transport/503 backoff, retained state, and retry cleanup.

## Local implementation proof

The app was first exercised against the exact server SHA in disposable Compose project
`t3rooms-app01-m21-3d480fc`, using Rails `127.0.0.1:33131` and PostgreSQL
`127.0.0.1:56531`. After proof, its containers, network, volume, and unique image
`t3rooms-ledger:app01-m21-3d480fc` were removed.

The four pre-existing stopped Rooms Compose projects and their retained volumes were not altered:

- `t3rooms`
- `t3rooms-app01-m2-75d4f6b`
- `t3rooms-slice1-a-ec952f2`
- `t3rooms-slice1-b-ec952f2`

## Remote deployment

- SSH host: `fcfdev` (aarch64 Linux)
- Checkout: `/home/brw/services/t3rooms`
- Checkout SHA: `3d480fc927676786c5b16249822453aecc5feaa5`, clean
- Compose project: `t3rooms-dogfood`
- Environment file: `/home/brw/services/t3rooms-dogfood.env`, mode `0600`
- Rails image: `t3rooms-ledger:dogfood-3d480fc`
  - Image ID: `sha256:cc531c3e6193da88248294787198a8da74f7c3e804e3ebc0ef3630b1e5e71104`
  - Architecture: `arm64`
  - OCI revision: `3d480fc927676786c5b16249822453aecc5feaa5`
- Rails container:
  `36c017d55e96fcad456bd48b3dc3c939679c5480b566971ef97ca16d20978efc`
- PostgreSQL container:
  `7436593d2f820a2ea4433a054d62299aeb36fca87caafb9a43bdeced883c07e6`
- PostgreSQL image:
  `sha256:db676a0ed906c00f55020fb8999e4fb30c598bf5c3b5c188630aef2812d3f11d`
- Retained volume: `t3rooms-dogfood_ledger-postgres`
- Retained volume data path:
  `/home/monroe/docker-data/volumes/t3rooms-dogfood_ledger-postgres/_data`
- Remote listeners: `127.0.0.1:3000` for Rails and `127.0.0.1:55432` for PostgreSQL
- Puma geometry: minimum 3 threads, maximum 3 threads
- Non-loopback probe to `192.168.1.90:3000`: not reachable

`fcfdev` did not have GitHub credentials. The exact clean published commit was transferred with a
temporary Git bundle; both bundle copies were deleted after checkout verification. No working
directory or uncommitted source was copied.

The durable Local bootstrap produced:

- Room: `room:019fbf3b-8742-7fc2-b021-543a8cf3d379`
- Principal: `h:019fbf3b-8742-7f9f-86ab-f8717a4a141d`
- Display name: `Shared Local user`
- Role: `admin`

## Tunnel

- Local listener: `127.0.0.1:33101`
- Remote target: `127.0.0.1:3000` on `fcfdev`
- Control socket:
  `/Users/brw/Developer/apps/t3code/.t3/rooms-dogfood-live/fcfdev-tunnel.sock`
- Verification-time master PID: `57986`

Recreate/check commands:

```sh
ssh -M \
  -S /Users/brw/Developer/apps/t3code/.t3/rooms-dogfood-live/fcfdev-tunnel.sock \
  -fN \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L 127.0.0.1:33101:127.0.0.1:3000 \
  fcfdev

ssh \
  -S /Users/brw/Developer/apps/t3code/.t3/rooms-dogfood-live/fcfdev-tunnel.sock \
  -O check \
  fcfdev

curl --fail --silent --show-error \
  http://127.0.0.1:33101/rooms/local/workspace
```

The desktop is configured to `http://127.0.0.1:33101`; it never uses a LAN, Tailscale, or direct
remote API URL.

## Runtime acceptance

The desktop launcher enforces a genuine same-checkout macOS singleton/user-data constraint. A
second isolated desktop process could not acquire the app singleton. Per the approved fallback,
the proof used one real desktop UI plus a second API client against the same tunnel. Two-window
desktop proof is **UNRUN**, not passed.

| #   | Acceptance item                                                       | Result                          | Evidence                                                                                                     |
| --- | --------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Both clients discover the same durable room                           | PASS via desktop + API fallback | Both read room `room:019fbf3b-8742-7fc2-b021-543a8cf3d379`                                                   |
| 2   | Client A creates a channel and Client B sees it automatically         | PASS                            | API created `channel:019fbf45-d4df-78c3-8554-f5432c37a3c0`; desktop discovered it without refresh/navigation |
| 3   | Client A sends Markdown and Client B sees it automatically            | PASS                            | API item `feed-item:019fbf46-6b3a-76ec-a07b-5e3a3134a37f`, sequence 4                                        |
| 4   | Client B replies and Client A sees exactly one copy                   | PASS                            | Desktop item `feed-item:019fbf46-d272-7590-8b4f-87766e603337`, sequence 5; API returned one copy             |
| 5   | Ordinary long-poll timeout causes no visible interruption             | PASS                            | Server completed a 25,035 ms timeout with `200`; UI stayed connected and stable                              |
| 6   | Tunnel/server interruption shows reconnecting while retaining content | PASS                            | Screenshots 03 and 05 retain all already reconciled messages                                                 |
| 7   | Restoring tunnel/server catches up without restarting the app         | PASS                            | Tunnel catch-up sequence 6 and server-restart catch-up sequence 7 appeared automatically                     |
| 8   | Server restart preserves durable state and sequence                   | PASS                            | Same room, principal, channel, and four items at sequences 4 through 7 after restart                         |
| 9   | Sample to Local does not leak fixture state                           | PASS                            | Camera Team sample was isolated; Local restored only the durable dogfood workspace                           |
| 10  | V1 and V2 still work                                                  | PASS                            | Both sidebar variants were selected and captured                                                             |
| 11  | A native T3 thread can still be opened/created in V3                  | PASS                            | Native `New T3 Thread` draft route opened with its real composer; no prompt was sent                         |
| -   | Two real desktop windows                                              | UNRUN                           | Same-checkout app singleton prevented the second isolated Electron instance                                  |

Catch-up items:

- Sequence 6: `feed-item:019fbf48-4665-7aaf-a193-5334bce9da44`,
  `**Tunnel outage catch-up** appeared after forwarding resumed.`
- Sequence 7: `feed-item:019fbf49-2abe-7653-b130-a7a990ec0f12`,
  `**Server restart catch-up** preserved the durable stream.`

Both clients use the same generated Local human/admin identity. This proves durable shared state
and notification delivery only. It does not prove multiplayer attribution, authorization, or
native-thread sharing.

## Screenshot evidence

Evidence root:
`/Users/brw/Developer/apps/t3code/.t3/rooms-dogfood-live/screenshots`

1. `01-local-empty-ready.png`
2. `02-live-notification-and-reply.png`
3. `03-tunnel-reconnecting-content-retained.png`
4. `04-tunnel-restored-catch-up.png`
5. `05-server-reconnecting-content-retained.png`
6. `06-server-restored-durable-stream.png`
7. `07-sample-workspace-isolated.png`
8. `08-sidebar-v1.png`
9. `09-sidebar-v2.png`
10. `10-v3-native-thread-draft.png`

The final pushed-revision channel screenshot and final desktop process identity are recorded in
the final APP-01 delivery after the commit is created and the app is relaunched from it.

## Restart commands

Server:

```sh
ssh fcfdev \
  'cd /home/brw/services/t3rooms && docker compose --env-file /home/brw/services/t3rooms-dogfood.env -p t3rooms-dogfood up -d'
```

Tunnel: use the recreate command in the Tunnel section after verifying that the control socket and
local port are not already active.

Desktop:

```sh
cd /Users/brw/Developer/apps/t3code
env \
  T3CODE_DEV_INSTANCE=rooms-dogfood-live \
  T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT=9321 \
  mise x node@24.16.0 -- pnpm exec vp run dev:desktop \
    --home-dir /Users/brw/Developer/apps/t3code/.t3/rooms-dogfood-live
```

The primary scratch home is gitignored and contains no personal `~/.t3` state:

`/Users/brw/Developer/apps/t3code/.t3/rooms-dogfood-live`

## Monroe copy-ready handoff

Monroe needs Tailscale/network reachability to `fcfdev`, SSH authorization on `fcfdev`, the
published T3 Code `integrate/rooms-slice-1` branch, his own scratch T3 home, and the app configured
to his own forwarded loopback URL. He should choose an unused local port; this example uses
`33102`:

```sh
MONROE_T3_HOME="$PWD/.t3/rooms-dogfood-monroe"
mkdir -p "$MONROE_T3_HOME"

ssh -fN \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L 127.0.0.1:33102:127.0.0.1:3000 \
  fcfdev

curl --fail --silent --show-error \
  http://127.0.0.1:33102/rooms/local/workspace

env \
  T3CODE_DEV_INSTANCE=rooms-dogfood-monroe \
  mise x node@24.16.0 -- pnpm exec vp run dev:desktop \
    --home-dir "$MONROE_T3_HOME"
```

In Settings, Monroe must select Sidebar V3, choose Rooms data source `Local`, and set the Local API
base URL to `http://127.0.0.1:33102`.

Do not claim shared native T3 threads or distinct Local identity from this setup. Both clients
currently appear as `Shared Local user`.

## Limitations and usability observations

- Two real desktop windows are unrun because the dev launcher/App singleton rejects the second
  same-checkout instance. The temporary peer scratch home was moved recoverably to Trash.
- A stale retained room-to-project binding appears as `1 project binding unavailable` until a
  current project is registered and rebound. This did not affect channel notifications.
- Intentional tunnel/server outage probes produce expected IPC connection errors in dev logs while
  the bounded retry state is active; the UI retains durable content and recovers.
- Native T3 thread creation was opened only far enough to prove the native composer route remains
  available. No prompt was sent, no credentials were used, and no sharing claim is made.
- The held request cannot be physically aborted through the existing one-shot IPC bridge. It is
  immediately generation-invalidated and ignored when it eventually settles.

## Cleanup and retained geometry

Removed after proof:

- Disposable local Compose project, network, containers, volume, and unique image
- Temporary local and remote Git bundles
- Failed peer desktop process group
- Peer scratch home from its source location; it was moved recoverably to Trash

Intentionally retained for dogfood:

- Clean remote server checkout and `t3rooms-dogfood` Compose project
- Loopback-only Rails/PostgreSQL listeners and persistent dogfood database volume
- One authenticated SSH tunnel and its control socket
- Primary gitignored T3 scratch home and screenshot evidence
- One final desktop instance, relaunched from the pushed app commit and left in V3 / Rooms / Local
  on the durable channel; its final PID/process group is recorded in the final APP-01 delivery
