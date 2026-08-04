# APP M5 Claw live activation handoff

## Status

**Live read/reply operation works, but the original strict acceptance gate is
not met.** The final resident connector is enabled and healthy, and one
server-attributed Claw reply was delivered. During recovery, two adapter defects
caused two failed invocations/provider runs before the successful cached
settlement. Permanent live totals are therefore three Rooms invocations and two
provider runs, not the required one-and-one. This deviation must not be erased
or described as exact acceptance.

- Repository: `benwilliams0540/t3code`
- Checkout: `/Users/monroe/Developer/GitRepos/t3code`
- Branch: `feat/rooms-m5-claw-live-activation`
- Exact base: `fc35724f4a8c76ae15fb77e04b3438a7e3d397a3`
- Final implementation: `1c981888ecdea88527b09b9d9dfbcc143039b790`
- Server branch: `feat/rooms-m5-claw-live-delivery`
- Server implementation: `4511c58419f0dde56d3149358af91fc2871816bc`

## Frozen contracts and authority

- `rooms.agent-deliveries` v1 schema SHA-256:
  `98f507c0d67ddecda9cafdbc19d9bf8b55649583cd95576a039d9ebd4d950258`
- `rooms.agent-invocations` v1 schema SHA-256:
  `c9579694223e28404f2102f2d404e2baaeb0e9036c01209e711a535302c276d9`
- Delivery route: authenticated `GET /agent/v1/deliveries` with bounded
  `after_seq`/`timeout_ms`; the server derives room, Agent, machine, rights,
  author, mention truth, source identity, timestamp, and trace identity.
- Invocation settlement uses the existing Agent API. Stable delivery,
  invocation, result, reply, receipt, and outbox identities make retries and
  cursor replay idempotent.
- The connector is limited to one room, one allow-listed channel,
  `channel.read`, and `message.send`-equivalent settlement. It has no Local API
  impersonation, story/governance/native-T3 control, generic append, database
  access, or listener.

The authenticated room principal is server-owned:

- Agent: `a:019fca3a-999d-7805-b06f-68d433f4029c`
- Machine: `m:019fca3a-999d-7225-9f21-a4c22ee378b3`
- Active credential metadata:
  `credential:019fca3f-ea40-75d5-81cb-849c76ef13d0`, issued
  `2026-08-04T00:50:14.208Z`, expires `2026-08-11T00:50:14.208Z`
- Superseded credential:
  `credential:019fca3a-999d-726d-b895-05acf3528d7c` (revoked)

The first temporary enrollment used a different Rails signing key, so its
digest could not verify in the live service. It was rotated once through the
live Manager boundary; the Agent/machine pair did not change and the old
credential was revoked. No bearer value was printed or placed in this report.

## Resident package and host state

- Package: `@t3tools/rooms-agent-connector-host@1.0.0`
- Final release:
  `/home/monroe/services/rooms-claw-connector/releases/1c981888ecdea88527b09b9d9dfbcc143039b790`
- Packed artifact SHA-256:
  `bd571126e9c1d9c5ba19606dc817ae196c35ce1407ba4b0130f647c4dacc3262`
- Bundle SHA-256:
  `7f6d39f1eabeb4857d5c3e9077570f6cf1eedc2582df2c1ec6fa681dc4f83deb`
- Runtime: user-local Node `24.16.0`
- Unit: `/home/monroe/.config/systemd/user/rooms-claw-connector.service`
- Config: `/home/monroe/.config/rooms-claw-connector/config.json`
- Rooms secret boundary:
  `/home/monroe/.config/rooms-claw-connector/rooms-agent.token`
- Final state: `/home/monroe/.local/state/rooms-claw-connector/epoch-3`

The unit, config, secret, release, and state have owner-only modes. The Gateway
token stays in the pre-existing owner-only OpenClaw configuration and is
resolved only at handshake. Final unit state is active/running/enabled with
`NRestarts=0`, main PID `362255`, one process, no connector listener, no
PostgreSQL connection, and only loopback Rails/OpenClaw connections. Readiness
is `ready=true`, cursor `35`, Gateway `2026.7.1-2`, release `1c981888...`.

## Live chronology and recovery

All genuine UI actions below were agent-operated through Monroe's isolated
Local-human desktop UI. They were not physically typed by Monroe and were not
injected through the Local API.

