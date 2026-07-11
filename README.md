# RubyLens

RubyLens turns a Ruby codebase into a private, interactive stellar artwork. It uses Rubydex internally to map Ruby code, then writes one self-contained offline HTML report.

This is an early local prototype. RubyLens 0.1 targets Ruby 4.0 and pins Rubydex 0.2.9 while its API is pre-1.0.

## Build a report

Add RubyLens to the bundle of the project you want to visualize, then run:

```sh
bundle exec rubylens build .
```

The default report is `rubylens-report.html` in the project root. It contains fully qualified class, module, and gem names plus resolved constant-reference relationships for local exploration, but no source text, comments, or paths. Dependency stars remain anonymous and are summarized at the gem level. RubyLens adds that exact default path to Git's local exclude file and writes the report with owner-only permissions, so it stays out of commits without changing the project's `.gitignore`. The model reveals private codebase structure, so keep it local unless you intend to share it.

Ruby API:

```ruby
result = RubyLens.generate(path: ".")
puts result.output_path
puts result.counts
puts result.warnings
```

Passing `output:` selects a custom path. Custom paths are written exactly where requested and are not added to Git's local excludes, so the caller is responsible for keeping them private.

The report is fully local: it makes no network requests and needs neither Node nor a server to open. Drag to orbit, zoom toward the cursor, Shift-drag or use Pan mode to traverse dense clouds, or use the arrow keys to move the view. Show or focus core code, tests, and gems independently; sidebar highlights fly to a top-down view of the relevant star or system. Selecting a class, module, or gem reveals its strongest incoming and outgoing resolved constant-reference routes, with accessible route buttons for travelling to each destination. The optional All routes mode pauses drift and draws the complete aggregated connection layer at once. These are static reference relationships, not runtime calls. Double-clicking a gem cloud expands that one existing system for a sharper, more separated view without loading another model.

## Development

Activate the pinned Ruby before every Ruby command:

```sh
source /opt/homebrew/share/chruby/chruby.sh
chruby ruby-4.0.5
bundle install
bundle exec rake test
gem build rubylens.gemspec
```

The TypeScript/Three.js visual study remains under `prototype/codebase-cosmos`. It is a design lab rather than a runtime dependency of the gem.
