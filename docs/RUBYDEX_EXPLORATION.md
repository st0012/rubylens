# RubyDex exploration: what RubyLens should build first

## Decision

Build the first RubyLens product slice around an ordered **Lineage Spine**, not a global 3D dependency graph.

The evidence supports three complementary views:

1. **Lineage Spine** — the primary interactive view. Preserve Ruby lookup order exactly, including prepend entries before self, and add an origin/dependency rail beside the chain.
2. **Boundary Lanes** — the provenance layer. Explain when lookup crosses from workspace code into a workspace package, bundle-only gem, transitive gem, RBS/core signature, or global-injection candidate.
3. **Class Dossier** — the inspector, mobile, print, and accessibility fallback. Show definitions, resolution confidence, reopen/merge evidence, and transitive reach without requiring a graph.

The original dependency iceberg remains useful as a later overview, but gem mass must come from **workspace semantic contact**—workspace constant references and ancestry boundary crossings—not the gem's own indexed declaration volume. Development tools otherwise dominate the scene. Every dependency signal is static evidence, not proof of runtime use.

## Exact method

The spike used Ruby 4.0.5 and Rubydex 0.2.9. The pinned [v0.2.9 README](https://github.com/Shopify/rubydex/blob/v0.2.9/README.md#usage) documents the Ruby `Graph` API, and its [experimental MCP section](https://github.com/Shopify/rubydex/blob/v0.2.9/README.md#mcp-server-experimental) describes the released semantic tools. The generated artifacts retain the exact Rubydex version.

Two clean detached worktrees were indexed without changing their source:

| Target | Commit |
|---|---|
| RDoc | `6630d89b1422ba1ccbf9f7e48f82ffc9bd9f83e3` |
| Rails | `03fd08a62790d279361cf67de135e1fea85986ea` |

Each target used an isolated bundle that preserved its target-only lockfile and added Rubydex as tooling. The Rails bundle required one isolated native-build override for `mysql2 0.5.6`: `--with-ldflags=-L/opt/homebrew/opt/zstd/lib`. No Homebrew links/packages or source worktrees were changed.

Two extraction modes were compared:

- **Control:** Git-selected, tracked or unignored `.rb`, `.rbs`, `.rake`, and `.ru` files passed to `Graph#index_all`, followed by `resolve`.
- **Workspace research snapshot:** bare upstream `Graph#index_workspace`, followed by `resolve`, under the exact overlay bundle.

The workspace mode is deliberately an upstream-behavior research capture. It is **not private-safe**: Rubydex 0.2.9 can index ignored or untracked Ruby files. The same limitation applies to the official MCP server because its indexer also calls `index_workspace`. The saved RDoc/Rails worktrees passed a post-run escaping-symlink audit and show no extra workspace documents, but that does not make the mode suitable for arbitrary private repositories.

The required production adapter is a distinct safe-manifest mode:

1. enumerate Git-selected workspace files;
2. reject or deduplicate symlinks by canonical path and selected-target membership;
3. audit external dependency and explicit RBS roots;
4. pass the safe workspace manifest plus those external roots to `Graph#index_all`;
5. retain the origin and dependency ledger.

The direct extractor does not call `Graph#load_config`; the MCP server does. Neither target contained `rubydex.toml`, so totals reconcile here. Product code must choose configuration behavior deliberately.

The released Codex registration command is `codex mcp add rubydex -- bundle exec rdx --mcp`. This exploration did not change global Codex configuration: its verification probe instantiated the MCP server in process against each isolated target bundle.

## Control versus full index

The headline totals below are global graph totals. They are useful for capacity and reconciliation, not project rankings.

| Target/mode | Status | Documents | Declarations | Definitions | Constant refs | Method refs | Total time |
|---|---:|---:|---:|---:|---:|---:|---:|
| RDoc control | complete | 220 | 6,584 | 7,195 | 12,259 | 40,896 | 16.96s |
| RDoc workspace | complete | 2,587 | 61,867 | 68,924 | 49,882 | 213,498 | 173.66s |
| Rails control | complete | 3,406 | 60,869 | 60,835 | 191,135 | 331,188 | 100.89s |
| Rails workspace | partial | 10,098 | 173,775 | 186,443 | 388,045 | 768,432 | 607.38s |

Collection and serialization dominate runtime: 167.35s of the RDoc full run and 586.42s of the Rails full run. RubyDex indexing and resolution themselves were under one second for each full run. A production model should stream or selectively materialize records instead of serializing every raw semantic array by default.

The sanitized MCP probes independently rebuilt each full graph and matched files, declarations, definitions, reference totals, and every normalized declaration-kind count exactly. They also exercised:

- RDoc: search/get `RDoc::NormalClass`; descendants for `RDoc::Context`.
- Rails: search/get `ActiveRecord::Base`; descendants for `Rails::Engine`.

All calls succeeded. MCP payloads omit comments, source excerpts, and absolute paths.

## Origin and dependency proof

Full-index document origins:

| Target | Workspace | External gem | RBS | Rubydex tooling | Builtin |
|---|---:|---:|---:|---:|---:|
| RDoc | 219 | 2,097 | 247 | 23 | 1 |
| Rails | 3,404 | 6,670 | 0 | 23 | 1 |

RDoc's isolated bundle includes `rbs 4.0.3`, so Rubydex added core and stdlib signatures. Rails' isolated bundle contains no RBS gem and therefore has no RBS documents. RubyLens must pin or disable an RBS policy explicitly rather than inheriting ambient `Gem.path`.

Dependency counts must distinguish lockfile spec rows, unique packages, and actual observed documents:

| Target | Target spec rows | Unique packages incl. self | Dependency packages excl. self | External packages | External with documents |
|---|---:|---:|---:|---:|---:|
| RDoc | 42 | 36 | 35 | 35 | 35 |
| Rails | 263 | 231 | 230 | 217 | 214 |

Platform variants explain the row/package difference: RDoc's `libv8-node` and the tooling Rubydex package have multiple locked platforms. The analysis groups by name and version while preserving platform lists.

Rails has 13 workspace/path dependency packages and 217 external RubyGems packages. Its locked roles are 12 direct-runtime workspace components, 76 bundle-only packages, and 142 transitives. The three declared-but-not-locked names for the selected platforms are `bundler`, `tzinfo-data`, and `wdm`.

Three external Rails packages produced no RubyDex document:

- `rbtree 0.4.6` and `stringio 3.1.7`: their installed `lib` roots contain no indexable Ruby/RBS files.
- `rubocop-rails-omakase 1.0.0`: its declared `lib` root does not exist.

“Locked exact” therefore means an exact package installation was available; it does **not** mean the package contributed declarations.

## Workspace population and identity

Project-facing rankings use explicit workspace `class_definition` and `module_definition` sites joined to canonical declarations:

| Target | Strict explicit namespaces | Classes | Modules | Constant-backed secondary cohort | Broad canonical cohort |
|---|---:|---:|---:|---:|---:|
| RDoc | 258 | 238 | 20 | 19 | 277 |
| Rails | 8,051 | 6,791 | 1,260 | 232 | 8,283 |

The secondary cohort contains canonical class/module declarations backed only by constant-shaped workspace definitions; examples include Rails `APP_PATH`, `ColumnDefinition`, and `Dot::INSTANCE`. It should be visible as a separate badge, not silently mixed into class/module rankings.

Canonical declaration identity wins over a definition's syntax. Rails has one explicit `class_definition` for `ActiveRecord::ConnectionAdapters::ConnectionPool::WeakThreadKeyMap`, while the canonical declaration is a `constant_alias`. Six merged names contain both class and module definition sites, mostly test/fixture collisions. RubyLens should display an ambiguity ledger instead of asserting that these are ordinary reopenings.

## Ancestry and prepend evidence

Nearest-rank ancestor counts remove exactly one self entry wherever it occurs; entries before self remain in order as prepend-prefix candidates.

| Cohort | Population | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| RDoc strict all | 258 | 6 | 20 | 21 |
| RDoc source | 138 | 5 | 9 | 10 |
| RDoc tests | 120 | 19 | 20 | 21 |
| Rails strict all | 8,051 | 15 | 70 | 85 |
| Rails source | 2,433 | 8 | 18 | 74 |
| Rails tests | 5,528 | 40 | 70 | 85 |

Rails has exactly 20 self-not-first declarations: 17 at index 1 and three at index 2. Useful fixtures include:

- `ActionText::Engine`: `ActionText::Encryption` before self.
- `ActiveSupport::TestCase`: `TestsWithoutAssertions`, then `SetupAndTeardown`, then self.
- `ERB::Util`: two ActiveSupport ERB modules before self.
- `ActiveRecord::ConnectionAdapters::ConnectionPool`: `QueryCache::ConnectionPoolConfiguration` before self.
- `ActiveSupport::MessageEncryptor`: `Messages::Rotator` before self.

This is the strongest reason to make exact ordered lookup the primary visual. A generic node-link graph obscures the behavior Ruby developers need to understand.

## Descendants, reopenings, and resolution

RubyDex `descendants` is a transitive closure that includes self. RubyLens may use it for reach counts after removing self by name, but it must never label the result direct children. A direct expandable tree requires inversion of resolved per-definition superclass/mixin edges with relation kind, location, and reopen provenance.

Strict Rails source transitive-reach candidates, after separating broad global-injection candidates, begin with:

- `ActiveRecord::ActiveRecordError` — 99
- `ActiveSupport::Callbacks` — 88
- `Arel::Nodes::Node` — 86
- `Arel::AliasPredication` — 78
- `Arel::Expressions`, `Arel::OrderPredications`, `Arel::Predications` — 77 each
- `Arel::Math` — 76
- `Arel::Nodes::NodeExpression` — 74
- `Rails::Generators::Actions` — 57
- `Rails::Generators::Base` — 56

`Object`, `Kernel`, `ActiveSupport::Tryable`, and other very broad entries belong in a separate, hatched **static global-injection candidate** cohort. That label is a heuristic until direct relation evidence is inverted.

Workspace-definition reopen evidence:

| Target | Multi-site names | Additional workspace sites |
|---|---:|---:|
| RDoc | 15 | 36 |
| Rails | 337 | 3,147 |

RDoc's largest are `RDoc` (11 sites), `RDoc::Markup` (7), and `Racc` (6). Counts exclude gem and RBS definitions.

Full indexing materially improves relationship resolution:

| Target/relation | Control resolved/unresolved | Full resolved/unresolved |
|---|---:|---:|
| RDoc superclass | 149 / 22 | 171 / 0 |
| RDoc mixin | 29 / 6 | 33 / 2 |
| Rails superclass | 5,441 / 255 | 5,504 / 192 |
| Rails mixin | 2,058 / 108 | 2,140 / 26 |

Rails adds 63 superclass resolutions with no regressions. RDoc adds 22. This supports using the full graph for selected-lineage evidence while keeping project rankings workspace-scoped.

## Known distortions and warnings

- **Tests dominate depth.** Rails test ancestry p50 is 40 versus source p50 8; RDoc tests are similarly inflated by Test::Unit.
- **RBS changes identity and depth.** RDoc gains useful core resolution, but signature definitions merge into workspace names and must not count as source reopenings.
- **Global gem mixins distort every chain.** Bundle-wide injection is static evidence, not proof of runtime loading.
- **Rails full status is partial.** RubyDex reported two missing roots: the Rails root gemspec's nonexistent `<workspace>/lib` and `rubocop-rails-omakase 1.0.0/lib`. Arrays are untruncated, and all 263 target spec rows are exact.
- **Rails workspace coverage is 3,404/3,405.** Upstream defaults excluded `.github/workflows/scripts/test-container.rb`; the missing control file defines only `LOCALHOST` and `PORT`, so strict class/module rankings are unaffected.
- **Ignored/untracked risk is blocking for product use.** Bare `index_workspace` and official MCP can read ignored Ruby files. Use only the future safe-manifest adapter for arbitrary private repositories.
- **Visibility is unsafe in 0.2.9.** Calling method visibility can abort in native code for `module_function`; the harness records `visibility: null` and never invokes visibility predicates.
- **Method references are occurrences, not a call graph.** They have optional receiver information but cannot support reliable whole-program call edges.
- **Source text is intentionally absent.** Generated snapshots omit excerpts, comments, and absolute source paths.

## Recommended prototype data contract

The first `model.v1` should be presentation-led and smaller than the research raw snapshots:

- `snapshot`: target commit, Ruby/Rubydex versions, status basis, input coverage, warnings, RBS policy, and safety mode.
- `population`: strict explicit namespace counts plus a separate constant-backed cohort.
- `declaration`: canonical name/kind, source/test/mixed scope, ambiguity flags, workspace definition sites, definitions by origin, and cross-origin merge evidence.
- `lineage`: exact ordered ancestors, self index, prepend prefix, semantic folds that preserve order, origin/dependency role per entry, and boundary transitions.
- `relations`: direct superclass and mixins per definition; resolved/unresolved status; inverted direct descendants only when provenance is retained.
- `reach`: transitive workspace reach split by source/test/external, explicitly labeled non-direct.
- `dependency`: name/version/platforms, workspace/external scope, direct-runtime/development/bundle-only/transitive role, observed-document counts, semantic-contact evidence, and `runtime_use: unproven`.
- `resolution_delta`: control-to-full completions and regressions.
- `privacy`: source/comments/absolute-path flags and an explicit report-sharing warning.

Renderer coordinates, layout simulation, and camera state do not belong in the semantic contract. URL/share state may identify a selected declaration and filters, but the generated report remains offline.

## Artifacts

- RDoc: [control summary](../generated/rdoc/control/summary.json), [workspace summary](../generated/rdoc/workspace/summary.json), [all declaration names](../generated/rdoc/workspace/raw/declaration_names.json.gz), [analysis](../generated/rdoc/analysis.json), [comparison](../generated/rdoc/comparison.json), [MCP probe](../generated/rdoc/mcp.json), [safety metadata](../generated/rdoc/workspace/safety.json).
- Rails: [control summary](../generated/rails/control/summary.json), [workspace summary](../generated/rails/workspace/summary.json), [all declaration names](../generated/rails/workspace/raw/declaration_names.json.gz), [analysis](../generated/rails/analysis.json), [comparison](../generated/rails/comparison.json), [MCP probe](../generated/rails/mcp.json), [safety metadata](../generated/rails/workspace/safety.json).
- Official upstream: [Shopify/Rubydex](https://github.com/Shopify/rubydex), [API reference](https://shopify.github.io/rubydex/), and [releases](https://github.com/Shopify/rubydex/releases).
