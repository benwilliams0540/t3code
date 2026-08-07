# Shared Rooms alpha ingress

This directory contains a secret-free Cloudflare Tunnel example for an authorized Shared Rooms
alpha. The tunnel is a migration bridge to a loopback Rails process, not the long-term Rooms
hosting architecture and not a T3 Connect managed-environment tunnel.

The example publishes only the M7 Shared Human and resident-Agent paths required by the alpha:

- `/rooms/human/v1/**`
- `/agent/v1/deliveries`
- `/agent/v1/invocations/**`
- `/agent/v1/work/channel-context`
- `/rooms/ready`, the intentionally minimal Rails readiness response

Every other path terminates at Cloudflare's `http_status:404` service. In particular, the example
does not publish `/rooms/local/**`, PostgreSQL, the OpenClaw Gateway, the native T3 server, or an
arbitrary loopback service.

## Approval and secret boundary

Do not create a tunnel, DNS record, paid resource, account token, or live route until an operator
explicitly authorizes that account change. Do not add tunnel credentials, Rails secrets, Clerk
secrets, Agent credentials, or bearer tokens to this directory, a URL, an environment example, a
log, or a report.

After authorization, an operator should:

1. Copy `cloudflared.example.yml` to an owner-only path outside the repository.
2. Replace the example hostname, tunnel UUID, credentials-file path, and loopback Rails port with
   the authorized values. Keep the origin loopback-only.
3. Validate routing without starting the tunnel:

   ```sh
   cloudflared --config /absolute/path/to/rooms-alpha.yml tunnel ingress validate
   cloudflared --config /absolute/path/to/rooms-alpha.yml tunnel ingress rule \
     https://rooms.example.test/rooms/human/v1/session
   cloudflared --config /absolute/path/to/rooms-alpha.yml tunnel ingress rule \
     https://rooms.example.test/rooms/local/v1/rooms
   ```

   The Shared Human URL must select its Rails service rule. The Local URL must select the final
   `http_status:404` rule.

4. Confirm Rails itself enforces the dedicated Rooms JWT audience, room membership and
   capabilities, exact hosted-origin CORS allow-list, bounded bodies and polls, rate limits,
   trusted-proxy policy, redacted errors, and the same route allow-list. Tunnel path routing is
   defense in depth, not authorization.
5. Start `cloudflared tunnel run` only through the approved operator-owned service definition. Do
   not pass credentials on a command line or copy them into T3 Code configuration.
6. Configure clients with the public origin only:

   ```dotenv
   T3CODE_ROOMS_API_URL=https://rooms.example.test
   T3CODE_ROOMS_CLERK_JWT_TEMPLATE=t3-rooms
   ```

   Keep the separate T3 Connect Relay URL and Relay JWT template unchanged.

## Verification gates

Before calling an authorized alpha reachable, verify separately:

- Cloudflare returns the minimal readiness response at `/rooms/ready` and `404` for
  `/rooms/local/**` and unrelated paths.
- An unauthenticated or wrongly-audienced request cannot use Shared Human or Agent routes.
- The browser preflight succeeds only for the exact authorized hosted app origins.
- The resident connector reaches the HTTPS Rooms origin outbound while its OpenClaw Gateway URL
  remains a loopback `ws:` origin.
- Restart and network interruption recover from the durable cursor without duplicating a provider
  turn, invocation, reply, result, or receipt.

If account authorization or credentials are unavailable, leave the live-alpha gate **UNRUN**. The
checked-in example and local tests do not prove a deployed or production-ready service.
