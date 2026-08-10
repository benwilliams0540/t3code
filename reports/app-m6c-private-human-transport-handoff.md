# M6C private Human transport — app handoff

## Outcome and immutable inputs

M6C is implemented locally on `feat/rooms-m6c-private-human-transport`.
The implementation was based on app revision
`6758d7bdeae329ed074ec798811f53b75e03fd73` and the accepted M6 producer
revision `e8a84387d584d0d126d2e6eb86af6850845b8d2a`. The implementation-only head
before this handoff is `a7f8613fe8006ebdc40582f0311c4a65bbd835b1`:

- `ea7022fd8` — `feat(rooms): add Shared origin policy`
- `a7f8613fe` — `feat(rooms): enable desktop Shared HTTPS`

No commit was pushed and no pull request, release, hosted web configuration, or
live environment was changed.

## Delivered behavior

- Rooms now distinguishes Local and Shared origins. Local accepts only HTTP
  loopback; Shared accepts HTTPS origins and HTTP loopback. Origins with
  credentials, paths, queries, or fragments fail closed.
- Shared transport is desktop-only for non-loopback HTTPS. A browser build
  cannot call a Shared server directly; it must have the Electron bridge.
- The Electron main process enforces the exact authenticated Human route,
  method, identifier, and query-key allow-list before performing a request.
  It sends only `Authorization` and, when needed, `Content-Type`; browser
  credentials are omitted and redirects are handled manually and rejected.
- GET bodies are rejected. Bearers reject whitespace/CRLF and values over
  16 KiB. JSON bodies are capped at 64 KiB. CAS bodies must be valid base64 on
  the CAS route and decode to no more than 5 MiB.
- Redirect rejection is covered for same-origin, cross-origin, and HTTPS to
  HTTP downgrade responses before response bodies are consumed.
- The Shared client fetches a fresh Clerk bearer for every request and checks
  the auth generation after every response, including long-poll completion.
  Stale-generation responses cannot update UI state.
- No token, cookie, Shared origin, or Shared transport response is persisted.
  Existing Local loopback transport remains supported.

## Changed paths

- `.env.example`
- `packages/shared/package.json`
- `packages/shared/src/roomsTransport.ts`
- `packages/shared/src/roomsTransport.test.ts`
- `apps/desktop/src/ipc/methods/roomsHuman.ts`
- `apps/desktop/src/ipc/methods/roomsHuman.test.ts`
- `apps/web/src/cloud/publicConfig.ts`
- `apps/web/src/cloud/publicConfig.test.ts`
- `apps/web/src/cloud/roomsAuth.ts`
- `apps/web/src/cloud/roomsAuth.test.ts`
- `apps/web/src/features/rooms/dataSource/RoomsDataSourceProvider.tsx`
- `apps/web/src/features/rooms/dataSource/humanSharedClient.ts`
- `apps/web/src/features/rooms/dataSource/humanSharedClient.test.ts`
- `apps/web/src/features/rooms/dataSource/localChannelsClient.ts`
- `apps/web/src/localApi.ts`
- `apps/web/src/localApi.test.ts`
- `reports/app-m6c-private-human-transport-handoff.md`

No `.github/**`, `packages/client-runtime/**`, or
`packages/rooms-agent-connector/**` file changed. The pnpm lockfile is
unchanged. Pre-existing user changes to `.gitignore` and `fastlane/` were not
touched or staged.

## Local validation

Validation used Node 24.19.0 and pnpm 11.10.0.

| Check                                                   | Result                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Frozen dependency install                               | Passed; lockfile unchanged                                                                                           |
| Rooms/app/desktop/shared/connector regression selection | 49 files, 252 tests passed                                                                                           |
| Typecheck: contracts, shared, desktop, web, connector   | Passed                                                                                                               |
| Full lint                                               | Passed; only existing warnings outside M6C paths                                                                     |
| Changed source-file format check                        | 15 of 15 files passed                                                                                                |
| App handoff format check                                | Passed                                                                                                               |
| Production desktop build                                | Passed for web, server bundle, preload, and Electron main                                                            |
| `git diff --check` from the pinned base                 | Passed                                                                                                               |
| Prohibited-path and lockfile diff checks                | Zero changes                                                                                                         |
| Secret-pattern scan                                     | Zero PEM, cloud/API token, JWT, or high-entropy bearer candidates; three intentional URL-userinfo rejection fixtures |

The full-repository format check is not claimed: it reports four pre-existing
Rooms fixture JSON files and the unrelated untracked `fastlane/README.md`.
Every M6C source file passed the scoped format check. Existing lint warnings in
ChatMarkdown, SidebarUpdatePill, CommandPalette, and ThreadTerminalDrawer were
not changed.

Generated `apps/web/dist`, `apps/server/dist`, and
`apps/desktop/dist-electron` output was removed after validation. Existing
dependency caches and unrelated working-tree state were preserved. Homebrew
Node 24.19.0 was installed to satisfy the repository's Node 24 engine and was
retained as the required local toolchain.

## Live acceptance still required

No signed desktop build or physical-device flow was run. No Clerk production
configuration or credential was read or changed. No tailnet endpoint was
contacted, no account/room/provider state was created or mutated, and no
network-interruption, app-restart, fallback-stop, or two-account acceptance
story was exercised. Those steps remain behind the explicit live authorization
gate and must use the exact reviewed app/server revisions named by the operator.

Current expected transport boundary after an authorized deployment:

```text
signed desktop renderer
  -> Electron main-process Human allow-list
  -> private tailnet HTTPS Human ingress

browser renderer -> non-loopback Shared HTTPS rejected
Local mode       -> HTTP loopback only
Agent connector  -> existing internal loopback path, unchanged
```
