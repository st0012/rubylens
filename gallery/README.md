# Ruby Galaxies gallery

The public gallery page for st0012.dev/ruby-galaxies: four codebases (RuboCop,
Rails, Discourse, rubygems.org) rendered as live RubyLens Showcases, each
linking to its interactive Explorer.

## Rebuilding

From the repository root, with the pinned development Ruby active:

```sh
source /opt/homebrew/share/chruby/chruby.sh && chruby ruby-4.0.5
ruby gallery/build.rb
```

This regenerates every artifact into `gallery/dist/` (git-ignored) and copies
`index.html` plus the social preview in. `dist/` is the complete folder to
upload; files are written world-readable, so mode-preserving copies (`rsync`,
`scp`) serve correctly.

Prerequisites: local checkouts of the four projects at `~/projects/<name>`
(paths are constants at the top of `build.rb`), each with its bundle
installed. The script clones and installs nothing; it reports what is missing.

## What the build enforces

- **Clean checkouts.** A target with tracked changes, or untracked files that
  could enter the index (`.rb`, `.rake`, `.rbs`, `.ru`), fails the build so
  unofficial sources never reach published artifacts.
- **Complete artifacts.** Unexpected dependency warnings fail the project.
  Known unavoidable skips live in `EXPECTED_WARNINGS` (rubygems.org skips
  five licensed Avo gems plus `ransack`).
- **Fresh page facts.** The package counts and morphology designations in
  `index.html` are hand-written. If a regeneration changes them, the build
  fails and prints the rows to update; also bump the `generated` dates then.
- **Valid social preview.** The checked-in preview must be a 1200×630 8-bit
  RGB PNG. The build copies it into `dist/` only after validating that format.

## Social preview

`ruby-galaxies-social-preview.svg` is the editable source and
`ruby-galaxies-social-preview.png` is the publishable export. Both live beside
this README so the public card remains deterministic and reviewable.

On macOS, regenerate the PNG after editing the SVG:

```sh
sips -s format png gallery/ruby-galaxies-social-preview.svg \
  --out gallery/ruby-galaxies-social-preview.png
magick gallery/ruby-galaxies-social-preview.png \
  -background '#03040a' -alpha remove -alpha off -strip \
  PNG24:gallery/ruby-galaxies-social-preview-rgb.png
mv gallery/ruby-galaxies-social-preview-rgb.png \
  gallery/ruby-galaxies-social-preview.png
```

## Common changes

- **Refresh a project:** `git pull` in its checkout, `bundle install` if the
  lockfile moved, rerun the build.
- **Edit the page:** change `gallery/index.html`, rerun the build to refresh
  `dist/`.
- **Add a project:** add an entry to `PROJECTS` in `build.rb` and a
  `<section>` block in `index.html`; add `EXPECTED_WARNINGS` patterns only if
  the project has unavoidable skips.

RubyLens rendering improvements need no gallery changes: artifacts are
regenerated from the current code on every build.
