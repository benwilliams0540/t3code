# ThreadSpace desktop delivery

Use this runbook when a Rooms change must work in the installed ThreadSpace app. It records the
checks that shorten future investigations; the issue, pull request, and commits retain the task
history.

## Keep the evidence in the right place

| Artifact           | What belongs there                                                |
| ------------------ | ----------------------------------------------------------------- |
| This documentation | Stable behavior, boundaries, and repeatable verification          |
| GitHub issue       | Current outcome, acceptance criteria, and remaining work          |
| Pull request       | The change, review discussion, and validation evidence            |
| Git commits        | Exact implementation history                                      |
| `reports/`         | A fixed acceptance snapshot only when later work needs to cite it |

Do not add a report for every attempt. Update this runbook only when a lesson changes how the next
person should build, diagnose, or accept the product.

## Delivery evidence

Treat these as separate gates:

1. The intended commit is on `main`.
2. The packaged app was built from that exact commit and has the expected version and signature.
3. That exact app bundle is installed.
4. The running process belongs to the installed bundle and reports the expected version.
5. Required services answer from the same network path the app uses.
6. The user completes the real flow in the installed app.
7. Durable behavior survives app replacement or restart when persistence is part of the change.

For ThreadSpace work, “merged” means the change has reached `main` and the real build. A green unit
test, a pull request merge, or a replaced app bundle establishes only one gate.

On macOS, an older Electron process can continue running after the app bundle is replaced. Quit the
app through its normal lifecycle, launch the installed bundle, and verify the bundle path, process,
version, and commit-derived artifact before testing. Preserve existing local state until the issue
has been reproduced; move a cache aside for a clean-state test instead of deleting it.

## Fast diagnostic order

Follow the user action across boundaries in this order:

1. installed artifact and running process;
2. renderer request or sign-in action;
3. Electron main-process transport;
4. system-browser OAuth launch;
5. custom-protocol callback into ThreadSpace;
6. Rooms session and membership;
7. room load and restart persistence.

Stop at the first boundary without evidence. A request reaching the provider does not prove the
response reached the renderer, and the disappearance of one error does not prove the whole flow.
Use focused tests first. Add temporary live logging only around the uncertain boundary, and record
method, host/path, status, and lifecycle events without tokens, credentials, or OAuth query data.

For an FCFDEV-hosted room, check tailnet reachability, peer identity, SSH authentication, and HTTP
readiness independently. One passing check does not establish the next one.

## Clerk in the Electron app

`@clerk/electron` marks its native requests with `_is_native=1` and supplies a bearer authorization
header. Electron may also add the renderer's `Origin` header. Clerk rejects a request that presents
both native authorization and browser origin semantics.

The desktop main process therefore owns a narrow compatibility boundary:

- remove `Origin` only for HTTPS requests to the exact configured Clerk frontend API when the URL
  is native and a nonempty bearer is present;
- match header names case-insensitively and leave browser-style requests and every other host alone;
- add `Access-Control-Allow-Origin` to the corresponding native response for the exact renderer
  origin, because Electron still applies response CORS to the renderer; and
- install the hooks after Electron is ready and before creating the browser window, with scoped
  cleanup.

