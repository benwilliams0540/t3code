# Rooms resident-agent connector revision handoff

Date: 2026-08-03

Status: immutable standalone connector candidate ready for independent re-review. This report does
not grant `ACCEPT CONTRACT`, integration approval, or live-use approval.

## Revision identity

- Repository: `/Users/brw/Developer/apps/t3code`
- Branch: `feat/rooms-agent-connector-contract`
- Original connector base: `dd9ea9fee0817366de1d5348d22c88c51a3df7a7`
- Prior implementation: `cc2dad89e42027cac31f22cdcd0d5505b1e7c094`
- Prior handoff: `db12f090c9a035d70d8caba336c16e22d0a0eefd`
- `CONNECTOR_REVISION_IMPLEMENTATION_SHA`:
  `254fdd39b49bb28bd7fc33b3c83ee1560d7eff5e`
- `CONNECTOR_REVISION_HANDOFF_SHA`: the commit containing this report and the published branch tip;
  its exact value is recorded in the publication response because a Git commit cannot embed its own
  hash in its tree.

Publication is a normal fast-forward of this branch only. After publication, local `HEAD`, the
tracking ref, and a direct `ls-remote` read of
`refs/heads/feat/rooms-agent-connector-contract` must all equal the handoff commit.

## Exact implementation paths

- `packages/rooms-agent-connector/src/connector.ts`
- `packages/rooms-agent-connector/src/contextEnvelope.ts`
- `packages/rooms-agent-connector/src/contracts.ts`
- `packages/rooms-agent-connector/src/openClawGatewayTransport.ts`
- `packages/rooms-agent-connector/src/sqliteInvocationStore.ts`
- `packages/rooms-agent-connector/test/connector.test.ts`
- `packages/rooms-agent-connector/test/fakeGatewayTransport.ts`
- `packages/rooms-agent-connector/test/openClawGatewayTransport.test.ts`

No package manifest, lockfile, Rooms UI/server integration, M4 contract, Local human endpoint, or
native T3 path changed.

## Finding 1: configuration epoch is durable and atomic

The reviewed version-1 invocation shape is intentionally superseded before acceptance. Every
`rooms.resident-agent-invocation@1` envelope now freezes the trusted binding's positive integer
`connector.configVersion`. That field participates in canonical envelope JSON, the persisted
envelope hash, file reopen, resume, and exact first-envelope replay. Prior and revised canonical
invocation bytes are not compatible.

SQLite now uses explicit `PRAGMA user_version = 1`. A database with the prior unversioned candidate
tables is rejected with `unsupported_store_schema`; it is never silently read as revised state.
This fail-closed decision is safe here because the connector remains unintegrated and has no live
state to migrate.

Invocation creation validates the enabled binding and exact configuration epoch inside the same
`BEGIN IMMEDIATE` transaction that persists the envelope. Result settlement also uses one
`BEGIN IMMEDIATE` transaction to read the invocation and current binding, compare enabled state and
the frozen epoch, and write the terminal result. A matching enabled epoch accepts the normalized
Gateway outcome. A disabled binding persists `connector_disabled`; an enabled but changed epoch
persists `connector_configuration_changed`. Both are cancelled, contain no reply, and are not
deliverable. The old transient enabled-only precheck was removed from `connector.ts`.

Delivery-receipt creation already used a write transaction; it now additionally requires the
current binding epoch to equal the invocation's frozen epoch. Therefore a configuration change
after successful settlement but before receipt creation revokes delivery atomically.

Deterministic regressions prove a version-1 run can pause after acceptance, observe disablement to
version 2 and re-enablement to version 3, settle only as cancelled, and never receive a receipt. A
new mention created under version 3 still completes and receives its own receipt. A separate test
proves post-success epoch change rejects receipt creation.

## Finding 2: Gateway errors are connector-owned

The pinned OpenClaw source remains `2026.6.2` at
`0b464ff410e56b37270ab7d5a371e152a83e0a41`. Its protocol exposes canonical top-level codes in
`packages/gateway-protocol/src/schema/error-codes.ts` and structured connection failure codes in
`packages/gateway-protocol/src/connect-error-details.ts` under `error.details.code`.

The adapter now recognizes exact token-auth detail codes and `AUTH_SCOPE_MISMATCH` without substring
classification. It maps them to `gateway_authentication_failed` and `gateway_scope_required`.
Canonical `UNAVAILABLE` and `AGENT_TIMEOUT` map to connector-owned unavailable and timeout failures.
Every other remote response error maps to non-retryable `gateway_request_rejected`.

