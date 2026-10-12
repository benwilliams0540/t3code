# Threadspace workspace layout

- `/apps/server`: T3 coding runtime and local client transport, distinct from the Rooms backend. Node.js WebSocket server. Wraps Codex app-server, serves the built web app, and opens the browser on start.
- `/apps/web`: React + Vite UI. Session control, conversation, and provider event rendering. Connects to the server via WebSocket.
- `/apps/desktop`: Electron shell. Spawns a desktop-scoped `t3` backend process and loads the shared web app.
- `/packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types.
- `/packages/shared`: Shared runtime utilities consumed by both server and web. Uses explicit subpath exports (e.g. `@t3tools/shared/git`, `@t3tools/shared/DrainableWorker`) — no barrel index.

- `/apps/mobile`: Native client and platform adapters.
- `/packages/client-runtime`: Shared client connection, feed and conversation behavior; no React or runtime-specific execution.
- `/packages/rooms-agent-api`: Agent-side Rooms wire contract/client.
- `/packages/rooms-agent-connector`: Room delivery to actual agent runtime and reconciliation.
- `/packages/rooms-agent-connector-host`: Standalone connector configuration and process supervision.
- Separate `t3rooms/ledger`: Rails/PostgreSQL Rooms backend for durable shared membership and work.

See [product architecture](../architecture/threadspace.md) for ownership and dependency direction.
