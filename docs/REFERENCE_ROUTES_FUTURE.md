# Reference routes: archived design context

Reference routes were implemented in commit `36afd1c` and removed from the active product in July 2026. This document preserves the useful semantic and interaction work so it can be reconsidered without keeping its indexing and rendering cost in every report.

## What the feature meant

A route was an aggregated, directed set of resolved Ruby constant references. It was not a runtime call edge and was never intended to become a call graph.

- The source was the innermost plotted workspace class or module whose definition range contained the reference.
- The target was either another plotted workspace namespace or one dependency-gem hub.
- Duplicate occurrences at the same source span were removed.
- Self-routes were omitted.
- The compact model stored `[source_namespace, target_kind, target_ordinal, occurrences]`.
- Incoming reference totals remained a separate star signal and tooltip metric.

The report offered a short incoming/outgoing list for a selected class, module, or gem. An experimental global layer first showed all routes, then narrowed to routes where either endpoint was Core code. Dependency stars stayed anonymous and non-interactive; dependency routes terminated at the gem hub.

## Interaction decisions worth keeping

- A selected-node route list should use fully qualified Ruby names and ordinary Ruby wording.
- Route lists should stay bounded: the experiment used 16 entries on precise pointers and 8 on coarse pointers.
- Global routes should never introduce per-edge hover or picking at large-project scale.
- Hover must not dim the galaxy. Selection can reduce context slightly, but it must remain spatially legible.
- Sidebar navigation should use a smooth top-down camera flight with an appropriate zoom, not merely recenter the selected point.
- Arrow keys move the camera. They do not move selection through sidebar items.
- Routes are static reference relationships. UI and documentation must never describe them as runtime calls.

## Scale findings

The real Rails report contained 30,156 aggregated routes representing 99,451 resolved occurrences. Limiting the global layer to routes touching Core code reduced that to 24,635 routes and 79,948 occurrences.

The data objects were not the primary resource problem. Two 3D endpoints per Rails Core route fit in well under 1 MB as packed floating-point coordinates. The problem was Canvas 2D's immediate-mode rendering: every camera frame would need tens of thousands of CPU projections and line draws while the renderer was already drawing thousands of stars.

A screen-space bitmap cache made the layer cheap while stationary, but camera movement invalidated it. Freezing navigation was confusing; hiding and rebuilding after movement was workable but felt unlike an interstellar map. At overview scale the complete layer was also visually dense enough to obscure the underlying systems.

## Why it is paused

- Source-range attribution added substantial indexing work on large repositories.
- A complete route layer was not a useful default reading of a 100k-namespace codebase.
- Canvas caching compromised the expected orbit, pan, and zoom interaction.
- The product now prioritizes cinematic sharing and configurable multi-system monorepo structure.

The active adapter therefore keeps only inbound resolved-reference counts used as star signals. It no longer derives source namespace ranges or emits route rows. The art model and report no longer contain route data, route panels, or global route controls.

## Recommended revival path

Reintroduce routes only after configurable monorepo boundaries exist.

1. Aggregate references between boundary groups for the overview; suppress internal self-group edges and report them as a metric.
2. Attribute a reference's source group from its actual source file so cross-group reopenings are not assigned to the namespace's dominant owner.
3. Keep per-node neighborhoods available only inside a focused system and only for plotted nodes.
4. Render the global layer as one WebGL line buffer. Upload endpoint coordinates once and transform them with the camera on the GPU so routes remain attached during orbit, pan, and zoom.
5. Keep route details accessible in a bounded HTML list; do not add edge picking.
6. Validate on a synthetic 100k-namespace fixture and a real large monorepo before enabling the feature by default.

The original commit remains useful implementation archaeology, but this document is the product contract for any future revival.
