# RubyLens

RubyLens turns a Ruby codebase into self-contained stellar HTML. It uses Rubydex internally to map Ruby code, then generates either a private interactive report or a privacy-reduced autonomous Showcase.

This is an early local prototype. RubyLens 0.1 supports Ruby 3.2 through 4.0 and pins Rubydex 0.2.9 while its API is pre-1.0.

## Galaxy morphology

RubyLens borrows the [Hubble sequence](https://science.nasa.gov/asset/hubble/the-hubble-tuning-fork-classification-of-galaxies/) as a visual vocabulary. E0–E7 move from nearly round to increasingly flattened elliptical silhouettes; S0 is a smooth lenticular disc without visible arms; Sa–Sc move from tighter arms and larger bulges to looser arms and smaller bulges; SBa–SBc follow the same progression with a central bar; and Irr uses asymmetric clumps.

RubyLens classifies the Core/Test body and each dependency package independently from existing numeric aggregates and deterministic seeds. They share the same classifier mechanics, but a package never inherits the project's, host's, or dependency system's decision. The designations describe rendered shapes, not the codebase's architecture, purpose, or quality.

[![Five synthetic RubyLens renders of elliptical, lenticular, spiral, barred spiral, and irregular galaxy shapes using identical data.](docs/images/galaxy-morphology-families.jpg)](docs/images/galaxy-morphology-families.jpg)

*Five families rendered from the same synthetic points, seeds, colors, and camera; only morphology changes.*

[![Paired synthetic RubyLens renders comparing E2 with E6, Sa with Sc, and SBa with SBc.](docs/images/galaxy-morphology-variations.jpg)](docs/images/galaxy-morphology-variations.jpg)

*Representative endpoints inside the elliptical, spiral, and barred-spiral families.*

For the astronomy behind the names, see [NASA's guide to galaxy types](https://science.nasa.gov/universe/galaxies/types/) and Wikipedia's [Hubble sequence overview](https://en.wikipedia.org/wiki/Hubble_sequence).

## Generate a report

Add RubyLens to the bundle of the project you want to visualize, then run:

```sh
bundle exec rubylens report
```

When `TARGET` is omitted, RubyLens uses the current working directory. Pass a path after the command to visualize a different project. The default report is `rubylens-report.html` in the project root. It contains fully qualified class, module, and gem names for local hover details, but no source text, comments, or paths. Dependency stars remain anonymous and are summarized at the gem level. RubyLens adds that exact default path to Git's local exclude file and writes the report with owner-only permissions, so it stays out of commits without changing the project's `.gitignore`. The model reveals private codebase structure, so keep it local unless you intend to share it. Project and package morphology are derived from coarse code proportions; a shared report or Showcase can reveal bucketed project traits, and package-local geometry can make coarse package aggregate composition more visually legible even though it adds no source names.

Ruby API:

```ruby
result = RubyLens.generate_report(path: ".")
puts result.output_path
puts result.counts
puts result.warnings
```

Passing `output:` selects a custom path. Custom paths are written exactly where requested and are not added to Git's local excludes, so the caller is responsible for keeping them private.

The report is fully local: it makes no network requests and needs neither Node nor a server to open. Drag to orbit, zoom toward the cursor, Shift-drag or use Pan mode to traverse dense clouds, or use the arrow keys to move the view. Show or focus core code, tests, and gems independently; selecting a Ruby node or dependency system flies to a top-down relationship view that keeps both the target and Core visible. Drift continues through exploration unless you pause it with the toolbar control or Space. Reset returns to the default camera without changing that explicit drift choice. Double-clicking a gem cloud expands that one existing system for a sharper, more separated view without loading another model.

Explorer reports embed every model-eligible dependency declaration and require WebGL2 to plot the complete dependency scene. If WebGL2 is unavailable or its context is lost, the report stops interactive rendering, disables scene controls, and opens the standard warning instead of presenting a sampled scene. The masthead explains that WebGL2 is required; exact dependency totals and gem aggregates remain complete in the report.

RubyDex-indexed Ruby documents under `spec/` or `specs/` contribute non-interactive class-like stars for `describe` and `context` calls. `it` and `specify` calls contribute only to the aggregate Tests method count; RubyLens does not execute specs or infer nesting.

## Generate a Showcase

Showcase is a standalone artistic presentation: it opens directly, rotates once per minute, and contains no Explorer controls or interactions.

```sh
bundle exec rubylens showcase
```

The default output is `rubylens-showcase.html` in the project root. It is self-contained, offline, atomically written with mode `0600`, and locally excludes only that exact default path and its atomic temporary-file pattern. Explicit custom outputs remain unmanaged. RubyLens refuses to replace a tracked default or an unrelated existing file.

The default Minimal Showcase intentionally includes only the project name and numeric visual structure. It omits aggregate statistics and does not serialize declaration names, gem names, source text, comments, or paths. Pass `--details` to add the aggregate Ruby statistics and one-at-a-time cinematic labels for a deterministic, capped selection of Core/Test declarations and dependency systems. Individual dependency stars remain anonymous. Showcase embeds every model-eligible dependency declaration and renders every Core, Test, dependency, and hub point with WebGL2; it does not substitute a sampled Canvas scene. If WebGL2 is unavailable or loses its context, the artwork stops and says that WebGL2 is required. `prefers-reduced-motion` produces one stable frame instead of a continuous orbit and hides cinematic labels.

Ruby API:

```ruby
result = RubyLens.generate_showcase(path: ".", details: true)
puts result.output_path
```

Showcase generation and viewing need no Chrome, Chromium, Ferrum, FFmpeg, Node, or HTTP server; viewing requires a browser with WebGL2. Both disclosure levels reveal the project name and numeric visual structure, including the derived project and package morphology families; someone familiar with the family bands can infer coarse aggregate proportions. `details: true` additionally reveals selected code/dependency names and aggregate statistics, so review it before sharing.

The accepted deterministic morphology design and its self-contained visual prototype are preserved in [`docs/specs/2026-07-14-galaxy-morphology-design.md`](docs/specs/2026-07-14-galaxy-morphology-design.md).

## Development

RubyLens supports Ruby 3.2 through 4.0. Contributors can activate the repository's pinned development Ruby before every Ruby command:

```sh
source /opt/homebrew/share/chruby/chruby.sh
chruby ruby-4.0.5
bundle install
bundle exec rake test
gem build rubylens.gemspec
```
