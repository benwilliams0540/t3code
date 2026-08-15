# Threadspace v3 element stylebook

Status: working baseline, v0.1  
Source plate: TS-2200-04, Rev D  
Scope: web/desktop and mobile Rooms surfaces

## 1. Design thesis

Threadspace is a modern collaborative room presented as a purpose-built instrument. The outer chassis may be softly rounded and physical. Everything inside the screen well is precise: square plates, one-pixel rules, restrained lamps, dense metadata, and calm human prose.

Dark mode is an inverted console. Paper mode is a warm drafting sheet in a pale housing. They are equal appearances, not a primary theme and a decorative alternate.

The hierarchy is:

1. chassis and engraved context;
2. navigation and room identity;
3. operational plates;
4. human content;
5. sparse semantic signals.

## 2. Non-negotiable grammar

- Round the chassis; square the screen elements. Internal plates use a 1px rule and 2px maximum visual radius.
- Use IBM Plex Sans, or the product sans equivalent, for human-authored prose and readable titles.
- Use IBM Plex Mono, or the product mono equivalent, for identifiers, timestamps, counts, tabs, state labels, and engraved metadata.
- Never set a sentence written by a person in mono.
- Use teal only for active relationships: agents, links, threads, and connected execution.
- Use amber only when the current human must act or decide.
- Use green for healthy or complete state and red for failed, silent, unhealthy, or truly destructive state.
- Bone belongs to the physical environment. It is not a data color.
- A signal bus is functional, not decoration. Draw it only when two or more elements have a real relationship.
- Prefer a static lamp. Amber is the only signal eligible to pulse, and only for exceptional pending-human attention; it is not required to animate.
- Never fabricate a state to fill a visually convenient slot. Show `UNKNOWN`, `UNAVAILABLE`, or an honest empty state.

## 3. Provisional tokens

The design record defines semantics but not hex values. `tokens.css` normalizes the richer mobile implementation from PR #2 into a cross-surface starting point. See `DECISIONS.md` before treating these as final brand values.

### Geometry

| Token | Value | Use |
| --- | ---: | --- |
| edge | 1px | plates, rows, controls, dividers |
| internal radius | 0–2px | plates and controls |
| icon plate | 44px | back, settings, send, close |
| compact row | 48px min | navigation and generic rows |
| descriptive row | 58px min | status and two-line rows |
| section header | 36px min | plate header bands |
| desktop grid | 32px | Paper drafting background |
| unfolded drawer | 352dp | pinned Fold-open drawer |

### Type roles

| Role | Face | Typical size | Treatment |
| --- | --- | ---: | --- |
| primary title | Sans bold | 18–20 | sentence case |
| row title | Sans bold | 14–15 | sentence case |
| prose/body | Sans regular | 13–15 | comfortable line height |
| eyebrow | Mono bold | 10 | uppercase, 0.8–1.7px tracking |
| compact metadata | Mono regular | 9–10 | uppercase where categorical |
| action | Mono bold | 10–11 | concise verb phrase |

## 4. Navigation and back controls

### Back plate

- Use the platform-standard back glyph: `chevron.left` on iOS and `arrow_back` on Android/web equivalents.
- Put the glyph in a 44×44 square plate with a 1px edge; never in a pill or floating circular button.
- The whole plate is the target. The icon is approximately 18–19px.
- Pair it with a two-line header: Sans title above, Mono context below.
- Back returns one navigation level and keeps the selected room/thread stable.

### Room rail and drawer

- The room rail uses compact lettered plates. A selected room gains a clear edge/fill change and a 3px selection bar.
- Reserve amber dots on room plates for real pending-human attention.
- Drawer rows are at least 48px tall, with one glyph column, a Sans label, optional Mono detail, and an optional trailing count.
- Group rows under Mono eyebrow labels such as `ROOM`, `WORK`, and `NETWORK`.
- Selected state comes from structure and contrast, not from turning the whole row teal or amber.

### Tabs

- Mobile has four top-level destinations: `CHAT`, `AGENTS`, `STATUS`, `BOARD`.
- A tab may carry a lamp or badge only for real unread/attention state.
- Channel and Story detail are nested screens. Status and Board remain flat destinations on phone and Fold cover.

## 5. Thread lists and chat

### Thread row

Each row has four layers:

1. eyebrow: runner identity, Story link, or state;
2. title: the human-readable work/thread title;
3. summary: next action or latest meaningful activity;
4. metadata: owner, timestamp, run count, or compact identifiers.

Use state chips such as `RUNNING`, `FAILED`, and `COMPLETE` only when the state is authoritative. Chips are compact square labels, not rounded tags. Do not create a separate “thread” title if the eyebrow already carries the runner and Story context.

