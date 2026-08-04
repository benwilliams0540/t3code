# Monroe Claw resident activation handoff

## Result

The private resident connector host is implemented, tested, packaged, accepted
against the exact isolated server producer with a real one-time Agent credential
and fake Gateway, and staged owner-only on fcfdev. The exact server producer is
now deployed to dogfood. This handoff does not claim Agent enrollment, a running
connector service, real provider execution, or human-message acceptance.

- Repository: `benwilliams0540/t3code`
- Checkout: `/Users/monroe/Developer/GitRepos/t3code`
- Branch: `feat/rooms-m5-claw-live-activation`
- Exact base: `fc35724f4a8c76ae15fb77e04b3438a7e3d397a3`
- Implementation commit: `7437362b74ffeae945188ff621d58d8e51b51eb5`
- Implementation subject: `feat(rooms): add resident connector host`
- Package: `@t3tools/rooms-agent-connector-host@1.0.0`
- Executable: `dist/bin.mjs`
- Bundle SHA-256: `df80f5caaddb9743efd0a2f1a10291d19476f53653f5088729868d681335d795`
- Packed artifact SHA-256: `ab034578cabf68767aea186012f1be9e260235f3a100e826f6c37197a57e930d`
- Required runtime: Node `24.16.0`

## Frozen producer/consumer pair

- Server branch: `feat/rooms-m5-claw-live-delivery`
- Server implementation: `4511c58419f0dde56d3149358af91fc2871816bc`
- Server report head: `5242b571803f32ed404ef913d5a480ec1a47be6d`
- `rooms.agent-deliveries` v1 schema SHA-256:
  `98f507c0d67ddecda9cafdbc19d9bf8b55649583cd95576a039d9ebd4d950258`
- `rooms.agent-invocations` v1 schema SHA-256:
  `c9579694223e28404f2102f2d404e2baaeb0e9036c01209e711a535302c276d9`
- OpenClaw: `2026.7.1-2 (0790d9f)`, protocol v4
- Required Gateway methods: `agent`, `agent.wait`, `chat.history`,
  `sessions.abort`

The delivery parser pins the server implementation, contract ID, version,
schema URI, and schema hash. Any extra field, identity mismatch, page-bound
violation, out-of-order source sequence, nonempty attachment/link metadata, or
Agent-authored mention fails closed.

## Host behavior

The package adds one non-listening process that:

1. reads an owner-only strict JSON configuration;
2. reads the Rooms bearer from a separate mode-0600 file;
3. resolves the Gateway token at handshake time from the existing mode-0600
   OpenClaw configuration without copying it;
4. long-polls only `http://127.0.0.1:3000/agent/v1/deliveries`;
5. verifies the server-derived room, Agent, machine, and read-write profile;
6. filters to exactly one configured channel before connector handling;
7. maps server-owned mention truth into the accepted inbound contract;
8. reuses `RoomsResidentAgentConsumer`, `RoomsResidentAgentConnector`,
   `OpenClawGatewayTransport`, `RoomsInvocationHttpClient`, the Agent API
   client factory, and the accepted SQLite stores;
9. processes each bounded page sequentially and checkpoints only after the
   whole page succeeds; and
10. logs only stable event/status/error categories and counts, never message
    bodies or tokens.

A partial-batch crash leaves the cursor unchanged. Replaying the page uses the
existing stable delivery, invocation, Gateway idempotency, result, receipt,
outbox, and reply identities. If a previously accepted invocation still owns a
live lease, the page is deferred and not checkpointed so recovery can resume
it. SIGINT/SIGTERM abort a held poll and active provider work through the
existing cancellation boundary.

The local connector binding is one room plus one channel. The server credential
remains room-scoped under the existing credential contract. Agent replies are
created only by the server-authoritative invocation finish transaction; the
host has no generic message/event append operation.

## Security boundary

- Only credential-free loopback HTTP and WebSocket origins are accepted.
- Config values cannot supply actor, role, membership, capability, or reply
  attribution to the server.
- The model receives only the bounded accepted context envelope and the fixed
  `channel.read`/`message.send`-equivalent capability pair.
- Source attachments and links are empty because the current immutable message
  schema has no such metadata.
- Story, governance, enrollment, connector-control, generic message, generic
  append, and native-T3-control tools are absent.
- The Local-human API is not called.
- The connector opens no listener and reads no database.
- No Rooms, OpenClaw, Git, SSH, or provider credential is checked in, printed,
  copied into Rooms, or placed in process arguments.

