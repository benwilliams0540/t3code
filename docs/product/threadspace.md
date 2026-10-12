# Threadspace product direction

Threadspace is one shared project workspace for people and agents. Rooms is its
backend domain and implementation, not a separate application or product roadmap.
Web, desktop and native mobile are clients of the same shared work.

This document owns product scope. [Architecture](../architecture/threadspace.md)
owns implementation responsibilities.
[Roadmap #26](https://github.com/benwilliams0540/t3code/issues/26) owns current
delivery, dependencies and acceptance; avoid duplicating that checklist here.

## The useful shared workspace

People join a room on an existing designated host, exchange messages, choose
distinct work conversations, and follow up with the resident agent. Returning
from another authorized client should continue the same conversation. Results
and shared history remain readable when the agent runtime is unavailable.

Participants see accurate progress and outcomes alongside authorized project
files and changes. Room membership authorizes shared room access; project grants
and the host's execution policy govern files and tools. Personal chats and
sessions become shared only through an explicit authorized handoff.

The first milestone uses one existing host, one project and one resident agent
for integration proof. Those limits describe the proof setup, not domain caps.
The room host stays fixed; ordinary reconnect and persistence on that host are
required. A Story is optional for discussion or agent work.

## Ownership

| Owner               | Responsibility                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Threadspace clients | Workspace presentation, drafts and navigation, over shared connection/feed/conversation state.                                         |
| Rooms backend       | Shared membership, room/channel/conversation identity, durable history and execution binding/turn records; authorization and ordering. |
| Agent connector     | Delivery and runtime adaptation, acceptance receipts and reconciliation.                                                               |
| Agent runtime       | Actual sessions, execution, tools and supported approvals under host policy.                                                           |

The backend and clients can have different languages, packages and repositories.
Change their organization when it gives behavior a clearer owner or simplifies
development; source history belongs in Git. A moved file or new forwarding layer
does not establish ownership while old callers still make the same decisions.

## Complete the milestone

Source implements compatible durable conversation contracts, shared client state,
runtime continuation and channel conversation navigation. Authorized current
files/diffs and proof on the intended host with two separately authenticated
clients remain milestone work; the roadmap owns their current status.

Acceptance includes distinct conversations, continued follow-ups, ordered
concurrent turns, safe retry/reconnect, honest cancellation and uncertain states,
and retained history/bindings after an ordinary same-host restart. Record exact
client/backend/connector revisions, running configuration and observed behavior
in the roadmap. Desktop/web and native mobile evidence remain distinct.

## Later

Host swapping, replicated recovery, takeover, laptop host packaging, general
attachments, proactive agents and optional managed hosting remain separate
backlog work. Free self-hosting remains a longer-term direction; revisit
[hosting and access](../rooms/hosting-and-access.md) when scheduling it.
Existing stories and their review workflow remain supported.

Historical reviews live in `reports/`; their old work order is evidence of a past
decision. Current work follows this direction and the roadmap.
