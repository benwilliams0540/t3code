# App M6B authenticated shared Rooms handoff

## Outcome and immutable pins

The T3 Code consumer is implemented on `feat/rooms-m6b-human-identity` from the exact M5
integration floor. The implementation is published only after this report is committed and the
branch is pushed.

```text
app integration floor branch: feat/rooms-m5-claw-live-delivery
app integration floor SHA: 2b55ff38dbd76788d3fc6e69317947d081933cdc
inherited M5 implementation: 1c981888ecdea88527b09b9d9dfbcc143039b790
app M6B implementation SHA: 6c25b93a3f3d9a8b782107f44ebcf649ae972c1b

server integration floor SHA: 2109ca209ca2da3763cdbac338b11015f6223564
inherited server M5 implementation: 4511c58419f0dde56d3149358af91fc2871816bc
server M6B producer SHA: 5c58c843ede9f77a13010645736ddc0abf36eef5
server M6B report head: d3c9946fae8059ab2601493d8c9fe09a684c13bd

contract ID: rooms.human-shared
contract version: 1
schema: contracts/rooms/human-shared/v1/schema.json
```

The app pins the server producer, contract ID, version, and schema path in source. It does not pin
the later server documentation commit as the producer. No live Clerk tenant, account, token,
bootstrap, invite, deployment, `fcfdev` database, or service was used or changed during the app
phase. The implementation is ready for a later authorized live gate; it is not live M6B
acceptance.

## Product behavior

Shared is a third explicit Rooms data source beside Sample and the development-only Local source.
The desktop experience now:

- reuses the existing T3 Connect sign-in and account avatar;
- requests the dedicated Rooms-template Clerk token just in time for every request and long-poll
  reissue;
- distinguishes authenticating, signed-out, authenticated nonmember, invited, ready,
  expired-session, authorization-failure, invalid-configuration, and general-error states;
- discovers only rooms returned by the authenticated session;
- accepts an explicitly supplied one-time first-admin bootstrap;
- lets an authorized admin issue and copy one role-bound opaque invite;
- lets a signed-in nonmember inspect bounded room/role/expiry metadata before accepting an invite;
- displays the current server principal name, role, and stable `h:<uuidv7>` identity;
- resolves message writers only through the server-owned room principal directory;
- keeps unknown writers visibly unresolved rather than attributing them to the reader;
- gates channel, message, work, evidence, review, completion, invite, and role-related controls from
  server capability booleans; and
- reuses the existing channel, story, evidence, review, and native-thread product surfaces without
  changing their ownership model.

Sample, Local v1, Local changes, Local stories v1/v2, native T3 threads, M5 Agent/connector
packages, and managed Relay remain distinct. Shared human credentials are never accepted as Agent
credentials, and the app does not route connector or agent work through human authentication.

## Clerk and Relay separation

Canonical public build variables for Shared Rooms are:

```text
T3CODE_CLERK_PUBLISHABLE_KEY
T3CODE_ROOMS_CLERK_JWT_TEMPLATE
T3CODE_ROOMS_API_URL
```

The loader projects these to the web build aliases. The existing managed Relay still requires all
of its original public configuration, including `T3CODE_CLERK_JWT_TEMPLATE` and
`T3CODE_RELAY_URL`. Rooms-only configuration can mount Clerk without enabling or weakening Relay.
The Relay token options and dedicated Rooms token options remain separate.

Partial or malformed Rooms configuration fails closed. The Rooms API base must be a
credential-free HTTP loopback origin with no path, query, or fragment. Missing publishable key,
Rooms template, or valid loopback origin renders the Shared source unavailable; it does not select
the Local fallback.

## Authentication, state, and persistence boundary

Clerk authentication proves only the current cloud account. The server separately resolves the
stable human binding, room membership, role, capabilities, and message attribution.

The app holds only an in-memory token provider and monotonically increasing authentication
generation. It obtains a fresh short-lived token for each ordinary request and each long-poll
reissue. Sign-out or account switch synchronously removes token access. A Shared workspace snapshot
is renderable only when both its account ID and authentication generation still match. The source
then clears the prior Shared selection, stops the old change loop, ignores late work, and loads
fresh server session/workspace truth.

