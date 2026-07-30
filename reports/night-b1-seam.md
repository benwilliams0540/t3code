# Night B1 — raw orchestration event seam

**RUNNABLE: YES — the contract and WebSocket seam run under focused integration tests.**
**LIVE SCRATCH TURN: not yet observed; the C2 adapter is the remaining live client.**

## Run it tomorrow

The pasteable proof available on this branch is:

```bash
cd /Users/brw/Developer/apps/t3code &&
pnpm exec vp test run packages/contracts/src/orchestration.test.ts apps/server/src/server.test.ts -t 'subscribeEvents|raw orchestration'
```

Expected summary:

```text
Test Files  2 passed (2)
Tests  9 passed | 155 skipped (164)
```

To start the real server without touching the live T3 home:

```bash
cd /Users/brw/Developer/apps/t3code
T3CODE_HOME=/Users/brw/t3-scratch T3CODE_DEV_INSTANCE=rooms pnpm dev
```

The dev runner prints the actual HTTP and WebSocket ports. In another terminal,
create the one-time credential for the same scratch database:

```bash
cd /Users/brw/Developer/apps/t3code
pnpm --filter t3 exec node src/bin.ts auth pairing create \
  --base-dir /Users/brw/t3-scratch \
  --label rooms-adapter \
  --json
```

Exchange that credential for only `orchestration:read`, request
`POST /api/auth/websocket-ticket`, connect to `/ws?wsTicket=...`, then call:

```json
{
  "_tag": "orchestration.subscribeEvents",
  "payload": {
    "afterSequence": 0,
    "requestCompletionMarker": true
  }
}
```

The exact Effect RPC framing is intentionally delegated to C2 rather than
duplicated in a throwaway observer. A successful stream emits each persisted
`OrchestrationEvent` as `{ "kind": "event", "event": ... }`, then
`{ "kind": "synchronized" }`, then live event frames.

## What landed

- `orchestration.subscribeEvents` is part of the shared method set and
  `WsRpcGroup`.
- The input requires an exclusive non-negative cursor; `0` means the beginning.
- Output carries the unprojected 26-type `OrchestrationEvent` union or a
  synchronization marker.
- The server attaches the live subscription first, captures the durable head,
  replays through that head, drops the exact replay/live overlap, and then
  tails.
- The exhaustive authorization table requires `orchestration:read`.

Current source moved beyond the feasibility pin: authorization mappings now
live in `apps/server/src/auth/RpcAuthorization.ts`, so the correct minimal
change is four production files, not the report's predicted three.

## Batching and backpressure

Historical replay stays lazy and uses the event store's existing fixed
1,000-event pages. The handler passes only the captured replay length, so it
cannot chase a moving head.

Each subscriber has a 1,024-event dropping queue at the WebSocket boundary.
Nothing is silently dropped: when that queue fills, the stream fails with
`OrchestrationGetSnapshotError`; the client can then reconnect from its last
applied exclusive cursor. This keeps memory bounded without turning a slow consumer
into missing history. The overflow behavior is covered by a deterministic
integration test.

## Verification

Observed on 2026-07-30:

```text
$ pnpm exec vp test run packages/contracts/src/orchestration.test.ts apps/server/src/server.test.ts -t 'subscribeEvents|raw orchestration'
Test Files  2 passed (2)
Tests  9 passed | 155 skipped (164)
Duration  3.43s
```

Also observed:

- `pnpm --filter @t3tools/contracts typecheck` — exit 0.
- `pnpm --filter t3 typecheck` — exit 0, with six pre-existing Effect
  suggestions in `src/orchestration/decider.ts`.
- Targeted `vp lint` over the six changed TypeScript files — exit 0.
- `git diff --check` — exit 0.

The machine has Node `v25.9.0`; the repository requests `^24.13.1`, so pnpm
printed an engine warning. Tests and both typechecks still passed.

## Not verified

- No live scratch T3 server was started and no human turn was sent during B1.
  C2 must perform that real connection and record its result.
- Relay, Tailscale, and SSH transports were not exercised. They share the same
  authenticated WebSocket RPC boundary, but that remains source-supported
  rather than runtime-observed here.