When multiple threads belong to one agent, a thin teal bus may connect them. The line should terminate at explicit taps and disappear when no relationship exists.

### Chat timeline

- Humans and agents occupy the same flat timeline. Avoid alternating chat bubbles.
- Use a 36px square identity plate. Human plates are neutral; agent plates use a restrained teal edge/wash and an `AGENT` label.
- Author names and message prose use Sans. Timestamps, identity labels, and event metadata use Mono.
- System or unknown-schema events use an inset event strip rather than impersonating a human message.
- Preserve unsupported event payloads without guessing their meaning.

### Composer

- The composer is a square-edged input plate anchored to the bottom chrome.
- Send is a separate 44×44 plate with an upward arrow. Disabled state reduces contrast without changing the semantic color.
- Keep the channel marker and destination visible. Do not hide where a message will be sent.

## 6. Generic lists

- A list is one plate with 1px row separators, not a stack of floating cards.
- Use 48px minimum rows for one line and 58px for a title plus detail.
- Align recurring fields into stable columns: status/glyph, primary content, optional owner/count, updated time.
- Use a lamp plus label for semantic state; do not tint the whole row.
- Selected/pressed state is a neutral surface shift. Amber never means selected.
- Empty cells in topology retain the grid with a dashed `NO STORY` plate.
- Empty lists explain what is absent and, when truthful, the next available action.

## 7. Settings

- Treat Settings as an instrument panel: section plate, Mono header band, then neutral rows.
- A row has a Sans label and optional explanation on the left, with one control or value aligned right.
- Navigation rows use a chevron; toggles and segmented controls remain square-edged and at least 44px tall.
- Appearance exposes `DARK` and `PAPER` as peers and shows the current selection structurally.
- Account, room, and permission identifiers use Mono. Explanatory privacy/security copy uses Sans.
- Dangerous actions get their own section and red only at the final irreversible control.

## 8. Accept, deny, review, and permission prompts

### Context first

An approval surface begins with an amber header or callout that states:

- what needs a decision;
- who or what requested it;
- the scope and consequence;
- whether a default exists;
- what is blocked while it waits.

The content is neutral; amber marks the need for human action, not a recommendation.

### Actions

- Use explicit verbs: `ALLOW ONCE`, `ALLOW FOR ROOM`, `DENY`, `SEND BACK`, `APPROVE + COMPLETE`.
- Avoid vague `YES`, `NO`, `OK`, and overloaded `CLEAR` when the action has consequences.
- Put the safe reversible action first when platform convention allows; keep destructive denial/removal visually distinct only when it is actually destructive.
- Every target is at least 44px and generally 48px on mobile.
- Disabled actions stay visible with the exact unmet requirement in Sans copy beneath them.
- After settlement, replace the controls with a receipt: decision, actor, time, and resulting state.

### Modal use

Use an inline review plate when the decision belongs to the current list or Story. Use a bottom sheet/mobile modal when consequence detail or scoping choices must stay visible. Use a blocking dialog only for irreversible or security-sensitive actions.

## 9. Responsive behavior

### iPhone and Fold cover

- Single pane.
- Flat primary destinations with nested channel/Story detail.
- Bottom four-tab navigation.
- Keep actions and counts visible without horizontal tables.

### Fold open

- Treat the near-square canvas as a new composition, not a uniformly scaled phone.
- Pin the 352dp drawer for Chat.
- Use split panes where one side is navigation/context and the other is active content.
- Status and Board adopt full-width logic: four-across counters and proper tables.

### Desktop/web

- Preserve a single aligned screen well.
- Use tables when columns carry comparable data.
- Keep chassis metadata outside the content hierarchy.

## 10. State, accessibility, and performance

- Color is never the only state cue; pair every lamp with a label or accessible name.
- All icon-only controls need an explicit accessible label.
- Maintain 44px touch targets and visible focus outlines using relationship teal.
- Respect reduced motion. No status requires continuous animation to be understood.
- Avoid continuously repainting glows or background effects. Dark lamps may have a static glow; Paper lamps are solid dots with a hairline ring.
- Loading, empty, unavailable, permission-denied, offline, and error states are first-class variants.

## 11. Design review checklist

- Is this state supported by the current contract?
- Is the element a plate, a row, a label, a lamp, or a real relationship bus?
- Is human language in Sans and machine metadata in Mono?
- Does semantic color mean exactly one thing?
- Are back, close, send, and decision targets at least 44px?
- Does Paper preserve hierarchy without relying on glow?
- Does Fold open recompose rather than scale?
- Is the resolved/disabled/error state shown?
- Can the component be understood without color or motion?

