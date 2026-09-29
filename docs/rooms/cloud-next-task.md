# Next work for ThreadSpace

Updated 2026-09-29. Read [current direction](README.md),
[architecture and code map](../architecture/rooms.md), and
[roadmap #26](https://github.com/benwilliams0540/t3code/issues/26) before selecting
an implementation issue. The earlier recovery comparison is deferred. This
packet prepares work; it does not start an agent, implementation or deployment.

## Select one bounded issue

The first work is under the hood: service-owned conversations/session bindings,
and shared client connection/feed state. Those can be developed independently
against agreed versioned contracts. Agent continuation follows the binding
contract; conversation navigation and files/diffs follow that integration.
Use the roadmap's linked issues for acceptance and dependencies. Do not use old
issue comments or dated reports to restore recovery-first sequencing.

For service work, use the separately authorized private `t3rooms` repository on
`main` and `docs/design/persistent-room-conversations.md`. If access is unavailable,
report that boundary and complete only independently authorized client work.
Keep private implementation evidence in the private repository.

For client state work, start at `RoomsDataSourceProvider.tsx`,
`RoomsLocalChannelFeed.tsx`, mobile `RoomsRealtimeCoordinator.tsx`, and
`packages/client-runtime/src/rooms`. Specify the new owner's small interface,
extract one lifecycle at a time, then remove its old decisions. Preserve auth
identity generations, per-server sessions, draft retry identity and explicit
preferences. Platform UI stays in each app; shared state stays outside React.

## Concrete regression to include

Shared cursor recovery is an existing bounded defect within the state work:

- `humanSharedContract.ts` lacks optional `head_seq` in the error response.
- `humanSharedClient.ts` drops it when decoding.
- `localChangesLoop.ts` needs a valid `headSeq` to recover an ahead cursor.
- The Local error/client path already provides a comparison.

Preserve a validated nonnegative integer head and prove Shared decoding through
loop recovery: an ahead cursor receives a lower head, the next wait uses that
head, and normal catch-up resumes. Cover absent/malformed heads and unrelated
errors without tight retries or fabricated success. Use controlled promises or
receipts. Forward feed pagination is a related but separately specified case:
honor server snapshots and sparse sequences; do not assume a sequence delta is
a message count. Add a long-channel regression before changing feed behavior.

## Finish the selected slice

Check current main, applicable instructions and overlapping work before editing.
Read package manifests when dependencies are needed and follow the repository's
`vp` workflow. Run focused tests for the owned contract/state/adapter only; avoid
repo-wide checks or installing a full environment for source-only review. Report
an unavailable prerequisite after one evidence-backed correction, preserving
manifests and lockfiles.

An implementation handoff includes the exact commit, changed interface, removed
duplicate ownership, focused checks, compatibility/migration impact and remaining
integration/device gate. Commit and push the authorized task branch. Open a PR
only when explicitly requested. A worker handoff does not claim integration,
installation or deployment; the assigned integrator records those gates on #26.
Do not schedule repeated polling while waiting for a local acceptance step.
