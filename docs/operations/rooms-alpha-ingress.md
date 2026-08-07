# Rooms alpha ingress

This runbook prepares the M7 Shared Rooms HTTPS edge without provisioning or deploying an account.
The checked-in Cloudflare example is a migration bridge to one loopback Rails process, not the
long-term hosted architecture and not a T3 Connect managed-environment tunnel.

## Public, secret-free configuration

Build desktop and hosted web with:

```dotenv
T3CODE_CLERK_PUBLISHABLE_KEY=pk_test_example
T3CODE_ROOMS_CLERK_JWT_TEMPLATE=t3-rooms
T3CODE_ROOMS_API_URL=https://rooms.example.test
```

The Rooms URL and JWT-template name are public identifiers. Do not add a Clerk secret key, session
token, bootstrap/invite credential, Agent bearer, tunnel token, or credentials-file contents to a
build variable.

Enable the companion Rails perimeter only in the public-facing process:

```dotenv
ROOMS_PUBLIC_INGRESS_ENABLED=1
ROOMS_PUBLIC_ALLOWED_ORIGINS=https://app.example.test
ROOMS_PUBLIC_HOSTS=rooms.example.test
ROOMS_PUBLIC_TRUSTED_PROXY_CIDRS=127.0.0.1/32,::1/128
ROOMS_PUBLIC_JSON_MAX_BYTES=65536
ROOMS_PUBLIC_CAS_MAX_BYTES=5242880
```

Keep the existing dedicated Clerk issuer, audience, and JWKS configuration on Rails. The allowed
origins are exact HTTPS origins, not patterns. The hosts are exact proxy `Host` values. Trust only
the actual loopback/private addresses used by the operator-owned edge; forwarded protocol and
Cloudflare client IP are ignored from any other source.

When `ROOMS_PUBLIC_INGRESS_ENABLED` is absent, the middleware is a no-op so existing Local dogfood
behavior is unchanged. When enabled, it permits only Shared Human routes, the resident connector's
delivery/invocation/channel-context routes, and `GET /rooms/ready`. The route perimeter supplements,
but never replaces, controller authentication, membership, and capability checks.

## Prepare an authorized Cloudflare tunnel

Do not execute this section until the account owner authorizes tunnel/DNS changes and supplies the
credentials through an operator-controlled secret store.

1. Copy [`cloudflared.example.yml`](../../infra/rooms-alpha/cloudflared.example.yml) to a mode-0600
   file outside the repository.
2. Replace only the example tunnel UUID, credentials-file path, hostname, and loopback Rails port.
3. Validate the configuration without running it:

   ```sh
   cloudflared --config /absolute/path/to/rooms-alpha.yml tunnel ingress validate
   cloudflared --config /absolute/path/to/rooms-alpha.yml tunnel ingress rule \
     https://rooms.example.test/rooms/human/v1/session
   cloudflared --config /absolute/path/to/rooms-alpha.yml tunnel ingress rule \
     https://rooms.example.test/rooms/local/workspace
   ```

   The Shared Human URL must select Rails; the Local URL must select the final `http_status:404`
   rule.

4. Start the tunnel only through an approved service definition whose upstream remains loopback.
   Never publish PostgreSQL, `/rooms/local/**`, `/events`, `/adapter/**`, the native T3 server, or
   the T3/OpenClaw Gateway.

## Acceptance gates

Before calling the alpha reachable, prove separately:

- `GET /rooms/ready` returns the minimal database-backed readiness response through the edge;
- unrelated and Local paths return `404` at both the edge and Rails public perimeter;
- browser preflight succeeds only for the exact hosted app origins;
- invalid Clerk audience/signature, nonmembers, insufficient capabilities, spoofed identity
  headers, oversized bodies, and abusive rates fail with redacted structured errors;
- the resident connector reaches the HTTPS Rooms origin outbound while its Gateway remains
  loopback `ws:`;
- cursor replay after a restart/outage produces no duplicate provider turn, invocation, reply,
  result, or receipt; and
- desktop and hosted web decode the same committed state after human-controlled sign-in.

The two-human invite/message flow and a genuine `@Claw` mention must be performed by the humans in
the normal UI. With no separately authorized endpoint or account actions, record live acceptance as
**UNRUN**. Local tests do not prove production readiness.
