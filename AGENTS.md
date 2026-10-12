# Threadspace

Threadspace is one product. This repository owns its clients, shared client state
and agent connectors; `t3rooms` owns its Rooms backend. It is Ben and Monroe's
collaborative prototype fork of T3 Code.
Read [product direction](docs/product/threadspace.md) when choosing scope;
[roadmap #26](https://github.com/benwilliams0540/t3code/issues/26) owns delivery status.
Read [Threadspace architecture](docs/architecture/threadspace.md) when changing connection,
conversation, contract or agent ownership. Dated reviews describe their recorded
revision; check current callers and issue status before treating them as work.

## Working loop

1. Establish the current `main` revision and task owner. Preserve concurrent and
   untracked work. Use a temporary branch/worktree when isolation helps, and reuse
   dependencies where practical instead of installing a complete environment per worker.
2. Build the smallest complete experiment for the current outcome. When touching
   an area, remove superseded code, tests and instructions whose purpose has ended.
   Retain compatibility for an identified current consumer or migration and record
   that reason. Larger adjacent cleanup belongs in its existing issue.
3. Choose the smallest meaningful proof using [docs/operations/ci.md](docs/operations/ci.md).
   Run the affected build/typecheck and behavioral tests that can expose a real failure;
   use a representative preview or interaction for UI changes. Cosmetic edits and
   implementation-mirroring assertions usually need no new tests. Broaden for affected
   boundaries, new failures or unresolved risk; stop when the slice's acceptance is met.
   Whole-repository checks and hosted workflows are explicit opt-ins, not routine gates.
4. Commit and push authorized work through the agreed collaborator workflow. An
   assigned integrator owns merging and delivery. Record the tested commit, focused
   proof, unavailable checks and a short "test when you sit down" list. Source proof,
   installed behavior and publication are separate results; polling CI is not a finish condition.

## Current behavior and consequential boundaries

Preserve user history, scoped credentials, membership/access checks, stable request
identity and safe retry of uncertain writes. Git recovers source; it does not undo
participant data changes or already-issued external writes. Add regressions for real
failures and durable contracts rather than preserving a superseded architecture.

Check the affected entry points and clients: web, desktop and native mobile share
logic in `packages/client-runtime`. Provider or wire changes need decisions at their
actual adapters/consumers. Keep reverse actions and reconnect behavior coherent.
Shared room access does not imply access to private host files or personal chats.
For async behavior use controlled promises, receipts and worker drains for deterministic proof.

## Local runtime

- `vp run dev` uses worktree-local `.t3` state. Read the actual ports from the
  `[dev-runner]` output; pass the pairing URL when handing over a client.
- `~/.t3/userdata` is live user data. Use disposable worktree state for tests.
  If seeding from `~/.t3/dev`, copy a quiescent SQLite database with its WAL/SHM
  siblings; copy rather than symlink, and include secrets only when needed.
- Dev is single-origin: Vite proxies `/api`, `/ws`, `/oauth` and `/.well-known`.
  Avoid `VITE_HTTP_URL`/`VITE_WS_URL` overrides that bake localhost into remote clients.
- Track the PID/port and stop method for processes you start. Stop only processes
  whose ownership you established; never kill by a broad name/path pattern.
- Runtime/browser access, device installs, host restarts and publication follow the
  user's authorized scope. The integration owner runs one relevant client pass;
  workers do not independently start full app environments.

## Code and delivery pointers

- `apps/server` owns T3 orchestration/providers; before Effect changes read
  `.repos/effect-smol/LLMS.md` and `docs/operations/effect-fn-checklist.md`.
- `apps/web`, `apps/desktop` and `apps/mobile` own presentation/platform adapters;
  `packages/client-runtime` owns shared client behavior. Keep runtime protocol at
  its adapter boundary and avoid duplicate lifecycle owners.
- `packages/contracts` owns wire schemas; the separate Rooms service owns durable
  membership/history. Keep current paired contracts, including live v1 writes/auth.
- `.repos/` contains read-only references. Never edit or import them into the product.
- [#18](https://github.com/benwilliams0540/t3code/issues/18) owns upstream merge
  maintenance. Follow its current recipe instead of replaying historical feature branches.
- Update the relevant user/architecture docs when behavior changes. For desktop
  delivery read `docs/operations/threadspace-delivery.md`; for an authorized public
  release or relay deployment read `docs/operations/release.md` before launching a workflow.
