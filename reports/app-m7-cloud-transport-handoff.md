# M7 Cloud Rooms Transport handoff

Status: **M7 CLOUD ROOMS TRANSPORT IMPLEMENTED — LIVE ALPHA GATE UNRUN**

## Repository pins

| Repository | Remote                                           | Branch                          | Base                                                                                     | Implemented tip before this report                                                      |
| ---------- | ------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| T3 Code    | `https://github.com/benwilliams0540/t3code.git`  | `feat/rooms-m7-cloud-transport` | `6758d7bdeae329ed074ec798811f53b75e03fd73` — `fix(rooms): pin agent feed projection`     | `5efa5e49e17b01831beb94e7d579b8720e597df3` — `docs(rooms): add alpha ingress runbook`   |
| T3 Rooms   | `https://github.com/benwilliams0540/t3rooms.git` | `feat/rooms-m7-cloud-transport` | `ee381424993ec4a892a9a722e44ced593b2e35e9` — `fix(rooms): present agent replies cleanly` | `1afc58caec02f19c297a8e258d0c8b876a295fb0` — `feat(rooms): harden public alpha ingress` |

The app implementation commits are:

- `a5eb5d1459fad1755a0a1fb5920b063c9670358a` — shared origin/request policy and hosted transport;
- `48e449dba2c46d081c92647cadc7202fe4e0a963` — desktop and hosted-web Shared clients;
- `cae68f19752f9be4b5526a0b0c76305197a50745` — connector HTTPS egress; and
- `5efa5e49e17b01831beb94e7d579b8720e597df3` — architecture and alpha-ingress runbooks.

This report is committed after those implementation commits. Its documentation commit is the app
branch tip and must be resolved with `git rev-parse feat/rooms-m7-cloud-transport`; a Git object
cannot contain its own final SHA.

Both remote base heads were fetched again immediately before commit and still matched the pins.
The dedicated checkouts began clean at those exact bases. The original detached T3 Code checkout
remained clean at `6758d7bdeae329ed074ec798811f53b75e03fd73`. No running Rooms deployment,
installed T3 Code app, personal application state, or `fcfdev` service was accessed or changed.

## Delivered architecture

Desktop and hosted web now call a credential-free Shared Rooms HTTPS origin using the accepted
Human v1 contracts. The browser sends a fresh Authorization-only request, omits cookies, refuses
redirects, and rechecks the Clerk account/auth generation after the response. Electron keeps the
same exact route/method/query/body policy in its trusted main-process boundary. Local Rooms remains
restricted to credential-free HTTP loopback.

The resident connector initiates outbound HTTPS Rooms delivery and invocation traffic with its
existing room-scoped Agent credential and refuses redirects. Its T3/OpenClaw Gateway configuration
remains loopback WebSocket only. Stable delivery/invocation/result/receipt identities, durable
cursor persistence, retry behavior, and duplicate suppression were preserved.

The Rails public-ingress mode is disabled by default. When explicitly enabled it admits only the
exact Shared Human methods/routes, required Agent delivery/invocation/channel-context routes, and
database-backed `GET /rooms/ready`. It enforces exact HTTPS browser origins, trusted proxy CIDRs and
forwarded protocol, host admission, caller-identity-header rejection, pre-parser 64 KiB JSON and
5 MiB CAS limits, route-class fixed-window limits, secure headers, request IDs, and redacted errors.
Existing controller authentication, server-derived membership, and capability policy remain
authoritative.

## Main files and contracts

- `packages/shared/src/roomsTransport.ts`: typed Local/Shared origin policy and exact Human request,
  bearer, query, JSON, and CAS bounds; exported as `@t3tools/shared/roomsTransport`.
- `packages/client-runtime/src/rooms/transport.ts`: reusable hosted fetch adapter, exported as
  `@t3tools/client-runtime/rooms`.
- `apps/web/src/cloud/*`, `apps/web/src/features/rooms/dataSource/*`, and `apps/web/src/localApi.ts`:
  public HTTPS configuration, direct hosted transport, and auth-generation invalidation.
