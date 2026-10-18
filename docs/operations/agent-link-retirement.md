# Agent Link reconciliation

Decision recorded October 18, 2026 against Threadspace
`d224442a20ec75f983e2d696b784f6b2f1bb3a62`, Rooms backend
`235d376b879326aece915b560ddd91aff91119f7` and
[Agent Link](https://github.com/StoneHub/agent-link/tree/28bad254bf7716cda9d741153ea74420680c7806)
`28bad254bf7716cda9d741153ea74420680c7806`.

Agent Link source retirement and repository archival are complete as of October
18, 2026. Its [preserved source](https://github.com/StoneHub/agent-link/tree/87287f84409b9003881de34097629fe5be3d2d2b)
is historical; new shared project agent work uses Threadspace's existing
connector. No transport, profile store or prompt wrappers were imported.
Rooms remains the durable backend; runtime
execution stays in the connector and OpenClaw. This decision does not establish
designated-host or installed-client acceptance.
[#11](https://github.com/benwilliams0540/t3code/issues/11) and
[#26](https://github.com/benwilliams0540/t3code/issues/26) own that remaining work.

Monroe confirmed that this is an early prototype consolidation: there will be
two active repositories, `t3code` and `t3rooms`. This decision was integrated on
`main` in [PR #50](https://github.com/benwilliams0540/t3code/pull/50).
The [Rooms #12 conclusion](https://github.com/benwilliams0540/t3rooms/issues/12#issuecomment-6247181760)
establishes that no backend code change was needed. Runtime testing and feature parity are
later Threadspace work, not prerequisites to consolidating the product.

## Capability disposition

Agent Link's `agent_link.py` stores routing hints in `profiles.json`, probes SSH
and the OpenClaw CLI, and sends `openclaw agent` messages. `brief` and `handoff`
are fixed prompts around the same `send_agent_message` used by `ask`. The helper
has no Rooms membership, durable binding, acceptance receipt, result
reconciliation or automatic transcript migration.

| Agent Link surface     | Threadspace path and disposition                                                                                                                                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile add/list`     | Human server profiles and authenticated room selection serve clients; explicit resident-host v2 configuration supplies connector identity and credential paths. SSH routing hints cannot supply Rooms principals, credentials or runtime bindings. No automatic profile import.                                         |
| `probe`                | Resident host `--check` validates configuration, authenticated delivery identity, Gateway methods and local state on the designated host against loopback services. It does not test SSH, remote network access or client sign-in. No replacement SSH probe.                                                            |
| `ask`                  | Select/create a shared conversation and send an explicitly addressed request through the existing human client. The backend orders its turn; the connector adapts it to OpenClaw. Source exists; useful intended-host execution remains #11 acceptance.                                                                 |
| `brief`                | Request a project briefing in the selected shared conversation using authorized context. Personal-agent memory, private history and machine-wide context are not automatically available. Current project files/diffs remain [#23](https://github.com/benwilliams0540/t3code/issues/23). No personal-memory import.     |
| `handoff`              | A human may explicitly share a reviewed summary as a normal message in the intended conversation. This preserves shared history; it does not guarantee personal-agent memory storage. Automatic transient-agent submission/private transcript export has no current consumer or authorization contract and is deferred. |
| Future A2A/tool grants | Unimplemented roadmap items are not migration dependencies. Host tools/approvals remain runtime responsibilities; reachability, quoted approvals and room membership confer no new execution grants.                                                                                                                    |

These replace shared-work workflows, without CLI compatibility or personal-agent
memory parity. No Agent Link runtime consumer was found in the inspected
Threadspace client/connector sources. Product retirement is complete; no
deprecation work remains assigned to another chat. Removing any existing
installation or private profile remains a separate, scoped operation. Agent Link
issue #2 remains open in the read-only archive as historical tracking; do not
unarchive the repository solely to close it. The archive's frozen README and
retirement guide still describe archival as pending; GitHub's completed archive
state and this active guide supersede that pre-archive wording. Current product
work belongs in Threadspace's existing backlog.

## Current connector trace

1. **Discovery/configuration.** Human identity/provenance live in
   [`serverProfile.ts`](../../packages/client-runtime/src/rooms/serverProfile.ts)
   and connection generations in
   [`connection.ts`](../../packages/client-runtime/src/rooms/connection.ts).
   The connector uses explicit configuration:
   [`config.ts`](../../packages/rooms-agent-connector-host/src/config.ts) parses
   actual room/channel/agent/machine IDs, connector epoch, loopback service
   origins and credential-file paths. Version 2 can omit legacy `nativeT3` IDs.
2. **Readiness/auth.**
   [`ResidentConnectorHost.check`](../../packages/rooms-agent-connector-host/src/host.ts)
   checks Rails health, authenticated delivery binding and Gateway continuation
   support. Construction opens/validates local SQLite state; `--check` does not
   dispatch work or advance the cursor. Credentials come from owned mode-0600
   files; state uses mode 0700. Rooms authorizes agent credentials and scope;
   OpenClaw retains actual execution policy.
3. **Execution.**
   [`roomsServerConsumer.ts`](../../packages/rooms-agent-connector/src/roomsServerConsumer.ts)
   reserves a backend binding, initializes its real session, commits the receipt
   and claims ordered dispatch.
   [`openClawGatewayTransport.ts`](../../packages/rooms-agent-connector/src/openClawGatewayTransport.ts)
   resolves that exact session, submits `agent`, records acceptance and waits for
   the actual run. Conversations inherit host tool/approval policy; legacy
   isolated requests retain restricted options. There is no approval UI bridge
   or auto-approval path.
4. **Receipts/retries.**
   [`connector.ts`](../../packages/rooms-agent-connector/src/connector.ts) and
   [`sqliteInvocationStore.ts`](../../packages/rooms-agent-connector/src/sqliteInvocationStore.ts)
   retain accepted run identity and suppress duplicate delivery. The consumer
   records runtime/results through the backend; uncertain acceptance is not
   permission to resend. Host scanning retains the durable checkpoint before
   unresolved work while independent conversations can proceed.
5. **Stop/disable/removal.**
   [`bin.ts`](../../packages/rooms-agent-connector-host/src/bin.ts) handles
   SIGINT/SIGTERM with an abort signal. Conversation waits detach, preserving
   accepted runs for restart reconciliation. Stop the intended supervisor too
   if it would restart the process. Stopping is not revocation or cancellation.
   The store's `setEnabled` is an internal gate, not a client
   disable/uninstall command; host construction provisions an enabled binding.
   Durable disable/revocation belongs to Rooms governance
   (`Rooms::AgentCredentials::Manager#set_enabled` / `#revoke` in
   `t3rooms/ledger/app/services/rooms/agent_credentials/manager.rb`) and requires
   its own authorization. Retain state/history for unresolved runs; do not
   delete databases or credentials when retiring the helper.

## Actual client consumers

- [`conversationClient.ts`](../../packages/client-runtime/src/rooms/conversationClient.ts)
  owns scoped v2 list/read/create/feed/send requests and decoding.
  [`conversations.ts`](../../packages/client-runtime/src/rooms/conversations.ts)
  owns selection and stable request IDs across deliberate command retries.
- Web's
  [`humanSharedClient.ts`](../../apps/web/src/features/rooms/dataSource/humanSharedClient.ts)
  constructs that client; `RoomsDataSourceProvider.tsx` supplies it to
  [`RoomsLocalChannelFeed.tsx`](../../apps/web/src/features/rooms/channel/RoomsLocalChannelFeed.tsx),
  used by Local and Shared surfaces. Despite the component name, Shared
  conversations use authenticated human transport.
- Desktop uses web presentation and
  [`roomsHuman.ts`](../../apps/desktop/src/ipc/methods/roomsHuman.ts) /
  [`roomsLocal.ts`](../../apps/desktop/src/ipc/methods/roomsLocal.ts) transport
  adapters, without a separate agent execution loop.
- Mobile's [`client.ts`](../../apps/mobile/src/features/rooms/client.ts)
  constructs the same conversation client; `RoomsRouteScreen.tsx` consumes
  `RoomsConversations`. Secure storage/lifecycle/notifications stay in mobile
  adapters. A web source pass does not prove native acceptance.
- [`rooms-agent-mcp`](../../packages/rooms-agent-mcp/README.md) exposes the
  scoped agent catalog. It has no invocation-start, generic reply or connector
  control operation; it is not an unrestricted transient-agent handoff interface.

## Retirement decision and later product work

Agent Link is retired as an active standalone project, with its source history
preserved in the archived repository. No compatibility shim, new transport or
personal-memory migration is required for this consolidation. Existing private
profiles/history stay intact. Fleet's Windows controller reference was
[reconciled](https://github.com/StoneHub/fleet/commit/82a9bbb1e6e72e96cf9decd01156a713a8191727)
to direct new shared-work integration to Threadspace's existing owners.

The following are future product work under #11/#26, not retirement or merge
gates. Complete them as the prototype develops:

1. If an existing consumer surfaces, record its actual shared-work need in the
   appropriate Threadspace issue. Do not infer private-history sharing consent
   from its old Agent Link configuration.
2. An authorized operator runs host v2 readiness against compatible installed
   Rooms/OpenClaw versions. Record revisions, protocol and configuration
   provenance without credentials. A fixture pass is insufficient.
3. Two authenticated clients continue A on the same persisted binding, isolate
   B, retain history after ordinary same-host restart, and reconcile retries
   without duplicate side effects/replies. Exercise a bounded useful task and
   actual approval behavior; missing runtime/approval state must remain honest.
4. Review a project briefing and an explicitly shared summary in the intended
   conversation. Share only approved material; no private-memory migration or
   automatic handoff is implied. Record web, installed desktop and native mobile
   evidence separately in #26.

No new feature issue is needed for prompt wrappers. #11 owns real runtime
acceptance; #23 owns source-authorized project content;
[#31](https://github.com/benwilliams0540/t3code/issues/31) retains later host
packaging. Revisit automatic handoff only for a demonstrated consumer, with
sender identity, destination authorization, stable request IDs, uncertain-write
reconciliation and an explicit sharing boundary defined first.
