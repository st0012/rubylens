# Reference routes

RubyLens Reports can show aggregated, directed Ruby constant-reference routes. A route is a static resolved relationship in the indexed code, not a runtime call edge and not a call graph.

## Semantic contract

- The source is the innermost plotted workspace class or module whose definition range contains the reference.
- The target is either another plotted workspace namespace or one dependency-gem hub.
- Repeated references with the same source and target collapse into one route with an integer occurrence count.
- Duplicate occurrences at the same source span are removed, and self-routes are omitted.
- Dependency stars stay anonymous and non-interactive; routes into dependency code terminate at the named gem hub.
- Incoming reference totals remain a separate star signal and tooltip metric. A route count describes one source/target relationship and must not be substituted for that total.

The compact snapshot and art row is:

```text
[source_namespace, target_kind, target_ordinal, occurrences]
```

Every field is an integer. `target_kind` distinguishes a namespace ordinal from a package ordinal. Configured reports retain a route only when its workspace endpoints survived bounded plotting.

## Selected-route interaction

A locked class, module, or gem selection reveals one bounded neighborhood in the Explorer. Precise pointers show at most 16 entries; coarse pointers show at most 8. Outgoing and incoming candidates compete in one global ranking by occurrence count. Equal counts use destination name, direction, category, and stable plotted ordinal as deterministic tie breakers. The UI then presents the chosen entries in separate outgoing and incoming groups.

This is intentionally different from reserving half the list for each direction: a route described as strongest must not be omitted merely because its direction used an arbitrary quota. Selecting a destination follows it with the same smooth top-down camera navigation used by sidebar highlights.

The ranked neighborhood is computed only when the locked selection, category visibility, or pointer limit changes. Both the HTML panel and route drawing consume that cached bounded list. Hover and animation frames never rescan or sort full adjacency.

## Core route map

The Core routes control builds an optional frozen overview containing only routes where at least one endpoint is Core code. It does not create hoverable edge objects, labels, picking, or another data model.

Building the map pauses drift, returns to the overview camera, projects endpoints through typed caches, and draws aggregate lines into an offscreen Canvas in frame-budgeted chunks. The galaxy remains visible beneath it. Camera, visibility, and focus controls are disabled while the map is building or displayed because moving the camera would invalidate the screen-space cache. Escape, Reset view, or the route control exits and restores the prior camera and drift state.

That interaction is a deliberate Canvas performance boundary. A continuously navigable complete layer would require a GPU line buffer that transforms endpoints with the camera rather than projecting and drawing every edge on the CPU for every frame.

## Generation and memory contract

RubyLens derives inbound signals and routes in the same resolved-reference pass. Per-document source ranges use an indexed containment lookup rather than a full range scan for every occurrence. The adapter aggregates repeated relationships and performs the deterministic ordering once.

The art model filters and remaps rows without a second all-edge sort. In the browser, rows are decoded in one pass into one canonical edge object shared by sparse outgoing and incoming indexes. Core-touching edges additionally appear by reference in the static-map subset. The raw nested rows are then removed from the parsed model, and there is no retained all-edge pointer array.

Showcase strips route rows and all endpoint identities before serialization. Routes are private Explorer structure, just like class, module, group, and gem names. A Report remains owner-only by default and should not be shared unless disclosing that structure is intentional.

## Deferred improvements

- Render a navigable overview with a single GPU line buffer while preserving the no-picking rule.
- Add aggregate cross-system relationships that explain monorepo boundaries without duplicating per-node routes or changing system geometry.
- Measure full-pipeline indexing and browser memory across additional public repositories and synthetic high-fanout fixtures.
- Evaluate whether route visibility needs an independent filter after ordinary Core, Tests, and Gems visibility has proven insufficient.

Method-call occurrences remain outside this feature. RubyLens will not infer or market a whole-program Ruby call graph from partial static method-call data.
