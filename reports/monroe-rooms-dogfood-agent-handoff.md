# MON-01 · Rooms dogfood evaluator

This entire document is the task brief for a Codex agent running on Monroe's Mac.

## Objective

Launch one isolated T3 Code desktop instance from the exact published Rooms app revision, connect
it through an authenticated SSH tunnel to the existing loopback-only `t3rooms` dogfood service on
`fcfdev`, verify the durable Local room visually, capture evidence, and leave the tunnel and app
running for Monroe.

This is a run-only evaluation. Do not implement, commit, push, deploy, restart the shared server,
or write to the shared room.

Return `READY FOR MONROE DOGFOOD` only if the exact app revision, tunnel, Local workspace, visible
V3 channel, and final retained processes are all verified. Otherwise return `NOT READY` with the
failed gate and the evidence collected so far.

## Fixed revisions and expected server state

- T3 Code remote: `https://github.com/benwilliams0540/t3code.git`
- App branch: `integrate/rooms-slice-1`
- Exact app SHA: `f72d291b67a5f1f15457e71fbce0273d73c36c87`
- Commit subject: `feat(rooms): refresh local channels live`
- Server SSH alias: `fcfdev`
- Exact server SHA: `3d480fc927676786c5b16249822453aecc5feaa5`
- Remote service path: `/home/brw/services/t3rooms`
- Remote Rails listener: `127.0.0.1:3000`
- Remote PostgreSQL listener: `127.0.0.1:55432`
- Compose project: `t3rooms-dogfood`
- Expected room: `room:019fbf3b-8742-7fc2-b021-543a8cf3d379`
- Expected room name: `Rooms dogfood`
- Expected channel slug: `m21-live-notifications`
- Expected Local principal display name: `Shared Local user`

At packaging time, the remote server checkout was clean at the exact server SHA, PostgreSQL was
healthy, Rails was running, and both listeners were loopback-only. Recheck this live; do not rely
on the packaging-time observation.

Codex execution note: ordinary shell tool calls do not necessarily preserve variables. Either use
one persistent `zsh` session for the preflight/tunnel blocks or repeat the relevant variable
declarations at the start of each call. Never run a block with an unset checkout, scratch, socket,
port, or URL variable.

The implementation audit is checked into the app at:

`reports/app-01-local-change-notifications-handoff.md`

Read it after the exact app revision is checked out.

## Authority and hard boundaries

You are authorized to:

- inspect the existing T3 Code checkout and applicable `AGENTS.md` files;
- fetch and fast-forward only `origin/integrate/rooms-slice-1` to the pinned SHA;
- install the pinned lockfile dependencies only if they are absent;
- use Monroe's existing SSH authorization to create one local port forward to `fcfdev`;
- create one gitignored scratch home inside the T3 Code checkout;
- launch exactly one isolated T3 Code development instance;
- use Browser/Computer Use only to configure and visually validate that local app;
- create screenshots and diagnostic logs only inside the scratch home.

Do not:

- use personal `~/.t3` state;
- use `--share`, live provider credentials, T3 Connect, or any unrelated remote service;
- print, request, copy, or persist SSH/Git/provider credentials;
- create a worktree, branch, commit, tag, push, PR, or deployment;
- edit tracked source, manifests, lockfiles, the server checkout, Compose state, or the database;
- restart or stop `t3rooms-dogfood`;
- expose Rails on `0.0.0.0`, LAN, or Tailscale interfaces;
- connect the desktop directly to an `fcfdev`, LAN, or Tailscale API address;
- start more than one desktop instance or any additional long-poll client;
- send a message, create a channel, or otherwise mutate the shared room without a fresh explicit
  approval from Monroe or Ben;
- stop Ben's app, Ben's tunnel, unrelated SSH sessions, or any process you did not start.

The server supports two held change requests plus one command request. Ben's retained app may
already consume one held request, so Monroe's one app is the maximum additional app client for
this evaluation.

## Stop conditions

Stop and return `NOT READY` if any of these is true:

- the task is not running inside an existing T3 Code checkout;
- applicable `AGENTS.md` instructions conflict with this brief;
- the checkout has tracked or untracked work that would be overwritten or makes exact-revision
  proof ambiguous;
