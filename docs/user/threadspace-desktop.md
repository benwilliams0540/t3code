# ThreadSpace desktop Alpha

ThreadSpace can be built as a separate desktop app for Rooms development. Install it alongside T3 Code to try a change in a recognizable app while keeping the two apps' browser profiles and local backend state separate. The default build remains T3 Code.

## Build on macOS

Use the normal desktop build with the opt-in brand:

```sh
T3CODE_DESKTOP_BRAND=threadspace \
T3CODE_DESKTOP_VERSION=0.0.34 \
vp run dist:desktop:dmg:arm64
```

The existing signing options still apply. For a Developer ID build, set `T3CODE_DESKTOP_SIGNED=true` and supply your own signing identity. Signing and notarization are separate; an unnotarized build is not ready for general distribution. Do not remove quarantine to bypass Gatekeeper.

This produces **ThreadSpace (Alpha).app**, using the existing ThreadSpace artwork from the mobile app. Its bundle identifier is `com.threadspace.alpha`; its URL schemes are `threadspace` and `threadspace-dev`. It does not register T3 Code's callback schemes. macOS arm64 is the initial install target; Windows and Linux installation have not been validated, and Windows still uses the upstream icon.

## Independent local state

On macOS the packaged app uses:

| Data                            | Location                                                           |
| ------------------------------- | ------------------------------------------------------------------ |
| Browser profile                 | `~/Library/Application Support/threadspace-alpha`                  |
| Backend home                    | `~/Library/Application Support/threadspace-alpha/runtime`          |
| Backend state and Clerk session | `~/Library/Application Support/threadspace-alpha/runtime/userdata` |

The packaged app ignores `T3CODE_HOME`. An explicit `THREADSPACE_HOME` overrides its backend home. Development builds retain the dev runner's worktree-specific `T3CODE_HOME` unless `THREADSPACE_HOME` is set. ThreadSpace does not migrate T3 Code profiles, databases, or sign-in sessions. The backend selects an available local port and identifies its process as `ThreadSpace Backend`.

Isolation covers app state, not a separate copy of project files or provider credentials. Selecting the same project directory still opens the same files on disk. Shared Rooms accounts and server data remain shared after sign-in.

## Sign-in and updates

ThreadSpace needs its own sign-in. Configure the Clerk native application's allowed redirect URL for `threadspace://app/` (and `threadspace-dev://app/` for development) before expecting OAuth sign-in to work. Keep the existing T3 callbacks registered for T3 Code. The packaged alpha disables Clerk passkeys by default because this build does not provision the new bundle's passkey entitlements. Enable them only with matching signing configuration.

ThreadSpace defaults to disabled automatic updates and the artifact builder omits the upstream GitHub update feed, preventing a ThreadSpace install from updating into T3 Code. Install subsequent local builds explicitly. A dedicated update service is deferred.

This flavor changes desktop identity and runtime ownership. Channel screenshots, screen sharing, and agents reading another participant's unfinished project work are separate features.
