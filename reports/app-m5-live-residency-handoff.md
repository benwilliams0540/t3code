# Rooms M5 isolated residency acceptance handoff

Date: 2026-08-03 (America/New_York)

Status:

```text
M5 PLATFORM PUBLISHED
EXACT-IMAGE AUTOMATED INTEGRATION PASSED
REAL CLAW ACCEPTANCE BLOCKED: NO APPROVED-SCOPE RUNTIME OR CONFIGURATION
REAL HERMES ACCEPTANCE BLOCKED: NO APPROVED-SCOPE RUNTIME OR PROTOCOL
```

This report deliberately separates exact-image automated integration from
real-provider acceptance. The fake transport evidence below does not close the
Claw or Hermes gates.

## Published app inputs

- Repository: `/Users/brw/Developer/apps/t3code`
- Branch: `feat/rooms-m5-agent-integration`
- Exact M4 base: `44e4b18846788204c1a51eb7b16a3cb2fd401eca`
- Published M5C producer: `b95e97d6992d39b8fb8d0fcaa2d605b56e7701c1`
- Accepted connector cherry-picks:
  - `daec66238cef2684436a8a378c509e11b27ca759`
  - `b4d17e52a60d43e3cd52a6afacc06a6530003da3`
- Published connector consumer and handoff:
  `d9855f2c477a59dbc0f26adf8f3feb50f17a7a09`
- This live-evidence report: the later commit containing this file; its exact
  SHA is recorded by publication because a commit cannot contain its own hash.

Before this report, local `HEAD`, its upstream, and direct remote
`refs/heads/feat/rooms-m5-agent-integration` all equaled
`d9855f2c477a59dbc0f26adf8f3feb50f17a7a09`.

## Exact accepted server image

The retained immutable image was inspected before use:

```text
tag: t3rooms-m5-agent-read-compat:86e56a3
image id: sha256:3fc331f4a7d691a582e6848f6f8542bb0c39193e5720c471f867fb48e27dc85d
OCI revision: 86e56a3a8a23d124b89a467306317d513f8c134d
reported size: 248459496 bytes
Ruby: 4.0.6
```

The isolated stack used only fresh task-owned resources:

```text
ledger container: t3rooms-m5-acceptance-ledger
database container: t3rooms-m5-acceptance-db
network: t3rooms-m5-acceptance
volume: t3rooms-m5-acceptance-postgres
ledger: 127.0.0.1:33104
PostgreSQL: 127.0.0.1:55441
final database directory size: 63.6 MB
```

Docker inspection confirmed the running ledger container used the exact image
ID and exposed port 3000 only as `127.0.0.1:33104`. PostgreSQL exposed 5432
only as `127.0.0.1:55441`. Health returned HTTP 200 before use and after an
explicit ledger-container restart.

## Real Agent identity and bounded server state

The exact image's explicit test-only M5B runtime bootstrap issued one real,
one-time `read_write` Agent credential in the isolated database. No fake
authenticator or Local-human fallback was used.

Safe identifiers:

```text
room: room:019fc86e-e3f0-7da9-ba4e-0b481799e67e
channel: channel:019fc86e-e429-7e18-8ab2-82ee07dcf135
Agent: a:019fc86e-e3e8-79ae-9fb9-b485c08c5754
machine: m:019fc86e-e3e8-75c4-b2de-68d5e4595db8
source event: 019fc86e-e42e-7f1c-80e4-f6f6ebc79fe2
source sequence: 7
configuration epoch: 7
```

Two earlier fresh task-owned databases were discarded after runner-only
post-issuance reporting mistakes made their one-time plaintext credentials
unrecoverable: the first used `Rooms::Event` instead of top-level `Event`; the
second treated the already-normalized `occurred_at` string as a time object.
Neither failure reached the HTTP consumer, changed source, or exposed a token.
Both failed databases, containers, volumes, and networks were destroyed before
the successful proof used a third empty database.

## Exact-image automated integration

A secret-free Node proof runner loaded the committed consumer directly from
the published checkout under Node `24.16.0`. It used:

- the real one-time bearer;
- `RoomsInvocationHttpClient` over loopback HTTP;
- `RoomsServerInvocationMappingStore` in checkout-local gitignored scratch;
- `RoomsResidentAgentConsumer` and the accepted connector;
- `makeRoomsAgentClientFactory` from the shared M5C implementation;
- the server-bounded `rooms_channel_context_get` read;
- two exact `rooms_story_create` calls with one stable tool-call identity; and
- an explicitly labeled in-process fake provider transport returning one
  Markdown reply.

The first run returned:

```text
proof kind: exact_image_with_fake_transport
consumer result: settled
server invocation: invocation:019fc872-31ca-7ff9-8e8d-38ede6180794
server status: succeeded
server configuration epoch: 7
result: m5d:result:1a3f58e9a3c2fb041497217eb6512d19e07976e6ee0958f033ab2a0b93d89cc7
receipt: m5d:receipt:1a3f58e9a3c2fb041497217eb6512d19e07976e6ee0958f033ab2a0b93d89cc7
story: story:019fc872-3217-7bd1-b459-b36f96d7f8b7
story retry replayed: true
fake provider invocations: 1
result event sequence: 12
reply event sequence: 13
receipt event sequence: 14
notification sequence: 14
```