Only source mode and room IDs are serializable. The persisted selection decoder strips unrelated
fields, and focused tests prove that bearer, bootstrap, and invite fields do not survive its
serialization boundary. Bootstrap and invite redemption credentials live only in current form
state and are cleared after successful redemption or an authentication transition. An issued
invite may remain in the current admin view or clipboard until explicitly cleared, as required for
the handoff action; it is never written to settings, local storage, project bindings, diagnostics,
or a report.

## Narrow transport boundary

Electron adds one typed `requestRoomsHuman` IPC operation. The renderer cannot supply an arbitrary
header map. The main process:

- accepts only credential-free HTTP loopback origins;
- enforces the exact `/rooms/human/v1` route and GET/POST method allow-list;
- accepts only the documented feed/change query keys;
- validates UUIDv7 room, channel, and story path identifiers;
- rejects blank, whitespace-padded, CR/LF-bearing, or over-16-KiB bearers;
- constructs the only `Authorization` header;
- bounds CAS uploads to 5 MiB and permits base64 bodies only on the room CAS route; and
- returns safe typed failures without retaining lower-level HTTP causes that could include request
  headers.

The client validates opaque bootstrap/invite input as nonblank, whitespace-exact, CR/LF-free, and
at most 512 characters. It validates every response against the pinned Effect schema and checks
room/channel/cursor invariants. Stable message and command request IDs survive an in-view retry,
preserving the existing idempotency behavior.

## Surface matrix

| Surface                  | M6B behavior                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Electron desktop         | Required product surface; implemented and tested through the main-process loopback boundary.                                                     |
| Locally hosted web       | Fixed Shared client paths are available when browser CORS/private-network policy permits loopback access.                                        |
| Hosted web               | Clerk may mount, but HTTPS mixed-content, CORS, or private-network policy can block HTTP loopback; no bypass or remote Rails exposure was added. |
| Mobile                   | No Rooms UI was added; existing T3 Connect mobile authentication and public config remain unchanged.                                             |
| T3 Connect managed Relay | Existing template, URL requirement, session minting, and UI behavior remain unchanged and are not required for Rooms identity.                   |

Desktop remains the only acceptance surface for this slice.

## Scope and collision result

No new worktree was created. The canonical app checkout was used because the only pre-existing app
change was the non-overlapping untracked
`reports/monroe-rooms-dogfood-agent-handoff.md`; it remains unmodified and untracked. The existing
dogfood app process was stopped without touching its separately owned SSH tunnel. The tunnel was
left running and listening only on loopback.

The implementation did not touch:

- `packages/rooms-agent-api/**`;
- `packages/rooms-agent-mcp/**`;
- `packages/rooms-agent-connector/**`;
- connector host or service code;
- `apps/server/src/cloud/http.ts` or managed Relay mint semantics;
- provider CLI adapters, orchestration, or native T3 thread ownership;
- M6A tunnel supervisor or connection-state files;
- `cloud-connect` behavior;
- the live `fcfdev` service or database;
- personal/shared T3 state; or
- the read-only control repository.

Shared integration required small changes to the existing Local channel/activity/story components
and the generic Local change-loop interface. Those changes are source-generic only: Local wire
contracts and endpoints remain frozen, and the final focused Rooms regression set covers Sample,
Local, V1/V2, M3/M4, and M5-adjacent touched areas.

## Exact server producer files

The immutable server producer changes exactly:

