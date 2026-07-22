# RubyLens design contract

RubyLens uses a dark stellar identity: magenta Core, cyan Tests, and warm gold Gems. The galaxy remains the primary surface; product controls should be restrained, familiar, and visually subordinate to it.

## Explorer

- Core and Tests are navigable Ruby namespace points. Gems are aggregate dependency systems; multi-package Git sources use one parent system with inspectable package subclouds, while their stars stay anonymous and non-hoverable.
- Search uses names already embedded for interactive Ruby points, parent dependency systems, and gem packages. It is lazy, debounced, capped, progressively revealed, and reuses the same spatial navigation as canvas and sidebar selections rather than creating a parallel model.
- Point, highlight, and dependency selections use one top-down relationship flight. The selected target sits near one side of the usable canvas while Core remains visible on the other for scale; the open panel and compact layout are excluded from the framing area. Concentric category focus is the graceful system-wide case and remains centered with Core visible.
- Reset returns to the exact default camera, reveals every category, clears spatial focus and selection, and restores orbit navigation without changing the user's drift choice. Arrow keys continue to pan the world when focus is not in an editable control.
- Hover and selection retain surrounding context. Category focus may reduce emphasis lightly, but the scene must not collapse into heavy dimming.
- Partial-index warnings use an accessible disclosure. Only sanitized package names with canned reasons may appear as row details; every other warning is an aggregate category count.

## Motion and access

Explorer drift is slow and time-based. Hover, selection, focus, expansion, panel use, and camera flights do not pause it; only the drift control or an unmodified Space press outside an interactive control changes the explicit drift state. Dependency clouds rotate around their own package hubs at deterministic, independently seeded speeds derived from their declaration-count mass proxy, cloud radius, and distance from Core. The same drift control pauses both scene drift and cloud rotation. Camera flights explain spatial changes. Reduced-motion preference completes navigation immediately and disables autonomous Explorer drift and cloud rotation.

Travel topology stays bounded and its motion transient. According to the complete rendered point population, RubyLens shows one simultaneous flight in very small reports and at most two at every larger scale, favoring workspace-to-Gem routes throughout. Seeded individual launches use varied gaps and staggered handoffs instead of synchronized bursts; a short clean seam once per minute keeps the Showcase and Clip loop exact. Each admitted 2.2-second flight stays attached to its rotating endpoint stars through one stable-side broad arc with a long, full feathered wake that thickens into one subdued elongated same-hue drop; no separate orb, white-hot projectile tip, or persistent line remains. Camera changes clear active flights instead of letting them jump or re-enter. Every route represents a resolved reference from a workspace namespace to another workspace namespace or an exact anonymous Gem declaration star. Top-level, ambiguous, exact-self, and non-workspace origins are omitted. Explorer shows flights only while drift is active, and reduced motion disables them.

Controls use standard inputs, buttons, disclosures, keyboard activation, visible focus, and readable status text. Compact layouts bound and scroll dense details without obscuring the entire galaxy or clipping controls and long names.

## Showcase

Showcase is autonomous and noninteractive. It preserves the approved fixed presentation contract and contains no Explorer panel, toolbar, tooltip, warning disclosure, search, hover, selection, or navigation behavior. Both modes use the deterministic presentation clock for transient travel flights. Annotated output may show one moving ring-and-leader label at a time in the matching Core, Test, or Gem color; Minimal output has no statistics or labels.

Clip is the Showcase recorded, not a new presentation: one full camera turn captured at the fixed 1920×1080 stage, looping seamlessly. It introduces no clip-only framing, branding, sizes, brightness, cloud rotation, or travel choreography. Cloud speeds resolve to whole turns per 60-second presentation loop, and travel flights use the same elapsed-time schedule through the synthetic export clock. The one sanctioned divergence is annotation fading, which collapses the staggered wall-clock CSS transitions into a single deterministic opacity envelope on the export clock ([rendering reference](docs/EXPLORER_SHOWCASE_RENDERING.md)).
