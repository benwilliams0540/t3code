# Shared rooms in Threadspace

Threadspace uses its Rooms backend to keep shared project work durable. Choose
**Threadspace** under **Settings → Beta → Sidebar version**, then select a room.

Sign-in follows the selected backend. A managed T3 Connect server uses your
T3 Connect account; a server with its own sign-in uses the account on that server.
The workspace offers the appropriate sign-in when the session expires.

## Use your own server

The Shared source can also talk to a Threadspace server you or a friend host. In the access
panel, enter the server URL under **Change server** and choose **Connect**. The client asks
the server which sign-in it uses before showing any form.

If the server has its own sign-in:

- **Set up server** appears when nobody owns the server yet. Paste the setup token the host
  printed with `bin/rails rooms:local:issue_setup`, pick a username, a password of at least 10
  characters, and a display name. You become the owner.
- **Join with invitation** takes a room ID and invite token from a room admin plus your new
  username, password, and display name. One step creates your account and puts you in the room.
- **Sign in** works on any device with the same username and password.
- **Reset password** takes a reset token the host issues with
  `USERNAME=<name> bin/rails rooms:local:issue_password_reset`. It signs out every other device.

**Sign out** on the dashboard revokes this device's session on the server. **Forget this
server** also drops the server from this device. The client keeps your session for that
server only and never sends it to another address. Changing the hostname, scheme, or port
requires signing in again, even if the new address reports the same server ID.

## Create a shared room

After signing in, choose **New room** from the room rail or the first-room screen.
Enter a name and check the server shown in the dialog. Creation makes your account the
room's admin and opens its **#general** channel. Existing members can create additional
rooms from the same rail. You do not need a Clerk administrator account, an operator
setup token, or permission from another room's owner to create your own room.

If a request fails, **Retry creation** reuses the same request ID. The server returns
the existing room if the first attempt succeeded. Changing the name starts a new request.
The optional operator setup-token flow remains available for managed provisioning.

This requires a reachable Rooms server with the self-service creation route and working
sign-in configuration. A private development server is not a public hosted service;
downloading the client alone does not provision a server. Release onboarding must state
which service users join and how they connect to it.

## Find the work that needs attention

The dashboard leads with **Needs you**, then shows active work, the project's vision status,
momentum, and recent durable activity. Counts and story state come from the selected Rooms source;
Threadspace does not fill missing records with sample data.

Open **Stories** to switch between a board and a list with a detail pane. The board/list preference
is stored on the current device. Story ownership is shown from durable workflow history. A current
human can claim a backlog story, attach evidence, move it into review once the evidence gate is
satisfied, and approve and complete it when authorized. Reviews and completion remain separate
server records even though the UI offers them as one action.

## Move between discussion and execution

Channels keep messages in their real Rooms routes. Select a message to shape it into a story. The
current server contract cannot persist a message-to-story link, so the action is explicitly labeled
**Create without link** and no durable relationship is implied.

Use the **Conversation** selector in a channel to choose a continuing conversation
or **All channel messages**. Enter a **New conversation title** and choose **Start
conversation** when your account can create one. Sending while a conversation is
selected keeps the message in that conversation. Reopening it restores the durable
history from the backend.

When a selected conversation addresses an agent, each request is a separate turn.
Its status comes from the backend:

- **Queued** waits behind earlier unfinished work on the same binding.
- **Starting** means dispatch has begun; **Working** requires an actual accepted run.
- **Needs attention** means the outcome is uncertain. It does not authorize another execution.
- **Replied** or **Failed** records the terminal outcome.

The agent's execution binding is reused for continuing turns. A different
conversation gets its own binding. **Session missing** keeps history visible and
blocks execution until the host resolves the missing session; the client cannot
silently replace it. Ordinary discussion remains available.

Historical channel messages outside these conversations keep their existing Agent-turn presentation:

- **Claw is working…** means the connector recorded the invocation but no reply is recorded yet.
- **Taking longer than expected** appears after 30 seconds without a terminal reply. It does not
  claim that the invocation failed.
- A successful reply replaces the progress state and stays attributed to the Agent.
- **Claw couldn’t respond** includes a safe reason such as unavailable, timed out, rate limited, or
  rejected. Gateway details are never displayed.

The client does not automatically repeat failed runtime execution. Retrying an
uncertain message submission reuses its request identity so the backend can return
the same durable message. Runtime uncertainty requires host reconciliation.

Opening a Rooms thread keeps the native T3 thread surface and adds a collapsible context rail. When
the thread is exactly linked to a story, the rail shows its owner, stage, evidence, and next action.
The current thread contract does not expose a selectable output inventory, so Rooms shows that
capability as unavailable instead of fabricating attachments.

## Browse project files and changes

Open **Project → Files & Changes** to browse a project shared by the room's host
owner. Choose a file to read its current contents, or choose **Changes** to inspect
staged and unstaged edits. Use **Refresh** to read again. The view identifies the
host and checkout, read time and base revision; a moving checkout is not one saved
snapshot.

The first version is read only. The host owner configures the shared checkout and
exclusions on the Rooms backend; adding a local T3 project does not share it.
A room without a configured share shows **No project shared yet**. Removing the
share blocks later reads. Current content stays in memory and is cleared on an
unavailable/revoked source or account switch; offline browsing is not included.
Agent-facing read routes use the same source service. Wiring those reads into the
intended agent runtime and installed two-client acceptance remain #23/#26 work.

## Know what is authoritative

**Evidence**, **Decisions**, and **People and machines** are projections of the selected Rooms
source. People, agents, and machines remain separate principals even when they share a display
name. Vision revision history, provenance, and freshness are shown only when the source contract
provides them; otherwise the Vision route explains exactly which capability is unavailable.

Loading, empty, unavailable, stale, and stopped states stay visible. Check the source and project
shown in the Rooms header before acting, especially after changing accounts or environments.

## Mobile

The side-by-side Threadspace mobile build connects directly to the configured private HTTPS
Human endpoint with a fresh dedicated Clerk token for every request. From the Threads screen, open
Rooms to review attention items, inspect and advance stories, read or send channel messages, open an
exact linked T3 thread, and distinguish people, agents, and machines.

Channels use the same conversation selector, creation and follow-up state as web.
Conversation turn and binding labels come from the shared client owner; historical
Agent turns retain their existing accessible live updates.

The initial mobile surface refreshes when opened and on pull-to-refresh. Evidence upload, story
creation, room creation, vision revision history, invitations, and administration remain desktop/web actions. Mobile
shows those limits explicitly instead of substituting local fixtures or browser state.