```text
contracts/rooms/human-shared/v1/README.md
contracts/rooms/human-shared/v1/schema.json
ledger/Gemfile
ledger/Gemfile.lock
ledger/app/controllers/application_controller.rb
ledger/app/controllers/cas_controller.rb
ledger/app/controllers/rooms/human/v1/base_controller.rb
ledger/app/controllers/rooms/human/v1/bootstrap_redemptions_controller.rb
ledger/app/controllers/rooms/human/v1/cas_controller.rb
ledger/app/controllers/rooms/human/v1/changes_controller.rb
ledger/app/controllers/rooms/human/v1/channel_feeds_controller.rb
ledger/app/controllers/rooms/human/v1/channel_messages_controller.rb
ledger/app/controllers/rooms/human/v1/channels_controller.rb
ledger/app/controllers/rooms/human/v1/invite_inspections_controller.rb
ledger/app/controllers/rooms/human/v1/invite_redemptions_controller.rb
ledger/app/controllers/rooms/human/v1/invites_controller.rb
ledger/app/controllers/rooms/human/v1/sessions_controller.rb
ledger/app/controllers/rooms/human/v1/stories_controller.rb
ledger/app/controllers/rooms/human/v1/story_evidence_controller.rb
ledger/app/controllers/rooms/human/v1/story_reviews_controller.rb
ledger/app/controllers/rooms/human/v1/story_threads_controller.rb
ledger/app/controllers/rooms/human/v1/story_transitions_controller.rb
ledger/app/controllers/rooms/human/v1/workspaces_controller.rb
ledger/app/models/rooms/human_attestation_binding.rb
ledger/app/models/rooms/human_bootstrap_credential.rb
ledger/app/models/rooms/human_invite_credential.rb
ledger/app/services/rooms/cas/store.rb
ledger/app/services/rooms/human_access/bootstrap_issuance.rb
ledger/app/services/rooms/human_access/bootstrap_redemption.rb
ledger/app/services/rooms/human_access/contract.rb
ledger/app/services/rooms/human_access/identity_binding.rb
ledger/app/services/rooms/human_access/invite_inspection.rb
ledger/app/services/rooms/human_access/invite_issuance.rb
ledger/app/services/rooms/human_access/invite_redemption.rb
ledger/app/services/rooms/human_access/membership_resolver.rb
ledger/app/services/rooms/human_access/request_context_resolver.rb
ledger/app/services/rooms/human_access/request_session.rb
ledger/app/services/rooms/human_access/session_projection.rb
ledger/app/services/rooms/human_access/workspace_projection.rb
ledger/app/services/rooms/human_attestation/clerk_verifier.rb
ledger/app/services/rooms/human_attestation/configuration.rb
ledger/app/services/rooms/human_attestation/jwks_resolver.rb
ledger/app/services/rooms/human_attestation/request_authenticator.rb
ledger/app/services/rooms/human_attestation/verified_identity.rb
ledger/app/services/rooms/human_credentials/token.rb
ledger/app/services/rooms/membership/state.rb
ledger/app/services/rooms/membership_command.rb
ledger/config/routes.rb
ledger/db/migrate/20260803000007_create_rooms_human_identity.rb
ledger/lib/tasks/rooms_human.rake
ledger/test/contracts/human_shared_contract_test.rb
ledger/test/integration/human_shared_api_test.rb
ledger/test/services/human_access_test.rb
ledger/test/services/human_attestation_test.rb
ledger/test/services/human_credential_concurrency_test.rb
ledger/test/support/human_identity_runtime_proof.rb
```

The server documentation commits add and then correct only
`reports/srv-m6b-human-identity-handoff.md`.

## Exact app implementation files

The implementation commit changes exactly:

