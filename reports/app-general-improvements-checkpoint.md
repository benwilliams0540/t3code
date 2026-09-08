# App general-improvements checkpoint

Date: 2026-08-01 (America/New_York)

## Scope and base

- Repository: `/Users/brw/Developer/apps/t3code`
- Branch: `feat/general-improvements`
- Published base at Gate 0: `e69caa60598b3c3951147fc9c82cf32447f05701`
- M2 consumer base remains an ancestor: `f72d291`
- Ben-owned interrupted input preserved and completed: the pre-existing
  `packages/contracts/src/settings.ts` composer-shortcut schema diff
- Preserved unrelated file, not staged: `reports/monroe-rooms-dogfood-agent-handoff.md`

## Previously accepted product behavior

Ben separately reported manual product acceptance for these already-published commits:

- `dd9ea9fee0817366de1d5348d22c88c51a3df7a7` — channel conversation rendering
- `50b9551ed3d91b905c03dca6ce40f6a4457e095e` — compact composer `+` image and trigger actions
- `e69caa60598b3c3951147fc9c82cf32447f05701` — working native threads in the V3 sidebar

That manual acceptance is not claimed as proof for the new shortcut implementation. The accepted
conversation, quick-action, and working-thread paths were retained; no emoji, GIF, or story action
was added to the composer menu.

## Shortcut implementation

The typed client-settings schema now has independent fields:

- `channelComposerSendShortcut`, default `modifier_when_multiline`
- `threadComposerSendShortcut`, default `enter`

Both accept `enter`, `modifier_when_multiline`, and `modifier_always`. Decoding an older settings
document supplies the defaults. The patch schema accepts either field independently, and the
existing client hydration/persistence route performs a whole-snapshot merge without changing the
other preference.

The Beta settings page exposes separate Channel and Thread radio controls. The native
`ChatComposer` reads the thread setting without replacing its provider, environment, project,
thread, draft, send-state, or quick-action machinery. The Local Rooms channel composer reads the
channel setting while retaining its capability guard, pending guard, exact Markdown body, error
display, retained draft after failure, and stable request UUID across retry.

One shared keyboard policy evaluates actual `\n` content, never visual wrapping:

- `enter`: Enter sends; Shift+Enter inserts a newline.
- `modifier_when_multiline`: plain Enter sends a single line; after an actual newline it inserts a
  newline; Cmd/Ctrl+Enter sends.
- `modifier_always`: plain Enter inserts a newline; Cmd/Ctrl+Enter sends.

IME composition and the legacy key-code `229` fallback never send. On responsive mobile, plain
Enter continues to insert a newline under every policy, preserving the existing software-keyboard
safety behavior; an explicit Cmd/Ctrl+Enter from a hardware keyboard can send. The native React
Native mobile composer is a separate implementation and does not consume the web/desktop client
setting in this checkpoint.

## Automated validation

| Validation                                                       | Result                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| Contract settings suite (`packages/contracts`)                   | PASS — 16 files / 219 tests                              |
| Focused web shortcut, persistence, channel retry, and feed tests | PASS — 5 files / 56 tests                                |
| Focused shortcut/channel regression rerun                        | PASS — 3 files / 53 tests                                |
| Desktop client-settings persistence test                         | PASS — 1 file / 7 tests                                  |
| Contracts typecheck                                              | PASS                                                     |
| Web typecheck                                                    | PASS                                                     |
| Desktop typecheck                                                | PASS; two unrelated pre-existing Effect suggestions only |
| Mobile typecheck                                                 | PASS                                                     |
| Web production build                                             | PASS; existing chunk-size advisory only                  |
| Scoped lint                                                      | PASS                                                     |
| Scoped format check and `git diff --check`                       | PASS                                                     |

Focused assertions cover legacy/default decoding, patch rejection, all three policies, actual
newline detection, Shift/Command/Control variants, IME and key-code `229`, responsive mobile,
independent patch persistence, exact channel retry identity, capability rejection, blank-body trim
checking, and duplicate in-flight rejection.

An initial web package-script invocation placed file arguments after its internal `--` and
therefore ran the full unit project instead of the intended file subset. It reported 220 passing
files and the unrelated `promptStashStore.test.ts` failing 8 tests because `localStorage` lacked
`setItem`; the run also warned that Node `v25.9.0` is outside the package's requested Node
`^24.13.1` and that `--localstorage-file` had no valid path. The correctly scoped direct invocation
then passed all 5 requested files. This unrelated full-suite result is not counted as shortcut
proof.

## Surface and transport consequences

- Web: setting, hydration, keyboard policy, and both relevant composers are covered by focused
  tests, typecheck, and production build.
- Desktop: it hosts the same web `ChatComposer` and Local Rooms channel surface; typed desktop
  settings persistence now round-trips the new fields, with focused test and typecheck passing.
- Mobile web viewport: preserves plain-Enter newline behavior; modifier behavior is tested.
- Native mobile: separate React Native composer, so consuming these web composer preferences is not
  applicable to this checkpoint; its typecheck passes after the shared contract addition.
- Local/relay/tunnel: the preference remains app-local client state and changes no backend, relay,
  tunnel, authentication, or native thread identity. The Local channel consumer remains restricted
  to the configured loopback Rooms API.

## Manual proof and publication

No new manual product-acceptance claim is made for the shortcut controls or their keyboard feel.
The bounded integrated browser/desktop pass belongs to the later M3 integration phase. Publication
evidence and `M3_APP_CANDIDATE_SHA` are recorded after the single checkpoint commit is created,
pushed by normal fast-forward, and verified equal to the remote branch.