1. Non-mention control persisted as `Shared Local user` at source sequence
   `21`; cursor advanced with zero invocation, outbox, or provider delta.
2. One `@Claw` mention persisted at sequence `22`.
3. Epoch 1 created invocation
   `invocation:019fca44-4cab-7714-98c6-63cfb542b3ab` and failed. OpenClaw sent
   accepted and terminal responses under one request ID; the adapter treated
   the terminal response as a mismatch and attempted invalid WebSocket close
   code 1002. Fix `a889b93ac543bc95a542cbcdf3315223d91b7603`
   accepts the terminal shape and uses a valid close boundary.
4. Epoch 2 created invocation
   `invocation:019fca55-940b-78e0-be79-684515217568` and failed. OpenClaw's
   internal session mode left `chat.history` empty even though the terminal
   `agent` response carried the reply. Fix
   `2c026abbb86a20955588ec2db130992246380d4f` resumes a cached terminal run;
   fix `1c981888ecdea88527b09b9d9dfbcc143039b790` captures the terminal payload.
5. Epoch 3 reused the cached provider result without a third provider run.
   Invocation `invocation:019fca5a-49be-7ad2-ac6e-c49ecd7fbaf0`
   succeeded: result sequence `30`, one Agent-attributed reply sequence `31`,
   and receipt/notification sequence `32`. Outbox:
   `outbox:019fca5a-4b03-7f69-a9c1-33ccc3fbd630`.
6. Restarting the connector changed PID `345138 → 346199` with cursor `32`
   and zero provider/server-count delta.
7. Restarting the exact Rails service through its supervisor preserved the
   image and container identity. The connector emitted safe retry categories
   during unavailability, then recovered at cursor `32` with zero duplicate
   provider or settlement work.
8. Resetting only the epoch-3 delivery cursor `32 → 21`, while preserving
   connector and mapping state, replayed deliveries back to `32` with zero
   provider, invocation, outbox, or Agent-message delta.
9. Manager disablement produced event sequence `33`. While disabled, one UI
   `@Claw` negative persisted once as `Shared Local user` at sequence `34` and
   remained stable for 25 seconds. Head moved `33 → 34`; invocations, results,
   receipts, outboxes, Agent messages, and provider runs all had delta zero.
10. The same Agent was re-enabled by Manager event sequence `35`, event ID
    `019fca6b-659c-7b39-b962-660ba55eca4e`. With the local binding still off,
    the connector consumed through cursor `35` with zero work. The exact unit
    was stopped, only the epoch-3 binding toggled `0 → 1`, and the unit restarted
    to final PID `362255` without a new message or provider turn.

Final restoration counts are: server invocations `3`, results `3`, receipts
`3`, outboxes `3`, Agent messages `1`, provider runs `2`; local inbound events
`3`, local invocations `1`, mappings `1`. No new provider message is permitted
merely to make the historical totals look cleaner.

Disabled-gate evidence:
`/Users/monroe/Developer/GitRepos/t3code/.t3/rooms-dogfood-monroe/screenshots/claw-disabled-gate-seq34-20260803.png`

OpenClaw's pre-existing owner-only runtime journal records provider reply
content for `deliver=false`; connector logs contain no bodies or credentials.
This behavior is disclosed rather than suppressed.

## Security and provenance audit

A bounded match-count-only scan found zero actual Rooms bearer and zero actual
Gateway token matches in the app branch diff, server branch diff/report,
systemd unit/process arguments, non-secret connector config, release
manifest/source, connector journal, Rails/OpenClaw relevant logs, image
metadata, and the named backup dump. Expected boundaries contained exactly one
Rooms bearer in the owner-only Rooms secret file and exactly one Gateway token
in the owner-only OpenClaw configuration. Authorization/Bearer source literals
were present only as contract code/documentation (`app diff=1`, `server
diff=4`, `server report=1`, `release source=3`). One app-diff token-value shape
was an inert test fixture; actual-secret matches remained zero. Raw
Unstructured upstream-failure pattern matches were zero.

No credential was copied into Rooms, reports, process arguments, or release
artifacts. No Local API impersonation, database scraping, native-T3 control,
M6A/control change, non-loopback listener, provider credential change, PR, or
merge was performed. The server/database were changed only by the already
recorded M5 deployment and Manager operations. Hermes validation remains
pending and is not claimed.