```text
.env.example
apps/desktop/src/ipc/DesktopIpcHandlers.ts
apps/desktop/src/ipc/channels.ts
apps/desktop/src/ipc/methods/roomsHuman.test.ts
apps/desktop/src/ipc/methods/roomsHuman.ts
apps/desktop/src/preload.ts
apps/web/src/cloud/managedAuth.tsx
apps/web/src/cloud/publicConfig.test.ts
apps/web/src/cloud/publicConfig.ts
apps/web/src/cloud/roomsAuth.test.ts
apps/web/src/cloud/roomsAuth.ts
apps/web/src/components/clerk/T3ConnectSidebarSignIn.tsx
apps/web/src/components/settings/BetaSettingsPanel.tsx
apps/web/src/features/rooms/channel/RoomsAddChannelDialog.tsx
apps/web/src/features/rooms/channel/RoomsLocalChannelFeed.tsx
apps/web/src/features/rooms/channel/localActivityProjection.test.ts
apps/web/src/features/rooms/channel/localActivityProjection.ts
apps/web/src/features/rooms/dataSource/RoomsDataSourceProvider.tsx
apps/web/src/features/rooms/dataSource/diagnostics.test.ts
apps/web/src/features/rooms/dataSource/humanSharedClient.test.ts
apps/web/src/features/rooms/dataSource/humanSharedClient.ts
apps/web/src/features/rooms/dataSource/humanSharedContract.test.ts
apps/web/src/features/rooms/dataSource/humanSharedContract.ts
apps/web/src/features/rooms/dataSource/index.ts
apps/web/src/features/rooms/dataSource/localChangesLoop.ts
apps/web/src/features/rooms/dataSource/model.test.ts
apps/web/src/features/rooms/dataSource/model.ts
apps/web/src/features/rooms/shell/RoomsHumanAccessPanel.test.ts
apps/web/src/features/rooms/shell/RoomsHumanAccessPanel.tsx
apps/web/src/features/rooms/shell/RoomsHumanWorkspaceSurface.test.ts
apps/web/src/features/rooms/shell/RoomsHumanWorkspaceSurface.tsx
apps/web/src/features/rooms/shell/RoomsWorkspaceNavigation.tsx
apps/web/src/features/rooms/shell/RoomsWorkspaceShell.tsx
apps/web/src/features/rooms/shell/RoomsWorkspaceSurface.tsx
apps/web/src/features/rooms/shell/navigation.test.ts
apps/web/src/features/rooms/shell/navigation.ts
apps/web/src/features/rooms/stories/RoomsLocalStories.tsx
apps/web/src/localApi.ts
apps/web/src/main.tsx
apps/web/vite.config.ts
docs/README.md
docs/cloud/t3-connect-clerk.md
docs/rooms/shared-human-identity.md
packages/contracts/src/ipc.ts
scripts/lib/public-config.test.ts
scripts/lib/public-config.ts
```

This report is the only additional app file in the documentation commit.

## Validation evidence

All required validation was run from the canonical app checkout after the final source fixes.

| Validation                                        | Result                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------- |
| Scoped formatter                                  | PASS - 45 changed/new TypeScript, TSX, and Markdown files             |
| Scoped lint with unused-disable reporting         | PASS - no findings                                                    |
| `@t3tools/contracts` typecheck                    | PASS                                                                  |
| `@t3tools/desktop` typecheck                      | PASS; two unrelated pre-existing Effect suggestions only              |
| `@t3tools/web` typecheck                          | PASS                                                                  |
| `@t3tools/scripts` typecheck                      | PASS                                                                  |
| Focused web Rooms/auth/config/settings tests      | PASS - 43 files / 173 tests                                           |
| Focused desktop Rooms IPC tests                   | PASS - 2 files / 18 tests                                             |
| Public-config loader tests                        | PASS - 1 file / 6 tests                                               |
| Production desktop build                          | PASS - web, server bundle, desktop preload, and Electron main bundles |
| `git diff --check`                                | PASS before the implementation commit                                 |
| Prohibited-path and credential-persistence review | PASS                                                                  |

The test runtime was Node 25.9.0 while the repository declares Node 24.13.1. Focused tests and the
production build passed; Vitest emitted its environment warning about an invalid
`--localstorage-file` path. One earlier command accidentally allowed the web runner to ignore the
intended file list and start its broad suite: 223 of 225 files passed, while two unrelated
`promptStashStore` files failed eight tests because that unsupported Node runtime did not provide a
usable local-storage implementation. This is diagnostic context, not a full-suite claim. The
required focused invocation was corrected and passed in full.

No browser or Computer Use acceptance was performed. No result above proves real Clerk
configuration, physical two-desktop behavior, or live credential hygiene.

## Server producer and exact-image evidence

The published server handoff is
`reports/srv-m6b-human-identity-handoff.md` at server report head
`d3c9946fae8059ab2601493d8c9fe09a684c13bd`. Its immutable producer proof records:

```text
tag: t3rooms-m6b-human-identity:5c58c84
image ID: sha256:bd7fa20494c2abd436c27055e8b35ff3eb4cef1d5db7bdabcb46e005508811d5
repo digest: t3rooms-m6b-human-identity@sha256:bd7fa20494c2abd436c27055e8b35ff3eb4cef1d5db7bdabcb46e005508811d5
OCI revision: 5c58c843ede9f77a13010645736ddc0abf36eef5
image bytes: 248610961
```

