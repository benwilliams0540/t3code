# Rooms M5 resident connector integration handoff

Date: 2026-08-03 (America/New_York)

Status:

```text
M5 RESIDENT CONNECTOR CONSUMER READY FOR ISOLATED ACCEPTANCE
AUTOMATED CONTRACT AND PACKAGING PROOF PASSED
REAL CLAW AND HERMES ACCEPTANCE NOT YET CLAIMED
```

## Immutable inputs and integration order

- App repository: `/Users/brw/Developer/apps/t3code`
- Target branch: `feat/rooms-m5-agent-integration`
- Exact M4 base: `44e4b18846788204c1a51eb7b16a3cb2fd401eca`
- Published M5C producer: `b95e97d6992d39b8fb8d0fcaa2d605b56e7701c1`
- Accepted server M5B producer: `68d1958b5b56a760b2e7df6dad03ed1cb8173292`
- Accepted server read/write-compatible implementation:
  `86e56a3a8a23d124b89a467306317d513f8c134d`
- Pinned server report head: `4d05e2654b500fd3aef94be8676ab35039cae8a8`
- Published standalone connector handoff:
  `e88932dbd4b58cc57c8d2a259bd9169d23226632`
- Accepted standalone connector commits, in order:
  - `cc2dad89e42027cac31f22cdcd0d5505b1e7c094`
  - `254fdd39b49bb28bd7fc33b3c83ee1560d7eff5e`
- Post-M5C independent review disposition: `ACCEPT CONTRACT`, recorded in the
  control repository at
  `reports/monroe-claw-connector-post-m5c-rereview.md`.

M5C was committed and published before connector integration. Only the two
accepted implementation commits were explicitly cherry-picked. Their local
integration commits are:

```text
cc2dad89e42027cac31f22cdcd0d5505b1e7c094
  -> daec66238cef2684436a8a378c509e11b27ca759

254fdd39b49bb28bd7fc33b3c83ee1560d7eff5e
  -> b4d17e52a60d43e3cd52a6afacc06a6530003da3
```

At `b4d17e52a60d43e3cd52a6afacc06a6530003da3`, the integrated
`packages/rooms-agent-connector` tree and the accepted source tree at
`254fdd39b49bb28bd7fc33b3c83ee1560d7eff5e` both resolve to:

```text
40b7c189fa4a277cff3be55b7ef9fa2cd7843dbb
```

The consumer implementation and this report are a later, separate commit. Its
exact implementation SHA is the commit containing this report and is recorded
by the publication result because a commit cannot contain its own hash.

## Consumer implementation

Added:

```text
packages/rooms-agent-connector/src/roomsServerConsumer.ts
packages/rooms-agent-connector/test/roomsServerConsumer.test.ts
reports/app-m5-resident-connector-handoff.md
```

Updated:

```text
packages/rooms-agent-connector/package.json
packages/rooms-agent-connector/src/index.ts
pnpm-lock.yaml
```

The new consumer composes, without duplicating semantic implementations:

- the accepted provider-neutral `RoomsResidentAgentConnector` and its
  `ResidentAgentGatewayTransport` seam;
- the frozen `rooms.agent-invocations` v1 HTTP start/get/finish contract; and
- the shared M5C `@t3tools/rooms-agent-api` client for invocation-bounded
  channel context and the same retry-stable work-tool envelope used by
  internal and external MCP.

The invocation HTTP client accepts only credential-free loopback HTTP origins,
puts the bearer only in the authorization header, validates the exact contract
version and terminal settlement shape, and preserves only structured server
errors. It does not log or serialize the bearer.

## Server authority and recovery state

The consumer starts the Rooms server invocation before requesting bounded
context or invoking a provider. The server-issued invocation ID is then the
authoritative ID for:

- M5C context and work-tool headers;
- terminal result identity;
- delivery receipt identity;
- reply/outbox settlement; and
- restart and duplicate-delivery decisions.

Connector-local deterministic invocation IDs remain transport-recovery keys
inside the accepted connector only. They are never sent to the Rooms server as
authoritative invocation IDs and never produce a connector-local reply after
server settlement.

`RoomsServerInvocationMappingStore` is a bounded recovery map. It stores only:

- a SHA-256 digest of the stable delivery identity;
- the acknowledged server invocation ID;
- the server-derived connector ID; and
- the frozen positive configuration epoch.

It stores no room transcript, reply, result body, receipt, story, membership,
credential, or authority state. After restart, the consumer uses the mapping
to GET the server invocation. A terminal server invocation ends processing
without another provider turn or finish. A running invocation resumes through
the accepted connector recovery path and finishes the same server identity.

