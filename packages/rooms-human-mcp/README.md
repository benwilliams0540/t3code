# ThreadSpace Human MCP

A stdio MCP server that lets an assistant use ThreadSpace as one human, without
the desktop app: read rooms, start conversations, post messages that `@Claw`,
and wait for the agent's reply. It opens no listener and logs only to stderr.

It authenticates with a **delegated human access token** (`rha1_…`) issued on
the Rooms server (see `t3rooms` `docs/operations/human-access-tokens.md`). The
token acts as the human who owns it: messages show as that person. The server
limits it to session, workspace, feed, story reads and conversation routes; room
creation, invites, channels, story writes, files and sign-out are refused.

## Configure

```sh
ROOMS_HUMAN_BASE_URL=https://<rooms-host>   # origin only, like the desktop app's server URL
ROOMS_HUMAN_TOKEN_FILE=~/.config/threadspace-mcp/token   # chmod 600; holds only the token
```

The token is read once at start from the file, never from arguments,
environment values or tool parameters. A file readable by group or others, or one
that does not hold exactly one `rha1_` token, stops the server before it serves.
Remote origins must be HTTPS; plain HTTP is accepted only for loopback.

The machine running it must reach the Rooms server (for FCFDEV, a tailnet
machine). Register it with Claude Code from this checkout:

```sh
claude mcp add threadspace \
  -e ROOMS_HUMAN_BASE_URL=https://<rooms-host> \
  -e ROOMS_HUMAN_TOKEN_FILE="$HOME/.config/threadspace-mcp/token" \
  -- node "$PWD/packages/rooms-human-mcp/src/bin.ts"
```

## Tools

| Tool                             | Does                                                 |
| -------------------------------- | ---------------------------------------------------- |
| `threadspace_session`            | Who the token posts as, and their rooms              |
| `threadspace_room`               | Channels and members of a room                       |
| `threadspace_list_conversations` | Conversations in a channel                           |
| `threadspace_start_conversation` | Start one, optionally with a first message           |
| `threadspace_send_message`       | Post in a conversation; returns `message_seq`        |
| `threadspace_read_conversation`  | Agent turns with live state, plus messages           |
| `threadspace_wait_for_reply`     | Wait for the agent's turn on `message_seq` (≤ 300 s) |
| `threadspace_read_channel`       | The channel feed                                     |

Agents answer only an exact `@Claw` inside a conversation; a channel message
without a conversation is stored but not answered. `threadspace_wait_for_reply`
returns `replied` with the reply, `failed` with the safe error code, or, on
timeout, `running`/`no_turn_yet` with the turn's server state (for example
`uncertain`), so a stuck turn is visible rather than silent.

Writes take an optional `request_id` (lowercase UUIDv7). Reuse it to retry a
write whose outcome is unknown; the server replays instead of posting twice.

## Check

```sh
pnpm --filter @t3tools/rooms-human-mcp typecheck
pnpm --filter @t3tools/rooms-human-mcp test
```
