# Payload schemas

RubyLens moves data through three schemas. One is an in-memory handoff; two are persisted inside generated HTML artifacts. This document is the contract for their shapes and for when the version strings must change.

## Why the `schema` field exists

Generated artifacts are self-contained: one gem run bakes the model JSON and the runtime JavaScript into the same HTML file, so the runtime never receives data from a different RubyLens version and never checks the field at load. The version string exists for everything outside that moment:

- Artifacts outlive the gem. The string identifies the format of a report months later, in a bug ticket or an archive.
- The payload is mostly positional integer rows, which cannot describe themselves. The string is the only format identifier in the file, so external tooling that parses the embedded JSON can fail loudly on a format change instead of silently reading shifted columns.
- Tests assert the exact version, which turns any payload change into a deliberate, reviewable bump.

**Versioning rule:** any change to a schema's fields, row lengths, or column meaning bumps that schema's version, in the same change. Versions never need to stay decodable by older runtimes — artifacts carry their own runtime.

## `rubylens.snapshot.v9` — indexing handoff (in-memory)

Produced by `RubyLens::Index::RubydexAdapter#index`; consumed by `MorphologyClassifier` and `ArtModelBuilder`. Never persisted.

| Field | Shape |
| --- | --- |
| `project_name` | Humanized target directory name |
| `namespace_names` | Names aligned with `namespaces`; RSpec proxy groups (`RSpec example group #NNNNNN`) appended last |
| `namespaces` | 13-integer rows, below |
| `constant_reference_links` | Up to 1,024 two-integer rows: `[referringIndex, referencedIndex]`; both are global indexes into `namespaces` followed by the flattened dependency declaration rows described below, and the referrer always addresses `namespaces` |
| `category_stats` | `{"core" => [classes, modules, methods, constants], "tests" => [...]}` |
| `dependency_signal_maxima` | Six integers: maxima of the dependency declaration signal columns |
| `packages` | Hashes: `name`, `role` (0 direct / 1 transitive), `location` (0 workspace / 1 external), `ruby_counts` (4), `declarations` (7-integer rows, below). Snapshots are complete-only: there is no separate declaration count — every consumer derives it from `declarations.length`, so a bounded payload cannot be expressed |
| `dependency_systems` | Hashes: `id`, `package_indexes`, `label_package_index` |
| `dependency_warnings` | Hashes with at least `name` and `reason` |
| `warning_counts` | `{"manifest", "index", "integrity"}` counts |

Namespace row (13 integers):

```text
[kind, scope, ancestorDepth, definitionSites, reopenings, descendants,
 references, members, classCount, moduleCount, methodCount, constantCount,
 instanceVariableCount]
```

- `kind`: 0 class, 1 module. `scope`: 0 core, 1 test, 2 mixed (mixed renders as core).
- Columns 2–7 are the six signal fields, in the order of `ArtModelBuilder::SIGNAL_FIELDS`.
- `references` is the complete count of resolved inbound workspace constant-reference occurrences. The bounded link list does not change it.

Dependency indexes begin at `namespaces.length` and flatten `packages[].declarations` in manifest package order and per-package index-stream order. This anonymous ordinal gives an exact declaration-star endpoint without adding dependency names.

Constant-reference links contain resolved references whose occurrence is inside the workspace and attributable to one innermost unambiguous namespace definition. The referring endpoint is therefore always Core or Test; the referenced endpoint addresses a workspace namespace or dependency declaration exactly. RubyLens omits top-level, ambiguous, and exact-self occurrences and deduplicates the remaining directed relationships. It retains links in graph iteration order until it reaches either 1,024 rows or 2,048 attribution attempts; it does not rank or weight the sample. The stored direction is workspace referrer to referenced declaration; these rows are neither call edges nor a complete relationship graph.

Dependency declaration row (7 integers):

```text
[kind, ancestorDepth, definitionSites, reopenings, descendants, references, members]
```

- `kind`: 0 class, 1 module, 2 other. Columns 1–6 are the six signal fields (`DependencyAggregation::SIGNAL_COLUMNS`).

