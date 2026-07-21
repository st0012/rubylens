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
| Yourself | `rubylens report` | Real class, module, and gem names, fully interactive |
| Your team or a talk | `rubylens clip --details` | A 60-second looping MP4 with stats and cinematic labels |
| Anyone | `rubylens clip` | Project name and the galaxy's shape and scale |

> [!IMPORTANT]
> Nothing is uploaded and no source code is embedded. Outputs still name your project and can name classes and gems. See [Privacy and sharing](#privacy-and-sharing).

https://github.com/user-attachments/assets/43570623-6d98-46c9-9303-7faa4035b2a7

*The Explorer on Rails: search, fly to a class, expand a gem cloud.*

https://github.com/user-attachments/assets/bb266de5-bbd7-4ccd-814b-15961b45bd39

*A `--details` clip: what your team sees.*

## Setup notes

RubyLens runs from a project's own bundle, inside a Git repository. Complete gem clouds need a readable `Gemfile.lock` and installed gems; without them you still get Core and Tests, plus a warning. `TARGET` defaults to the current directory; pass a subdirectory and `--lockfile Gemfile.lock` to zoom into part of a monorepo.

## Privacy and sharing

Everything runs locally: indexing, rendering, and clip encoding (your own Chrome and ffmpeg, over loopback). Outputs are self-contained files that make no network requests.

What each output reveals:

- **Explorer**: fully qualified class, module, and gem names. Never source text, comments, or file paths.
- **Showcase and clip**: the project name and the galaxy's shape and scale; `--details` adds aggregate statistics and selected names.

Shape is information too: a gem cloud's form hints at its rough makeup. Default outputs are written `0600` and added to the repository's local `.git/info/exclude`; RubyLens replaces its own previous output but refuses tracked or unrelated files. Custom `--output` paths are written exactly where you point them, with none of these protections.

## Using Explorer

Drag to orbit, scroll to zoom, search from the panel, double-click a gem cloud to expand it. Press `?` in the app for every shortcut. WebGL2 is required; without it RubyLens shows a warning rather than a partial galaxy.

## Using Showcase

`rubylens showcase [--details]` writes the self-playing page the clip records: it rotates once per minute, forever, with no controls. Embed it or loop it on a screen. With `prefers-reduced-motion` it presents one stable frame.

## Using Clip

`rubylens clip [--details]` records one full rotation into `rubylens-clip.mp4` (1080p30 H.264; the loop has no visible cut). It needs Chrome or Chromium and ffmpeg, checks for both before any work, and honors `RUBYLENS_CHROME` and `RUBYLENS_FFMPEG` overrides. Rendering is off-screen with progress reported; expect a few minutes without GPU acceleration. The showcase HTML always lands next to the video.

## What the stars mean

- **Magenta**: the project's classes and modules.
- **Cyan**: test classes and modules, including RSpec `describe`/`context` groups.
- **Gold**: gem clouds of anonymous stars; gems from one Git source can share a dependency system.

Rubydex supplies the declarations and references; RubyLens never executes your code, and references are not a call graph. It reads tracked and unignored `.rb`, `.rake`, `.rbs`, and `.ru` files, plus locally installed gem code.

## Galaxy morphology

Broad code counts pick each galaxy's shape from the [Hubble sequence](https://science.nasa.gov/asset/hubble/the-hubble-tuning-fork-classification-of-galaxies/), independently for the core and every gem. The shape describes the rendering, not the architecture or its quality.

[![Paired synthetic RubyLens renders comparing E2 with E6, Sa with Sc, and SBa with SBc.](docs/images/galaxy-morphology-variations.jpg)](docs/images/galaxy-morphology-variations.jpg)

*Representative endpoints inside the elliptical, spiral, and barred-spiral families.*

Full visual model: [morphology design](docs/specs/2026-07-14-galaxy-morphology-design.md) and [stellar design research](docs/STELLAR_DESIGN_RESEARCH.md).

## CLI reference

```text
rubylens report|clip|showcase [OPTIONS] [TARGET]
```

All commands take `-o`/`--output FILE` and `--lockfile FILE`; `clip` and `showcase` also take `--details`. `rubylens clip --output movie.mp4` writes the recorded showcase to `movie.html` beside it.

## Ruby API

```ruby
require "rubylens"

report = RubyLens.generate_report(path: ".")
clip = RubyLens.generate_clip(path: ".", details: true)
clip.output_path    # the MP4
clip.showcase_path  # the showcase it recorded
```

Results carry `output_path`, `counts`, and `warnings`. Custom `output:` paths are the caller's to keep private.

## Development

Ruby 3.2 through 4.0; `.ruby-version` and `.node-version` pin the development runtimes.

```sh
bundle install && npm ci
bundle exec rake test   # Ruby tests
npm test                # JS unit + browser tests (npx playwright install chromium once)
```

Contracts live in [PRODUCT.md](PRODUCT.md) and [DESIGN.md](DESIGN.md); scale notes in [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

## License

RubyLens is available under the [MIT License](LICENSE.txt).
