# RubyLens

RubyLens turns a Ruby codebase into self-contained stellar HTML. It uses Rubydex internally to map Ruby code, then generates either a private interactive report or a privacy-reduced autonomous Showcase.

This is an early local prototype. RubyLens 0.1 supports Ruby 3.2 through 4.0 and pins Rubydex 0.2.9 while its API is pre-1.0.

## Generate a report

Add RubyLens to the bundle of the project you want to visualize, then run:

```sh
bundle exec rubylens report .
```

The default report is `rubylens-report.html` in the project root. It contains fully qualified class, module, and gem names for local hover details, but no source text, comments, or paths. Dependency stars remain anonymous and are summarized at the gem level. RubyLens adds that exact default path to Git's local exclude file and writes the report with owner-only permissions, so it stays out of commits without changing the project's `.gitignore`. The model reveals private codebase structure, so keep it local unless you intend to share it.

Ruby API:

```ruby
result = RubyLens.generate_report(path: ".")
puts result.output_path
puts result.counts
puts result.warnings
```

Passing `output:` selects a custom path. Custom paths are written exactly where requested and are not added to Git's local excludes, so the caller is responsible for keeping them private.

`RubyLens.generate` remains a thin alias for `RubyLens.generate_report`.

The report is fully local: it makes no network requests and needs neither Node nor a server to open. Drag to orbit, zoom toward the cursor, Shift-drag or use Pan mode to traverse dense clouds, or use the arrow keys to move the view. Show or focus core code, tests, and gems independently; sidebar highlights fly to a top-down view of the relevant star or system. Double-clicking a gem cloud pauses drift and expands that one existing system for a sharper, more separated view without loading another model.

## Generate a Showcase

Showcase is a standalone artistic presentation: it opens directly, rotates once per minute, and contains no Explorer controls or interactions.

```sh
bundle exec rubylens showcase .
```

The default output is `rubylens-showcase.html` in the project root. It is self-contained, offline, atomically written with mode `0600`, and locally excludes only that exact default path and its atomic temporary-file pattern. Explicit custom outputs remain unmanaged. RubyLens refuses to replace a tracked default or an unrelated existing file.

The Showcase payload intentionally includes the project name, aggregate Ruby statistics, and numeric visual structure. It does not serialize declaration names, gem names, source text, comments, or paths. Configured multi-system scenes serialize at most 50,000 namespace rows, plus bounded dependency detail, and retain an anonymous hub and deterministic representatives from every nonempty system before allocating detail. Unconfigured scenes preserve the existing 50,000-point gem-hub sampler. `prefers-reduced-motion` produces one stable frame instead of a continuous orbit.

Ruby API:

```ruby
result = RubyLens.generate_showcase(path: ".")
puts result.output_path
```

Showcase generation and viewing need no Chrome, Chromium, Ferrum, FFmpeg, Node, or HTTP server. The HTML discloses enough aggregate structure to characterize a codebase, so review it before sharing.

Repositories with many first-class applications or components can add a strict versioned `.rubylens.yml`, or pass `--config FILE`, to make them named, navigable regions inside the same continuous Core galaxy. Boundaries never change host diameter and region proximity is artistic, not a dependency claim. Use `--no-config` for one anonymous region. The matching, ownership, privacy, scale, and bounded-rendering contract is documented in [`docs/MONOREPO_BOUNDARIES.md`](docs/MONOREPO_BOUNDARIES.md). Reference-route experiments are paused and preserved in [`docs/REFERENCE_ROUTES_FUTURE.md`](docs/REFERENCE_ROUTES_FUTURE.md).

## Development

RubyLens supports Ruby 3.2 through 4.0. Contributors can activate the repository's pinned development Ruby before every Ruby command:

```sh
source /opt/homebrew/share/chruby/chruby.sh
chruby ruby-4.0.5
bundle install
bundle exec rake test
gem build rubylens.gemspec
```

The TypeScript/Three.js visual study remains under `prototype/codebase-cosmos`. It is a design lab rather than a runtime dependency of the gem.
