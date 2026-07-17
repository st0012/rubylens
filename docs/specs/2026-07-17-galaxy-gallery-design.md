# Ruby Galaxies gallery design

Accepted 2026-07-17. A public gallery page for st0012.dev/ruby-galaxies that shows four
well-known Ruby codebases as live RubyLens galaxies and links each to its interactive
Explorer. The page exists to make people enjoy and appreciate codebases, not to analyze
them; it is also the first public face of RubyLens.

The accepted visual direction is preserved in
[`2026-07-17-galaxy-gallery-prototype.html`](2026-07-17-galaxy-gallery-prototype.html)
(the "Survey" variant chosen from three prototyped directions). The prototype uses a
static canvas stand-in for the galaxies; the real page embeds generated Showcase files.

## Deliverable

A new `gallery/` directory in this repository:

- `gallery/index.html` — the hand-authored gallery page. Self-contained inline CSS/JS,
  no external requests, matching the product's no-CDN stance.
- `gallery/build.rb` — generates all publishable artifacts into `gallery/dist/`.
- `gallery/dist/` — git-ignored. After a build it is the exact folder to upload:
  `index.html`, plus per project `<slug>.html` (Explorer report) and
  `<slug>-showcase.html` (Showcase with `--details`).

Projects and slugs, in page order: `rubocop`, `rails`, `discourse`, `rubygems-org`.
Deployment is out of scope for now.

## Page design (Survey direction)

Dark instrument aesthetic on the Showcase's own base color `#03040a`: monospace type,
dotted-grid background, corner-tick frames around each stage, amber (`#ffc36b`) and
cyan (`#74d8ff`) accents borrowed from the Showcase annotation palette.

1. **Top bar** — `ruby-galaxies · survey` / `st0012.dev`.
2. **Hero** — "Ruby Galaxies — 4 objects catalogued", a three-sentence introduction
   (stars are classes and modules, clouds are dependencies, built for appreciation
   rather than analysis), and a link to the RubyLens repository. The repository is
   private as of this writing, so the link 404s for visitors until it is made public.
3. **Four exhibits.** Each exhibit is:
   - A header row: index (`[01/04]`), project name, designation (the project's real
     morphology family, read from the generated artifact), and an
     `open explorer ↗` link.
   - A corner-ticked stage embedding `<slug>-showcase.html` in an iframe sized to most
     of the viewport height. Showcase is autonomous and non-interactive, so a
     transparent full-stage anchor overlays the iframe; clicking anywhere on the
     galaxy opens `<slug>.html` in the same tab. The visible header link is the
     explicit, accessible path to the same destination.
   - A readout row with facts the embedded Showcase does not already display: the
     project's role in one phrase, its dependency package count, and the generation
     date. The Showcase masthead inside the stage carries the class/module/method
     statistics, so the readout must not repeat them. (The counts shown in the
     prototype are placeholders.)
4. **Footer** — "made with RubyLens — turn your own codebase into a galaxy" plus links
   to the repository and st0012.dev.

## Embedding and loading behavior

- Baseline (no JS): plain `<iframe loading="lazy">`, so every exhibit works and
  off-screen showcases are deferred by the browser.
- Enhancement: an IntersectionObserver detaches the `src` of iframes far outside the
  viewport and reattaches them as they approach, keeping at most about two live WebGL
  scenes. A reattached Showcase restarts its rotation; accepted.
- `prefers-reduced-motion` (static frame) and missing WebGL2 (explicit warning) are
  already handled inside the Showcase artifact itself; the gallery adds nothing.

## Build script

`gallery/build.rb`, run from this repository with the pinned development Ruby:

- Expects local checkouts of the four projects; their paths are constants at the top
  of the script (default `~/projects/<name>`). It does not clone or run
  `bundle install` itself: for each target it verifies the checkout exists and its
  bundle is resolvable, and reports exactly what is missing otherwise.
- Invokes RubyLens the way that works for foreign projects on this machine: `ruby
  -Ilib exe/rubylens` without `bundle exec` (Bundler would hide the target's gems),
  augmenting `GEM_PATH` when the target's bundle was installed under a different Ruby.
- Writes explicit outputs into `gallery/dist/` (custom output paths are intentionally
  outside RubyLens's default-path management), then copies `gallery/index.html` in.
- A failure for one project reports and continues with the others; the script exits
  non-zero if any project failed.
- Prints each project's counts and morphology designation so the hand-maintained
  header and readout rows in `index.html` can be updated when artifacts are
  regenerated.

## Testing and verification

No new automated suites: the gallery is a leaf artifact, not library code. Verification
is running `build.rb` against the four real projects, opening `dist/index.html`, and
reviewing screenshots (including reduced-motion and no-JS states) before anything is
committed or published.

## Out of scope

Templated index generation, automated stat extraction into the page, hosting and
deployment automation, analytics of any kind, and any RubyLens library changes. The
gallery consumes existing `rubylens report` and `rubylens showcase --details` outputs
as they are.