Provider SDK upgrades do not replace live acceptance of this boundary. The implementation and
regressions are documented by [PR #35](https://github.com/benwilliams0540/t3code/pull/35) and
[PR #36](https://github.com/benwilliams0540/t3code/pull/36); the completed installed-app evidence is
on [issue #34](https://github.com/benwilliams0540/t3code/issues/34).

### External OAuth return and retry

The SDK owns the browser handoff and pending flow. For a packaged ThreadSpace build the redirect
is exactly `threadspace://app/`; development uses `threadspace-dev://app/`. The SDK accepts a
matching `open-url` event or matching URL in `second-instance` arguments. Matching checks the
scheme, host, and path; query parameters and fragments are passed to Clerk for authentication.
Transport completion alone does not prove authentication or room membership.

With the current SDK, one pending flow is allowed and its callback window is 180 seconds. Repeated
sign-in clicks during that window produce “an OAuth flow is already pending.” Timeout or scoped
bridge cleanup clears the flow and timer; a later attempt can start. Cancellation here means
bridge teardown, not closing a browser tab: tab closure provides no cancellation signal. Keep the
existing timeout unless a reproduced defect justifies changing it. Do not clear the browser
profile to recover from an already completed timeout.

When an older installed bundle owns the OS protocol association, inspect the actual recipient
before changing anything. The running single-instance app can receive the callback forwarded
from another bundle. A default-handler lookup alone cannot establish a routing defect. A probe
using a different path tests OS handoff only; it cannot resolve the SDK's pending OAuth flow.

Run the repeatable local contract coverage without opening a browser or reading native storage:

```sh
vp test run apps/desktop/src/app/DesktopClerk.oauth.test.ts \
  apps/desktop/src/app/DesktopClerk.test.ts \
  apps/desktop/src/app/DesktopAppIdentity.test.ts
```

These tests execute the repository adapter and the installed SDK with synthetic Electron events,
IPC, timers, browser opening, and storage. They cover endpoint matching, both callback routes,
delayed returns, duplicate returns, timeout/retry, teardown/recreation, browser-open failure,
main-frame ownership, and absence of callback logging. They do not establish real OS delivery,
provider authentication, two installed clients, Keychain/SecureStore, or notifications.

### Sanitized diagnostics and native acceptance

Preserve a working authenticated session. First inspect its current dashboard and exact running
build. Do not start another OAuth flow merely to obtain a trace. When a future failing attempt
needs observation, coordinate browser ownership and one human-owned attempt before adding any
temporary observer. Keep observation at the renderer transport boundary and restore the original
method in `finally`; remove its diagnostic global and close DevTools when finished. Never patch
the packaged app or read profile/token storage for this diagnosis.

Use a strict allowlist for the receipt:

- event: `transport-open`, `transport-resolved`, or `transport-rejected`;
- UTC observation time and elapsed milliseconds;
- expected callback scheme/host/path only after checking exact equality with the configured
  redirect; and
- rejection category: `pending`, `timeout`, `cancelled`, or `other`.

Do not record method arguments, return objects, exception messages/stacks, full URLs, URL query
parameters/fragments, OAuth code/state, tokens, account identifiers, or room contents. Only
record a provider hostname after confirming it is the expected provider. Do not log arbitrary
unmatched URLs or serialize an IPC event. The SDK contract test protects its current logging
behavior; it cannot prove temporary observers, provider code, or all Electron logging are safe.

Record these acceptance gates separately:

1. Exact running app path, version, embedded commit, and artifact provenance; distinguish the
   backend runtime directory from Electron's browser profile. A renamed test bundle can still
   share the installed app's bundle ID, callback scheme, and browser profile.
2. One real callback reaches that build; the sign-in modal disappears and the authenticated Rooms
   dashboard loads. Record only outcomes, never room/account contents.
3. Quit/reopen through the normal app lifecycle using the same approved artifact/profile/runtime;
   verify existing session and selected-room restoration before another login.
   Record the number of cycles. One successful cycle establishes that restoration only; it does
   not establish multi-day session expiry, network-failure recovery, or two-client behavior.
4. Two separately authenticated exact-source clients in a designated disposable room exchange
   unique messages, agree on history/attribution, and retain history after reopening.
5. Background/resume the exact native mobile build while another client sends a message. Repeat
   promptly to exercise startup ownership; confirm catch-up, no duplicate unread/notification
   effects, and no leaked current wait. Then terminate/reopen to exercise actual durable storage.
6. Restart only a captured disposable Rooms service, or a specifically authorized designated
   service in coordination with its owner. Confirm honest unavailability/reconnect, retained
   membership/history, and a new message after recovery. Restarting the Electron backend does
   not restart the separate Rooms service.

An ahead-cursor fixture requires an approved disposable storage seam. Do not edit live Keychain
or SecureStore. Keep unexecuted device/service steps explicitly pending. Desktop sign-in does
not satisfy mobile authentication, installation, or two-client acceptance; resident-agent
continuation and long-channel pagination are separate product work.

## Keep current work out of this runbook

Track unfinished product work in issues. In particular, packaging the loopback Rooms helper is
separate from proving authentication, and a working private development room is separate from
fresh-download onboarding for another person. Link the issue from a pull request and update the
issue acceptance record when the installed flow is proven.
