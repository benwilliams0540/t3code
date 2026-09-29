# ThreadSpace Rooms: current direction

Decision updated 2026-09-29. This is the entry point for Rooms product work. The
[roadmap issue](https://github.com/benwilliams0540/t3code/issues/26) owns delivery
status; the [Rooms board](https://github.com/users/StoneHub/projects/4) owns the
queue. This document owns the milestone and scope. Older dated reviews remain
evidence; their hosting/recovery-first assignments are superseded.

## The next useful room

People open ThreadSpace, join a room on an existing designated computer, and work
with a resident agent. They can create and return to distinct conversations,
follow up with the same agent context, see work in progress, and inspect the
authorized project files and changes alongside the conversation. Teammates see
the same shared work. A conversation remains useful beyond one mention/reply.

The host stays fixed for this milestone. It owns the room service and runs the
agent connector; OpenClaw owns its agent sessions and execution. ThreadSpace
provides the shared workspace for that work. Existing voice/chat inputs can
remain useful entry points; an explicit future handoff can associate them with a
room conversation. Personal chats do not become shared room history implicitly.

### Milestone acceptance

1. Two separately authenticated clients join an existing room on the designated
   host, exchange messages, and reopen the same durable history.
2. A person starts conversation A with the resident OpenClaw agent, then follows
   up. Both turns use A's persisted execution binding. Conversation B has a
   separate binding. Switching clients or reconnecting does not reset A.
3. People can browse/select these conversations and see queued, running,
   completed, failed, cancelled, and uncertain outcomes honestly. Retrying a
   delivery does not repeat work or create duplicate replies.
4. The agent performs a bounded useful project task under the host's configured
   permissions. Authorized participants inspect the relevant current files and
   diffs with their source and freshness visible. Runtime capabilities and
   approvals are surfaced accurately.
5. An ordinary service restart on the same host retains the conversation/session
   mapping. If the host is unavailable, clients show that state and reconnect to
   it when it returns. Agent unavailability is distinct from room unavailability.

The first integration proof can use one project and one resident agent. The
domain must not hard-code a two-person or one-agent product limit. Native mobile
uses the same contracts and shared state; its installed acceptance is recorded
separately from desktop/web evidence.

## Work order

1. **Under the hood:** durable room conversations and agent-session bindings;
   shared ownership of client connection, feed and conversation state.
2. **Agent continuation:** route distinct turns through the same persisted
   OpenClaw binding, preserve invocation deduplication, and support useful work.
3. **Workspace:** conversation navigation, selected-host entry/reconnect, and
   authorized files/diffs next to the work. Prove the complete flow on real
   clients against the intended host before calling the milestone delivered.

See [architecture and code map](../architecture/rooms.md) for the migration and
[next-task guidance](cloud-next-task.md) for a bounded implementation handoff.
The roadmap links the actual issue owners and dependencies; this document does
not maintain a second status checklist.

## Later

Host swapping, synchronized replicas, takeover/recovery on another computer,
laptop host packaging, and automatic election are deferred. They are not
prerequisites to this milestone. Same-host persistence and reconnect remain in
scope. Ordinary attachments, broad release/onboarding, richer boards, proactive
agents, and optional managed hosting stay in the backlog.

Longer-term free self-hosting remains part of the product direction. Revisit
[hosting and access](hosting-and-access.md) when scheduling that work. Stories
and their review workflow remain supported; creating a Story is not required to
talk to an agent or continue a conversation.

## Source and setup

The 2026-09-29 audit used client `main` at `ca74c303b` and the separately
authorized room-service `main`. Use current `main` in both repositories when
starting work; the service repository's GitHub default is a historical feature
branch. This direction does not change repository settings.

For source work, read repository instructions and the relevant module in the
code map. Inspect manifests only when implementation needs dependencies. For
build/install work, use [ThreadSpace delivery](../operations/threadspace-delivery.md).
Keep client source, service source, installed artifacts, running services, and
human acceptance as separate recorded facts. This planning update changes none
of the running services.
