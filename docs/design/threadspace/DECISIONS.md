# Threadspace stylebook decisions

## Provenance

This baseline was created from:

- the supplied Threadspace v3 bundled prototype;
- the supplied Threadspace v3 Design Record, plate TS-2200-04, Rev D;
- PR #2, `feat(rooms): apply Threadspace experience across clients`, at `4f29dac6e51ec18efa635ae8c4a9cc1b691c467d`;
- exact prototype renders in `reference/`;
- Nano Banana concept explorations in `concepts/`.

The prototype and PDF are design sources. PR #2 is implementation evidence. Product contracts remain authoritative for what the interface may claim or do.

## Settled for v0.1

- Internal controls are square plates with 1px rules and no more than 2px visual radius.
- Human prose is Sans; system and operational metadata is Mono.
- Teal means relationship, amber means the current human must act, green means healthy/complete, red means failed/unhealthy/destructive, and bone means physical environment.
- Mobile back controls use the platform-standard glyph inside a 44px plate.
- Lists use shared plates and separators rather than floating card stacks.
- Chat is a flat shared timeline; agents receive identity treatment, not a separate conversational lane.
- Decision prompts explain scope and consequence before showing explicit verbs.
- Paper and Dark are peers.
- Fold-open is a recomposition, not a scaled phone.

## Known token drift

The Design Record does not specify exact colors, spacing scale, shadow blur, or glow values. PR #2 currently has slightly different web and mobile values:

- web light relationship teal: `#177b82`; mobile: `#126f77`;
- web dark attention amber: `#d3a04e`; mobile: `#efad3c`;
- web base surfaces and mobile base surfaces also differ by a few RGB steps.

`tokens.css` uses the mobile palette because it is complete across relationship/status/attention/error semantics. This is a provisional design reference, not a production import. A follow-up should reconcile the palette with visual contrast checks on web, iOS, and Android before it becomes canonical.

## Open questions

1. What exact chassis radius and shadow recipe should be canonical outside the screen well?
2. Should amber ever pulse in production, or remain merely eligible for motion when a future attention policy requires it?
3. What are the final hover/pressed/focus surface deltas in both appearances?
4. Which permission decisions require a blocking dialog versus inline review or a bottom sheet?
5. Should `CLEAR` in the prototype mean dismiss, acknowledge, or resolve? Product copy should use the actual action verb.
6. Does the final type system ship IBM Plex directly or map to existing product font tokens?

## Concept-art caveat

Generated plates are for composition, hierarchy, and component shape. Their text is not product copy, their colors are not token samples, and any depicted capability must be checked against current contracts before implementation.