## `rubylens.art.v13` — Explorer model (persisted)

Built by `ArtModelBuilder#build`; embedded base64-encoded in `rubylens-report.html`. Scene rows are deterministically shuffled and prefixed with render seeds.

| Field | Shape |
| --- | --- |
| `projectName` | String |
| `morphology` | One 10-integer morphology row, below |
| `totals` | `{"namespaces", "packages", "dependencyStars"}` exact counts |
| `domains` | Per-signal maxima across namespaces and dependency declarations, keyed by the six signal field names |
| `categoryStats` | As in the snapshot |
| `namespaceNames`, `namespaces` | Names plus 14-integer rows: `[seed, ...snapshot namespace row]` |
| `constantReferenceLinks` | Two-integer rows: `[referringIndex, referencedIndex]`; both are global render indexes into `namespaces` followed by `dependencyStars`, and the referrer always addresses `namespaces` |
| `packageNames`, `packages` | Names plus 9-integer rows: `[seed, role, location, declarationCount, classCount, moduleCount, methodCount, constantCount, systemIndex]` (`systemIndex` −1 when ungrouped) |
| `packageMorphologies` | 10-integer morphology rows, one per package in package order, seeded by that package's `seed` |
| `dependencySystems` | 2-integer rows: `[seed, labelPackageIndex]` |
| `dependencyStars` | 8-integer rows: `[seed, packageIndex, ...six signal values]` |
| `dependencyWarnings` | Validated `{"name", "reason"}` pairs |
| `warningCounts` | As in the snapshot |

Morphology row (10 integers), decoded once at load by the runtime's `decodeMorphology`:

```text
[family, ellipticity, bulgeShare, armCount, winding, armFraction, barLength,
 clumpCount, clumpSpread, phaseSeed]
```

- `family`: 0 elliptical, 1 lenticular, 2 spiral, 3 barred spiral, 4 irregular. Fraction knobs are scaled to thousandths; only the knobs relevant to the family are read. Barred-spiral `barLength` accepts 0.1–0.8, including the longer bars emitted for visually enriched large packages. The other accepted knob ranges are specified in the [galaxy morphology design](specs/2026-07-14-galaxy-morphology-design.md).
- A malformed row falls back to the default spiral `[2, 0, 240, 3, 105, 380, 0, 0, 0, phaseSeed]`, rendered through the standard spiral recipe.

The art builder trusts the adapter's semantic filtering and cap, remaps both endpoints into the global render address space, and seeded-shuffles the retained rows. Package and system hubs are outside this address space. The runtime derives each route's animation seed from its endpoint indexes. It preserves the stored referrer-to-referenced semantics but presents each flight in reverse, from the referenced declaration star to its referrer.

## `rubylens.showcase.v7` — Showcase projection (persisted)

Built by `ShowcaseModel#call` from the art model; embedded in `rubylens-showcase.html`. It is the privacy-filtered projection: numeric rows are re-validated and truncated to their exact lengths, and no name fields are carried except in Details annotations.

Always present: `projectName`, `details` (boolean), `domains`, `morphology` (10-integer row), `namespaces` (14), `constantReferenceLinks` (2), `packages` (9), `packageMorphologies` (10), `dependencySystems` (2), `dependencyStars` (8) — the same row shapes as the art model, without the name arrays.

Both Showcase modes retain the bounded `constantReferenceLinks` rows. Their anonymous endpoints let Minimal Showcase reveal a sparse sample of relationship topology without carrying namespace names; this is an intentional disclosure, not a complete graph.

Details mode (`--details`) adds:

| Field | Shape |
| --- | --- |
| `totals` | As in the art model |
| `categoryStats` | As in the art model |
| `pinnedNamespaceAnchors` | Indexes of `Object`/`Kernel`/`BasicObject` rows kept anchorable without annotation |
| `annotations` | Up to 200 safety-filtered `{"category", "name", "kind", "anchor"}` entries, category-interleaved |
