# Threadspace resident agent connector host

This private Node executable connects Threadspace's Rooms backend to one resident
OpenClaw agent and one configured channel. It owns configuration and process
supervision; the backend owns durable conversations, bindings and turn order.
See [product architecture](../../docs/architecture/threadspace.md).

For the Agent Link replacement decision, existing client call sites and safe
retirement conditions, see [Agent Link reconciliation](../../docs/operations/agent-link-retirement.md).

The host reads Rooms and Gateway credentials from the intended owner-only files.
It opens no listening service and stores no provider credentials in room records.
Local SQLite files retain delivery checkpoints, mapping and accepted-run receipts;
they do not become another conversation/binding authority.

## Choose the configuration version

`rooms.resident-agent-host-config` version **2** uses v2 delivery and continuing
conversation contracts. It reserves a backend binding, initializes or adopts its
actual OpenClaw session, commits the session receipt and consumes dispatch once.
Follow-ups retain that binding; each turn retains a distinct invocation identity.

The `nativeT3` block is optional in version 2. Omit it for a conversation-only
OpenClaw host. Ordinary historical mentions without a conversation are then
reported as unsupported and skipped; they cannot stop current conversation work.
To retain legacy one-shot execution, provide actual environment/project/thread
IDs. Version **1** remains supported for that existing path and requires those
IDs. A Rooms channel ID or invented T3 identifier is never a substitute.

The common configuration still supplies connector ID/version/epoch, actual
room/channel/agent/machine IDs, loopback Rails and Gateway origins, credential
file paths, OpenClaw host/agent identity, a state directory and delivery settings.
`src/config.ts` owns the exact validated shape. Keep configuration and state
under the intended host owner.

## Build and check

From this package:

```sh
vp run build
node dist/bin.mjs --config /absolute/path/to/host-config.json --check
```

Readiness checks strict configuration, file ownership/mode, authenticated Rooms
binding, Gateway protocol/method support and local state schemas. Version 2 also
requires advertised `sessions.create` and `sessions.resolve` support. The check
does not move the delivery cursor or execute agent work.

The resident loop is:

```sh
node dist/bin.mjs --config /absolute/path/to/host-config.json
```

## Retry, shutdown and capabilities

The backend serializes turns on each binding. The host can process independent
conversations and scan later delivery pages when an earlier conversation is
blocked. A temporary scan position never replaces the durable checkpoint before
unresolved work; a crash safely repeats already settled deliveries.

Accepted runs keep their actual run ID for reconciliation. Unknown acceptance or
cancellation retains the turn's queue barrier. Host shutdown detaches the wait
instead of cancelling the accepted runtime run. Explicit cancellation requires a
run-specific receipt. Missing or replaced sessions remain blocked for deliberate
host reconciliation; they are never silently recreated.

Continuing work uses the runtime's configured tools and approval policy. This
connector supplies no approval UI bridge and never auto-approves. A yielded or
unreconciled runtime state remains visible as uncertain. Actual tool/approval
behavior and the designated host's runtime version need integration acceptance;
protocol fixtures alone do not establish them.

SIGINT/SIGTERM stops the foreground host; stop its supervisor separately if it
would restart it. Stopping does not revoke credentials or cancel an accepted
run. Keep checkpoint/receipt state for reconciliation. Durable agent disable
and credential revocation belong to Rooms governance and require their own
authorization; there is no client uninstall command in this package.
