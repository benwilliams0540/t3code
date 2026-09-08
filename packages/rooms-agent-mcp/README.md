# Rooms Agent MCP

This package exposes the checked-in Rooms Agent catalog over MCP stdio. It opens no network listener and accepts only `http://localhost`, `http://127.0.0.1`, or `http://[::1]` as its Rooms server base URL.

Run it from this checkout with:

```sh
ROOMS_AGENT_BASE_URL=http://127.0.0.1:3000 \
ROOMS_AGENT_BEARER_TOKEN='<one-time-provisioned-agent-credential>' \
ROOMS_AGENT_PROFILE=read_only \
pnpm --filter @t3tools/rooms-agent-mcp start
```

Use `ROOMS_AGENT_PROFILE=read_write` only for a credential provisioned with that server profile. All `rooms.agent-work` v1 tools also require a live connector invocation supplied through configuration, never model arguments:

```text
ROOMS_AGENT_INVOCATION_ID
ROOMS_AGENT_CONNECTOR_ID
ROOMS_AGENT_CONFIGURATION_EPOCH
```

The package deliberately contains no invocation-start operation, governance, generic reply, connector control, projection refresh, remote transport, or native T3 control. Logs are directed to stderr so stdout remains MCP protocol-only.
