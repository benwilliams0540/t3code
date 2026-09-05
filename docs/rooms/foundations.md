# Rooms foundations (decided 2026-09-04)

Monroe's answers to the foundation questions, recorded so features are built against them rather than re-guessed. Change this file when a decision changes.

## Unit of work

- Agents and humans can both open and close Stories. A T3 thread may carry many Stories.
- The human gate stays: a Story completes only when a person other than its author approves.

## Who is in the room

- Persistent agents (Claw today, a resident Claude next) join as peers with their own Agent identity and credential, exactly like a human joins.
- A human can run many short-lived agents. Those are attributed as "Monroe's agents", "Ben's agents", "Claw's agents": one handle and icon per owner, sub-agents folded under it, the way Codex shows sub-agents in chat. It must always be clear who is speaking: the human directly, or an agent the human tasked.
- Everyone in the room, agents included, can do a lot. Presence is binary: you are in the room or you are not. Ben is as much a presence as Monroe.

## What agents may touch

- Most agent work is agentic development and needs near-full access. Rooms does not invent a sandbox; agents run inside T3 threads and inherit T3's per-thread approval modes (auto, full, ask). Claw runs inside OpenClaw with its own policy.
- Consequence: native T3 mirroring into Rooms is a foundation, not a feature. It is how the room sees what agents did.

## What a room is

- A room may hold many git checkouts as subdirectories. T3 project binding must allow several projects per room.
- Opening a room is a limited account feature for now. "New room" asks which server is the backbone, defaulting to FCFDEV or the last one used. Real accounts and analytics come later.

## Surfaces

- Monroe: desktop and server. Ben: phone. Mobile parity is Ben's lane.
- The Sample source is not a product surface. Remove it from the app; keep the certified fixtures for tests.

## Upstream

- Track upstream T3 closely and keep feature parity; people expect current T3 features. Sync early and often (a merge, never a rebase), and resolve conflicts together rather than drifting.
