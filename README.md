# RubyLens

RubyLens turns a Ruby codebase into a private, interactive stellar artwork. It uses Rubydex for semantic signals such as ancestry, descendants, members, definition sites, and resolved constant references, then writes one self-contained offline HTML report.

This is an early local prototype. RubyLens 0.1 targets Ruby 4.0 and pins Rubydex 0.2.9 while its API is pre-1.0.

## Build a report

Add RubyLens to the bundle of the project you want to visualize, then run:

```sh
bundle exec rubylens build .
```

The default report is `.rubylens/report.html`. It contains declaration and gem names for local hover details, but no source text, comments, or paths. RubyLens creates `.rubylens/.gitignore` and writes the report with owner-only permissions. The model reveals private codebase structure, so keep it local unless you intend to share it.

Ruby API:

```ruby
result = RubyLens.generate(path: ".", output: ".rubylens/report.html")
puts result.output_path
puts result.counts
puts result.warnings
```

The report is fully local: it makes no network requests and needs neither Node nor a server to open. Drag to orbit, zoom toward the cursor, Shift-drag or use Pan mode to traverse dense clouds, show or focus core code, tests, and gems independently, and jump from RubyDex-powered standout facts to highlighted declarations in the galaxy.

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