Remote `error.code`, `message`, `retryable`, unknown `details`, and oversized or secret-shaped
values are discarded. The connector's result boundary independently clamps unknown transport error
codes to a fixed connector-owned code, message, and retry policy before persistence.

Regression coverage sends a Gateway error code containing the handshake token, another
secret-shaped sentinel, and 2,000 additional bytes. Neither the public exception, `String(error)`,
serialized error, durable result, reopened SQLite record, database file, nor failed receipt path
contains the sentinel. Exact authentication, scope, and generic rejection mappings are also proved.

## Finding 3: local wait timeout aborts once

After a run ID is accepted, both caller cancellation and a local `agent.wait` request-timer expiry
now issue one best-effort `sessions.abort` for that run and configured agent. The original
`GatewayTransportError` remains terminal even if abort itself fails. A Gateway-returned timeout
continues to return the stable `agent_timed_out` outcome and abort once.

The request-timeout tests use a zero-millisecond injected wait grace and fake in-memory WebSocket;
they do not sleep or access a live Gateway. Coverage proves:

- accepted local wait timeout sends exactly one abort and remains timed out;
- abort failure does not replace the original timeout;
- caller cancellation sends exactly one abort;
- Gateway-returned timeout sends exactly one abort;
- pre-acceptance local timeout sends no abort; and
- resume sends `agent.wait` and exactly one abort without a second `agent` request.

## Validation

Pinned runtime: Node `24.16.0` through `mise`.

```text
mise x node@24.16.0 -- pnpm exec vp test run \
  packages/rooms-agent-connector/test/connector.test.ts \
  packages/rooms-agent-connector/test/openClawGatewayTransport.test.ts
```

Result: 2 files passed, 29 tests passed, 0 failed. The prior candidate had 18 focused tests, so this
revision adds 11 focused regression tests.

```text
mise x node@24.16.0 -- pnpm exec tsgo --noEmit \
  -p packages/rooms-agent-connector/tsconfig.json
```

Result: passed with no diagnostics.

```text
mise x node@24.16.0 -- pnpm exec vp lint packages/rooms-agent-connector
```

Result: passed with no diagnostics.

```text
mise x node@24.16.0 -- pnpm exec vp fmt --check packages/rooms-agent-connector
```

Result: all 14 matched package files use the correct format.

```text
git diff --check
```

Result: passed.

The validation run refreshed ignored workspace `node_modules` state and reran the repository's
Effect `tsgo` prepare patch. It produced no tracked dependency, manifest, or lockfile change.

## Checkout and ownership state

No worktree was created. The canonical checkout is the only listed worktree. No process held an open
file under `packages/rooms-agent-connector` during the publication preflight. Two pre-existing T3
Code development runtimes and the checkout-local `fcfdev` SSH tunnel remained running; they use
runtime state outside this package and were neither stopped nor modified.

The unrelated user-owned untracked file
`reports/monroe-rooms-dogfood-agent-handoff.md` was preserved byte-for-byte and was not staged. At
handoff, that file is the only checkout status entry outside the committed revision report before
publication; no generated connector artifacts are tracked.

## Proof boundaries and remaining dependency

This is standalone contract, SQLite, connector, and in-memory fake-Gateway evidence only. No real
OpenClaw process, credential, `fcfdev` access, room write, live Rooms server, desktop UI, provider
turn, external listener, package publication, PR, merge, deployment, or CI trigger was used.

The connector is not a Rooms consumer yet. Live use remains blocked on the separately reviewed,
authenticated Rooms Agent API/outbox path, a dedicated host-owned read/reply-only agent, and an
explicit integration decision. The existing Local human endpoint remains forbidden for agent
identity. This revision adds no story mutation, governance, generic reply framework, remote
exposure, or native T3 creation/control.

## Independent re-review input

Review the exact range:

```text
db12f090c9a035d70d8caba336c16e22d0a0eefd..254fdd39b49bb28bd7fc33b3c83ee1560d7eff5e
```

Then inspect this report at the published handoff tip and independently verify configuration-epoch
settlement/receipt atomicity, the fixed remote-error map and discarded fields, timeout abort count,
test assertions, branch equality, and proof boundaries. Only that independent reviewer may return
`ACCEPT CONTRACT`.