- `origin/integrate/rooms-slice-1` does not resolve to the exact app SHA;
- normal fast-forward checkout is impossible;
- SSH requires credentials or interactive authorization the agent does not already have;
- `fcfdev` is unreachable;
- the remote server checkout is not the exact server SHA or is dirty;
- the workspace does not load through the local tunnel;
- an existing T3 Code development instance would collide with the isolated launch;
- the Rails service appears reachable through a non-loopback remote address;
- completing the task would require killing an unrecorded process or expanding authority.

Do not reset, stash, clean, delete, force-switch, or create a worktree to work around a failed gate.

## 1. Read instructions and establish the checkout

Start from the T3 Code checkout supplied to the Codex task. Do not search personal directories or
clone into an unapproved location.

```sh
MONROE_T3CODE_CHECKOUT="$(git rev-parse --show-toplevel)"
test -f "$MONROE_T3CODE_CHECKOUT/AGENTS.md"
cd "$MONROE_T3CODE_CHECKOUT"
```

Read every applicable `AGENTS.md`, then inspect without changing anything:

```sh
git status --short --branch --untracked-files=all
git remote -v
git worktree list --porcelain
df -h .
```

The canonical checkout must be suitable as-is. Do not create another worktree.

## 2. Verify and select the exact published app revision

Fetch only the integration branch and stop if the fetched SHA differs:

```sh
cd "$MONROE_T3CODE_CHECKOUT"

git fetch origin integrate/rooms-slice-1

MONROE_EXPECTED_APP_SHA=f72d291b67a5f1f15457e71fbce0273d73c36c87
MONROE_FETCHED_APP_SHA="$(git rev-parse FETCH_HEAD)"

test "$MONROE_FETCHED_APP_SHA" = "$MONROE_EXPECTED_APP_SHA"
```

If the local integration branch already exists, select and fast-forward it normally:

```sh
git switch integrate/rooms-slice-1
git merge --ff-only "$MONROE_FETCHED_APP_SHA"
```

If the branch does not exist locally, stop and ask Monroe for approval before creating it. Do not
substitute a detached checkout or another branch.

Verify the exact state:

```sh
test "$(git rev-parse HEAD)" = "$MONROE_EXPECTED_APP_SHA"
test "$(git ls-remote origin refs/heads/integrate/rooms-slice-1 | awk '{print $1}')" = \
  "$MONROE_EXPECTED_APP_SHA"
test -z "$(git status --porcelain)"

git show -s --format='%H%n%s' HEAD
```

Expected subject:

`feat(rooms): refresh local channels live`

## 3. Verify tools and prepare isolated scratch state

Use the pinned toolchain:

```sh
cd "$MONROE_T3CODE_CHECKOUT"

mise x node@24.16.0 -- node --version
mise x node@24.16.0 -- pnpm --version
```

If `node_modules` is absent, the only permitted bootstrap is:

```sh
mise x node@24.16.0 -- pnpm install --frozen-lockfile
```

Do not change the lockfile. Recheck `git status --porcelain` after installation.

Create the one approved scratch home:

```sh
MONROE_T3_HOME="$MONROE_T3CODE_CHECKOUT/.t3/rooms-dogfood-monroe"
MONROE_SCREENSHOTS="$MONROE_T3_HOME/screenshots"
MONROE_TUNNEL_SOCKET="$MONROE_T3_HOME/fcfdev-tunnel.sock"

mkdir -p "$MONROE_SCREENSHOTS"
git check-ignore -v "$MONROE_T3_HOME"
```

The ignore check must prove that `.t3` covers this path. Do not proceed if it would become tracked.

## 4. Verify SSH and the remote server read-only

Do not enter or request credentials. Use `BatchMode` so missing authorization fails safely:

```sh
ssh -G fcfdev >/dev/null
ssh -o BatchMode=yes -o ConnectTimeout=10 fcfdev true
```

Verify the server checkout and loopback listeners without modifying them:

```sh
ssh -o BatchMode=yes fcfdev '
  set -e
  cd /home/brw/services/t3rooms
  test "$(git rev-parse HEAD)" = 3d480fc927676786c5b16249822453aecc5feaa5
  test -z "$(git status --porcelain)"
  docker inspect t3rooms-dogfood-db-1 \
    --format "db={{.State.Status}}/{{.State.Health.Status}}"
  docker inspect t3rooms-dogfood-ledger-1 \
    --format "ledger={{.State.Status}}"
  ss -ltn | grep -E "127.0.0.1:(3000|55432)"
'
```