Live inspection on fcfdev confirmed only that
`/home/monroe/.openclaw/openclaw.json` is a regular owner-1001 mode-0600 file
and that `gateway.auth.token` has string type. Its value was never printed or
copied.

## Configuration and state

The configuration contract is `rooms.resident-agent-host-config` v1. It pins:

- connector ID/version/configuration epoch;
- loopback Rooms URL and external bearer-file path;
- room, channel, Agent, and machine principal IDs;
- genuine native T3 environment/project/thread IDs;
- loopback Gateway URL, existing OpenClaw config path, host ID, and Agent ID;
- owner-only state directory; and
- explicit initial cursor, long-poll timeout, and bounded retry delay.

The host creates three separate owner-protected SQLite files:

- `delivery-cursor.sqlite` for the pinned monotonic feed cursor;
- `connector.sqlite` for accepted binding/inbound/invocation/receipt state; and
- `server-mappings.sqlite` for stable delivery-to-server-invocation mapping.

The intended fcfdev layout is:

```text
/home/monroe/services/rooms-claw-connector/releases/7437362b74ffeae945188ff621d58d8e51b51eb5/
/home/monroe/services/rooms-claw-connector/current
/home/monroe/.config/rooms-claw-connector/config.json        mode 0600
/home/monroe/.config/rooms-claw-connector/rooms-agent.token  mode 0600
/home/monroe/.local/state/rooms-claw-connector/              mode 0700
```

The intended user unit is `rooms-claw-connector.service`, owned by `monroe`,
with the exact user-local Node 24.16.0 executable and release path. The release
path and `current` symlink are staged, but no config, secret, SQLite state, or
unit has been installed.

## Readiness and packaging

`rooms-agent-connector-host --config <absolute-path> --check` verifies:

- strict config and loopback-only URLs;
- owner/mode of the Rooms and OpenClaw secret sources;
- Rails `/up` on loopback;
- authenticated delivery contract and binding identity without cursor movement;
- OpenClaw protocol-v4 handshake and required methods without a provider turn;
  and
- supported local SQLite schemas and the exact connector binding.

The check may initialize owner-only local SQLite schema/binding state. It does
not move the cursor, invoke OpenClaw, write to Rooms, or start a listener.

The package builds through pinned esbuild `0.28.1` into one 681,585-byte ESM
bundle with Node built-ins external and all workspace runtime code embedded.
`npm pack` under the pinned Node toolchain produces a three-file artifact:
`README.md`, `package.json`, and `dist/bin.mjs`. The extracted artifact was
executed and returned the expected redacted `configuration_unreadable` failure
for an absent config, proving the packed entry point rather than only source.

## Validation evidence

- Host focused suite: 4 files, 10 tests passed.
- Existing connector suite: 3 files, 36 tests passed.
- Existing Agent API suite: 2 files, 8 tests passed.
- Combined: 9 files, 54 tests passed.
- Host, connector, and Agent API typechecks: passed.
- Targeted host lint: passed with unused-disable reporting.
- Host plus lockfile formatting: passed.
- Frozen pnpm lockfile install and supply-chain policy: passed.
- Bundle build and extracted tarball execution: passed.
- `git diff --check`: passed before implementation commit.

Host tests cover strict schema/catalog drift, server-owned mention mapping,
empty metadata, unavailable delivery, shutdown cancellation, owner/mode secret
checks, cursor persistence, checkpoint conflict, schema corruption, channel
allow-listing, sequential non-mention/mention delivery, partial-batch crash and
restart replay, and identity mismatch. The accepted connector/API suites cover
stable invocation identity, one provider acceptance, retry/recovery,
unavailable results, disablement, duplicate delivery, bounded context, server
settlement, exactly-one reply, and Agent attribution.

## Independent compatibility proof

The packed implementation ran on fcfdev against exact ARM64 server image
`sha256:fd8418a45bd66f584f46d2686a7ea21f115e00e76ecdd2ed3c8e91fe76a7608b`,
whose OCI revision was exactly server implementation `4511c584...`. PostgreSQL,
Rails, the credential, connector state, and fake Gateway were task-owned and
isolated from dogfood. Rails used loopback `127.0.0.1:33120`; the fake Gateway
used loopback `127.0.0.1:18790`.

Safe proof identity:

