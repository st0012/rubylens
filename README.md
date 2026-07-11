# RubyLens

RubyLens turns a Ruby codebase into a private, interactive stellar artwork. It uses Rubydex internally to map Ruby code, then writes one self-contained offline HTML report.

This is an early local prototype. RubyLens 0.1 supports Ruby 3.2 through 4.0 and pins Rubydex 0.2.9 while its API is pre-1.0.

## Build a report

Add RubyLens to the bundle of the project you want to visualize, then run:

```sh
bundle exec rubylens build .
```

The default report is `rubylens-report.html` in the project root. It contains fully qualified class, module, and gem names for local hover details, but no source text, comments, or paths. Dependency stars remain anonymous and are summarized at the gem level. RubyLens adds that exact default path to Git's local exclude file and writes the report with owner-only permissions, so it stays out of commits without changing the project's `.gitignore`. The model reveals private codebase structure, so keep it local unless you intend to share it.

Ruby API:

```ruby
result = RubyLens.generate(path: ".")
puts result.output_path
puts result.counts
puts result.warnings
```

Passing `output:` selects a custom path. Custom paths are written exactly where requested and are not added to Git's local excludes, so the caller is responsible for keeping them private.

The report is fully local: it makes no network requests and needs neither Node nor a server to open. Drag to orbit, zoom toward the cursor, Shift-drag or use Pan mode to traverse dense clouds, or use the arrow keys to move the view. Show or focus core code, tests, and gems independently; sidebar highlights fly to a top-down view of the relevant star or system. Double-clicking a gem cloud pauses drift and expands that one existing system for a sharper, more separated view without loading another model.

## Render a cinematic GIF

RubyLens can index a target and render its locally generated model as a fixed, seamless galaxy loop:

[![Animated RubyLens preview of Rails; opens the full 20-second export. A dense pink Core galaxy, cyan Test halo, and amber dependency systems rotate beneath aggregate Ruby statistics.](docs/assets/rubylens-rails-galaxy-preview.gif)](docs/assets/rubylens-rails-galaxy-full.gif)

*[Rails](https://github.com/rails/rails) rendered locally by RubyLens. This phone-friendly 10-second preview opens the [full 20-second default export](docs/assets/rubylens-rails-galaxy-full.gif) (960×540, 12 fps, 19.3 MiB). Both GIFs contain no source text, file paths, declaration names, or gem names.*

```sh
bundle exec rubylens gif .
```

The default `rubylens-galaxy.gif` is 20 seconds, 12 frames per second, and 960×540. The camera completes one unbroken 360° orbit across those 20 seconds, using a close three-quarter view and a subtle breathing zoom. Capture mode hides the explorer, tooltips, declaration names, and gem names. It shows the project title, aggregate Core counts, Test class/method counts, the dependency-gem count, and the rotating stellar model.

The GIF contains no source text or paths, but it is not anonymous: its title, counts, and visual structure can identify or characterize a private codebase. Review the finished animation before sharing it.

For predictable export cost on large repositories, capture mode samples non-hub stars into a 50,000-point budget and keeps every gem hub. The displayed statistics still describe the complete indexed model.

Generation stays on the local machine and needs Chrome or Chromium plus `ffmpeg`; it needs neither Node nor an HTTP server. RubyLens uses an incognito headless browser, removes its owner-only temporary report and PNG frames after the run, then atomically publishes the final GIF with mode `0600`.

```sh
bundle exec rubylens gif . \
  --duration 20 \
  --fps 12 \
  --size 960x540
```

Use `--browser FILE` or `--ffmpeg FILE` when either executable is outside the normal lookup path. The default path is locally ignored. RubyLens refuses a tracked default path or an unrelated existing file; explicit custom outputs are not added to Git's local excludes.

Ruby API:

```ruby
result = RubyLens.generate_gif(path: ".", duration: 20, fps: 12, width: 960, height: 540)
puts result.output_path
```

The configurable multi-system design for repositories with many first-class applications or components is documented in [`docs/MONOREPO_BOUNDARIES.md`](docs/MONOREPO_BOUNDARIES.md). Reference-route experiments are paused and preserved in [`docs/REFERENCE_ROUTES_FUTURE.md`](docs/REFERENCE_ROUTES_FUTURE.md).

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
