---
name: rooms-create-story
description: Create a server-backed Rooms story through the authenticated Rooms Agent toolkit. Use when a user asks to capture, open, or create work in the current room and optionally link the verified invoking T3 thread.
---

# Create a Rooms story

Use only the checked-in Rooms Agent catalog pinned to `rooms.agent-stories` v2 and `rooms.agent-work` v1.

## Validate the surface

1. Require these read tools: `rooms_context_get`, `rooms_story_list`, `rooms_story_get`, and `rooms_story_search`.
2. Require the nine work tools: `rooms_story_create`, `rooms_story_claim`, `rooms_story_release`, `rooms_story_transition`, `rooms_story_attach_evidence`, `rooms_story_request_review`, `rooms_story_complete`, `rooms_channel_context_get`, and `rooms_archived_thread_summary_get`.
3. Stop on a missing or additional `rooms_*` tool. Do not substitute governance, connector-control, generic-message, projection-refresh, or native-T3 tools.
4. Call `rooms_context_get`. Require contract `{id: "rooms.agent-stories", version: 2}` and `tool_catalog_version: 2`.
5. Require a live `read_write` profile and server invocation before creating. If either is absent, report the structured error and do not fall back to local state.

## Create

1. Derive a concise title and a lowercase story type from the user's request. Ask only when the request does not establish either.
2. Set `link_invoking_thread: true` when the current verified T3 thread is the work source. Set it to false only when the user explicitly wants an unlinked story.
3. Call `rooms_story_create` exactly once. Never supply room, actor, principal, Agent, machine, invocation, connector, configuration epoch, event, sequence, or credential fields.
4. Read the created story with `rooms_story_get` and report the server-returned ID, stage, and native-thread link status.

Treat retries with a replayed receipt as success. Preserve server errors exactly. On `projection_stale`, stop and report it; no projection-regeneration contract exists.
