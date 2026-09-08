---
name: rooms-triage-stories
description: Triage server-authoritative Rooms stories with bounded list, search, and detail reads. Use when a user asks for backlog review, active-work status, blockers, prioritization, or an inventory of stories in the authenticated room.
---

# Triage Rooms stories

Keep triage read-only. Use `rooms.agent-stories` v2 even when the credential is `read_write`.

## Validate and read

1. Require the checked-in four-tool read catalog: `rooms_context_get`, `rooms_story_list`, `rooms_story_get`, and `rooms_story_search`. If other `rooms_*` tools are present, do not call them during triage.
2. Call `rooms_context_get`. Require contract `{id: "rooms.agent-stories", version: 2}` and `tool_catalog_version: 2`.
3. Call `rooms_story_list` with the smallest useful filters and page size. Follow the returned cursor only when more results are needed.
4. Use `rooms_story_search` for title lookup and `rooms_story_get` for details on shortlisted stories. Do not infer a story's current gate or allowed actions from a compact list item.

## Report

Group stories using server-returned stage, completion, review, evidence, native-thread link, and source sequence. Distinguish facts from recommendations. Include story IDs for every recommended action and identify ambiguous matches.

Do not claim, transition, attach evidence, request review, complete, release, send a generic reply, or control native T3. Preserve structured errors. On `projection_stale`, report the source/projected heads and stop; the catalog deliberately has no projection-refresh tool.
