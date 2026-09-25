# ThreadSpace product and architecture review

Status: cloud design review for [#26](https://github.com/benwilliams0540/t3code/issues/26), written 2026-09-25. It is not an implementation, deployment, or change to branch defaults.

- **Source:** client `main` at `bdd40b607e4b715f0478b4fd9522dc27255b4a1e`, read from source only. No install, build, test or server run.
- **Issues read:** #26 and its comments, #31, #11, #22 and #23. There are no overlapping open PRs; #28 is an upstream-sync report.
- **Reviewer:** Claude Code cloud session, model `claude-opus-5-5`, effort `xhigh`.
- **Private server:** the room server (`benwilliams0540/t3rooms`, Rails) was not accessible. **Every server conclusion here is provisional**, drawn from the client's contracts and this repo's docs. It needs the separately prepared private-backend review.

Evidence labels: **[src]** implemented in source · **[test]** fixture or fake test · **[hist]** docs or reports only · **[none]** not found.

## 1. The experience to build first

The smallest replacement for "copying input between chat services" is one room where people talk, share what they see, and ask agents that work in a member's real project:

1. Monroe, Ben and a third teammate, each on their own installed app and account, open room *Splats* on its host. For now that is the existing server; later, a laptop.
2. Ben pastes a screenshot of a broken layout into `#general` and writes "@Monroe's agents why does this wrap?"
3. Monroe's own T3 environment, where *splats-web* is bound to the room, receives the mention. It starts a normal T3 turn in that project under Monroe's approval mode, with the recent channel text and the screenshot as input.
4. The reply appears in the channel attributed to **Monroe's agents · Codex in splats-web**. It shows working / replied / failed states and links to the T3 thread. Any edits stay uncommitted in Monroe's checkout, and nothing is pushed.
5. Ben writes "@Monroe's agents show the diff". The room shows the current uncommitted diff from Monroe's environment, stamped with environment, checkout, base revision and capture time, under a read-only grant Monroe gave the room.
6. A nontechnical teammate reads the thread and asks the persistent agent (Claw) to summarize the decision.
7. When Monroe's laptop sleeps, "Monroe's agents" show *environment offline*. The conversation continues on the room host.

Screen sharing, boards, federation and parity lists are not needed for this.

## 2. What exists: gap map

| Capability | Status | Anchors |
| --- | --- | --- |
| Signed-in shared conversation over HTTP JSON (v1 routes, v2 feed); long-poll change loop with 0.5–5 s backoff | [src][test] | `apps/web/src/features/rooms/dataSource/humanSharedClient.ts:315-519`, `localChangesLoop.ts:47-175`; tests `humanSharedClient.test.ts`, `localChangesLoop.test.ts` |
| Electron main process as the only network hop; route, method and query allow-list | [src][test] | `apps/desktop/src/ipc/methods/roomsHuman.ts:71-122`, `packages/shared/src/roomsTransport.ts:65-121` |
| Runtime server profile and local sessions scoped per server ID (one profile, token in localStorage) | [src][test] | `dataSource/serverProfile.ts:10-112` |
| Room creation, invite enrollment, reconnect banner | [src]; live proof [hist] | `shell/RoomsCreateRoomButton.tsx:28-75`, `shell/RoomsHumanAccessPanel.tsx`, `reports/app-local-sign-in-live-proof.md` |
| Idempotent send (stable request ID until the draft changes) | [src][test] | `channel/stableCommand.ts:14-30`, `channel/RoomsLocalChannelFeed.tsx:149-183` |
| Agent turn lifecycle in the feed (running / delayed / replied / failed) | [src][test] | `packages/client-runtime/src/rooms/agentTurns.ts:96-196`, `channel/RoomsLocalChannelFeed.tsx:78-92` |
| Persistent agent (Claw) via the OpenClaw connector: lease, restart resume, duplicate suppression | [src][test]; one live reply [hist] | `packages/rooms-agent-connector/src/connector.ts:25-26,211-329`, `reports/app-m5-claw-live-activation-handoff.md` |
| Claw doing work | **no**: `promptMode: "none"`, no message tool, channel text plus host health only | `packages/rooms-agent-connector/src/openClawGatewayTransport.ts:851-858` |
| Rooms MCP toolkit on T3's `/mcp` | [src][test]; work tools refuse without an invocation envelope, and it has no message tool | `apps/server/src/mcp/McpHttpServer.ts:222-235`, `packages/rooms-agent-api/src/client.ts:302-312`, `contracts.ts:177-189` |
| "Monroe's agents" owner attribution | [none]: the principal has no owner field, and a delegate only appears in the Sample fixture | `dataSource/humanSharedContract.ts:35-40`, `fixtures/workspace-read-v2.json` |
| A T3 turn posting to a room, or a room message starting a T3 turn | [none] | `threads/RoomsNativeThreadSurface.tsx:126`; `docs/rooms/cleanup-ledger.md` (mirroring never run) |
| Channel attachments | [none]: text-only composer; payload is `{ body_markdown }`; connector host requires empty `attachments` | `channel/RoomsLocalChannelFeed.tsx:191`, `dataSource/localChannelsContract.ts:37`, `packages/rooms-agent-connector-host/src/deliveryClient.ts:122-125` |
| Room file store | [src][test] for story evidence: CAS upload ≤ 5 MiB | `packages/shared/src/roomsTransport.ts:107`, `apps/desktop/src/ipc/methods/roomsLocal.ts:16,81-89` |
| T3 image attachments (reusable UI and validation) | [src][test] | `packages/contracts/src/orchestration.ts:142-180`, `apps/web/src/components/chat/ChatComposer.tsx` |
| Room ↔ project binding | [src][test], **device-local only** (localStorage); it filters your own threads | `threads/roomProjectBindings.ts:17-48` |
| Read-only project/diff access for others | [none]: T3 reads exist but are environment-scoped (`orchestration:read` covers files, diffs and `filesystem.browse`), and file APIs take a caller `cwd` | `apps/server/src/auth/RpcAuthorization.ts:25-60`, `apps/server/src/ws.ts:1077-1094,1603-1640` |
| Desktop hosting the T3 server on LAN, Tailscale or relay | [src][test] | `apps/desktop/src/backend/DesktopServerExposure.ts:30-133`, `docs/user/remote-access.md` |
| Desktop hosting a room | [none]: forwards requests only; no Rails or Postgres packaging in this repo | `apps/desktop/src/ipc/methods/roomsLocal.ts:34-66` |

Client defects found while tracing, each small and in scope for slice 1:

- **The product path defaults to Sample.** The data-source mode is stored with default `"sample"`, and error panels still offer Sample (`dataSource/RoomsDataSourceProvider.tsx:307-311`, `shell/RoomsWorkspaceShell.tsx:351,501`).
- **Shared cursor recovery can never run.** The change loop recovers from `change_cursor_ahead` only when the error has `headSeq` (`localChangesLoop.ts:149-152`). The Shared decoder builds errors without it (`humanSharedClient.ts:179-196`); only the Local decoder copies `head_seq` (`localChannelsClient.ts:176`). A Shared 409 therefore retries forever.
- **A live refresh reloads only the first 100-item page** (`channel/RoomsLocalChannelFeed.tsx:415-423,467-470`), and "Load more" pages forward from there. If the server orders the feed oldest-first, new messages in a long channel stay hidden until someone pages. *Server order unverified.*
- **Invite issuance has no stable retry ID** (`shell/RoomsHumanWorkspaceSurface.tsx:60`). The `Idempotency-Replayed` header is parsed but never shown.

## 3. The three biggest bottlenecks

1. **Architecture: the room and the work live in different servers.** The T3 server already ships inside the desktop app. It is reachable over LAN, Tailscale and relay, and owns projects, files, diffs, attachments and provider agents. It plays no part in a room. The room lives in a separate Rails + Postgres service that the installed app can't run. Every #26 capability (#31 host/join, #22 files, #23 project context, #11 agents) has to cross this boundary, and today nothing does.
2. **Product: agents can't do useful work.** The one live room agent gets up to 20 channel messages and replies with no tools (`openClawGatewayTransport.ts:851-858`). The agents that can work (Codex, Claude and others in each member's T3) can't hear a mention or post a reply, and ownership ("Monroe's agents") has no representation.
3. **Product: nothing shared but text.** Screenshots can't be posted, project bindings stay on one device, and no read path reaches another member's checkout. Humans and agents therefore never consume the same material, which #22 and #23 require.

