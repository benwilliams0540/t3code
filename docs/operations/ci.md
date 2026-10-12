# Focused verification

ThreadSpace is a collaborative prototype. Choose checks for the changed behavior,
then stop when the agreed acceptance condition is established. A local launch is
startup evidence; consequential data, access and write behavior needs its own proof.

| Change                               | Useful local proof                                                                                                                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy, styling or layout              | One representative preview/interaction and the affected build/typecheck. Add a test only for meaningful behavior or a real regression.                                                 |
| Client/domain behavior               | `vp test run <affected-files>` plus the affected package's build/typecheck. Cover relevant state transitions, failure/retry and adapter boundaries.                                    |
| Room contract/session/write behavior | Focused client and service compatibility tests for the changed boundary. Preserve server/account switching, membership, stable request identity, pagination and duplicate suppression. |
| Packaging or native changes          | A check of the affected platform/artifact when available. Record native checks that could not run; reserve a full platform matrix for a selected release.                              |
| Workflow or instruction changes      | Parse/review changed definitions, run actionlint for workflows and check referenced commands/paths. Validate without dispatching publishing or deployment.                             |

Use current package scripts and the `vp` workflow. Whole-repository `vp check`,
recursive tests/typechecks and native matrices are opt-ins when their wider evidence
is needed. Keep focused regressions for user history, privacy, shared access and
external writes. Replace assertions that merely freeze obsolete presentation or
implementation details as their area changes; identify current consumers before
retiring a compatibility path.

## Requested hosted checks

- **Actions → Rooms Focused → Run workflow** runs the Rooms transport, shared
  runtime, agent API/MCP/connector, web, desktop Local/Human boundary and mobile
  tests, followed by relevant package typechecks on `ubuntu-latest` (20-minute limit).
  The YAML is the authoritative command list. This is a broader optional recipe,
  not the command for every small Rooms edit.
- **Actions → CI → Run workflow** runs the full inherited **Check**, **Test**,
  **Mobile Native Static Analysis** and **Release Smoke** jobs (10-minute limits).
  They use standard GitHub-hosted Ubuntu/macOS runners; native analysis installs
  the mobile Brewfile. Full-job success and duration on those runners still need
  verification when a full run is actually requested.

Both workflows are manual-only. Opening or merging a PR does not establish a hosted
pass. For a requested run, record its URL and tested commit; do not wait or poll for
CI as a routine pre-merge gate. Report local proof and unavailable checks in the PR,
with a short list of what to try in the next ordinary client session.

## Publication is separate

**Release** and **Deploy T3 Connect relay** are manual-only publication operations.
Their existing runner labels, signing configuration and production environment
gates are preserved. They are not validation workflows: the inherited release
recipe can publish npm/GitHub/web artifacts and announcements. Read the
[release runbook](release.md) for an authorized operation, or the
[ThreadSpace delivery runbook](threadspace-delivery.md) for a private development build.
