# RubyLens design contract

RubyLens uses a dark stellar identity: magenta Core, cyan Tests, and warm gold Gems. The galaxy remains the primary surface; product controls should be restrained, familiar, and visually subordinate to it.

## Explorer

- Core and Tests are navigable Ruby namespace points. Gems are aggregate dependency systems; their stars stay anonymous and non-hoverable.
- Search uses names already embedded for interactive Ruby points and gem systems. It is lazy, debounced, capped, progressively revealed, and reuses existing spatial focus rather than creating a parallel navigation model.
- Home returns to the exact default camera, reveals every category, clears spatial focus and selection, and restores orbit navigation. Arrow keys continue to pan the world when focus is not in an editable control.
- Hover and selection retain surrounding context. Category focus may reduce emphasis lightly, but the scene must not collapse into heavy dimming.
- Partial-index warnings use an accessible disclosure. Only sanitized package names with canned reasons may appear as row details; every other warning is an aggregate category count.

## Motion and access

Explorer drift is slow, time-based, and interruptible. Camera flights explain spatial changes. Reduced-motion preference completes navigation immediately and disables autonomous Explorer drift.

Controls use standard inputs, buttons, disclosures, keyboard activation, visible focus, and readable status text. Compact layouts bound and scroll dense details without obscuring the entire galaxy or clipping controls and long names.

## Showcase

Showcase is autonomous and noninteractive. It preserves the approved fixed presentation contract and contains no Explorer panel, toolbar, tooltip, warning disclosure, search, hover, selection, or navigation behavior. Annotated output may show one moving ring-and-leader label at a time in the matching Core, Test, or Gem color; Minimal output has no statistics or labels.
