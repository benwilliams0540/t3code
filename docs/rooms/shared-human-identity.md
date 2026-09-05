# Shared Rooms human identity

Shared Rooms is the authenticated, server-backed multiplayer source in the Version 3 sidebar. It
is additive to the certified Sample source and the explicit development-only Local fallback. It
does not change T3 Connect managed Relay minting or native T3 thread ownership.

## Immutable producer contract

The consumer is pinned in source to:

```text
t3rooms producer: 5c58c843ede9f77a13010645736ddc0abf36eef5
contract: rooms.human-shared
version: 1
schema: contracts/rooms/human-shared/v1/schema.json
```

The later server documentation commit is not the producer pin. A shared workspace is accepted only
after the server returns the current human principal, replayed role, capability matrix, channels,
and room-scoped principal directory. Message writers resolve through that directory. An unknown ID
stays visibly unresolved and is never replaced with the current reader.

The immutable v1 route remains available. Agent lifecycle is additive through the feed-only v2
contract:

```text
t3rooms producer: 0147f353190f2568dd42032677229a0d74eb5610
contract: rooms.human-shared
version: 2
schema: contracts/rooms/human-shared/v2/schema.json
route: GET /rooms/human/v2/rooms/:room_id/channels/:channel_id/feed
```

The v2 feed preserves v1 cursor and pinned-snapshot behavior and adds typed
`agent_invocation_update` items. Each update carries the invocation ID and the exact source event
for the triggering human message. A delivery receipt carries the recorded reply event reference.
Human clients never infer correlation from adjacent messages or matching display names.

Web, desktop, and mobile consume one shared projection that folds the append-only start, finish,
and receipt updates plus the correlated Agent reply into one conversational turn. An unfinished
turn becomes delayed after 30 seconds; a server-recorded failure keeps only the safe error
vocabulary. Protocol rejection maps to `provider_request_rejected` instead of the generic
`connector_internal`. Automatic retry is intentionally excluded because the invocation protocol
does not yet define idempotency and double-execution rules.

The OpenClaw transport sends `modelRun: true` whenever it sends `promptMode: "none"`, as required
by the OpenClaw 2026.8.2 agent protocol. The connector regression test freezes that request shape.

## Client configuration

Canonical public build variables are:

```text
T3CODE_CLERK_PUBLISHABLE_KEY
T3CODE_ROOMS_CLERK_JWT_TEMPLATE
T3CODE_ROOMS_API_URL
```

The loader projects them to `VITE_CLERK_PUBLISHABLE_KEY`,
`VITE_ROOMS_CLERK_JWT_TEMPLATE`, and `VITE_ROOMS_API_URL`. The Rooms API URL must be a
credential-free HTTP loopback origin, normally the local endpoint supplied by the supervised
transport. The Rooms JWT template is separate from `T3CODE_CLERK_JWT_TEMPLATE`, which remains the
managed Relay template.

These identifiers are public build configuration. Clerk secret keys, session tokens, bootstrap
credentials, and invite credentials must never enter client environment files.

## Authentication and transport boundary

T3 Code mounts its existing Clerk provider when either the original Relay configuration or the
Rooms configuration is complete. A signed-in account requests the dedicated Rooms-template token
just in time for every ordinary request and each long-poll reissue. Tokens are never written to
settings, local storage, project bindings, diagnostics, serialized source state, or logs.

Electron sends a narrow typed request to the main process. The main process:

- accepts only HTTP loopback with no URL credentials, path, query, or fragment in the base origin;
- owns the exact `/rooms/human/v1` route and method allow-list plus the single v2 feed route;
- constructs the only `Authorization` header itself;
- accepts no renderer-controlled header map;
- rejects blank, CR/LF-bearing, or oversized bearers;
- bounds raw CAS bytes and permits them only on the selected shared room's CAS route; and
- does not retain lower-level HTTP error causes that could contain request headers.

Locally hosted web can use the same fixed client paths when browser CORS policy permits access to
the loopback service. A hosted HTTPS page cannot assume that an HTTP loopback request will pass
mixed-content, private-network-access, or server CORS policy. M6B does not weaken those browser
policies and does not expose Rails on a LAN, tailnet, or public address to work around them.

## Account and credential lifecycle

The source represents `signed-out`, `authenticating`, `authenticated-nonmember`, `invited`,
`ready`, expired-session, authorization-failure, invalid-configuration, and transport/error states
separately. The `signed-out` and expired-session panels offer the same T3 Connect sign-in action as
the app sidebar, because the Rooms workspace replaces that sidebar with its own rail. First-admin bootstrap and invite credentials live only in the current form. Successful
redemption clears them. An issued invite may remain in the current admin view or clipboard until
the admin clears it; it is never a durable client setting.

Each authenticated source snapshot carries the Clerk account ID and an in-memory authentication
generation. Sign-out or account switch invalidates token access synchronously, hides prior source
state before it can render for the new account, cancels the old long-poll generation, clears the
shared selection, and ignores late work. Every subsequent request checks the active account
generation again. Room authority always comes from a fresh server session/workspace response.

## Roles and UI

Signed-in humans can create their own shared room through `POST /rooms/human/v1/rooms`
with a name and stable UUIDv7 request ID. The server returns the existing membership
redemption shape, assigns the creator's admin membership only in the new room, and
creates `#general` atomically. New users and existing members see **New room**; operator
bootstrap credentials remain an optional provisioning path. The dialog displays the
configured server. It does not provision hosting or grant backend/Clerk administration.

Room creation is currently exposed in desktop and web; native mobile creation is pending.
The producer route and ingress allow-list must be deployed before the consumer. Fresh
public-download onboarding, public signup, and server reachability are separate release
acceptance requirements from a local build against a private development deployment.

The UI consumes server capabilities rather than inferring authority from labels:

- `channel.create` controls channel creation;
- `message.create` controls the composer;
- `work.create`, `work.link_thread`, `work.attach_evidence`, `work.review`, and `work.complete`
  control story actions;
- `membership.manage` controls invite issuance; and
- `role.manage` is represented separately for future role-management UI.

The dashboard shows the current server principal name, stable `h:` ID, role, known principals,
channels, and active capability count. Admin invite issuance is role-bound and uses an idempotent
request ID. Message submission preserves its stable request ID across retry.

## Surface classification

| Surface                  | M6B behavior                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Electron desktop         | Required product surface; implemented through the main-process loopback boundary.                      |
| Locally hosted web       | Implemented through fixed client paths when browser CORS/private-network policy permits.               |
| Hosted web               | Clerk can mount, but mixed-content/CORS/private-network policy may block loopback; no bypass is added. |
| Mobile                   | Native Shared Rooms channels consume the same v2 Agent-turn projection and safe status copy.           |
| T3 Connect managed Relay | Existing configuration, template, minting, and UI requirements remain unchanged.                       |

## Acceptance boundary

Automated tests use no real Clerk tenant, account, JWT, bootstrap, invite, or deployed service. The
live two-human desktop gate remains mandatory. Follow the copy-ready runbook in
`reports/app-m6b-human-identity-handoff.md`; do not treat a build, generated-key server proof, or
single-account walkthrough as live acceptance.
