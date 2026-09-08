---
name: rooms-work-active-story
description: Claim and advance an existing server-backed Rooms story through the pinned workflow. Use when a user asks to begin, continue, transition, evidence, request review for, complete, pause, or release active Rooms work.
---

# Work an active Rooms story

Use only `rooms.agent-stories` v2 reads and `rooms.agent-work` v1 work tools.

## Establish authority and state

1. Require exactly the 13 `rooms_*` tools: the four read tools and nine work tools in the checked-in catalog. Stop on catalog drift or any privileged Rooms tool.
2. Call `rooms_context_get`. Require `{id: "rooms.agent-stories", version: 2}`, `tool_catalog_version: 2`, a live `read_write` profile, and a server invocation.
3. Resolve the story by explicit ID. If only a title is known, use `rooms_story_search`, then `rooms_story_get`; do not guess among ambiguous results.
4. Treat `rooms_story_get` as authoritative for stage, allowed transitions, allowed actions, gate state, evidence, review, and completion.

## Work

1. Claim with `rooms_story_claim` using the current server stage and a bounded 60–3600 second lease.
2. Perform only the requested work outside the toolkit. Do not present drafts, diffs, provider output, or local files as server evidence.
3. Attach evidence only after a matching CAS object already exists. Use the exact hash, bytes, media type, kind, and an honest note with `rooms_story_attach_evidence`.
4. Transition only through an entry returned in `allowed_next_transitions`, passing the current stage as `expected_stage`.
5. Request review only when the server reports the action available. This toolkit cannot approve a review.
6. Complete only when the server gate says completion is ready, using the exact evidence IDs covered by the approved review.
7. Release the claim when intentionally pausing or handing work back. Do not release another Agent's claim.

Re-read after each mutation. Stop on stale state, lease, gate, review, or configuration-epoch errors and report the structured code. On `projection_stale`, do not invent a refresh operation.
