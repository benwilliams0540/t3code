# Rooms cleanup ledger

Read [current direction](../product/threadspace.md) and [architecture](../architecture/threadspace.md)
before selecting work. This ledger contains historical source/runtime observations;
revalidate them before use. Current status and priority belong to the linked issues
and board. The September 29 audit did not re-deploy or re-test staging.

Keep concrete unfinished areas here with an owning issue. In-code markers use
`TODO(rooms):` and should point back here or to an issue.

## Product flow

- **Sample product flow is retired** ([#46](https://github.com/benwilliams0540/t3code/issues/46)). The September 4 decision in `foundations.md` is implemented: only Local and Shared are selectable. Old Sample source preferences normalize to the existing Shared connect/sign-in flow; existing Local/Shared preferences, server profiles and room/project bindings remain. Certified workspace fixtures and their decoder contracts stay as test/reference data, with no production fixture renderer.
- **Status header has no health fact.** `RoomsInteractiveDashboard.tsx` carries a `TODO(rooms)`; a real fact needs native T3 mirroring or project-impact telemetry (benwilliams0540/t3rooms#1). Do not fake one.
- **Native thread linking shows nothing.** `t3_environments` and `t3_mirrored_events` are empty on staging; the Rails adapter that mirrors T3 events was never run against a real environment. This is what would let Ben and Monroe see each other's agent work.
- **OpenClaw continuation source is delivered; host acceptance remains.** V2
  conversations resolve the persisted runtime binding and inherit host tool and
  approval policy. Legacy isolated invocations retain invocation-derived
  sessions and restricted options.
  [#11](https://github.com/benwilliams0540/t3code/issues/11) owns the actual
  tool/approval integration proof. See [Agent Link reconciliation](../operations/agent-link-retirement.md)
  for workflow replacements and the limits of that source evidence.

## Desktop build and sign-in

- **ThreadSpace has a separate opt-in desktop identity.** See `../user/threadspace-desktop.md` for the build and isolated state paths. Clerk's new native callback allowlist, passkey provisioning, notarization, and a dedicated update service remain separate setup and release work; do not claim sign-in proof from a successful build.
- **Passkeys are a build-time guess.** `T3CODE_DISABLE_CLERK_PASSKEYS` is read from the environment at launch (`apps/desktop/src/app/DesktopConfig.ts`); the unentitled Alpha relies on it. Detect the missing entitlement at runtime instead.
- **Unnotarized Developer ID builds.** Gatekeeper rejects on first open; that is expected for the Alpha and must not be worked around by stripping quarantine.
- **Alpha version numbers are hand-picked** at build time (`T3CODE_DESKTOP_VERSION`); there is no release tag on the fork.

## Connector and staging

- **Connector retry is too aggressive on credential failure** (one-second retry, five-second systemd restart). Bounded backoff is a source change in `packages/rooms-agent-connector-host`.
- **Agent credential expiry** is 2026-10-19; rotation is a Monroe-approved governance write (fleet runbook `fcfdev-rooms-connector.md`).
- **Container boot ownership lives in two places.** The compose files are under the `brw` account on FCFDEV; the `unless-stopped` restart policy was set with `docker update` outside them. A `docker compose up` from Ben's side resets it.
- **Mobile relay and delivery worker are stopped** until a `:8444` Serve route exists; the worker's last failure was only "database down".
- **OpenClaw owns nothing on Tailscale now** (`gateway.tailscale.mode: off`). Switching it back to `serve` resets the node's Serve config and removes `/rooms`.

## Repository hygiene

- **Upstream maintenance** is owned by [#18](https://github.com/benwilliams0540/t3code/issues/18). Use its current merge recipe and selected sync point; dated divergence reports are evidence to refresh.

- **CI and Rooms Focused are manual** on GitHub-hosted runners. Use the [focused verification recipe](../operations/ci.md); ordinary changes record relevant local proof in their PRs.
- **Draft #2 is superseded by the Threadspace stack** (#12, web/desktop slice, mobile slice). Close it with a link once the mobile slice merges.
- **M7 cloud transport** is deferred in [#6](https://github.com/benwilliams0540/t3code/issues/6). Port only the parts needed for a demonstrated transport gap; historical branches are candidates to inspect, not a wholesale merge prerequisite.
- **Four pinned fixture JSONs** under `apps/web/src/features/rooms/fixtures/` fail `vp fmt`; do not format them, their boundary tests hash the bytes.
- **Historical handoff branches** (`feat/rooms-agent-connector-contract`, `feat/rooms-m5-*`, `feat/rooms-m6b-*`, `feat/rooms-m6c-*`) are evidence, not integration targets.
