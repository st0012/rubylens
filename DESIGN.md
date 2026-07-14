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

Explorer drift is slow and time-based. Hover, selection, focus, expansion, panel use, and camera flights do not pause it; only the drift control or an unmodified Space press outside an interactive control changes the explicit drift state. Camera flights explain spatial changes. Reduced-motion preference completes navigation immediately and disables autonomous Explorer drift.

Controls use standard inputs, buttons, disclosures, keyboard activation, visible focus, and readable status text. Compact layouts bound and scroll dense details without obscuring the entire galaxy or clipping controls and long names.

## Showcase

Showcase is autonomous and noninteractive. It preserves the approved fixed presentation contract and contains no Explorer panel, toolbar, tooltip, warning disclosure, search, hover, selection, or navigation behavior. Annotated output may show one moving ring-and-leader label at a time in the matching Core, Test, or Gem color; Minimal output has no statistics or labels.
