# APP-2D · Documents, Atlas, evidence, and audit

## Can Ben run it now?

Not as a standalone unit branch. The fixture-backed React exports and focused tests are complete,
but APP-01 owns the shared slot registry and integrated desktop process. The shortest remaining step
is to cherry-pick this unit commit into `integrate/rooms-slice-1`, register `RoomsProjectSurface` as
the project slot and `RoomsVisionAtlas` as the Atlas slot, then run the primary-owned integrated
validation.

After integration, the approved isolated command is:

```text
T3CODE_DEV_INSTANCE=rooms-slice-1 mise x node@24.16.0 -- pnpm exec vp run dev:desktop --home-dir /Users/brw/Developer/apps/t3code/.t3/rooms-slice-1
```

This worker did not start a development server, browser, remote service, credential flow, or use a
personal T3 home.

## Exact inputs

- Unit branch: `unit/app-2d-project-surfaces`
- Exact unit base after APP-2A, APP-2B, then APP-2C integration:
  `76eb86b4b3be36dd2b657c618b9aa49db5efa13f`
- Original Rooms app base carried by the integration:
  `a7fb78d86b281ea0ccba6276ec71d97ec18d7e8c`
- Integrated `t3rooms` L15A source: `082f85871125c780a9bb6cbdf78a6df83c622290`
- Contract: `rooms.workspace-read`, version `1`
- Checked-in fixture SHA-256:
  `33b4a4d066d75f2b95c7d9c567da6bec16f37821dd8b41e621beaed85d5ae699`
- Checked-in schema SHA-256:
  `79f0827c9199c9a0347dd3f99643cdd773d3857b88415c64ca3c4ff625cfbae9`
- Worker commit: the single commit resolving `unit/app-2d-project-surfaces`; APP-01 records its exact
  SHA at integration because a commit cannot contain its own hash.

The implementation imports APP-2A's checked-in model and fixture. It does not duplicate or edit
either producer boundary.

## Changed paths

```text
apps/web/src/features/rooms/atlas/RoomsVisionAtlas.test.tsx
apps/web/src/features/rooms/atlas/RoomsVisionAtlas.tsx
apps/web/src/features/rooms/atlas/index.ts
apps/web/src/features/rooms/atlas/projection.ts
apps/web/src/features/rooms/audit/RoomsAuditDecisions.test.tsx
apps/web/src/features/rooms/audit/RoomsAuditDecisions.tsx
apps/web/src/features/rooms/audit/index.ts
apps/web/src/features/rooms/audit/projection.ts
apps/web/src/features/rooms/documents/RoomsVisionDocument.test.tsx
apps/web/src/features/rooms/documents/RoomsVisionDocument.tsx
apps/web/src/features/rooms/documents/index.ts
apps/web/src/features/rooms/documents/projection.ts
apps/web/src/features/rooms/evidence/RoomsEvidenceList.test.tsx
apps/web/src/features/rooms/evidence/RoomsEvidenceList.tsx
apps/web/src/features/rooms/evidence/index.ts
apps/web/src/features/rooms/evidence/projection.ts
apps/web/src/features/rooms/project/RoomsProjectIndex.tsx
apps/web/src/features/rooms/project/RoomsProjectSurface.test.tsx
apps/web/src/features/rooms/project/RoomsProjectSurface.tsx
apps/web/src/features/rooms/project/RoomsStoriesList.tsx
apps/web/src/features/rooms/project/index.ts
apps/web/src/features/rooms/project/projection.ts
reports/unit-app-2d-project-surfaces.md
```

No path outside the five owned feature prefixes and this report is part of the unit.

## Implemented boundary

- `RoomsProjectSurface` routes fixture-backed project sections for `vision`, `stories`, `evidence`,
  and `audit-decisions`; `RoomsProjectIndex` exposes the project documentation dashboard. Unknown
  routes and empty project data render explicit states.
- `RoomsVisionDocument` renders the exact current revision Markdown with the existing
  `react-markdown` and GFM dependencies. Its revision rail shows current and queued state, author and
  principal type, UTC time, immutable revision ID, and full source hash.
- Document source remote URL, pinned SHA, source head, compared-at time, and freshness are visible.
  The fixture's stale source mismatch produces a prominent regeneration warning without relying on
  a user opening metadata.
- `RoomsVisionAtlas` represents only declared fixture relationships: selected room, document and
  bound revision, channels, ordered workflow stages, and grouped human/agent/machine presence. It
  embeds or fetches no remote content and prominently marks the fixture Atlas stale.
- Evidence is the union of story attached-ID references and `evidence_attached` feed data. The one
  item with supplied CAS metadata shows its exact kind, hash, byte count, media type, actor, and
  source sequence; the other three are explicitly labeled reference-only. Unattached required
  evidence remains visible.
- Audit events flatten the two fixture feeds into global source-sequence order and preserve event
  ID/type/schema, time, summary, and actor identity. The recorded `approval_decided` fact is shown
  separately from declared workflow gate facts; gate definitions are not presented as invented
  audit events.
- Story and project-index views project only L15A data and perform no writes, fetches, provider
  calls, gate transitions, or client-local truth changes.

## Observed validation