- `apps/desktop/src/ipc/methods/roomsHuman.ts`: narrow HTTPS-capable Electron boundary.
- `packages/rooms-agent-api`, `packages/rooms-agent-connector`, and
  `packages/rooms-agent-connector-host`: Shared HTTPS origin support, redirect rejection, and
  `/rooms/ready` health check while the Gateway stays loopback-only.
- `ledger/lib/rooms/public_ingress.rb` and the Human/Agent base controllers: public perimeter,
  trusted proxy/CORS/body/rate/error policy, and correlated redaction.
- `ledger/app/controllers/rooms/readiness_controller.rb`: minimal database-backed readiness.
- `infra/rooms-alpha/cloudflared.example.yml`: secret-free path allow-list with a final 404 rule.
- `docs/architecture/rooms-cloud-transport.md` and `docs/operations/rooms-alpha-ingress.md`: trust
  boundaries, threat model, configuration, and operator gates.

PostgreSQL/event sequence remains truth; bounded long-poll reconnect continues from durable cursors.
No competing identity, credential, realtime, or Relay contract was introduced.

## Verification evidence

App checkout, using repository-pinned Node `24.16.0` and pnpm `11.10.0` through `mise`:

- `vp test run` over 16 focused shared/client/web/desktop/Agent/connector/host files:
  **16 files, 108 tests passed**.
- affected `typecheck` for shared, client-runtime, web, desktop, rooms-agent-api,
  rooms-agent-connector, and rooms-agent-connector-host: **7/7 passed**; three pre-existing
  Effect suggestions were informational.
- production `build` for web and rooms-agent-connector-host: **2/2 passed**; connector bundle
  `668.7 KiB`; web emitted its existing large-chunk warning.
- affected lint: **passed**.
- affected source/docs/YAML/HTML formatting and `git diff --check`: **passed**.
- `vp install --frozen-lockfile`: **passed**, including supply-chain policy validation.

Rails checkout, using Ruby `4.0.6`, Bundler `4.0.16`, and an isolated temporary PostgreSQL 18
cluster:

- Ruby syntax for the ingress and changed Human/Agent controllers: **passed**.
- isolated ingress test: **6 runs, 74 assertions, 0 failures/errors/skips**.
- focused Human attestation, capability, membership, Human API, Agent credential, Agent delivery,
  and ingress suite: **45 runs, 592 assertions, 0 failures/errors/skips**.
- targeted RuboCop: **9 files, no offenses**.
- `git diff --check`: **passed**.

Changed-file scans found no private-key blocks, high-entropy GitHub/Clerk/Slack/Agent/JWT bearer
patterns, or credential logging. The deliberate `rag1.test.sentinel-secret` test fixture was
reviewed as synthetic and asserts that the value never enters a URL. Human and Agent integration
tests also assert bearer redaction from error bodies and correlated request IDs.

Local production-build artifacts are `apps/web/dist` and
`packages/rooms-agent-connector-host/dist/bin.mjs`; both are ignored and were not deployed.
Homebrew PostgreSQL 18 was installed only to run the local Rails suites; no background service was
registered or left running.

## Infrastructure and live gates

No Cloudflare tunnel, DNS record, paid resource, public hostname, managed database, object store,
credential, deployment, PR, merge, real room message, or provider turn was created. The checked-in
Cloudflare file is an example only. A single tunnel to one Rails process is explicitly an alpha
migration bridge, not high availability or production hosting.

The following are **UNRUN** because no real endpoint/account/infrastructure action was authorized:

- real Clerk configuration and public CORS/proxy/host settings;
- desktop and hosted-web sign-in by Monroe;
- second-human invite/membership proof;
- human-authored ordinary message and genuine `@Claw` mention;
- connector attributed reply through a live public endpoint; and
- sleep/network interruption recovery observed simultaneously from desktop and hosted web.

Remaining alpha risks are the single-origin deployment shape, per-process fixed-window rate-limit
state, unproven real proxy CIDRs/headers, and unexercised account revocation and multi-client runtime
behavior. The smallest next authorized action is operator review of both pushed branches, followed
by approval of one disposable alpha hostname and human-controlled live acceptance using the
operator runbook. Do not call this production-ready from the automated evidence alone.
