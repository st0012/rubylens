# RubyLens project brief

This brief records the product's earlier research and direction-setting. [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md) are the current contracts for shipped product and interaction decisions.

## Vision

RubyLens is a CLI-first Ruby tool that turns a Ruby codebase into a beautiful, interactive semantic map and a compact set of useful project statistics. Its first output will be an offline browser report that can be explored and inspected locally. A hosted product may follow later if there is real demand and its cost and privacy model make sense.

The selected visual direction is a whole-codebase **Galaxy**: core, tests, and dependencies form one data-bearing stellar artwork intended to be appreciated at system scale rather than inspected node by node. Dependency packages become compact satellite systems. See [the exploration report](docs/RUBYDEX_EXPLORATION.md) for the semantic evidence and [the stellar design research](docs/STELLAR_DESIGN_RESEARCH.md) for the visual grammar.

## Why RubyDex

Most code visualizers stop at files, syntax, or text-level references. RubyDex resolves enough of Ruby's semantics to make the map describe the program rather than merely its directory tree. Its Ruby API can expose declarations and definitions, class relationships, mixins, and resolved constant references, giving RubyLens meaningful structure to visualize.

Accuracy note: this brief uses the preferred narrative spelling **RubyDex**. The upstream [README and Ruby API example](https://github.com/Shopify/rubydex#usage) style the project **Rubydex**, with Ruby namespace `Rubydex`, gem `rubydex`, and CLI `rdx`.

## Decisions made

- Implement the product and extractor in Ruby, supporting Ruby 3.2 through 4.0 while using Ruby 4.0.5 for local development.
- Start as a CLI that generates an offline, private-by-default report; defer hosting.
- Keep browser renderer assets local. Opening a generated report must require neither Node nor internet access at runtime.
- Do not use Figma or a subscription design tool. Review the appearance first in a no-dependency, self-contained HTML visual design sheet showing representative default and selected states, without production interactions. Turn the approved direction into an interactive HTML/JS spike afterward.
- Build a presentation-led vertical slice, because the visual determines the data contract and the available data constrains the visual. Do not build the presentation or extractor to completion in isolation.
- During visual prototyping, optimize for iteration speed: preserve basic dataset provenance, count truth, and privacy, but defer exhaustive semantic classification and validation until a direction is selected.
- Treat core code, tests, and dependencies as the three primary visual categories. Keep the scene artistic at whole-codebase scale, with concise declaration details rather than a node-inspection dashboard.
- Present the RubyDex model as a guided explorer for general Ruby users: separate core, test-only, and gem counts; let users show or focus each system; and turn ancestry, descendants, members, and references into clickable standout facts that highlight declarations.
- Make deep inspection spatially navigable: zoom toward the cursor or pinch midpoint, preserve orbit controls, and support explicit mouse, touch, and keyboard panning through dense clouds.
- Treat dependency focus as a lightweight level-of-detail state: double-click one existing gem system to pause drift, expand its current points, and sharpen its stars without duplicating dependency models in memory.
- Keep Galaxy A as the selected direction. City Blocks is paused until the stellar direction and gem pipeline are mature.
- Keep 3D coordinates and layout simulation renderer-owned rather than embedding positions in the compact `rubylens.art.v7` model.

## Confirmed RubyDex reality

- The current release is 0.2.9. It is MIT-licensed and still pre-1.0, so RubyLens should isolate the integration behind its own model contract.
- The Ruby API exposes documents, declarations, definitions, ancestry and descendants, superclass/mixin relationships, constant references, and partial method-call occurrences.
- Method-call data is not a reliable whole-program call graph. RubyLens must not label or market it as one.
- The released `rdx` CLI has no `--stats` flag. The Rust `rubydex_cli --stats` output is mainly timings, memory, and internal index counts; the MCP `codebase_stats` tool is the closer source for product-facing totals.
- `index_workspace` indexes locked gems, but it does not preserve package provenance or dependency depth. RubyLens should parse Bundler/Gemfile.lock for that information and join packages to RubyDex documents by path.

The upstream [API reference](https://shopify.github.io/rubydex/) should remain the source of truth as the pre-1.0 interface evolves.

## Open decisions

- Which totals belong in the first summary panel: likely files, classes, modules, methods, namespaces, and gems, subject to what can be defined consistently.
- What visual properties represent size, type, ownership, and risk without turning the scene into an unreadable dashboard.
- How dependency depth, direct versus transitive gems, and workspace packages should be grouped below the waterline.
- How the current bounded, lazy Explorer search and renderer level-of-detail should evolve for repositories beyond their measured scale.
- How configurable monorepo boundaries become stable, independently focusable Core systems; see [the boundary design](docs/MONOREPO_BOUNDARIES.md).
- Which additional shareable formats should follow the autonomous Showcase without weakening local-first privacy.
- Whether the production report remains a single HTML file or becomes a fully local report directory; either form must stay offline at runtime.
- Whether a hosted product is worth building, and what explicit redaction and upload controls it would require.

## Current vertical slice

1. An explicit Git-selected manifest is the only file list passed to `Graph#index_all`; exact locked gem files are containment-audited and RubyLens's tool-only dependency closure is removed.
2. The Rubydex adapter emits the signals and workspace/package names needed for local hover proof. Dependency declaration identities, source text, comments, and paths do not cross into the report payload.
3. `RubyLens.generate_report` and `rubylens report` write one owner-only, self-contained HTML report with guided core, tests, and gems exploration plus RubyDex-powered clickable facts. `RubyLens.generate` remains a compatibility alias.
4. The production Canvas renderer implements the approved galaxy morphology without requiring Node at report runtime. The Three.js prototype remains a design lab for HDR bloom, point-spread shaders, dust attenuation, and higher-scale rendering.
5. `RubyLens.generate_showcase` and `rubylens showcase` write a standalone, owner-only HTML presentation with a one-minute autonomous orbit, bounded visual detail, aggregate statistics, and a privacy-reduced numeric payload.

The next production slice is configurable multi-system monorepo boundaries, without changing the local-only privacy boundary. Resolved reference routes are paused; their findings and revival criteria are preserved in [the archived route design](docs/REFERENCE_ROUTES_FUTURE.md).

## Privacy guardrails

The current bare `index_workspace` research mode and upstream MCP indexer can include ignored or untracked Ruby files. They are not private-safe product paths. A distinct safe-manifest adapter is a blocking requirement before RubyLens is used as a general private-codebase tool.

- Index and render locally by default; never upload source, index data, or report contents without an explicit future opt-in flow.
- Ship scripts, styles, fonts, and rendering libraries locally. Generated reports must not call CDNs, analytics, telemetry, or remote APIs.
- Treat derived names, paths, relationships, and dependency lists as sensitive even when no source text is included.
- Exclude source snippets and file contents from the default model. Add any future excerpts only behind an explicit option with clear sharing warnings.
- Write generated reports to an ignored local output location by default and warn that sharing the HTML can disclose codebase structure.
- If hosting is explored later, design redaction, retention, access control, deletion, and cost limits before accepting private data.

## Name assessment

**RubyLens is a strong working name and `rubylens` is a plausible gem name**: short, memorable, and aligned with seeing a Ruby system more clearly. As of 2026-07-10, the official [RubyGems search](https://rubygems.org/search?query=rubylens) returned no result for `rubylens`; exact API lookups for `rubylens`, `ruby-lens`, and `ruby_lens` returned 404, the API search for `rubylens` returned `[]`, and version and owner lookups for `rubylens` also returned 404, following the documented [RubyGems.org API](https://guides.rubygems.org/rubygems-org-api/). There is therefore no currently published or owned RubyGems record for the desired exact name, so `rubylens` appears available today and has no RubyGems package collision. This is a point-in-time check, not a reservation; only an actual first push claims the name. [Neolex-Security/RubyLens](https://github.com/Neolex-Security/RubyLens) and the occupied `rubylens.com` domain still create public brand and search ambiguity rather than blocking the gem name. Keep RubyLens as the working name and plausible gem name; formal naming and Shopify-brand review remain relevant if the project moves toward public branding.

## Local setup

- Ruby 3.2 is the supported runtime floor and Ruby 4.0 is the current ceiling inherited from pinned Rubydex 0.2.9. [Ruby 4.0.5](https://www.ruby-lang.org/en/news/2026/05/20/ruby-4-0-5-released/) is installed locally, pinned in `.ruby-version` as `ruby-4.0.5`, and verified through chruby.
- Verified interpreter: `ruby 4.0.5 (2026-05-20 revision 64336ffd0e) +PRISM [arm64-darwin24]` through chruby.
- The project is a local Git repository on `main`; the initial Rubydex research and visual prototype are committed separately from the gem implementation.
- A Ruby research harness, sanitized snapshots, MCP probes, dependency overlays, post-processing analyzer, installable gem, private manifest, bounded local model adapter, CLI, and local report writer now exist.