Expected service states are `db=running/healthy` and `ledger=running`. Both published addresses
must begin with `127.0.0.1`.

## 5. Establish one SSH tunnel

Prefer local port `33102`. If it is occupied, choose one unused port from `33103` through `33112`
and record it. Do not stop the process occupying another port.

```sh
MONROE_ROOMS_PORT=
for MONROE_PORT_CANDIDATE in 33102 33103 33104 33105 33106 33107 33108 33109 33110 33111 33112; do
  if ! lsof -nP -iTCP:"$MONROE_PORT_CANDIDATE" -sTCP:LISTEN >/dev/null 2>&1; then
    MONROE_ROOMS_PORT="$MONROE_PORT_CANDIDATE"
    break
  fi
done
test -n "$MONROE_ROOMS_PORT"

MONROE_ROOMS_URL="http://127.0.0.1:$MONROE_ROOMS_PORT"
printf 'MONROE_ROOMS_URL=%s\n' "$MONROE_ROOMS_URL"
```

If the control socket already exists, first run:

```sh
ssh -S "$MONROE_TUNNEL_SOCKET" -O check fcfdev
```

- If it reports a running master, inspect its process and `-L` argument. Reuse it only if it is
  Monroe's matching `127.0.0.1:<recorded-port>:127.0.0.1:3000` tunnel.
- If the socket is stale, move it aside to a timestamped name inside the same scratch directory.
- If its ownership or purpose is ambiguous, stop. Do not kill it.

Start exactly one tunnel:

```sh
ssh -M \
  -S "$MONROE_TUNNEL_SOCKET" \
  -fN \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -L "127.0.0.1:$MONROE_ROOMS_PORT:127.0.0.1:3000" \
  fcfdev
```

Record and verify the master identity:

```sh
ssh -S "$MONROE_TUNNEL_SOCKET" -O check fcfdev
lsof -nP -iTCP:"$MONROE_ROOMS_PORT" -sTCP:LISTEN
```

Verify the workspace through the tunnel:

```sh
curl --fail --silent --show-error \
  "$MONROE_ROOMS_URL/rooms/local/workspace"
```

The response must be `status: ready`, room `Rooms dogfood`, principal `Shared Local user`, and
include channel `m21-live-notifications`.

## 6. Preflight the desktop singleton and debug port

The development app has a real macOS singleton constraint. Before launching, inspect:

```sh
pgrep -fl 'T3 Code \(Dev\)|dist-electron/main.cjs' || true
lsof -nP -iTCP:9322 -sTCP:LISTEN || true
```

If an existing T3 Code development instance or debug listener is present, do not kill it. Ask
Monroe to close it or supply a different approved checkout/session strategy, then stop this run.

## 7. Launch exactly one isolated desktop instance

Run this from a persistent PTY/terminal session and record the returned session identifier,
launcher PID, and process group. Never stop it by name or pattern.

```sh
cd "$MONROE_T3CODE_CHECKOUT"

printf 'launcher_pid=%s\n' "$$"
printf 'launcher_pgid=%s\n' "$(ps -o pgid= -p $$ | tr -d ' ')"

exec env \
  T3CODE_DEV_INSTANCE=rooms-dogfood-monroe \
  T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT=9322 \
  mise x node@24.16.0 -- pnpm exec vp run dev:desktop \
    --home-dir "$MONROE_T3_HOME"
```

Wait for `app ready`, `backend ready`, and `main window created`. Startup warnings about optional
provider CLIs do not authorize provider login or credential use.

## 8. Configure the local app visually

Use Browser/Computer Use only against the isolated local desktop window.

1. Open **Settings** from the bottom of the app sidebar.
2. Open **Beta features**.
3. Under **Sidebar version**, select **Version 3**.
4. Under **Rooms content**, select **Local workspace**.
5. Under **Local Rooms API**, enter the exact `MONROE_ROOMS_URL` printed above.
6. Wait for **Current source state: ready**.
7. Return to Rooms and open **Rooms dogfood**.
8. Open channel **m21-live-notifications**.

Do not register a project, create a native thread, send a prompt, create a channel, or send a
message during this read-only handoff.

## 9. Required visual and runtime validation

Verify all of the following:

