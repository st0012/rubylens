# RubyLens

Your Ruby codebase, as a galaxy.

[![Five galaxy families rendered by RubyLens: elliptical, lenticular, spiral, barred spiral, irregular.](docs/images/galaxy-morphology-families.jpg)](docs/images/galaxy-morphology-families.jpg)

RubyLens reads a Ruby project and writes one self-contained HTML file: classes and modules as magenta stars, tests as a cyan halo, gems as orbiting gold clouds. The galaxy's shape is derived from the code: spiral, elliptical, barred, lenticular, or irregular.

```ruby
# Gemfile
gem "rubylens", require: false
```

```sh
bundle exec rubylens report
```

Open `rubylens-report.html` in your browser. No server needed.

Three levels of disclosure:

| For | Command | Reveals |
| --- | --- | --- |
| Yourself | `rubylens report` | Real class, module, and gem names, sparse reference topology, and full interaction |
| Your team or a talk | `rubylens clip --details` | Project name, shape, scale, sparse reference topology, stats, and selected names |
| Anyone | `rubylens clip` | Project name, galaxy shape and scale, and sparse anonymous reference topology |

> [!IMPORTANT]
> Nothing is uploaded and no source code is embedded. Outputs still describe your project: they name it, can name classes and gems, and reveal some relationship topology. See [Privacy and sharing](#privacy-and-sharing).

https://github.com/user-attachments/assets/43570623-6d98-46c9-9303-7faa4035b2a7

*The Explorer on Rails: search, fly to a class, expand a gem cloud.*

https://github.com/user-attachments/assets/bb266de5-bbd7-4ccd-814b-15961b45bd39

*A `--details` clip: what your team sees.*

## Setup notes

RubyLens runs from inside an existing Ruby project's bundle, and the project must be inside a Git repository.

`clip` needs Chrome (or Chromium) and ffmpeg; see [Using Clip](#using-clip). Swap in `rubylens showcase [--details]` for the self-playing HTML page alone.

RubyLens uses the current directory when you omit `TARGET`. To visualize a subdirectory while using the current project's bundle and root lockfile, run:

```sh
bundle exec rubylens report components/payments --lockfile Gemfile.lock
```

For complete gem clouds, generate from a project with a readable `Gemfile.lock` after `bundle install`. Without a lockfile, RubyLens still shows Core and Tests but omits Gems and reports a warning. It never fetches missing dependencies during generation.

## Privacy and sharing

RubyLens indexes and renders locally. Generated HTML files contain their scripts, styles, fonts, and data, make no network requests, and open without Node or an HTTP server. Clip rendering also stays local: it drives your own Chrome and ffmpeg over loopback and never uploads anything.

But the outputs still describe your project:

- Explorer embeds fully qualified class, module, and gem names. It omits source text, comments, paths, and names for individual dependency stars.
- Minimal Showcase omits code and gem names, but still reveals the project name, the galaxy's shape and scale, and a sparse anonymous sample of constant-reference topology.
- Details Showcase adds aggregate statistics and selected code/dependency names to the same topology.
- Clip shows on screen exactly what the recorded Showcase shows, in a format anyone can replay.

Galaxy shape is also information: a package's rendered shape can make the rough makeup of that gem easier to see, even though it reveals no source text. Relationship topology is information too: a travel line means that one rendered namespace contains a resolved reference to another rendered declaration.

Default outputs are written atomically with owner-only `0600` permissions. RubyLens also adds the exact default output and its temporary-file pattern to the repository's local `.git/info/exclude`, so it does not change the shared `.gitignore`.

RubyLens updates its own existing default output, but refuses to overwrite a tracked file or an unrelated file at that path.

Custom output paths are written exactly where requested, may replace an existing file there, and are not added to Git's local excludes. Choose the path carefully and review the HTML before sharing it.

## Using Explorer

Explorer lets you search and move through Core code, Tests, and Gems while the galaxy continues to drift.

While drift runs, RubyLens scales traffic with the rendered project population: very small reports show one flight at a time, and larger reports show at most two simultaneous flights. Individual launches follow one seeded stream with varied gaps, and a finished flight frees capacity for another after a short randomized breath. There are no synchronized bursts or two-second pauses. Routes to exact Gem declaration stars are preferred three times out of four while workspace-only routes stay eligible. Very short, off-screen, capacity-conflicting, or shared-endpoint routes are skipped. Each admitted 2.2-second flight keeps one broad arc with a long feathered wake whose thickest end overlaps one elongated same-hue drop. Camera changes, paused drift, and reduced motion clear the flights rather than making them jump or reappear.

- Drag to orbit.
- Scroll at the cursor to zoom.
- Shift-drag, use Pan mode, or use the arrow keys to move across the galaxy.
- Search for classes, modules, and gems from the side panel.
- Select a class, module, or dependency system to fly to a top-down comparison that keeps Core visible for scale.
- Double-click a gem cloud to expand its existing stars.
- Press Space or use the toolbar to pause/resume drift.
- Use Reset to restore the default camera without changing your drift choice.

Explorer requires WebGL2 to render the complete galaxy. If WebGL2 is missing or the browser loses the context, RubyLens shows a warning rather than quietly drawing a partial galaxy.

## Using Showcase

Showcase is self-playing and noninteractive. It opens directly, rotates once per minute, and contains no Explorer controls, search, hover, or navigation.

Use the default Minimal mode when the visual shape is enough:

```sh
bundle exec rubylens showcase
```

Use `--details` when you want aggregate statistics and one-at-a-time cinematic labels:

```sh
bundle exec rubylens showcase --details
```

Both Showcase modes include the same bounded, anonymous travel flights. Showcase also requires WebGL2. A browser with `prefers-reduced-motion` enabled receives one stable frame with no travel flights or cinematic labels.

## Using Clip

Clip records the Showcase into `rubylens-clip.mp4`: one full camera rotation at 1920×1080 and 30 frames per second, encoded as H.264 for compatibility with Slack, X, LinkedIn, and slide decks. The camera ends where it started, so the loop has no visible cut.

```sh
bundle exec rubylens clip
bundle exec rubylens clip --details
```

Clip needs two locally installed tools and checks for them before doing any work:

- **Chrome or Chromium** for headless WebGL2 rendering. Discovery checks `PATH` and common install locations; set `RUBYLENS_CHROME` to point at a specific binary.
- **ffmpeg** for H.264 encoding (`brew install ffmpeg` or `apt install ffmpeg`); set `RUBYLENS_FFMPEG` to override discovery.

Frames render deterministically off-screen, so nothing flashes across your display, and progress is reported as the 1,800 frames encode. Expect a few minutes on machines without GPU acceleration. The showcase HTML is always written next to the video, so a failed render still leaves you a shareable page.

## What the stars mean

- **Core** is magenta. Its stars represent classes and modules from the project's main Ruby code.
- **Tests** are cyan. They represent test classes and modules. RubyLens also adds class-like stars for RSpec `describe` and `context` calls under `spec/` or `specs/`.
- **Gems** are warm gold. Each gem forms a cloud of anonymous stars. Related gems from the same materialized Git source can appear together as one dependency system.

RubyLens uses Rubydex to find classes, modules, methods, constants, inheritance, reopenings, and references. Shuttle flights draw from resolved references whose occurrences belong to Core or Test namespaces; their targets may be another workspace namespace or an exact anonymous Gem declaration star. Core-to-Core, Core-to-Test, Test-to-Core, Test-to-Test, and workspace-to-Gem flights are included; top-level, ambiguous, exact-self, and non-workspace origins are omitted. Flights travel from the referenced declaration to the referrer and show a bounded visual sample, not call edges or a complete relationship graph. RubyLens never executes the project or its tests.

RubyLens analyzes tracked `.rb`, `.rake`, `.rbs`, and `.ru` files inside the target, plus untracked files of those types that Git does not ignore. It reads dependency versions from `Gemfile.lock` and analyzes gem code already installed locally.

RubyLens is not a type checker, whole-program call graph, source browser, route explorer, or per-dependency-star inspector.

## Galaxy morphology

RubyLens uses the [Hubble sequence](https://science.nasa.gov/asset/hubble/the-hubble-tuning-fork-classification-of-galaxies/) as a visual vocabulary. It uses broad code counts to choose a repeatable shape for the central Core/Test galaxy and each dependency package independently. A package never inherits the project's, host's, or dependency system's decision.

Very large dependency packages that would otherwise render as smooth elliptical or lenticular clouds use a deterministic Spiral or Barred Spiral enrichment. This keeps their visual mass structured while smaller packages retain their aggregate-derived family.

The morphology describes the rendered shape. It is not a claim about the project's architecture, purpose, quality, or correctness.

[![Paired synthetic RubyLens renders comparing E2 with E6, Sa with Sc, and SBa with SBc.](docs/images/galaxy-morphology-variations.jpg)](docs/images/galaxy-morphology-variations.jpg)

*Representative endpoints inside the elliptical, spiral, and barred-spiral families.*

Read the [accepted morphology design](docs/specs/2026-07-14-galaxy-morphology-design.md) or [stellar design research](docs/STELLAR_DESIGN_RESEARCH.md) for the full visual model.

## CLI reference

```text
rubylens report [OPTIONS] [TARGET]
rubylens clip [OPTIONS] [TARGET]
rubylens showcase [OPTIONS] [TARGET]
```

All commands accept:

- `-o FILE` / `--output FILE` to choose an output path
- `--lockfile FILE` to use a specific `Gemfile.lock`
- `-h` / `--help` to show command help

`rubylens clip` and `rubylens showcase` also accept `--details`. A custom `rubylens clip --output movie.mp4` writes the recorded showcase to `movie.html` next to it.

## Ruby API

```ruby
require "rubylens"

report = RubyLens.generate_report(path: ".")
puts report.output_path
puts report.counts
puts report.warnings

showcase = RubyLens.generate_showcase(path: ".", details: true)
puts showcase.output_path

clip = RubyLens.generate_clip(path: ".", progress: ->(done, total) { puts "#{done}/#{total}" })
puts clip.output_path    # the MP4
puts clip.showcase_path  # the showcase HTML it recorded
```

Passing `output:` selects a custom path. The caller is responsible for keeping custom outputs private.

## Development

RubyLens supports Ruby 3.2 through 4.0. The repository's `.ruby-version` and `.node-version` select the development runtimes. Activate Ruby with your version manager, then install the Ruby and JavaScript dependencies:

```sh
bundle install
npm ci
```

Run the Ruby and JavaScript unit tests:

```sh
bundle exec rake test
npm run test:unit
```

Run the browser tests:

```sh
npx playwright install chromium
npm run test:browser
```

Build the gem:

```sh
gem build rubylens.gemspec
```

The product and design contracts live in [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md). Scale and benchmark notes live in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## License

RubyLens is available under the [MIT License](LICENSE.txt).
