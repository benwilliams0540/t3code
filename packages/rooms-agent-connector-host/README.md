# Rooms resident Agent connector host

This private Node 24 executable is the supervised, non-listening host for one
room-scoped Claw Agent and one explicitly allow-listed Rooms channel. It reads
`rooms.agent-deliveries` v1 from either loopback Rails or an explicitly configured
credential-free HTTPS Shared Rooms origin, reuses the accepted connector,
invocation, SQLite, and OpenClaw Gateway transports, and settles at most one
server-attributed reply through `rooms.agent-invocations` v1.

It does not use the Local-human endpoint, expose a network service, accept
caller-selected actor IDs, provide story/native-T3-control tools to the model,
or store provider credentials in Rooms. The Rooms bearer is read from a
mode-0600 file. The Gateway token is resolved at handshake time from the
existing owner-only OpenClaw configuration and is not copied into the host
configuration or state.

Run the credential-safe readiness check with:

```sh
pnpm build
node dist/bin.mjs --config /absolute/path/to/host-config.json --check
```

The check validates strict configuration, secret ownership/mode, Rooms
readiness, authenticated delivery binding, Gateway protocol/method compatibility,
and the three SQLite schemas. It does not move the delivery cursor, invoke a
provider, or mutate Rooms.

Run the resident loop with:

```sh
node dist/bin.mjs --config /absolute/path/to/host-config.json
```

The configuration contract is `rooms.resident-agent-host-config` version `1`.
It requires genuine native T3 environment, project, and thread IDs. Those IDs
must come from human-selected native T3 state; Rooms channel IDs are not a
substitute.

`rooms.baseUrl` accepts the existing credential-free HTTP loopback origin for
dogfood or a credential-free HTTPS origin for Shared Rooms. It rejects insecure
remote HTTP, URL credentials, paths, queries, fragments, and redirects.
`openClaw.gatewayUrl` remains a credential-free loopback `ws:` origin in both
modes. The connector never exposes or tunnels the Gateway.

The room-scoped Agent bearer remains in the owner-only file named by
`rooms.bearerTokenFile`. It is attached only as an `Authorization` header and
must never appear in the Rooms URL, host configuration JSON, logs, diagnostics,
or reports.

The secret-free alpha ingress example and operator boundary are documented in
[`infra/rooms-alpha`](../../infra/rooms-alpha/README.md). That example is not a
deployment and does not reuse or alter T3 Connect Relay enrollment semantics.

The cursor is checkpointed only after a whole bounded delivery page is handled
sequentially. A crash replays the page, while the existing connector store and
server invocation mapping make source delivery, provider acceptance, result,
receipt, outbox, and reply idempotent. An accepted invocation that is still
running defers the checkpoint so it can be resumed safely.
