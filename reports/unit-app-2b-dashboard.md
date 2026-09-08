# APP-2B — dashboard and workflow board

## Can Ben run it now?

Yes, as a fixture-backed dashboard unit after APP-01 integrates this commit and wires the
`RoomsDashboard` export into the APP-2A dashboard slot. The worker proof is:

```sh
cd /Users/brw/Developer/apps/t3code/apps/web
mise x node@24.16.0 -- pnpm exec vp test run --project unit \
  src/features/rooms/dashboard/RoomsDashboard.test.tsx
```

APP-01 still owns the integrated typecheck, web/desktop builds, both-sidebar live pass, browser
screenshots, and route-tree generation. This worker did not start a development server or browser.

## Exact inputs

- Unit branch: `unit/app-2b-dashboard`
- T3 producer/integration base: `7608ddde75b86c480811ae41503f50abd0bd073c`
- Original Rooms app base carried by that integration: `a7fb78d86b281ea0ccba6276ec71d97ec18d7e8c`
- Integrated `t3rooms` L15A source: `082f85871125c780a9bb6cbdf78a6df83c622290`
- Contract: `rooms.workspace-read`, version `1`
- Fixture SHA-256 pin consumed through APP-2A:
  `33b4a4d066d75f2b95c7d9c567da6bec16f37821dd8b41e621beaed85d5ae699`
- Worker commit: the single commit resolving `unit/app-2b-dashboard`; APP-01 records its exact SHA
  at integration because a commit cannot contain its own hash.

The implementation imports APP-2A's checked-in model and fixture. It does not duplicate or edit
either producer boundary.

## Changed paths

- `apps/web/src/features/rooms/dashboard/RoomsDashboard.tsx`
- `apps/web/src/features/rooms/dashboard/RoomsDashboard.test.tsx`
- `apps/web/src/features/rooms/dashboard/projection.ts`
- `apps/web/src/features/rooms/dashboard/index.ts`
- `reports/unit-app-2b-dashboard.md`

No path outside the owned dashboard prefix and this report is part of the unit.

## Implemented behavior

- Purely projects the L15A desktop and narrow/mobile projection declarations; stage and story order
  come from `workspace.projections`, not a UI-local workflow.
- Shows the vision headline, summary, current revision/source hash, document/Atlas freshness, and
  fixture routes.
- Shows four desktop columns with fixture labels, declared human owners, delegated agent/provider/run
  status, required and attached evidence, gate state, and gate metadata.
- Derives Needs attention from the server-projected `gate_state` and delegated `run_status` facts.
- Derives recent activity from room feed items in descending source-event sequence.
- At widths below 900 px, renders Needs attention first and then ordered vertical stage groups. It
  does not render a horizontally scrolling board.
- Exposes empty and error fallbacks from explicit L15A state-example inputs, including the fixture's
  authorization message and code.
- Offers no drag/drop, stage action, gate action, or local transition state. Vision and Atlas are
  read-navigation links only; gate truth is display-only.

## Validation evidence

Observed with repository-compatible Node `v24.16.0`:

```text
$ mise x node@24.16.0 -- pnpm exec vp test run --project unit \
    src/features/rooms/dashboard/RoomsDashboard.test.tsx
Test Files  1 passed (1)
Tests       7 passed (7)
Duration    317ms
```

The tests prove fixture stage/story ordering and association, declared owner/delegate/provider data,
evidence/gate metadata, Needs attention derivation, descending recent activity, non-mutation of the
fixture, four-column desktop markup, narrow DOM order, absence of client gate controls, exact
empty/authorization fallback behavior, and visible invalid-projection failure.

```text
$ mise x node@24.16.0 -- pnpm exec vp lint src/features/rooms/dashboard
exit 0; no diagnostics

$ git diff --check
exit 0; no diagnostics
```

The focused test runner regenerated `apps/web/src/routeTree.gen.ts` from APP-2A's new routes. The
file was restored byte-for-byte to this unit's base and is excluded; APP-01 retains route-generation
ownership.

## Surface, provider, and connection matrix

| Dimension     | Applicability and evidence                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web           | Implemented directly as React/Tailwind UI in `apps/web`; focused SSR and projection tests pass.                                                                                |
| Desktop       | Applicable because Electron wraps the web client. Not run by this worker; APP-01 owns the integrated desktop build/live proof.                                                 |
| Native mobile | Deferred. No React Native path changed. The shared L15A `mobile_vertical_stages` policy is honored by the narrow web projection, but this is not physical/native-mobile proof. |
| Codex         | Provider-agnostic rendering; fixture directly proves `openai-codex`.                                                                                                           |
| Claude        | Provider-agnostic rendering; fixture directly proves `anthropic-claude`.                                                                                                       |
| Cursor        | Same provider string boundary is applicable; no Cursor fixture record or runtime proof.                                                                                        |
| Grok          | Same provider string boundary is applicable; no Grok fixture record or runtime proof.                                                                                          |
| OpenCode      | Same provider string boundary is applicable; no OpenCode fixture record or runtime proof.                                                                                      |
| Local         | Pure projection has no transport branch; checked-in local fixture is directly tested.                                                                                          |
| Relay         | Expected to render the same authorized L15A payload; no relay connection was opened.                                                                                           |
| Tunnel        | Expected to render the same authorized L15A payload; no tunnel connection was opened.                                                                                          |

## Artifacts and disk

- New dashboard source/test allocation measured `36 KiB` before commit.
- Lane checkout measured `6,078,688 KiB`; dependencies were already prepared by APP-01.
- Data volume had `83,316,800 KiB` available at the worker evidence cutoff.
- No build output, screenshot, video, database, environment file, network service, or other generated
  artifact was retained.

## Verified, inferred, and not exercised

Verified: exact APP-2A base, fixture/model import boundary, pure projection behavior, responsive
markup structure, empty/error rendering, focused tests, focused lint, ownership, and restoration of
the generated route tree.

Inferred pending APP-01 integration: Electron visual behavior, both V1/V2 sidebar compositions,
actual CSS layout at browser widths, theme contrast, route navigation, and equivalent rendering over
relay/tunnel delivery.

Not exercised by this worker: shared typecheck, web build, desktop build, browser/Computer Use,
screenshots, motion recording, live L15B data, native mobile, physical devices, remote services, live
credentials, provider execution, drag/drop, or any write/gate transition.

## Interface requests and blockers

No frozen-contract or APP-2A interface change is requested. APP-01 only needs to import
`RoomsDashboard` from the dashboard index and assign it to the existing dashboard slot. The optional
`state` prop accepts an exact L15A state example for integrated empty/unauthorized screenshot states
while remaining compatible with `RoomsWorkspaceSlotProps`.

Ben's reserved composer `B2`, the event-subscription seam, global sidebars/routes, package manifests,
lockfiles, contracts, client-runtime code, and environment configuration remain untouched.