The exact image passed 398 Rails runs / 5,112 assertions, migration, schema, RuboCop, Zeitwerk,
Brakeman, Bundler audit, and generated-key PostgreSQL/Rails proof. The runtime proof created two
distinct generated subjects, two stable human principals, admin/operator membership, two
attributed messages, idempotent retry, story/evidence/review/completion, restart recovery, and 401
rejection for expired and invalid signatures. Exact plaintext scans found zero credential hits in
the Rails log and plain database dump. Task-owned containers, volumes, networks, logs, dumps,
certificates, keys, and mutable development image were removed; only the immutable image above was
retained.

That generated-key proof is server evidence, not the live two-account gate below.

## Publication ledger

Published server commits:

```text
5c58c843ede9f77a13010645736ddc0abf36eef5 feat(rooms): add human shared identity
aaab92d00b4480a3cc5740aa7952e440d449fcda docs(rooms): record M6B server proof
d3c9946fae8059ab2601493d8c9fe09a684c13bd docs(rooms): correct M5 server pin
```

App implementation commit:

```text
6c25b93a3f3d9a8b782107f44ebcf649ae972c1b feat(rooms): add shared human identity
```

The final app documentation commit and direct-remote equality are recorded by the publishing
handoff after this report is committed and pushed.

## Later live two-human acceptance runbook

This runbook requires a new, explicit human approval. It deliberately contains no real secret,
token, cookie, email address, or private account identifier.

### 1. Approval and stop conditions

Before touching a live system, record approval for the exact Clerk tenant, existing T3 Connect
application, test devices/accounts, server host, database, deployment window, supervised local
transport, and rollback owner. Stop immediately if any revision differs from the pins below, the
dedicated template cannot be separated from Relay, either desktop requires non-loopback Rails
exposure, Local data would be rewritten, or the credential-leak evidence cannot be collected
without publishing credential values.

Do not use personal app state unless it is explicitly approved for this gate. Use two independent
approved desktop devices or isolated approved desktop profiles:

```text
device A: first approved admin test account
device B: second approved operator test account
```

The accounts must be distinct Clerk subjects. Do not put their emails, provider subject IDs, or
cookies in the acceptance report.

### 2. Pin the deploy/build inputs

Use only:

```text
server branch: feat/rooms-m6b-human-identity
server producer/deploy SHA: 5c58c843ede9f77a13010645736ddc0abf36eef5
server contract: rooms.human-shared v1
server schema: contracts/rooms/human-shared/v1/schema.json

app branch: feat/rooms-m6b-human-identity
app implementation/build SHA: 6c25b93a3f3d9a8b782107f44ebcf649ae972c1b
```

Fetch normally, check out detached exact SHAs or verified branch heads, and record `git rev-parse
HEAD` plus direct remote equality before deployment/build. Do not merge, rebase, force-push,
publish packages, or deploy another revision as part of this gate.

### 3. Configure the existing Clerk application

With the approved Clerk operator:

1. Keep the existing T3 Connect application and sign-in behavior.
2. Create or verify a dedicated Rooms JWT template whose configured name is supplied only through
   `T3CODE_ROOMS_CLERK_JWT_TEMPLATE`.
3. Give that template a dedicated Rooms audience exactly equal to the Rails
   `ROOMS_CLERK_AUDIENCE` value. Do not reuse the Relay template or audience.
4. Use `RS256` and ensure issued tokens contain a stable nonblank `sub`, exact `iss` and `aud`, and
   bounded `exp`, `nbf`, and `iat` claims accepted by the server verifier.
5. Ensure the HTTPS JWK URL belongs to the same issuer origin and exposes the current signing key.
6. Verify configuration presence and claim names without copying any real value into source,
   shell history, screenshots, this report, or the final summary.

### 4. Configure Rails and build the app

Provide these Rails runtime names through the approved secret/configuration manager, without
printing their values:

```text
ROOMS_HUMAN_AUTH_PROVIDER=clerk
ROOMS_CLERK_ISSUER
ROOMS_CLERK_AUDIENCE
ROOMS_CLERK_JWKS_URL
```

Build each approved desktop at the exact app implementation SHA with these public variable names:

