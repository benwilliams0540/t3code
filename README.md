# Threadspace

Threadspace is a shared workspace for people and agents. Its web, desktop and
mobile clients let participants discuss project work, review durable results,
and work with agents on a designated host.

This repository is Ben and Monroe's prototype fork of
[T3 Code](https://github.com/pingdotgg/t3code). Its existing coding workspace and
provider integrations remain useful parts of Threadspace. Upstream T3 Code
downloads and `npx t3` do not install this fork.

## One product, separate responsibilities

- **Threadspace clients** own presentation and shared client state in this repo.
- **Rooms** is Threadspace's [Rails/PostgreSQL backend](https://github.com/benwilliams0540/t3rooms).
  It owns membership, shared history and durable work records.
- **Agent connectors** in this repo connect durable room work to the actual
  agent runtime. OpenClaw and native T3 runtimes own execution and tool policy.

The repositories have one [product direction](docs/product/threadspace.md).
See [architecture](docs/architecture/threadspace.md) for the implemented owners
and contracts, and [roadmap #26](https://github.com/benwilliams0540/t3code/issues/26)
for delivery and outstanding acceptance.

## Develop locally

Use the repository's Node version, pnpm and Vite+ workflow. Start with
[quick start](docs/getting-started/quick-start.md) and [AGENTS.md](AGENTS.md).
Room work also needs the compatible Rooms backend; launching the web app or its
T3 server does not provision that backend.

Choose checks for the changed behavior using [local checks](docs/operations/ci.md).
Whole-repository tests and hosted workflows are explicit opt-ins.

## Documentation

- [Product direction](docs/product/threadspace.md)
- [Product architecture](docs/architecture/threadspace.md)
- [Using rooms](docs/user/rooms.md)
- [Development and delivery](docs/operations/threadspace-delivery.md)
- [Documentation index](docs/README.md)

Provider and platform guides document capabilities inherited from T3 Code.
Build, installed-client behavior and deployed room/runtime acceptance are
recorded separately in the owning issues.
