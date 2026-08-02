# Rooms resident-agent connector: interface and adapter handoff

## Outcome

The first two non-live slices are implemented and prepared for review on the dedicated branch
`feat/rooms-agent-connector-contract`, based exactly on
`dd9ea9fee0817366de1d5348d22c88c51a3df7a7`:

1. a typed, durable read/reply-only connector core; and
2. a production-shaped OpenClaw Gateway WebSocket adapter tested entirely against an in-memory fake.

This work does **not** connect the package to the Rooms server or desktop UI. It does not call a real
OpenClaw Gateway, access `fcfdev`, use credentials, expose a listener, or write to a room. A live reply
remains blocked on a distinct authenticated Rooms Agent API; the existing Local human endpoint must
not be reused.

## Branch and ownership boundary

- Checkout: `/Users/monroe/Developer/GitRepos/t3code`
- Producer remote: `https://github.com/benwilliams0540/t3code.git`
- Producer branch: `feat/rooms-agent-connector-contract`
- Exact base: `dd9ea9fee0817366de1d5348d22c88c51a3df7a7`
- Implementation commit: `cc2dad89e42027cac31f22cdcd0d5505b1e7c094`
- Handoff report: this file in the immediately following documentation commit on the producer
  branch.
- Publication: the dedicated branch is pushed directly to `origin` using the authenticated
  `StoneHub` account after Ben granted branch-write access.
- Access history: the first push was rejected with HTTP 403 before access was granted. No alternate
  repository or credential was created; a dry-run against the same `origin` succeeded after the
  permission change, before the real push.
- No PR, merge, rebase, deployment, or integration-branch write was performed.
- New ownership surface: `packages/rooms-agent-connector/**` and this report.
- Workspace metadata: `pnpm-lock.yaml` gained only the new workspace importer.
- Ben-owned Rooms activity, channel, thread, sidebar, composer, data-source, and desktop IPC paths
  were not edited.

The implementation commit is the immutable review target. The report commit adds no runtime or
contract code. Reviewers can reproduce the exact implementation diff with:

```sh
git diff --stat dd9ea9fee0817366de1d5348d22c88c51a3df7a7..cc2dad89e42027cac31f22cdcd0d5505b1e7c094
git diff --check dd9ea9fee0817366de1d5348d22c88c51a3df7a7..cc2dad89e42027cac31f22cdcd0d5505b1e7c094
```

## Verified OpenClaw seam

The adapter targets the direct OpenClaw Gateway RPC interface, not Discord, Telegram, the Local
human Rooms endpoint, or an inferred HTTP API. The inspected local source snapshot was OpenClaw
`2026.6.2` at `0b464ff410e56b37270ab7d5a371e152a83e0a41` under
`/Users/monroe/Developer/GitRepos/openclaw-android-build/openclaw-src`.

Authoritative source files inspected:

- `packages/gateway-protocol/src/version.ts` and `schema/frames.ts`: protocol v4 and the
  challenge-first `connect` exchange.
- `packages/gateway-protocol/src/schema/agent.ts`: `agent`, stable `idempotencyKey`, agent/session
  selection, delivery suppression, and bounded timeout.
- `packages/gateway-protocol/src/schema/agents-models-skills.ts`: `agent.wait`.
- `packages/gateway-protocol/src/schema/logs-chat.ts`: `chat.history`.
- `packages/gateway-protocol/src/schema/sessions.ts`: `sessions.abort`.
- `docs/gateway/protocol.md`: the direct-loopback, token-authenticated `gateway-client` backend
  exception and required operator scopes.

The real host/runtime inventory was intentionally not refreshed in this slice. Compatibility with
the eventual installed runtime must be rechecked before a live probe.

## Contracts

### Trusted binding

One server-owned binding is provisioned by trusted configuration, never by a message caller:

```ts
interface ConnectorBinding {
  connectorId: string;
  connectorVersion: number;
  roomId: string;
  channelId: string;
  agentPrincipalId: `a:${string}`;
  openClawHostId: string;
  openClawAgentId: string;
  enabled: boolean;
  configVersion: number;
}
```

The binding scopes the connector to exactly one room and one allow-listed channel. Its only Rooms
capabilities are the exact tuple `channel.read`, `message.send`. The agent principal and stable
OpenClaw host/agent target come from this binding; inbound/result callers cannot select those
identities. The frozen invocation carries that target, and the transport fails before opening a
socket if its configured host/agent target differs.

### Durable inbound event

Contract `rooms.resident-agent-inbound@1` contains connector, room, channel, source message ID and
sequence, source author principal, structured mention flag, bounded Markdown body, sanitized
attachment/link metadata, timestamp, and trace ID. Attachments contain filename, media type, byte
size, and SHA-256 only. Links must be credential-free HTTPS, lose query/fragment data, and reject
local/literal hosts. The connector does not fetch attachments or links.