An exact repeated finish uses the same derived result and receipt IDs. A
different terminal server settlement, connector identity, epoch, result ID, or
receipt ID is rejected as a conflict. The server remains the only authority
for terminal state, reply attribution, receipt, outbox, and notification.

## Configuration epoch and disablement

Connector `configVersion` is passed exactly as
`X-Rooms-Configuration-Epoch` at invocation start. The consumer validates that
the server response returns the same connector ID and epoch, constructs the
shared M5C client with that server-issued invocation envelope, and uses the
same frozen epoch at finish.

Before context or provider work, the current local recovery binding must still
be enabled at the acknowledged epoch. Disablement, disable/re-enable, or any
epoch change cancels acknowledged queued work with `connector_cancelled`
without invoking the provider. The accepted connector independently rechecks
enablement and epoch atomically during local transport settlement. A running
server invocation may therefore receive its one safe cancellation result, but
new disabled work never starts a server invocation.

## Exhaustive safe failure normalization

The consumer freezes exactly the five durable server codes:

```text
connector_cancelled
connector_internal
provider_rate_limited
provider_timeout
provider_unavailable
```

Mapping is exhaustive and direct:

- connector timeout statuses -> `provider_timeout`;
- connector unavailable/network statuses -> `provider_unavailable`;
- exact recognized rate-limit codes -> `provider_rate_limited`;
- cancellation, disablement, superseded configuration, and epoch change ->
  `connector_cancelled`;
- every remaining connector, protocol, authentication, decoding, context, or
  internal failure -> `connector_internal`.

Provider/Gateway error codes, bodies, exception text, URLs, stack traces, and
safe-message strings are not copied into the server safe-failure field. Server
terminal status is exactly `succeeded` or `failed`.

## Focused automated proof

Pinned runtime: Node `24.16.0` via `npx --package=node@24.16.0`.

Combined M5C, connector, consumer, and internal MCP tests:

```text
pnpm exec vp test run \
  packages/rooms-agent-api/src/client.test.ts \
  packages/rooms-agent-api/src/toolkit.test.ts \
  packages/rooms-agent-mcp/src/server.test.ts \
  packages/rooms-agent-connector/test/connector.test.ts \
  packages/rooms-agent-connector/test/openClawGatewayTransport.test.ts \
  packages/rooms-agent-connector/test/roomsServerConsumer.test.ts \
  apps/server/src/mcp/McpHttpServer.test.ts

7 files passed
50 tests passed
0 failed
```

The consumer contributes seven focused tests proving:

- exact invocation headers and `configVersion == configuration_epoch`;
- loopback-only HTTP and structured safe server errors;
- server start before context and provider invocation;
- server-issued invocation identity through M5C context and settlement;
- one result, receipt, and attributed server reply with zero local receipts;
- restart plus duplicate delivery produces no second provider turn, invocation,
  finish, receipt, or reply;
- disablement/epoch change wins before queued provider work;
- the exhaustive five-code map discards provider-controlled text; and
- retry-stable, role-separated delivery/result/receipt identities.

Changed-package typechecks:

```text
pnpm exec tsgo --noEmit -p packages/rooms-agent-api/tsconfig.json
pnpm exec tsgo --noEmit -p packages/rooms-agent-mcp/tsconfig.json
pnpm exec tsgo --noEmit -p packages/rooms-agent-connector/tsconfig.json
pnpm exec tsgo --noEmit -p apps/server/tsconfig.json
```

All exited zero. The app-server check reported six pre-existing Effect
suggestions in `apps/server/src/orchestration/decider.ts`; they are outside
this change and are not diagnostics or failures.

Packaging:

```text
pnpm --filter t3 build:bundle
```

Passed. The server bundle produced its normal ten ignored `dist` artifacts;
the primary bundle was 4.27 MB and the full ignored output was 13.49 MB.

Connector path lint, formatting, frozen-lockfile install, and `git diff
--check` also pass. Final publication re-runs the affected checks after this
report is formatted.

## Scope and honest acceptance boundary

This commit adds no model-facing governance, membership, role, credential,
connector control, generic reply/append, workflow-definition, projection
regeneration, remote exposure, deployment, or native T3 create/steer/control
surface. `rooms.agent-work` remains version 1 with exactly nine operations;
`rooms.agent-stories` remains version 2 with exactly four reads.

No accepted server source or image changed. No experimental Hermes branch was
merged, and no Hermes transport is invented without a pinned goal-owned local
runtime/protocol. No PR, deployment, CI trigger, LAN/Tailscale listener,
personal `~/.t3/userdata`, M3/M4 stack, `fcfdev` tunnel, or unrelated T3
runtime was touched.

This is automated connector-consumer and app-packaging proof. It is not an
exact-image HTTP integration run and does not prove a real Claw or Hermes
provider turn. Those gates remain downstream and must be reported separately.
