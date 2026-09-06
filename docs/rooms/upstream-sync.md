# Rooms upstream sync

`integrate/rooms-current` tracks the fork's `main`, while the fork tracks
[`pingdotgg/t3code`](https://github.com/pingdotgg/t3code). Sync every two weeks and after an
upstream release. Use a merge commit; never rebase the Rooms integration line.

This procedure prepares a reviewable PR. It does not update `main`, merge the PR, deploy an app, or
prove client acceptance.

## Current baseline

Measured 2026-09-05 after fetching all three refs:

| Ref                              | Revision    | Divergence                                         |
| -------------------------------- | ----------- | -------------------------------------------------- |
| `origin/main`                    | `e6987965f` | 1,343 commits behind upstream; 0 fork-only commits |
| `upstream/main`                  | `eee05575e` | comparison source                                  |
| `origin/integrate/rooms-current` | `50c34a153` | 92 Rooms-only commits above `origin/main`          |

The two histories change 83 of the same paths since their merge base. Treat this as a real
reconciliation, not a routine fast-forward. The highest-risk shared surfaces are:

- desktop identity, configuration, backend startup, Electron protocol/IPC, and
  `scripts/build-desktop-artifact.ts`;
- `AppSidebarLayout.tsx`, `BetaSettingsPanel.tsx`, chat/composer routes, settings, and local API;
- mobile app configuration, navigation, authentication, and notification registration;
- shared contracts, relay code, workflow/release files, workspace manifests, and `pnpm-lock.yaml`.

Run the checked-in report after every fetch to replace this dated baseline with current evidence.
It only reads Git objects and prints the exact shared path list.

## Preflight and measure

1. Finish or pause other Rooms work and inspect every worktree. Do not resolve conflicts while
   another branch is editing the same surface.
2. Confirm the worktree is clean and review current PRs targeting `integrate/rooms-current`.
3. Configure the canonical upstream once, then fetch without pruning feature branches:

   ```bash
   git remote get-url upstream >/dev/null 2>&1 || \
     git remote add upstream https://github.com/pingdotgg/t3code.git
   git fetch --no-tags origin main integrate/rooms-current
   git fetch --no-tags upstream main
   git status --short --branch
   git worktree list
   node scripts/rooms-upstream-report.ts
   ```

Save the report in the PR body. A missing ref or malformed git result makes the command fail rather
than presenting a partial measurement.

## Merge on an isolated branch

Create the sync branch from the fetched integration tip, not from a developer's current checkout:

```bash
git worktree add ../t3code-rooms-upstream-sync \
  -b sync/rooms-upstream-YYYY-MM-DD origin/integrate/rooms-current
git -C ../t3code-rooms-upstream-sync merge --no-ff --no-commit upstream/main
```

Resolve each conflict against the current product boundary:

- preserve Shared Rooms authorization, Electron IPC allow-lists, and profile isolation;
- keep generic T3 defaults and upstream behavior outside the ThreadSpace build;
- regenerate generated files only with their owning command; never hand-merge generated route or
  lockfile output;
- compare both sides of every shared path; do not accept all of `ours` or `theirs` by category;
- record deferred conflicts instead of quietly dropping either side.

Commit the completed merge as one merge commit. Do not rebase, squash away the merge parent, force
push, or cherry-pick the 1,343 upstream commits individually.

## Focused verification

Run the Rooms scope carried by `.github/workflows/rooms-focused.yml` locally:

```bash
vp test run \
  packages/shared/src/roomsTransport.test.ts \
  packages/rooms-agent-api \
  packages/rooms-agent-connector \
  packages/rooms-agent-connector-host \
  apps/web/src/features/rooms \
  apps/web/src/cloud/roomsAuth.test.ts \
  apps/web/src/cloud/publicConfig.test.ts \
  apps/web/src/localApi.test.ts \
  apps/desktop/src/ipc/methods/roomsHuman.test.ts \
  apps/mobile/src/features/rooms

vp run \
  --filter @t3tools/shared \
  --filter @t3tools/rooms-agent-api \
  --filter @t3tools/rooms-agent-connector \
  --filter @t3tools/rooms-agent-connector-host \
  --filter @t3tools/desktop \
  --filter @t3tools/web \
  --filter @t3tools/mobile \
  typecheck

git diff --check origin/integrate/rooms-current...HEAD
node scripts/rooms-upstream-report.ts
```

Add focused tests for every conflict whose behavior changed. The manual `Rooms Focused` workflow
can reproduce the shared suite on GitHub-hosted runners when the PR is ready for that cost; the
fork's main workflow still targets unavailable Blacksmith runners.

Push the branch and open a PR to `integrate/rooms-current`. Include the before/after report, conflict
decisions by surface, focused checks, generated-file commands, and anything that remains unproved.
Do not merge until the Rooms owners review the reconciliation and the applicable desktop, web, and
mobile behavior has been exercised.
