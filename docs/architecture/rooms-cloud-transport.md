# Rooms cloud transport

M7 makes authenticated Shared Rooms reachable through a normal HTTPS service without changing
Sample, Local, T3 Connect Relay, or native T3 environment semantics. PostgreSQL and the committed
event sequence remain the durable source of truth. Long polling is a notification mechanism; every
reconnect resumes from the last durable cursor.

## Data flow and trust boundaries

```text
desktop renderer --typed IPC--> desktop main --HTTPS--+
hosted web ------------------------HTTPS-------------+--> Shared Rooms Rails/PostgreSQL
                                                     |
resident connector ----------------HTTPS-------------+
        |
        +--loopback WebSocket--> local T3/OpenClaw Gateway
```

- **Local Rooms** accepts only a credential-free HTTP loopback origin. M7 does not broaden it.
- **Shared Rooms** accepts either the existing HTTP-loopback dogfood origin or a credential-free
  absolute HTTPS origin. Relay URL and Relay JWT-template configuration remain separate.
- **Desktop** keeps the exact `/rooms/human/v1` method, route, query, bearer, and body policy in the
  main process. The renderer does not receive an arbitrary authenticated proxy.
- **Hosted web** uses the same typed request policy and response contracts through a direct secure
  request adapter. It sends no cookies and refuses redirects.
- **Rails** derives identity from a verified dedicated-audience Clerk JWT or a room-scoped Agent
  credential, then derives membership, role, and capabilities from server state on every route.
- **The resident connector** initiates every remote connection. Its T3/OpenClaw Gateway origin stays
  credential-free loopback WebSocket and is never an ingress target.

Bearers are acquired or read only at the request boundary. They are never valid URL components,
build variables, diagnostics, persistent source selection, local storage, or report fields.

## Transport policy

The shared transport policy rejects userinfo, non-root paths, query strings, fragments,
protocol-relative inputs, malformed hosts, insecure remote HTTP, arbitrary renderer headers, and
redirects. Browser requests use `credentials: "omit"`; Electron and connector requests construct
their narrow headers inside the trusted boundary. A redirect is a failure even when its target is
HTTPS, preventing both origin confusion and downgrade forwarding of authorization.

Authentication generations are leases on client work. Sign-out or account switch invalidates token
access immediately, hides old-room state, stops the old long poll, and rejects responses that finish
under an obsolete generation.

## Public Rails surface

The public-ingress mode is an additional perimeter, not a replacement for controller authorization.
It admits the authenticated Shared Human routes, the Agent delivery/invocation routes required by
the resident connector, and a deliberately minimal readiness response. Local Rooms, legacy ledger,
adapter, database, bootstrap tooling, and health details stay outside that surface. Explicit hosted
origins, bounded bodies/long polls/pages, route-class rate limits, trusted-proxy rules, request IDs,
and redacted structured failures are enforced before application handling.

The alpha Cloudflare tunnel is a migration bridge to one Rails origin. It does not make that origin
multi-region or highly available. The long-term service remains normally hosted Rails with managed
PostgreSQL and object storage.

## Threat model

| Threat               | M7 control                                                                                | Remaining operator responsibility                                         |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Bearer theft         | no URL/persistence/log placement; narrow headers; redirects refused                       | protect Clerk and Agent credential stores; revoke compromised credentials |
| Origin confusion     | one typed Local/Shared origin policy; exact root origins; explicit CORS list              | configure only owned HTTPS hostnames                                      |
| Redirect downgrade   | every bearer-carrying client refuses redirects                                            | keep edge-to-origin service configuration stable                          |
| CORS abuse           | exact hosted origins; credentials are not cookie based; no wildcard                       | update the allow-list deliberately for each hosted client                 |
| Proxy spoofing       | forwarded client data trusted only from configured proxy ranges; identity headers ignored | maintain the trusted-proxy list                                           |
| Connector compromise | room-scoped Agent credential; epoch disablement; bounded safe failures                    | rotate/revoke the existing credential and secure the host                 |
| Replay/duplication   | stable request, delivery, invocation, result, and receipt IDs plus durable cursor/state   | retain connector state across upgrades                                    |
| Local-route exposure | application and edge public-route allow-lists; catch-all denial                           | verify generated edge configuration before activation                     |

M7 does not add billing, enterprise SSO, end-to-end encryption, multi-region failover, a full mobile
Rooms UI, or a second connector credential model.
