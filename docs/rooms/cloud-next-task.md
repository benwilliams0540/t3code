# Next cloud work for ThreadSpace

Prepared 2026-09-25 after reviewing the first cloud report. Runtime source remains client main `bdd40b607e4b715f0478b4fd9522dc27255b4a1e`; this delivery adds documentation. Refresh the actual head and overlapping work before starting.

## First choice: resolve hosting and recovery design

Use the separately authorized private `benwilliams0540/t3rooms` repository on **main**, not its GitHub default feature branch. Read issue #8 and `docs/reviews/cloud-hosting-recovery-packet.md`. Produce the bounded source-backed comparison and checkpoint/authority proposal requested there. This directly supports #31 and the priority order in #26. It requires repository access, not a running Mac or Rails service. Keep private evidence private. Do not substitute a broad rewrite or deploy services.

If the cloud runner cannot access that private repository, report the access boundary once and use the independent client assignment below. Do not spend the session trying to recreate a private service.

## Independent client assignment: Shared cursor recovery

Goal: a Shared Rooms connection recovers from an ahead-of-server cursor instead of retrying forever. This is a bounded reliability fix supporting #21; it does not change product defaults, feed pagination, hosting, auth or invite behavior.

Read AGENTS.md, #21, `docs/rooms/cloud-product-review.md`, then:

- `apps/web/src/features/rooms/dataSource/humanSharedContract.ts`: `RoomsHumanErrorResponse` currently omits `head_seq`.
- `apps/web/src/features/rooms/dataSource/humanSharedClient.ts`: the Shared error decoder drops that value.
- `apps/web/src/features/rooms/dataSource/localChannelsClient.ts`: the existing Local decoder and error shape.
- `apps/web/src/features/rooms/dataSource/localChangesLoop.ts`: cursor-ahead recovery requires `headSeq`.
- The corresponding focused decoder and change-loop tests.

Add the optional validated head field to the Shared contract and preserve it in the error. Match the existing Local behavior without accepting malformed negative/non-integer values. Add a regression that exercises Shared decoding through change-loop recovery: an ahead cursor receives a lower valid head, the next wait uses the corrected head, and the loop resumes. Cover absent/malformed heads and unrelated errors without a tight retry loop or fabricated successful recovery. Use deterministic receipts or controlled promises, not sleeps.

Do not silently expand into default-mode migration: #21 requires preserving explicit preferences and generic T3 defaults. Feed pagination and invite response-loss behavior require separate contract review before implementation. Do not make those changes incidentally.

### Cloud environment and finish condition

For source review no installation is needed. For this implementation, use the versions in package.json: Node `^24.13.1`, pnpm `11.10.0`, repository `vp` workflow. Check these once before `vp i`. Missing personal `/Users/...` instructions and installed apps are not cloud prerequisites. Use one evidence-backed correction if setup fails; preserve manifests/lockfile and report the exact remaining limitation instead of changing versions until a build happens.

Run only focused tests, such as `vp test run apps/web/src/features/rooms/dataSource/humanSharedClient.test.ts apps/web/src/features/rooms/dataSource/localChangesLoop.test.ts`, plus the touched contract tests if required. Follow current repository instructions for targeted typechecking. No repo-wide check, desktop packaging, live providers, or real service credentials. If tests cannot run, return the patch with that gate explicitly pending.

Commit and push the provisioned task branch, report exact commit and tests. Do not open a PR unless the task explicitly requests one; do not merge or schedule recurring checks. Local integration must verify Shared reconnect in the installed client against the intended service. Unit tests prove the regression path, not installed multi-device acceptance.

## Local follow-up

The coordinator reviews each returned artifact once, runs the unavailable local gate, integrates authorized changes onto main, packages and verifies the installed app, and records actual acceptance on the existing issue. Cloud stops after its bounded handoff; it does not wait for device checks by polling.
