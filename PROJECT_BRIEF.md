# RubyLens project brief

## Vision

RubyLens is a CLI-first Ruby tool that turns a Ruby codebase into a beautiful, interactive semantic map and a compact set of useful project statistics. Its first output will be an offline browser report that can be explored and inspected locally. A hosted product may follow later if there is real demand and its cost and privacy model make sense.

The initial visual exploration is an ordered **Lineage Spine** with provenance lanes and an evidence dossier. The dependency iceberg remains a later overview candidate, sized by workspace semantic contact rather than a gem's own indexed volume. See [the exploration report](docs/RUBYDEX_EXPLORATION.md) for the evidence and tradeoffs.

## Why RubyDex

Most code visualizers stop at files, syntax, or text-level references. RubyDex resolves enough of Ruby's semantics to make the map describe the program rather than merely its directory tree. Its Ruby API can expose declarations and definitions, class relationships, mixins, and resolved constant references, giving RubyLens meaningful structure to visualize.

Accuracy note: this brief uses the preferred narrative spelling **RubyDex**. The upstream [README and Ruby API example](https://github.com/Shopify/rubydex#usage) style the project **Rubydex**, with Ruby namespace `Rubydex`, gem `rubydex`, and CLI `rdx`.

## Decisions made

- Implement the product and extractor in Ruby, targeting Ruby 4.0.5.
- Start as a CLI that generates an offline, private-by-default report; defer hosting.
- Keep browser renderer assets local. Opening a generated report must require neither Node nor internet access at runtime.
- Do not use Figma or a subscription design tool. Review the appearance first in a no-dependency, self-contained HTML visual design sheet showing representative default and selected states, without production interactions. Turn the approved direction into an interactive HTML/JS spike afterward.
- Build a presentation-led vertical slice, because the visual determines the data contract and the available data constrains the visual. Do not build the presentation or extractor to completion in isolation.
- During visual prototyping, optimize for iteration speed: preserve basic dataset provenance, count truth, and privacy, but defer exhaustive semantic classification and validation until a direction is selected.
- Lead with exact Ruby lookup order and visible prepend-before-self semantics; embed dependency provenance as a side rail. Keep the iceberg overview as a later, evidence-sized view.
- Keep 3D coordinates and layout simulation renderer-owned rather than embedding positions in `model.v1`.

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
- Which relationships merit a selectable edge in v1, and how many can be shown before detail becomes noise.
- The level-of-detail and search strategy needed for very large repositories.
- Whether the production report remains a single HTML file or becomes a fully local report directory; either form must stay offline at runtime.
- Whether a hosted product is worth building, and what explicit redaction and upload controls it would require.

## Recommended first vertical slice

1. Review the no-dependency Lineage Spine, provenance-lane, and evidence-dossier design sheet and select the first production direction.
2. Build the safe-manifest adapter required for private repositories; keep bare `index_workspace` as an upstream-behavior research mode.
3. Freeze `model.v1` from the approved visual and the existing RDoc/Rails analysis artifacts.
4. Build the first interactive lineage slice with exact ancestry order, prepend prefixes, origin boundaries, filters, folds, and transitive-reach evidence.
5. Explore the dependency iceberg and broader performance work later, using semantic contact rather than indexed gem volume and measuring model size, load time, interaction smoothness, and legibility.

This sequence gives presentation and extraction one shared feedback loop while keeping either side replaceable.

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

- [Ruby 4.0.5](https://www.ruby-lang.org/en/news/2026/05/20/ruby-4-0-5-released/) is installed, pinned in `.ruby-version` as `ruby-4.0.5`, and verified through chruby.
- Verified interpreter: `ruby 4.0.5 (2026-05-20 revision 64336ffd0e) +PRISM [arm64-darwin24]` through chruby.
- The project is an unborn local Git repository on `main`, with no commits or remote.
- A Ruby research harness, fixture tests, sanitized snapshots, MCP probes, dependency overlays, and post-processing analyzer now exist. The production renderer and safe-manifest adapter do not.