All commands used repository-compatible Node `v24.16.0`.

```text
cd /Users/brw/Developer/worktrees/t3code-lane-1/apps/web
mise x node@24.16.0 -- pnpm exec vp test run --project unit \
  src/features/rooms/documents/RoomsVisionDocument.test.tsx \
  src/features/rooms/atlas/RoomsVisionAtlas.test.tsx \
  src/features/rooms/evidence/RoomsEvidenceList.test.tsx \
  src/features/rooms/audit/RoomsAuditDecisions.test.tsx \
  src/features/rooms/project/RoomsProjectSurface.test.tsx

Test Files  5 passed (5)
Tests       11 passed (11)
Duration    523ms
```

The tests prove the exact current/queued revision projection, Markdown and source hashes, compared
freshness and stale warnings, Atlas revision binding and stale warning, fixture-only Atlas
relationships, full-metadata versus reference-only evidence, missing evidence requirements,
globally ordered audit source events, decision actor identity, gate-fact separation, all four
project section mappings, single-document index data, and truthful unknown/empty handling.

```text
cd /Users/brw/Developer/worktrees/t3code-lane-1
mise x node@24.16.0 -- pnpm exec vp lint \
  apps/web/src/features/rooms/documents \
  apps/web/src/features/rooms/atlas \
  apps/web/src/features/rooms/evidence \
  apps/web/src/features/rooms/audit \
  apps/web/src/features/rooms/project

exit 0; no diagnostics

git diff --check
exit 0; no diagnostics
```

The focused test runner regenerated `apps/web/src/routeTree.gen.ts`. It was restored exactly to the
unit base and is excluded; APP-01 retains route-generation ownership.

## Surface, provider, and connection matrix

| Dimension     | Status                                      | Evidence / reason                                                             |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Web           | Implemented                                 | React exports and focused SSR/projection tests pass                           |
| Desktop       | Applicable through the web shell            | APP-01 must wire, build, run, and capture the integrated Electron pass        |
| Native mobile | Deferred                                    | This unit owns only web feature prefixes; no React Native route was assigned  |
| Codex         | Provider-agnostic                           | Fixture attributes the queued revision to a Codex agent principal             |
| Claude        | Provider-agnostic                           | Human current-revision attribution is independent of any assisting provider   |
| Cursor        | Provider-agnostic, inferred                 | No provider-specific branch; no Cursor revision/event exists in the fixture   |
| Grok          | Provider-agnostic, inferred                 | No provider-specific branch; no Grok revision/event exists in the fixture     |
| OpenCode      | Provider-agnostic, inferred                 | No provider-specific branch; no OpenCode revision/event exists in the fixture |
| Local         | Implemented against the exact local fixture | Pure projection requires no server or credentials                             |
| Relay         | Presentation-equivalent, inferred           | The component consumes supplied workspace data only; no relay was opened      |
| Tunnel        | Presentation-equivalent, inferred           | The component consumes supplied workspace data only; no tunnel was opened     |

## Verified versus inferred

Verified locally: exact integrated consumer base, model/fixture import boundary, source and fixture
hashes, pure projections, exact document/revision/freshness rendering, fixture-only Atlas,
evidence-fidelity distinction, source-event order and actor identity, section routing and fallback
states, focused tests, focused lint, formatting, owned-path boundaries, and route-tree restoration.

Inferred pending APP-01 integration: final appearance and navigation under both V1 and V2 sidebars,
browser keyboard behavior, responsive layout and theme contrast, Electron behavior, relay/tunnel
delivery, and provider cases absent from the fixture.

## Generated artifacts and disk

- New source/test allocation before commit: documents `20 KiB`, Atlas `20 KiB`, evidence `20 KiB`,
  audit `20 KiB`, and project `28 KiB`; the report is additional small text.
- Existing lane `node_modules`: `5,879,500 KiB`; this unit installed nothing.
- Lane apparent size at measurement: `6,058,848 KiB`.
- Data volume available at evidence cutoff: `82,133,704 KiB` (`92%` capacity used).
- Transient generated route tree: restored exactly; no generated artifact remains tracked or dirty.
- No screenshot, video, build, cache, database, environment, scratch-home, or network-service
  artifact was created by this worker.

## Interface requests, blockers, and untested cases

No contract or APP-2A interface change is requested. APP-01 only needs to import
`RoomsProjectSurface` from `features/rooms/project` and `RoomsVisionAtlas` from
`features/rooms/atlas`, then assign them to the existing `project` and `atlas` slots.

Not exercised by this worker: shared web typecheck, web build, desktop build, development server,
browser/Computer Use, screenshots, motion recording, both sidebar variants, narrow visual layout,
live L15B data, native mobile, physical devices, relay/tunnel connections, remote services, live
credentials, or provider execution. The current fixture contains one document, one Atlas, one
detailed evidence event, and one approval decision; multi-document history, multiple decisions,
fully populated evidence metadata, and a current Atlas are structurally supported but not fixture
proven.

Ben's reserved composer `B2`, the event-subscription seam, global sidebars/routes, shell/model/
fixture producers, dashboard/channel/activity consumers, package manifests, lockfiles, contracts,
client-runtime code, and environment configuration remain untouched.
