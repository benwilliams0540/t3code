# Shared project tools for the room's agent

## TL;DR

Ask the resident agent about the real files or changes shown in **Files & Changes**.
This optional OpenClaw plugin lets it list shared projects, browse folders, read
text files and inspect staged/unstaged changes through the same backend reader
used by people. It never writes project files or starts an agent turn.

The first version serves one configured room and resident agent. Project sharing
and host tool policy remain explicit. Personal sessions receive no tools; a
Rooms session also has to match a ready backend binding for this credential's
room, agent and machine. A room member's message cannot supply that identity.

## Runtime and ownership

This uses OpenClaw's normal optional `registerTool` factory, not a second agent
loop or an expansion of the pinned 13-tool story catalog. The SDK surface was
reviewed against OpenClaw **2026.10.6**, commit
`fe06181dc5ecc01cf8904abbfc26925925efefbc`
([tool context](https://github.com/openclaw/openclaw/blob/fe06181dc5ecc01cf8904abbfc26925925efefbc/src/plugins/tool-types.ts),
[plugin entry](https://github.com/openclaw/openclaw/blob/fe06181dc5ecc01cf8904abbfc26925925efefbc/src/plugins/plugin-definition.types.ts)).
This source review and local proof do not establish an installed Gateway pass.

The plugin captures the runtime-supplied agent ID, session key and session ID;
models only supply a project ID and relative path. Every GET goes to
`/agent/v2/runtime/projects` or its `/:id/{entries,file,changes,diff}` children.
The paired backend verifies an initialized execution binding before reading.
An older backend fails closed with no fallback to unbound project routes.

The response decoder is shared with Files & Changes. Unexpected room/project/path,
contract or retention fields fail closed. Results preserve host, checkout, grant,
read time and Git base revision. Reads are individual observations of a moving
checkout; separate tool calls are not an atomic snapshot. File content and diffs
are untrusted project data, not instructions or permission grants.

There is no project cache. **OpenClaw may retain tool results in its ordinary
session history, and an agent reply may quote them into shared room history.**
The API's `retention: request_only` describes the backend reader, not deletion
from downstream histories. Enabling this plugin accepts that existing host/room
history policy. Unsharing stops future reads; it cannot retract material already
returned or quoted. Do not enable it for material that must not enter that history.

## Authorized host setup

Build in this repository with existing workspace dependencies:

```sh
vp run --filter @t3tools/rooms-agent-openclaw build
```

The package's `dist/index.mjs`, `openclaw.plugin.json`, `package.json` and README
form the private installable plugin directory. Runtime dependencies are bundled;
the host needs Node 24+ and the reviewed OpenClaw plugin API. Installing/enabling
it and any required Gateway reload are separate authorized host operations.
First deploy the paired backend runtime routes and configure its project shares
as described in backend `docs/operations/shared-project-files.md`.

Add this entry through the host's existing plugin installation/configuration path:

```json
{
  "plugins": {
    "entries": {
      "rooms-projects": {
        "enabled": true,
        "config": {
          "baseUrl": "http://127.0.0.1:3000",
          "bearerFile": "/absolute/private/path/rooms-agent-credential",
          "roomId": "room:<existing-room-id>",
          "agentId": "main"
        }
      }
    }
  }
}
```

Keep the configured origin on HTTP loopback without a path, query or credentials.
The existing agent credential must belong to this room/machine and allow project
reads. Supply it only through an owner-only regular file, not plugin JSON or a
prompt. The plugin rereads that file on each request, rejects symlinks, never
follows HTTP redirects, bounds responses to 2 MiB and times out after five seconds.

Opt in the five tools in the **resident agent's** existing tool policy:
`rooms_project_list`, `rooms_project_entries`, `rooms_project_file`,
`rooms_project_changes`, `rooms_project_diff`. Preserve the rest of the policy;
do not replace a host/global allowlist. Registration is optional and does not
override a deny rule or approve any action. Ordinary configured permissions and
approval behavior still belong to OpenClaw. No tool, inference or session is run
by importing or registering the plugin.

To disable, remove these tool grants and disable the plugin through the same
host configuration path. To revoke files immediately, remove the backend room's
project grant or revoke its credential. Preserve existing conversation history,
connector checkpoints and user profiles; this plugin owns none of them.

## Test when you sit down

In an initialized shared conversation, ask the agent to read a selected file and
explain its current diff. Compare the paths, returned lines and checkout identity
with Files & Changes from a second authenticated client, then follow up in the
same conversation. Revoke the project grant and verify a fresh read fails. A
personal conversation must not expose these tools. Installation, tool discovery,
actual model use and these two-client observations remain intended-host acceptance.