```text
T3CODE_CLERK_PUBLISHABLE_KEY
T3CODE_ROOMS_CLERK_JWT_TEMPLATE
T3CODE_ROOMS_API_URL
```

`T3CODE_ROOMS_API_URL` must be an HTTP loopback origin supplied by the existing supervised local
transport. Verify with the platform listener tool that Rails/transport listeners are loopback-only;
there must be no Tailscale `100.x`, LAN, wildcard, or public listener. Do not edit M6A supervisor
files merely to run this gate.

Start the exact server image/revision and app builds with the existing approved deployment and
supervision procedures. Do not restart or mutate unrelated `fcfdev`, M5 Agent, connector, Relay, or
Local services.

### 5. Issue and redeem the one-time first-admin bootstrap

From the exact server producer checkout/image and approved Rails environment, the operator runs:

```sh
ROOM_SLUG=<approved-slug> ROOM_NAME='<approved-name>' TTL_SECONDS=900 \
  bin/rails rooms:human:issue_bootstrap
```

The operator must deliver the one-time output directly to device A through the approved restricted
channel and add the exact value to the restricted scan-needle file described below. Never paste the
output into chat, a ticket, Git, logs, screenshots, or this report.

On device A:

1. Sign in through the existing T3 Connect control with the first approved account.
2. Select Shared Rooms and confirm the state is authenticated but nonmember.
3. Paste the bootstrap only into the first-admin form and redeem it once.
4. Confirm a new shared room appears with the current server name, `admin` role, and one stable
   `h:<uuidv7>` identity.
5. Switch to Local and confirm the existing `Shared Local user` development workspace still exists
   unchanged, then return to Shared.

Record the shared room/event identity only in the restricted acceptance packet. Do not publish the
account or principal values.

### 6. Issue, inspect, and redeem the operator invite

On device A:

1. Open the authenticated shared room dashboard.
2. Choose `operator`, create one invite, and copy the room-plus-invite payload.
3. Add the exact invite plaintext to the restricted scan-needle file without printing it.
4. Deliver it directly to device B through the approved restricted channel.

On device B:

1. Sign in through T3 Connect with the second approved account.
2. Confirm the server is reachable but the shared room cannot be read before membership.
3. Paste the room ID and opaque invite only into the invite form.
4. Inspect the bounded room name, role, and expiry; confirm no membership has yet appeared.
5. Accept once and confirm the same shared room appears with `operator` role and a second stable,
   distinct `h:<uuidv7>` identity.
6. Confirm reuse of the invite is rejected and does not create another membership.

### 7. Prove two-human attribution and retry

1. Device A sends one ordinary, non-sensitive message.
2. Device B sends one different ordinary, non-sensitive message.
3. On both desktops, verify the feed contains exactly those two messages, the same two distinct
   display names, and the same two distinct stable `h:<uuidv7>` IDs in the correct writer order.
4. Verify an intentionally unknown writer fixture/event, if the approved gate includes one, remains
   visibly unresolved and never becomes the current reader.
5. Exercise one owner-approved supervised-transport reconnect immediately around an ordinary
   message submission. If the UI offers Retry, use it without editing the draft so the in-memory
   stable request ID is reused. After recovery, verify exactly one message/event exists for that
   submission. If no genuine retry is exercised, leave the retry portion of the live gate pending.

Do not alter M6A supervisor source or expose Rails remotely for the reconnect exercise.

### 8. Prove restart and account invalidation

With explicit deployment-owner approval, restart Rails through the existing approved service
procedure while leaving the database intact. Do not restart unrelated services.

After restart, verify both desktops recover the same shared room, roles, principal directory,
messages, story/evidence state if exercised, and attribution. Verify each resumed ordinary request
and long poll uses a newly issued short-lived token.

Then on device B, sign out or switch to another approved account. Before any network refresh can
complete, confirm the prior Shared room, role, controls, and cached feed disappear. A newly signed-in
nonmember must see nonmember truth, not device B's prior authority. Sign back in only if needed to
finish evidence capture.

### 9. Prove loopback-only transport and credential hygiene

