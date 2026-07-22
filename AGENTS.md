# AGENTS.md

Documentation map for RubyLens. Start with [README.md](README.md) for usage and development setup.

## Working conventions

Maintainer preferences for agents working in this repository.

Code:

- Do not introduce attributes that duplicate or are derivable from data that is already present — a stored copy can drift out of sync with its source. Derive from the single authoritative representation instead (for example, a package's declaration count is its `declarations.length`, never a separate field).
- No one-line delegator methods — inline the underlying call at each call site, even when it is wordier.
- Cheap identity markers (like the payload `schema` fields) are worth keeping, but only with their purpose documented in a correctly named home (see [docs/SCHEMAS.md](docs/SCHEMAS.md)).

Workflow:

- Never post GitHub comments, review replies, or reactions on the maintainer's behalf. Respond to review feedback with code changes and report conclusions in the conversation.
- Communicate in plain English, and be concise.
- Verification is empirical, not just green tests: prove behavior-preserving changes by generating artifacts from both versions and comparing the embedded data and rendered pixels, and prove features by running them end to end.
- Diagnose before assuming a regression — reproduce first; missing output is often environmental (for example, dependency gems not installed in the generating bundle).
- Adversarially review any complexity you add: every new guard, field, helper, or layer must survive the question of whether it needs to exist at all before it ships.

## Contracts

- [PRODUCT.md](PRODUCT.md) — the product contract: surfaces, meaning and scale, privacy, and non-goals.
- [DESIGN.md](DESIGN.md) — the design contract: stellar identity, Explorer interaction, motion, and Showcase rules.

## Engineering references

- [docs/SCHEMAS.md](docs/SCHEMAS.md) — the payload contract: snapshot, art, and showcase schema shapes, and when to bump their versions.
- [docs/PERFORMANCE.md](docs/PERFORMANCE.md) — scale instrumentation, complete-row artifact evidence, and the dependency-aggregation benchmark.
- [docs/EXPLORER_SHOWCASE_RENDERING.md](docs/EXPLORER_SHOWCASE_RENDERING.md) — shared renderer data and intentional Explorer/Showcase presentation differences.

## Visual design

- [docs/STELLAR_DESIGN_RESEARCH.md](docs/STELLAR_DESIGN_RESEARCH.md) — the astrophysical visual grammar: morphology, light, and performance rules the renderer follows.
- [docs/specs/2026-07-14-galaxy-morphology-design.md](docs/specs/2026-07-14-galaxy-morphology-design.md) — the accepted deterministic galaxy morphology design.

## Renderer geometry practices

Rules distilled from iterating on the deterministic galaxy recipes in
`assets/runtime/report.js`. They exist because each one was violated once and
produced a visual regression that unit tests missed.

- Judge geometry changes by renders, not code review: top-down scatter
  small-multiples for structure plus real Explorer renders, before and after,
  including dense realistic star counts — several defects only appear at
  scale or on real projects.
- Ground visual tuning in observed galaxy structure (see
  [docs/STELLAR_DESIGN_RESEARCH.md](docs/STELLAR_DESIGN_RESEARCH.md)) rather
  than iterating by taste, and prefer physics laws with closed-form
  inverse-CDF samplers; observation wins over theory when they disagree.
- Never let draws pile onto a bound: clamping radii or flattening a sweep to
  a constant concentrates stars into arcs, rings, or spokes. Respread the
  mass instead, and rely on `test/js/position_distribution.test.mjs` — when
  adding a recipe, extend it and calibrate thresholds against a known-bad
  build so the guard demonstrably fails on the defect.
- A predicate the renderer uses must be the same function any test measures;
  never let a test assert a proxy gate while the renderer adds conditions.
- Geometry shared between the project galaxy and dependency clouds must live
  in one helper; hand-copied variants have diverged before. Verify intended
  no-op refactors seed-for-seed against the previous runtime.
- `unit(seed, channel)` draws must keep channels disjoint per population, and
  `normal(seed, channel)` consumes both `channel` and `channel + 1`;
  collisions silently bias distributions. Name tuned constants and their
  channels in a frozen recipe block (see `ARM_RECIPE`) instead of inlining
  them, keeping only formula-local ratios inline.
- Every runtime edit moves the assembled-report digest pin in
  `test/report_asset_assembler_test.rb`; classifier knob changes also need
  `REGENERATE_FIXTURES=1 bundle exec rake` and the pinned knob rows updated.

## Rubydex 0.2.9 integration notes

Constraints observed against pinned Rubydex 0.2.9 that shape `lib/rubylens/index/`. Re-verify each one when upgrading the pin; the upstream [API reference](https://shopify.github.io/rubydex/) is the source of truth for the evolving pre-1.0 interface.

- `Graph#index_workspace` and the upstream MCP indexer read ignored and untracked Ruby files. Private-safe indexing passes an explicit Git-selected manifest to `Graph#index_all`; `RubyLens::GitRepository` and `RubyLens::Index::Manifest` exist to build that manifest.
- `index_workspace` also discards package provenance and dependency depth. The manifest parses `Gemfile.lock` itself and joins packages to indexed documents by path.
- `Location#to_file_path` returns paths still percent-encoded, so `RubyLens::Index::SourcePath` decodes file URIs itself.
- Calling a declaration's method `visibility` can abort in native code (observed with `module_function`). Nothing in the adapter may invoke visibility predicates.
- Method references are text occurrences with optional receiver information, not a call graph. Never present them as call edges.
- When an `rbs` gem is visible to the ambient `Gem.path`, Rubydex can add core and stdlib signature documents whose definitions merge into workspace declaration identities. RBS policy must stay a deliberate choice, not inherited from the environment.
- `Namespace#ancestors` and `#descendants` include the declaration itself; the adapter subtracts self from both counts.
- The adapter deliberately never calls `Graph#load_config`: report generation must not silently honor a target repository's Rubydex exclusion configuration.
