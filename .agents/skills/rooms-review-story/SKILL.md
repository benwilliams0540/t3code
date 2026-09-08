---
name: rooms-review-story
description: Review a server-backed Rooms story's evidence and pinned workflow gate without granting approval. Use when a user asks whether a story is ready for human QA, completion, or handoff, or asks for a review request.
---

# Review a Rooms story

The Agent may assess and request review; it may not approve its own work or invent human acceptance.

## Validate and inspect

1. Require the exact checked-in Rooms Agent catalog: four `rooms.agent-stories` v2 reads and nine `rooms.agent-work` v1 tools. Stop on missing, extra, governance, generic-message, connector-control, projection-refresh, or native-T3 tools.
2. Call `rooms_context_get`; require `{id: "rooms.agent-stories", version: 2}` and `tool_catalog_version: 2`.
3. Resolve the exact story with `rooms_story_get`, expanding bounded activity only when it materially helps.
4. Assess the server-returned stage, eligible evidence, evidence satisfaction, reviewer allowance, self-review rule, approved review ID, and completion readiness.

## Act and report

Use `rooms_story_request_review` only when the user requests it, the profile is `read_write`, a live server invocation exists, and the server reports review available. Pass the current stage as `expected_stage`.

Never manufacture evidence, approve a review, bypass self-review, or complete from evidence not covered by the approved review. Report automated evidence separately from missing manual or physical acceptance. Re-read after a review request and report the receipt or structured server error.

On stale projection or state, stop. No projection-regeneration tool exists in the pinned contract.
