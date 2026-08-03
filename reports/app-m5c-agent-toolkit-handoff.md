# T3 Code M5C Rooms Agent toolkit handoff

Date: 2026-08-03

## Result

M5C is implemented on `feat/rooms-m5-agent-integration` from exact app base `44e4b18846788204c1a51eb7b16a3cb2fd401eca`.

The producer contract is pinned to:

- t3rooms producer: `68d1958b5b56a760b2e7df6dad03ed1cb8173292`
- control report head: `4d05e2654b500fd3aef94be8676ab35039cae8a8`
- reads: `rooms.agent-stories` v2, catalog version 2
- work: immutable `rooms.agent-work` v1

This checkpoint adds exactly four read tools and nine work tools. It adds no governance, membership, role, key, enrollment, workflow-definition, generic event append, generic reply/message, invocation management, connector control, projection refresh, remote MCP transport, or native T3 control.

## Shared implementation

`packages/rooms-agent-api` is the single implementation used by both surfaces. It owns:

- the pinned tool names and contract/version assertions;
- Effect input schemas and safe structured error schema;
- loopback-only base URL validation;
- configuration-only bearer handling through `Config.redacted`;
- `read_only` local refusal for all work tools;
- request construction and response normalization;
- v2 read and v1 work response contract checks;
- exact preservation of server-safe error code, status, message, retryability, and allow-listed details; and
- connector-owned work headers with an intent-derived, retry-stable tool-call ID.

Credential, room, actor, principal, Agent, machine, invocation, connector, configuration epoch, event, sequence, and native authority fields are absent from every model input schema. A malformed or version-drifted response fails closed without returning raw transport content.

## Internal T3 surface

`apps/server/src/mcp/toolkits/rooms` is a thin adapter beside the existing preview toolkit. `McpHttpServer` registers the shared Rooms toolkit on the existing provider-scoped authenticated `/mcp` transport. It does not add another listener or weaken existing preview authentication.

The internal toolkit uses the same local Rooms configuration as the external package. Reads require a configured Agent bearer. Work requires a `read_write` credential and a live server invocation envelope; M5C does not invent or expose invocation-start as a model tool.

## External local-only package

`packages/rooms-agent-mcp` is a stdio MCP package. It opens no listener. The shared client rejects non-loopback endpoints and URL credentials. Logs are directed to stderr so stdout remains protocol-only.

Configuration:

```text
ROOMS_AGENT_BASE_URL=http://127.0.0.1:<isolated-port>
ROOMS_AGENT_BEARER_TOKEN=<provisioned-agent-credential>
ROOMS_AGENT_PROFILE=read_only|read_write
```

Work-only configuration:

```text
ROOMS_AGENT_INVOCATION_ID=<live-server-invocation>
ROOMS_AGENT_CONNECTOR_ID=<accepted-connector-id>
ROOMS_AGENT_CONFIGURATION_EPOCH=<positive-server-epoch>
```

Start with `pnpm --filter @t3tools/rooms-agent-mcp start`. Do not place credential or invocation configuration in MCP arguments, checked-in configuration, prompts, results, or logs.

## Workflow skills

The following checked-in skills validate the pinned catalog and use only its bounded workflows:

- `.agents/skills/rooms-create-story/SKILL.md`
- `.agents/skills/rooms-work-active-story/SKILL.md`
- `.agents/skills/rooms-triage-stories/SKILL.md`
- `.agents/skills/rooms-review-story/SKILL.md`
- `.agents/skills/rooms-handoff-story/SKILL.md`

All five explicitly stop on catalog/version drift, preserve structured errors, and refuse an invented projection refresh. Triage is read-only. Review cannot grant approval. Handoff does not send a generic reply or steer native T3.

## Validation

All authoritative TypeScript validation below ran with Node `v24.16.0`:

```text
pnpm --filter @t3tools/rooms-agent-api typecheck
  PASS
pnpm --filter @t3tools/rooms-agent-api test
  PASS — 2 files, 8 tests
pnpm --filter @t3tools/rooms-agent-mcp typecheck
  PASS
pnpm --filter @t3tools/rooms-agent-mcp test
  PASS — 1 file, 1 test
pnpm --filter t3 typecheck
  PASS — existing unrelated decider suggestions only
pnpm --filter t3 exec vp test run src/mcp/McpHttpServer.test.ts
  PASS — 1 file, 5 tests
pnpm --filter t3 build:bundle
  PASS — Node 22.16 target bundle, 4.27 MB entry
vp lint <M5C paths>
  PASS — no findings
skill-creator quick_validate.py <each new skill>
  PASS — all five skills
```

An actual Node 24.16 stdio handshake also passed `initialize` and `tools/list`; the returned catalog contained exactly 13 tools and `rooms_context_get` advertised an object schema with `additionalProperties: false`.

Focused tests prove:

- exact four-read/nine-work catalog shape;
- internal/external registration parity;
- no credential or authority fields in tool schemas;
- `read_only` work refusal before network I/O;
- loopback-only endpoint refusal before network I/O;
- exact read query and work route/body normalization;
- bearer exclusion from URL, body, and result;
- retry-stable work tool-call identity;
- server invocation header construction;
- structured server-error preservation; and
- response contract-version drift rejection.

## Acceptance boundary

This handoff proves M5C packaging, schemas, client behavior, registration parity, focused tests, and bundle construction. It is not live Claw or Hermes acceptance and does not claim a real Agent read/write round trip. That gate belongs after the accepted connector commits are integrated and an isolated exact server image plus goal-owned credentials/configuration are available.

The pre-existing untracked `reports/monroe-rooms-dogfood-agent-handoff.md` was preserved and is not part of M5C.