Only a structured mention authored by a human principal (`h:`) may invoke the agent. Non-mentions
are durably recorded without invocation; agent-authored mentions are ignored to prevent loops.

### Bounded invocation envelope

Contract `rooms.resident-agent-invocation@1` freezes:

- connector/version, stable invocation ID, exact room/channel and source mention;
- at most 20 messages from that same room/channel and no later than the source sequence;
- at most 4,096 UTF-8 bytes per body and 24,576 UTF-8 body bytes total;
- at most 8 sanitized attachments and 8 sanitized links per message;
- deterministic ordering/truncation plus omitted-count metadata;
- exact capabilities, creation/deadline instants, trace ID, and attempt.

The source mention is retained exactly once even when older context is truncated. Canonical JSON
and UTF-8 byte bounds make retry payloads deterministic.

### Stable ID, states, result, and receipt

`invocationId` is a deterministic UUIDv8-shaped value derived from the connector ID and source
message ID under a versioned namespace. Its lifecycle is explicit:

```text
pending -> running -> succeeded
                   -> failed
                   -> unavailable
```

Cancelled and timed-out adapter results persist as `failed` with distinct result status and safe
failure code. A successful result contains exactly one non-empty Markdown reply, bounded to 16,384
UTF-8 bytes. Empty and `NO_REPLY` output is an explicit failure. Unknown result fields—including a
forged actor ID—are rejected.

The delivery receipt is created only after a succeeded result with a reply. It includes invocation,
room/channel, `inReplyToSourceId`, the server-created reply message ID, trace ID, and the agent
principal resolved from the trusted binding. Its API deliberately accepts no actor/principal field.

## Persistence and idempotency

`SqliteInvocationStore` uses foreign keys, WAL, a busy timeout, and `BEGIN IMMEDIATE` transactions.
It owns four tables:

| Table                | Durable purpose                                            | Key rules                                                              |
| -------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| `connector_bindings` | one trusted connector/room/channel/agent binding           | connector PK; unique agent principal; versioned enable CAS             |
| `inbound_events`     | normalized source delivery                                 | composite source PK; unique connector + source ID; exact replay hash   |
| `invocations`        | frozen envelope, claim lease, Gateway run, terminal result | invocation PK; unique connector + source ID; atomic claim/reclaim      |
| `delivery_receipts`  | proof of the one eventual Rooms reply                      | invocation PK; unique reply ID; unique connector + channel + source ID |

Exact duplicates return the existing record. Reusing a stable source key with changed event bytes is
an idempotency conflict, not a second delivery. Concurrent same-source creation keeps the first
frozen envelope; later contenders use that record. Claims use an atomic compare-and-set and a private
claim token. An expired accepted run resumes by persisted Gateway run ID; it never issues a second
`agent` request. If a worker dies before acceptance was durably recorded, the invocation becomes
`unavailable/gateway_acceptance_unknown` rather than risking a duplicate run. Disable uses a
config-version CAS: it blocks new/pending work and revokes any later reply from an already-running
adapter call. A disabled binding cannot create a delivery receipt.

## Gateway adapter

`OpenClawGatewayTransport` accepts only a credential-free `ws://` loopback origin. The credential is
provided by an async host callback at handshake time; it is not part of Rooms contracts, SQLite,
URLs, errors, or snapshots.

The adapter:

1. requires a protocol-v4 challenge and authenticates as `gateway-client` / `backend`;
2. verifies `agent`, `agent.wait`, `chat.history`, and `sessions.abort` are advertised;
3. sends one `agent` request using the invocation ID as OpenClaw's `idempotencyKey`;
4. uses a connector-owned session key and configured OpenClaw agent ID;
5. sets `deliver: false`, `disableMessageTool: true`, lightweight bootstrap, internal session
   effects, and no prompt-mode expansion;
6. persists the accepted run ID before waiting;
7. waits, reads the last assistant response from normalized history, and sanitizes/bounds it;
8. resumes a persisted run without another `agent` request; and
9. aborts best-effort on timeout, cancellation, or acceptance-persistence failure.

Frames are text JSON only, request IDs and run IDs are correlated, negotiated payload limits are
clamped to a connector-owned hard ceiling, and malformed, duplicate-challenge, binary, oversized,
or uncorrelated frames fail closed with safe
errors. The raw Gateway scopes are the minimum scopes required by those RPC methods, but this alone
does not sandbox the selected OpenClaw agent.

