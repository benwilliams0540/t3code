# Rooms cleanup ledger

Known messy, unfinished, or deferred areas, so an agent picking up Rooms can see the whole surface before choosing work. Each entry says what is true today, why it was left, and where the pointer lives. Add to this file instead of scattering guesses; remove an entry when the work lands. In-code markers use `TODO(rooms):` and should point back here or to an issue.

## Product flow

- **Sample and Local sources are still selectable.** Monroe wants the core flow only. The signed-out Shared panel no longer offers "Use Sample workspace" (#9), but Beta settings "Rooms content" and the Local-source error panel in `RoomsWorkspaceShell.tsx` still do. Drop them from the Alpha when asked; keep Sample for the certified fixtures in tests.
- **Status header has no health fact.** `RoomsInteractiveDashboard.tsx` carries a `TODO(rooms)`; a real fact needs native T3 mirroring or project-impact telemetry (benwilliams0540/t3rooms#1). Do not fake one.
- **Native thread linking shows nothing.** `t3_environments` and `t3_mirrored_events` are empty on staging; the Rails adapter that mirrors T3 events was never run against a real environment. This is what would let Ben and Monroe see each other's agent work.
- **`@Claw` cannot do real work.** Invocation is `promptMode: none`, no tools, channel text plus a host-health block (benwilliams0540/t3code#11 is the plan).

## Desktop build and sign-in

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

- **The main CI workflow cannot run on this fork** (Blacksmith runners). `rooms-focused.yml` is manual-only by Monroe's request; proof is local focused checks recorded in PR bodies.
- **Draft #2 is superseded by the Threadspace stack** (#12, web/desktop slice, mobile slice). Close it with a link once the mobile slice merges.
- **M7 cloud transport** (`feat/rooms-m7-cloud-transport`, both repos) stays unmerged until after human acceptance (benwilliams0540/t3code#6; map in `reports/rooms-m7-m6c-reconciliation-map.md` in Monroe's root checkout, untracked).
- **Four pinned fixture JSONs** under `apps/web/src/features/rooms/fixtures/` fail `vp fmt`; do not format them, their boundary tests hash the bytes.
- **Historical handoff branches** (`feat/rooms-agent-connector-contract`, `feat/rooms-m5-*`, `feat/rooms-m6b-*`, `feat/rooms-m6c-*`) are evidence, not integration targets.
