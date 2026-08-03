---
name: rooms-handoff-story
description: Prepare an evidence-backed handoff for a server-authoritative Rooms story. Use when a user asks to summarize current state, transfer context, pause work, or hand a story to another human or Agent without inventing room or native-thread state.
---

# Handoff a Rooms story

Build the handoff from server truth, not provider transcript, localStorage, fixture IDs, or local draft state.

## Validate and gather

1. Require the exact checked-in 13-tool Rooms Agent catalog. Stop on missing or additional `rooms_*` tools, especially generic reply, governance, connector-control, projection-refresh, or native-T3 control.
2. Call `rooms_context_get`; require `{id: "rooms.agent-stories", version: 2}` and `tool_catalog_version: 2`.
3. Resolve the exact story with `rooms_story_get` and capture its ID, stage, source sequence, allowed transitions/actions, gate, evidence, reviews, completion, and safe native-thread reference.
4. When a live server invocation is available, use `rooms_channel_context_get` for bounded channel context. Use `rooms_archived_thread_summary_get` only for an exact story-linked archived thread; do not request a raw transcript.

## Produce the handoff

State the objective, server-authoritative current stage, claim/lease status when returned, completed work, evidence IDs and CAS references, review/gate status, open blockers, allowed next actions, and exact story/native-thread identifiers safe for the recipient. Separate verified facts from recommendations and missing manual acceptance.

Release a live claim only when the user asks to pause or transfer work and the `read_write` invocation is authorized. Do not send a generic room reply or steer native T3. Preserve structured errors. If projection is stale, report it and stop; no refresh contract exists.
