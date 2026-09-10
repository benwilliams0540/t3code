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

## Keep current work out of this runbook

Track unfinished product work in issues. In particular, packaging the loopback Rooms helper is
separate from proving authentication, and a working private development room is separate from
fresh-download onboarding for another person. Link the issue from a pull request and update the
issue acceptance record when the installed flow is proven.
