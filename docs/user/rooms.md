# Rooms

Rooms brings the shared work around a project into T3 Code. Open **Version 3** in the sidebar,
select a Rooms source, and then select a project.

The Shared source needs a T3 Connect account. When you are signed out, the Rooms workspace shows
**Sign in to T3 Connect** in place of the room; the Rooms workspace has its own rail instead of the
app sidebar, so that button is the way in. The same button appears when your Rooms session has
expired.

## Find the work that needs attention

The dashboard leads with **Needs you**, then shows active work, the project's vision status,
momentum, and recent durable activity. Counts and story state come from the selected Rooms source;
T3 Code does not fill missing records with sample data.

Open **Stories** to switch between a board and a list with a detail pane. The board/list preference
is stored on the current device. Story ownership is shown from durable workflow history. A current
human can claim a backlog story, attach evidence, move it into review once the evidence gate is
satisfied, and approve and complete it when authorized. Reviews and completion remain separate
server records even though the UI offers them as one action.

## Move between discussion and execution

Channels keep messages in their real Rooms routes. Select a message to shape it into a story. The
current server contract cannot persist a message-to-story link, so the action is explicitly labeled
**Create without link** and no durable relationship is implied.

Opening a Rooms thread keeps the native T3 thread surface and adds a collapsible context rail. When
the thread is exactly linked to a story, the rail shows its owner, stage, evidence, and next action.
The current thread contract does not expose a selectable output inventory, so Rooms shows that
capability as unavailable instead of fabricating attachments.

## Know what is authoritative

**Evidence**, **Decisions**, and **People and machines** are projections of the selected Rooms
source. People, agents, and machines remain separate principals even when they share a display
name. Vision revision history, provenance, and freshness are shown only when the source contract
provides them; otherwise the Vision route explains exactly which capability is unavailable.

Loading, empty, unavailable, stale, and stopped states stay visible. Check the source and project
shown in the Rooms header before acting, especially after changing accounts or environments.

## Mobile

The side-by-side `T3 Code Rooms` mobile build connects directly to the configured private HTTPS
Human endpoint with a fresh dedicated Clerk token for every request. From the Threads screen, open
Rooms to review attention items, inspect and advance stories, read or send channel messages, open an
exact linked T3 thread, and distinguish people, agents, and machines.

The initial mobile surface refreshes when opened and on pull-to-refresh. Evidence upload, story
creation, vision revision history, invitations, and administration remain desktop actions. Mobile
shows those limits explicitly instead of substituting local fixtures or browser state.