Before live use, the host owner must provision a dedicated `rooms` OpenClaw agent with no provider
delivery, no skills, no story/native-T3 controls, and no tools beyond the model response path. That
host-owned token/agent configuration must stay outside Rooms. Hermes or another runtime can replace
OpenClaw later by implementing `ResidentAgentGatewayTransport`; the Rooms contracts and persistence
do not depend on the vendor.

## Failure behavior

- Missing/disabled binding or wrong room/channel: reject or record-without-invoking as appropriate.
- Non-mention or non-human mention: no adapter call.
- Duplicate source with identical bytes: replay existing state/result; no second call.
- Duplicate source with changed bytes: fail closed with idempotency conflict.
- Concurrent delivery: one SQLite claimant; others see running/terminal state.
- Gateway unavailable/auth/scope/protocol/method failure: explicit unavailable or failed result,
  safe message only, no receipt.
- Timeout/cancellation: explicit result plus best-effort abort, no receipt.
- Crash after accepted run: resume `agent.wait`/history using the persisted run ID.
- Crash before accepted run ID persists: unavailable rather than duplicate invocation.
- Empty/`NO_REPLY` response: explicit failed result; no Rooms delivery receipt.
- Oversized/invalid reply or forged result actor: fail closed.
- Room disabled during a run: the transport may settle, but its reply becomes a cancelled result and
  cannot receive a delivery receipt; future mentions remain disabled.

## Verification completed

Focused command:

```sh
mise x node@24.16.0 -- pnpm exec vp test run \
  packages/rooms-agent-connector/test/connector.test.ts \
  packages/rooms-agent-connector/test/openClawGatewayTransport.test.ts
```

Result: 2 files, 18 tests passed. Coverage includes mention, non-mention, exact duplicate delivery,
changed duplicate rejection, disabled connector, non-human loop prevention, unavailable connector,
bounded same-channel context, file-backed reopen/resume, concurrent creation/claim, disable
revocation,
server-derived reply attribution, receipt replay/conflict, protocol-v4 request shape, resume without
reinvoke, timeout/abort, remote URL rejection, missing methods, wrong correlation, binary frames,
oversized replies, and credential-leak sentinels.

Focused type check:

```sh
mise x node@24.16.0 -- pnpm exec tsgo --noEmit \
  -p packages/rooms-agent-connector/tsconfig.json
```

Result: passed with no diagnostics.

Focused lint:

```sh
mise x node@24.16.0 -- pnpm exec vp lint packages/rooms-agent-connector
```

Result: passed with no diagnostics.

These are contract/unit, durable-store, and fake-Gateway proofs. They are not live OpenClaw proof,
Rooms server integration proof, rendered attribution proof, cross-client proof, or shared-room proof.

## Review disposition requested

Review the implementation commit as an independently owned, non-live incubation result. The
recommended disposition is **accept the connector contracts and adapter boundary for later
producer integration**, while keeping the branch unmerged until the `t3rooms` Agent API/outbox is
reviewed and published. A review may instead request a bounded revision or split; it must not infer
authority to call OpenClaw, provision credentials, touch `fcfdev`, expose a listener, write to a
room, or open a PR.

Exact review inputs:

- Producer repository and branch: `benwilliams0540/t3code`,
  `feat/rooms-agent-connector-contract`
- Producer implementation SHA: `cc2dad89e42027cac31f22cdcd0d5505b1e7c094`
- Contract ids and version: `rooms.resident-agent-inbound@1`,
  `rooms.resident-agent-invocation@1`, `rooms.resident-agent-result@1`
- Contract/runtime paths: `packages/rooms-agent-connector/src/**`
- Focused proof paths: `packages/rooms-agent-connector/test/**`
- Consumer status: no Rooms server or desktop consumer exists in this branch
- Manual acceptance still required: server Agent API/outbox review, then separately authorized
  fake-connector integration before any live Gateway probe
- Known stop boundary: no Local-human endpoint fallback and no caller-supplied actor identity

## Smallest safe next slice

Add a server-owned Agent API and outbox transaction in the Rooms service—not the Local human
endpoint—with these responsibilities:

1. authenticate the connector host as this binding and resolve connector/room/channel/principal
   server-side;
2. emit the versioned inbound event only for the allow-listed channel;
3. accept exactly one result for the stable invocation ID;
4. atomically insert one agent-authored room message plus its `in_reply_to_source_id` and delivery
   receipt; and
5. publish the normal durable channel-change event so existing Rooms readers render it.

First add server contract/schema tests with a fake connector. Only after that review should a
loopback live Gateway probe be separately authorized. A real host token, `fcfdev` access, external
listener, Local-human endpoint fallback, and shared-room write are all outside this handoff.