- room: `room:019fca1d-30e2-77f5-9a72-e5a1b9a39522`
- channel: `channel:019fca1d-31ed-75a1-97d9-7a30d56f22a3`
- credential: `credential:019fca1d-321c-73fb-9752-eb4f5f0b9e3b`
- Agent: `a:019fca1d-321c-726e-9469-740c66e7250e`
- machine: `m:019fca1d-321c-70b5-a1b0-7232cc93e268`
- invocation: `invocation:019fca1f-5508-7844-a8ec-234e08b1f3e2`
- outbox: `outbox:019fca1f-567c-7f55-bfcf-6ba0f1528c37`
- result: `m5d:result:b58474cb132efed6b54e323c8bf7a563e397433bc20a275214c0cadc32337f3f`
- receipt: `m5d:receipt:b58474cb132efed6b54e323c8bf7a563e397433bc20a275214c0cadc32337f3f`
- Agent reply event sequence: `11`

Acceptance evidence:

1. A non-mention advanced cursor `6 → 7` with one message, zero invocation,
   zero outbox, and no fake-Gateway state file.
2. One human `@Claw` mention advanced cursor `7 → 8`, created exactly one
   succeeded invocation, fetched two bounded context messages, and produced one
   fake provider acceptance/wait/history.
3. Exactly one Agent-attributed reply, result, receipt, and outbox were created;
   result sequence `10`, reply sequence `11`, receipt/notification sequence
   `12`.
4. The next fresh host process observed the Agent reply through the delivery
   feed as `mentioned=false`, advanced cursor `8 → 12`, and did not reinvoke.
5. Resetting only the isolated poll cursor `12 → 7` while preserving dedupe
   state replayed two deliveries and returned to `12` with one mapping and zero
   provider or settlement delta.
6. Restarting the exact Rails container preserved cursor and invocation truth;
   a fresh host process timed out cleanly at `12` with zero provider delta.
7. Manager disablement followed by a later human mention returned
   `authentication_required`, left cursor `12`, and left invocation/outbox/fake
   provider counts at exactly one.

Final isolated counts were four human/Agent messages, one invocation, one
outbox, one local invocation, one server mapping, three recorded allow-listed
inbound events, and fake Gateway counts `accepted=1`, `waits=1`, `histories=1`,
`aborts=0`.

The Rooms bearer and Gateway token had zero matches in retained cache artifacts
and process arguments. The proof credential/state, Rails and PostgreSQL
containers, Docker network, and fake Gateway were removed. Safe evidence is
retained under
`/home/monroe/.cache/t3rooms-claw-live/isolated-evidence-4511c58-7437362/`;
the exact tested image remains for deployment comparison.

## Live staging and server deployment

User-local fcfdev runtime is installed without changing the system Ruby, system
Node, or OpenClaw runtime: mise `2026.8.1`, Node `24.16.0`, npm `11.13.0`, Ruby
`4.0.6`, and Bundler `4.0.16` under Unix user `monroe`.

The exact packed artifact was hash-verified after transfer and extracted to:

`/home/monroe/services/rooms-claw-connector/releases/7437362b74ffeae945188ff621d58d8e51b51eb5/`

The release root, release directory, manifest, and extracted package are
owner-only. `current` points to the exact implementation release. The manifest
records app SHA `7437362b...`, package version `1.0.0`, artifact and bundle
hashes, Node `24.16.0`, and `package/dist/bin.mjs`. No Rooms bearer, Gateway
token, native T3 ID, provider credential, or message body is present.

The dogfood Rails service now runs exact isolated-proof image
`sha256:fd8418a45bd66f584f46d2686a7ea21f115e00e76ecdd2ed3c8e91fe76a7608b`
with full OCI revision `4511c58419f0dde56d3149358af91fc2871816bc`.
Rails and PostgreSQL are healthy and remain published only on
`127.0.0.1:3000` and `127.0.0.1:55432`. Migrations are current. Final
pre-enrollment counts match the backup point: 16 room events, 12 messages, zero
invocations, and zero outboxes. See server report head `5242b571...` for the
backup, Git transport, exact image, and deployment audit.

## Remaining activation gates

1. Monroe must select real native T3 environment, project, and thread IDs.
   Rooms channel IDs are not substitutes and will not be inferred.
2. Enroll one seven-day room-scoped `read_write` Agent through the verified
   Local human admin and atomically install its one-time bearer.
3. Install and prove the single user service.
4. Monroe must author the ordinary control, `@Claw` mention, and disabled
   mention in the normal Rooms UI. The connector must not impersonate him.

No dogfood room message, Agent credential, invocation, provider turn, result,
receipt, outbox, or reply was created during implementation, isolated proof, or
server deployment. Ben's M6A branch was not checked out, edited, rebased,
merged, or pushed.