Separate from these:
- **Environment:** a later implementation needs Node `^24.13.1`, pnpm `11.10.0` and `vp`, plus the private server.
- **Device proof:** installed multi-device acceptance is still owed for everything past sign-in (#26 comments of Sept 10).

## 4. Architectural approaches

| | A. Package the room server | B. The room inside the T3 server | C. Room server as the ledger, T3 environments as participants **(recommended now)** |
| --- | --- | --- | --- |
| Shape | Ship Rails + Postgres beside the desktop app (or as a one-command host); agents keep using connectors | Port the room protocol into `apps/server` as an event-sourced module on T3's SQLite, auth and exposure; Rails becomes optional or managed | Keep the room protocol and server for membership, conversation and files. Each member's T3 server runs one outbound **environment connector** that answers its owner's agent mentions and serves read-only project grants. |
| Reuses | All server work: local auth, ledger, deliveries, CAS, conformance tests | Desktop backend, LAN/Tailscale/relay exposure, pairing, SQLite, attachments, providers; the client feed and agent-turn UI | Rails as-is; `rooms-agent-connector` lease, idempotency and lifecycle machinery with a new T3-turn adapter; T3 diff/read APIs; T3 composer attachments |
| Removes | Nothing | The Rails dependency for the free core; eventually the second connector stack | The OpenClaw-only assumption; device-local project binding as the only binding |
| Laptop hosting (#31) | Heavy: a Ruby and Postgres runtime per host, updates, backups | Natural: the host is the app users already install | Unchanged until the host decision; the slices don't depend on it |
| Recovery (t3rooms#8) | Postgres replication or dumps between laptops | SQLite snapshot/WAL shipping plus an epoch fence | Recovery is still owned by the room host; agent execution never moves |
| Migration | None | Export/import of existing FCFDEV rooms; a large port of private code; more fork delta against upstream `apps/server` | Additive: new principal owner field, delivery routing and a message attachment field on the server (provisional) |
| Risk | Operational weight for every host | Rewrites a working, tested ledger without seeing it | Two protocols until hosting is decided |

**Recommendation: C, with the host runtime decided by a bounded spike.** C delivers the useful part of #26 (agents working in real projects, shared screenshots and diffs) on the server that already works. It puts agent execution where #11 and #23 require it: the owning environment keeps its permissions. It is portable. The environment connector speaks the room's delivery/result protocol, not Rails internals, so it survives either answer to hosting.

For hosting (#31), I lean toward **B**: the installed app is already a network-exposed server, and SQLite replication is a much smaller recovery problem than moving Postgres between laptops. That lean rests on source I could not read, so take it as a hypothesis for the spike, not a decision.

The spike compares:
- **(i)** a packaged Rails + Postgres helper supervised by the desktop app, on install size, update path, backup/restore and first-owner setup;
- **(ii)** porting the minimal room surface (principals, membership, channel feed, deliveries, CAS) into `apps/server`, sized against the private ledger.

Start neither build before that comparison.

**Strongest counterargument:** hosting is roadmap step 2, and C defers it. Every slice built against the Rails server deepens dependence on a runtime that can't yet run on a laptop. If B wins, the Rails-side parts of slices 2 and 3 (owner field, attachment field, delivery routing) are built twice. The answer: those are small additive contract changes. The client and connector work is reused under B. The alternative, a hosting rewrite before anyone sees an agent do useful room work, risks building the wrong room.

## 5. Implementation slices

Each slice is dependency-ordered and gated on installed-device proof per `docs/operations/threadspace-delivery.md`. Server parts are provisional until the private review confirms them.

### Slice 1 — Trustworthy shared conversation (#21, closes gaps in #17)

- **Owns:** client-only.
  - `apps/web/src/features/rooms/dataSource/{model.ts,RoomsDataSourceProvider.tsx,humanSharedClient.ts}`
  - `apps/web/src/features/rooms/channel/RoomsLocalChannelFeed.tsx`
  - `apps/web/src/features/rooms/shell/{RoomsWorkspaceShell.tsx,RoomsHumanWorkspaceSurface.tsx}`
  - `apps/web/src/components/settings/BetaSettingsPanel.tsx`
- **Changes:**
  - Shared becomes the default and only product source; Sample and Local stay available to tests and dev builds.
  - The Shared error decoder carries `head_seq`, so cursor-ahead recovery runs.
  - A live refresh keeps the newest window rather than the first page, if the server's feed order confirms the defect.
  - Invite issuance gets a stable request ID.
- **Tests:** `vp test run` on `humanSharedClient.test.ts`, `localChangesLoop.test.ts`, `RoomsLocalChannelFeed.test.tsx`, and a new provider/default-mode test.
- **Device gate:** three people on two or more installed clients; a channel over 100 messages receives a new one live; a restart and a network drop reconnect without duplicates.

### Slice 2 — Screenshots in the channel (#22)

- **Owns:**
  - Composer paste/drop and preview, adapted from `ChatComposer.tsx` image handling.
  - Message attachment references in `humanSharedContract.ts` and `localChannelsContract.ts`.
  - Feed rendering.
  - Connector delivery accepting attachment references: `rooms-agent-connector-host/src/deliveryClient.ts:122-125`, with the existing sanitizer in `rooms-agent-connector/src/contextEnvelope.ts`.
- **Reuses:** the CAS upload path (`roomsTransport.ts:107`).
- **Server (provisional):** message payload `attachments[]` of CAS references with room authorization; `agent_deliveries/projection.rb` emits them (#22 names it); non-members get 403.
- **Tests:** contract decode/encode, composer cancel and retry keep one message, delivery-client acceptance.
- **Device gate:** a second client and a nonmember on separate installs; the image survives an app restart.

### Slice 3 — An owner's T3 environment answers in the room (#11, first read cut of #23)

- **Owns:**
  - A T3-turn adapter beside the OpenClaw one in `packages/rooms-agent-connector`.
  - A connector supervisor in `apps/server`, off by default and enabled per room by its owner, bound to one project.
  - A project-scoped read grant in `packages/contracts` (auth) and `apps/server/src/auth/RpcAuthorization.ts`: `projectId` instead of a caller `cwd`, bounded to `listEntries`/`readFile`/diff.
  - Binding UI showing which environment serves "*owner*'s agents".
- **Server (provisional):** an agent principal `owner` field; delivery routing to the owner's connector; an optional `environment_offline` state.
- **Behavior:**
  - A mention starts a normal T3 turn with bounded channel context and attachments, under the owner's approval mode.
  - The reply and lifecycle post back, attributed and linked.
  - A diff or file request returns captured content stamped with environment, checkout, base and time.
- **Tests:**
  - Adapter tests on fake providers, waiting on receipts, never sleeps.
  - Grant tests: traversal, symlinks, unshared project rejected.
  - Duplicate-delivery tests.
- **Device gate:** two disposable environments on separate machines; a real mention produces one attributed reply; source files unchanged unless the owner's mode allows edits; unsharing rejects further reads; reconnect produces no repeated reply.

After these, run the hosting spike, then #31 and the recovery proof on the chosen runtime.

## 6. Host/Join and explicit recovery

- **Identity.** Accounts and memberships are room-host data (server-owned, per `hosting-and-access.md`). They must be in the synchronized set, so a recovery host can verify the same people. Sessions can be reissued after takeover. Credentials for one host must never be replayed against another: the current per-server-ID session rule (`serverProfile.ts:67-112`) already enforces this and must hold across takeover.
- **Durable data and files.** The recovery set is conversation, membership, invites, deliveries/invocation outcomes and CAS objects. Agent execution records live in each owner's T3 environment and don't move.
- **Acknowledged loss.** Either (a) the host acknowledges a write only after a trusted recovery device holds it (no loss, slower, fails without a peer), or (b) it acknowledges locally and ships asynchronously within a stated window (last N seconds may be lost and must be listed after takeover). **Undecided** (D2).
- **Old-host return.** Every write carries a host epoch. "Take over hosting" (explicit, per the Sept 8 decision) increments it. A returning host that sees a higher epoch becomes a read-only follower. Its unshipped writes are shown as "not delivered" to their authors, never silently merged.
- **Agent execution ownership.** Execution belongs to the owning environment in every approach. A host change reconnects connectors to the new host, and an in-flight turn finishes and reports to whichever host holds the invocation record (lease reclaim in `connector.ts:211-239` already models this).

Open: trusted recovery devices, stale-host fencing while partitioned, host runtime and packaging, and discovery/trust for LAN join. The client still rejects plain-HTTP LAN origins (`hosting-and-access.md`).

## 7. Decisions for the owners, and the next task

- **D1. Host runtime.** Accept the spike framing (packaged Rails vs room-in-T3) and defer #31 building until it reports.
- **D2. Acknowledged-loss policy** for takeover: synchronous peer acknowledgement, or a bounded asynchronous window (size?).
- **D3. Agent identity.** Confirm "*owner*'s agents" as the addressable identity routed to the owner's environment, and set the default approval mode for room-started turns (recommend `ask`).
- **D4. Visibility.** Should room members see the whole T3 thread a mention starts, or only the reply, the lifecycle and a link?
- **D5.** Remove Sample and Local from product builds now (foundations already says so for Sample).

Next-task prompt (slice 1):

> In benwilliams0540/t3code on main, implement slice 1 of docs/rooms/cloud-product-review.md.
>
> - Make Shared the default and only product data source (Sample and Local remain for tests and dev).
> - Carry `head_seq` through the Shared error decoder so `change_cursor_ahead` recovers.
> - Give invite issuance a stable request ID.
> - Confirm the feed's server ordering before changing live refresh.
>
> Use Node ^24.13.1, pnpm 11.10.0 and `vp`. Run only `vp test run` on the touched tests and targeted typecheck, per AGENTS.md. Return a PR (only when explicitly requested) with the installed-client device gate listed as pending.