Capture the bounded Rails log for the gate and a plain dump of the task-approved database into a
restricted temporary directory. The acceptance operator must create a mode-0600 needle file,
outside Git and chat, containing one exact line for every bootstrap credential, invite credential,
JWT, invalid/expired JWT used in the gate, and selected decoded marker. Do not display that file.

After replacing the three path placeholders below with approved restricted paths, run:

```sh
umask 077
M6B_NEEDLE_FILE='<restricted-exact-needle-file>'
M6B_RAILS_LOG='<restricted-bounded-rails-log>'
M6B_DB_DUMP='<restricted-plain-database-dump>'

chmod 600 "$M6B_NEEDLE_FILE" "$M6B_RAILS_LOG" "$M6B_DB_DUMP"
wc -c "$M6B_RAILS_LOG" "$M6B_DB_DUMP"
if LC_ALL=C rg -F -l -f "$M6B_NEEDLE_FILE" "$M6B_RAILS_LOG" "$M6B_DB_DUMP"; then
  echo 'credential_scan_hits=nonzero' >&2
  exit 1
else
  M6B_RG_STATUS=$?
  if [ "$M6B_RG_STATUS" -ne 1 ]; then
    exit "$M6B_RG_STATUS"
  fi
fi
echo 'credential_scan_hits=0'
```

The command prints only byte counts, artifact names on failure, and the zero-hit result; it never
prints matching lines. Treat any match or scan error as a failed gate. Confirm separately that the
non-secret ledger invite ID persists as designed. Securely remove the needle file, plaintext dump,
and temporary log copy through the approved evidence-retention procedure after their hashes and
zero-hit result are recorded.

On both devices and the server host, record listener output proving the app reaches only loopback.
Any wildcard, LAN, Tailscale `100.x`, or public listener fails the gate.

### 10. Rollback boundaries

If the gate fails:

- disable the additive human-auth configuration so the surface fails closed;
- return app/server deployment pointers through the existing approved rollback procedure to the
  recorded pre-gate revisions;
- revoke the dedicated Rooms template/key only through the Clerk operator, without changing the
  Relay template or T3 Connect sign-in application;
- allow unredeemed one-time credentials to expire or revoke them through an approved server
  procedure;
- preserve the database backup and event evidence; do not destructively roll back the additive
  migration or delete shared room history without separate approval;
- do not modify or roll back M5 Agent/connector state, M6A transport supervision, Local v1 data,
  native T3 threads, personal T3 state, or unrelated `fcfdev` services; and
- restore loopback-only service state before ending the window.

### 11. Evidence required to accept M6B

The restricted acceptance packet must contain:

1. exact local and direct-remote server/app branches and SHAs;
2. config-presence checks naming the dedicated template/audience variables but no values;
3. two approved device labels and proof of two distinct signed-in subjects without emails or
   provider subject IDs in the public summary;
4. first-contact zero-membership evidence and explicit bootstrap creation of one new shared room;
5. preserved legacy Local workspace evidence;
6. prejoin denial, bounded invite inspection, operator redemption, and invite-reuse rejection;
7. both messages on both desktops with consistent distinct names and stable IDs, retained only in
   the restricted packet;
8. a genuine retry/reconnect with one resulting message/event;
9. Rails restart recovery with identical room, membership, messages, and attribution;
10. sign-out/account-switch evidence showing immediate loss of cached prior authority;
11. loopback-only listener evidence from server and both desktops;
12. bounded log/dump byte counts, artifact hashes, exact needle count, and
    `credential_scan_hits=0`; and
13. cleanup/rollback truth, including every retained artifact.

The acceptance owner must explicitly sign off all thirteen items. Automated tests, the generated
server proof, one account, or a successful build cannot substitute for this gate.

## Remaining limitations

- Real Clerk configuration and two real accounts were intentionally not used.
- Desktop is the required product surface; hosted web remains subject to browser loopback policy.
- M6A owns supervised transport and connection-state UX; this branch consumes loopback only.
- No deployment, production authentication, signed control, connector activation, or package
  publication occurred.
- The manual retry/reconnect, restart, account-switch, listener, and credential-leak checks remain
  pending.

M6B HUMAN IDENTITY IMPLEMENTATION PUBLISHED — LIVE TWO-HUMAN GATE PENDING