- V3 is the only selected sidebar version; V1/V2 are not simultaneously visible.
- The app is in Rooms / Local mode, not Sample.
- Room name is `Rooms dogfood`.
- Channel is `m21-live-notifications`.
- The visible feed contains exactly one copy of each existing item:
  - sequence 4: `Client A API observed by desktop without refresh.`
  - sequence 5: `Desktop reply arrived once and only once.`
  - sequence 6: `Tunnel outage catch-up appeared after forwarding resumed.`
  - sequence 7: `Server restart catch-up preserved the durable stream.`
- The principal is displayed as `Shared Local user`.
- No persistent `Live updates reconnecting` label remains after connection settles.
- The visible feed does not flicker or disappear across at least one ordinary 25-second wait.
- The app remains responsive and the sidebar collapse, back, and forward controls remain visible.

Capture at least:

1. V3 / Rooms / Local with the full channel and sequences 4–7 visible.
2. Settings / Beta features showing Version 3, Local workspace, the loopback API URL, and source
   state `ready` without exposing credentials.

Save evidence only under:

`$MONROE_T3_HOME/screenshots`

Use the available Computer Use screenshot facility. If it cannot save directly, use the standard
macOS screenshot tool only with Monroe's already-granted screen-capture permission. Do not install
a capture utility.

## 10. Final technical checks

With the app left on the real channel, verify:

```sh
cd "$MONROE_T3CODE_CHECKOUT"

test "$(git rev-parse HEAD)" = f72d291b67a5f1f15457e71fbce0273d73c36c87
test -z "$(git status --porcelain)"

ssh -S "$MONROE_TUNNEL_SOCKET" -O check fcfdev
lsof -nP -iTCP:"$MONROE_ROOMS_PORT"

curl --fail --silent --show-error \
  "$MONROE_ROOMS_URL/rooms/local/workspace"
```

Confirm from `lsof` that one desktop connection is using the tunnel. Do not start a separate
change-wait request to test the poll; the desktop already owns the permitted Monroe-side wait.

Inspect the persistent launch output and, if available, the renderer console. Report any repeated
`Maximum update depth exceeded`, `MenuGroupContext is missing`, Local API transport, or unhandled
React errors. Do not suppress errors merely to produce a clean screenshot.

Recheck disk and retained scratch size:

```sh
du -sh "$MONROE_T3_HOME" "$MONROE_SCREENSHOTS"
df -h "$MONROE_T3CODE_CHECKOUT"
```

## 11. Successful final state

On success, leave running:

- the existing `t3rooms-dogfood` service on `fcfdev`, untouched;
- one Monroe SSH tunnel through the recorded control socket;
- one T3 Code desktop instance from the exact app SHA;
- V3 / Rooms / Local with `m21-live-notifications` open;
- Monroe's one gitignored scratch home and screenshot evidence.

Do not stop the successful tunnel or desktop instance during cleanup.

If the launch fails and cleanup is necessary, stop only resources created during this run:

- stop the tunnel with `ssh -S "$MONROE_TUNNEL_SOCKET" -O exit fcfdev` only if this run created it;
- stop only the exact recorded app process group, after re-verifying its command and scratch path;
- never use `pkill`, `killall`, or a name/pattern match.

## Required final response

Return a concise evidence-backed handoff containing:

- `READY FOR MONROE DOGFOOD` or `NOT READY`;
- checkout path, branch, exact local SHA, and exact remote SHA;
- initial/final dirty status and any pre-existing paths;
- SSH reachability result and verified remote server SHA;
- selected local port and `MONROE_ROOMS_URL`;
- tunnel control socket, master PID/process identity, and check result;
- scratch home and disk usage;
- desktop launcher PID/PGID, Electron PID, backend PID, and persistent terminal session;
- visible room, channel, principal, and sequences;
- ordinary-timeout stability result;
- renderer/terminal error findings;
- screenshot paths;
- confirmation that no source, server, database, shared room, credentials, or personal `~/.t3`
  state was modified;
- intentionally retained processes and exact commands to reconnect to them;
- blockers and human decisions still required.

State these limitations explicitly:

- Local identity is shared as `Shared Local user`; this is not multiplayer identity.
- Native T3 threads are not shared by this handoff.
- No shared-room write or cross-client notification mutation was performed unless separately and
  explicitly authorized.
- A warning about an unavailable project binding or no registered T3 projects may be scratch-local
  usability friction; do not “fix” it by modifying a real project during this run.
