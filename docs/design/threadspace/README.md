# Threadspace element stylebook

This folder distills the Threadspace v3 instrument into reusable interface grammar. It is a design handoff for humans and coding agents, not a replacement for product contracts or a claim that every pictured capability exists.

## Start here

- [STYLEBOOK.md](./STYLEBOOK.md) — component rules, responsive behavior, and implementation guidance.
- [tokens.css](./tokens.css) — provisional cross-surface color and geometry tokens.
- [DECISIONS.md](./DECISIONS.md) — provenance, settled calls, token drift, and open questions.
- [`reference/`](./reference/) — exact renders captured from the supplied Threadspace v3 prototype.
- [`concepts/`](./concepts/) — Nano Banana concept plates that explore the smaller UI elements.
- [`prompts/`](./prompts/) — reproducible prompts used to create the concept plates.

## Concept plate index

1. [Navigation and back controls](./concepts/2026-08-15-12-12-00-navigation-elements.png) — room rail, drawer rows, compact headers, back plate, tabs, and selected states.
2. [Threads and chat](./concepts/2026-08-15-12-14-00-threads-chat.png) — thread rows, run chips, relationship bus, flat message timeline, agent identity, and composer.
3. [Lists and settings](./concepts/2026-08-15-12-15-00-lists-settings.png) — generic list grammar, settings sections, controls, empty/loading/error states, and Paper parity.
4. [Decisions and prompts](./concepts/2026-08-15-12-16-00-human-decisions.png) — review queue, accept/deny hierarchy, permissions, destructive confirmation, and resolved state.

The concept plates are directional. Use the written rules and product truth when an image contains ambiguous text or an unsupported capability.

## Agent handoff

Before implementing a Threadspace surface:

1. Read `STYLEBOOK.md` and the relevant concept prompt.
2. Check the live product contract. Do not invent presence, machine state, permissions, metrics, or actions.
3. Reuse the semantic tokens; do not sample colors from concept art.
4. Keep human prose in sans and system metadata in mono.
5. Capture before/after proof for user-visible UI work.