Result and receipt are distinct role-prefixed stable IDs even though their
suffix hashes intentionally derive from the same frozen invocation/delivery
tuple.

An immediate exact delivery replay returned the same terminal server
invocation and invoked the fake provider zero times. The ledger container was
then restarted against the same database. A post-restart replay again returned
the same server invocation, result, receipt, reply sequence, and notification
sequence, with zero provider invocations.

The server's final successful-settlement facts were:

```text
event count: 14
invocation rows in room: 1
outbox rows in room: 1
invocation status: succeeded
configuration epoch: 7
reply actor: a:019fc86e-e3e8-79ae-9fb9-b485c08c5754
```

Relevant room event counts were exactly one each for
`agent.invocation-started`, `agent.tool-executed`, `task.created`,
`task.thread-linked`, `agent.invocation-finished`, and
`agent.delivery-receipt-recorded`; there were two `message.created` events,
the original human message and the one Agent-attributed reply. Exact story and
delivery retries appended nothing.

This proves the accepted exact image and published app consumer compose over a
real Agent credential with bounded context, stable M5C work identity, server
authority, atomic reply/outbox/receipt settlement, replay, restart, and
attribution. It remains fake-provider evidence.

## Disablement and later mention

The isolated server then disabled the Agent through its authoritative
credential manager and appended one later human message in the same channel:

```text
later source event: 019fc874-3d2e-7240-b431-ab7157953a37
later source sequence: 16
message: @Claw this mention is after disablement.
```

A new invocation start using the same real bearer returned:

```text
HTTP 401
error: authentication_required
message: verified agent authentication is required
retryable: false
```

Counts remained:

```text
events: 16
invocations: 1
outboxes: 1
room messages: 3
```

The three room messages are the original human message, the one successful
Agent reply, and the later disabled human mention. There is no second Agent
reply, invocation, result, receipt, or outbox.

## Credential exclusion

The one-time bearer was retained only in one proof shell, never printed, and
unset before cleanup. Exact-byte scans returned:

```text
Rails logs: 0 matches
complete PostgreSQL dump: 0 matches
ledger and database container inspection: 0 matches
connector mapping and recovery scratch: 0 matches
```

## Real Claw gate: blocked

Approved-scope discovery found no running OpenClaw/Claw process, no
`openclaw` or `claw` executable, no global package/formula, and no OpenClaw
checkout in the bounded search under `/Users/brw/Developer`. The only
checked-in OpenClaw material is the reviewed protocol transport and its
fake-WebSocket tests.

No goal-owned, already-authorized Gateway token or configuration was present
in the M5 scratch scope. Existing T3 checkout-local states belong to protected
M3/M4/dogfood runtimes and were not read for provider credentials or
repurposed. Personal configuration was not searched or used. No login,
credential reset, provider install, or broader authorization was attempted.

Therefore no real Claw provider turn occurred. The required real mention,
provider invocation, shared-tool story creation, archived-thread authorization
pair, reply, replay/restart, and disabled-later-mention sequence is not
accepted as live evidence.

## Real Hermes gate: blocked

Approved-scope discovery found no running Hermes provider process, no `hermes`
or `hermes-cli` executable, no global package/formula, and no provider checkout
or pinned protocol in the bounded search under `/Users/brw/Developer`. The
`hermes-parser`, `hermes-estree`, and React Native Hermes compiler packages in
`node_modules` are JavaScript-engine build dependencies, not a resident Agent
provider.

No experimental Hermes branch was merged and no adapter was invented without
a pinned goal-owned runtime/protocol. No personal/shared credentials or login
flow were accessed.

Therefore no real Hermes provider turn occurred. The required real mention,
M5C read, attributed reply, idempotent settlement, shared-semantics proof, and
disabled-later-mention sequence remains blocked.

## Cleanup and preservation

Removed after evidence:

```text
t3rooms-m5-acceptance-ledger
t3rooms-m5-acceptance-db
t3rooms-m5-acceptance
t3rooms-m5-acceptance-postgres
127.0.0.1:33104 listener
127.0.0.1:55441 listener
.t3/rooms-m5-acceptance scratch files and directory
```

The exact accepted image remains retained for review. No global Docker prune
ran. The protected M3 stack on `33102/55439`, M4 stack on `33103/55440`,
`fcfdev` tunnel on `33101`, and existing T3 development processes were not
stopped, repurposed, or modified. Personal `~/.t3/userdata` was not accessed.

The unrelated untracked
`reports/monroe-rooms-dogfood-agent-handoff.md` remains preserved and is not
part of this report commit.

## Honest milestone boundary

The strongest accurate checkpoint is:

```text
M5 PLATFORM PUBLISHED — LIVE ACCEPTANCE BLOCKED
```

The published platform and exact-image automated path are ready. M5 is not
complete because neither real Claw nor real Hermes acceptance is available in
the approved local scope. This report claims no remote exposure, deployment,
production multiplayer, generalized provider support, governance, generic
reply framework, native T3 control, or later trust milestone.
