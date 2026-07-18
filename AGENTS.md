# AGENTS.md

Documentation map for RubyLens. Start with [README.md](README.md) for usage and development setup.

## Contracts

- [PRODUCT.md](PRODUCT.md) — the product contract: surfaces, meaning and scale, privacy, and non-goals.
- [DESIGN.md](DESIGN.md) — the design contract: stellar identity, Explorer interaction, motion, and Showcase rules.

## Engineering references

- [docs/PERFORMANCE.md](docs/PERFORMANCE.md) — scale instrumentation, complete-row artifact evidence, and the dependency-aggregation benchmark.
- [docs/EXPLORER_SHOWCASE_RENDERING.md](docs/EXPLORER_SHOWCASE_RENDERING.md) — shared renderer data and intentional Explorer/Showcase presentation differences.

## Visual design

- [docs/STELLAR_DESIGN_RESEARCH.md](docs/STELLAR_DESIGN_RESEARCH.md) — the astrophysical visual grammar: morphology, light, and performance rules the renderer follows.
- [docs/specs/2026-07-14-galaxy-morphology-design.md](docs/specs/2026-07-14-galaxy-morphology-design.md) — the accepted deterministic galaxy morphology design.

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
