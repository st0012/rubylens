# Galaxy morphology design

2026-07-14

## Problem

Every RubyLens scene uses one hardcoded morphology: 24% bulge, exponential disc,
three fixed arms at 38% in-arm probability (`corePosition`/`testPosition` in
`assets/runtime/report.js`). The only per-project variation is scale
(`layoutMetricsForCoreCount`). Two different projects side by side look like the
same galaxy at different sizes.

## Goal

Derive project and package-local galaxy morphologies from data RubyLens already
extracts, so different projects and dependency clouds produce visibly different
galaxy types, modeled on the Hubble classification (elliptical, lenticular,
spiral, barred spiral, irregular).

Decisions made during brainstorming:

- **Statistical fingerprint, not a semantic claim.** Morphology is a
  deterministic function of aggregate code statistics. RubyLens does not claim
  the shape "means" anything about code quality or architecture.
- **Discrete families with within-family variation.** Five unmistakably
  different silhouettes; knobs vary the details inside each family.
- **Stable under normal churn.** Standard classification reads coarse,
  slow-moving ratios. A week of commits keeps the same family; crossing a band
  edge moves a project to the adjacent family on the tuning fork. Very large
  smooth dependency packages use a separate deterministic visual enrichment,
  described below.
- **Applies to Explorer reports and both Showcase modes**, which share the same
  layout runtime.
- **Shared classifier, independent decisions.** The project morphology governs
  Core/Test. Each dependency package is classified from its own numeric
  aggregates and deterministic seed; it never inherits a project, host, or
  dependency-system family.

## Non-goals

- Interacting/peculiar galaxies for multi-component monorepos, dwarf-specific
  treatments, ring galaxies (future extension once recipes are parameterized).
- Displaying the designation (for example "SBb") in any UI. The value is stored
  in the art model but has no visual consumer yet.
- Any change to dependency package/system anchors, grouping, colors,
  interactions, camera controls, drift, bloom, or the WebGL2 rendering path.
  Package-local declaration offsets may vary around their existing anchors;
  Spiral arms alone may taper beyond the nominal cloud radius.
- New Rubydex indexing. All inputs already exist in the snapshot.

## Taxonomy

| Family | Code | Silhouette | Within-family knobs |
| --- | --- | --- | --- |
| Elliptical | E0–E7 | Smooth triaxial spheroid, no disc, no arms | ellipticity 0–0.7 (digit = round(e × 10)) |
| Lenticular | S0 | Large bulge plus smooth featureless disc | bulge share, disc extent |
| Spiral | Sa–Sc | Bulge, disc, 2–6 arms | arm count, winding tightness (a tight → c loose), in-arm fraction, bulge share (shrinks a → c) |
| Barred spiral | SBa–SBc | Central bar; arms unwind from bar ends | bar length plus all spiral knobs (arm count capped at 2–4) |
| Irregular | Irr | 2–5 offset clumps, no symmetry | clump count, clump spread, anisotropy |

## Classification

### Inputs

Computed in Ruby from the snapshot. All are cheap aggregates.

#### Project inputs

- `N` — core (non-test) namespace count; `T` — test namespace count
- `D` — indexed dependency declaration count; `P` — package count
- `moduleFraction` — modules among core namespaces / max(N, 1)
- `testShare` — T / max(N + T, 1)
- `depShare` — D / max(D + N, 1)
- `rootConcentration` — Herfindahl index over top-level roots of core
  namespace names: Σ (rootCount / N)² across distinct first segments
- `size` — N + T

#### Package inputs

Each package uses only `declaration_count`, the existing
`ruby_counts = [classes, modules, methods, constants]`, and its deterministic
uint32 package seed. Names, roles, locations, source paths, and dependency-system
membership do not affect the family decision.

### Project mechanics

1. **Irregular floor:** `size < 30` → Irr. (Arm structure cannot render at a
   few dozen points, so this is also a practical guard.)
2. **Structure axis:** `u = 0.45·testShare + 0.30·moduleFraction +
   0.25·depShare`, banded along the tuning fork:
   - `u < 0.18` → E
   - `0.18 ≤ u < 0.30` → S0
   - `u ≥ 0.30` → spiral (S or SB)
3. **Bar split:** `rootConcentration ≥ 0.5` → SB, else S.
4. **Sub-designation:** the spiral band splits into thirds by `u` → a/b/c.
   Ellipticals take `e = clamp(0.9·moduleFraction, 0, 0.7)`.
5. **Knobs:** shape knobs (arm count, bulge share, winding, bar length,
   ellipticity, clump count/spread) derive from the banded ratios above, so
   they drift as slowly as the family does. Orientation-only knobs
   (`phaseSeed`: arm phase, warp orientation) hash the project name; they
   change nothing about the perceived type.

### Package mechanics

Packages feed the same family bands and knob recipes through independently
derived inputs:

- `size = declaration_count`
- `moduleFraction = modules / max(classes + modules, 1)`
- `moduleStructure = (modules + 0.5) / (classes + modules + 1.0)`
- `nonMethodShare = (classes + modules + constants) / max(total constructs, 1)`
- `constantShare = constants / max(total constructs, 1)`
- `u = 0.45·nonMethodShare + 0.30·moduleStructure + 0.25·constantShare`
- `concentration = Σ ((count + 0.5) / (total constructs + 2.0))²`
- `irregularity = (moduleStructure + nonMethodShare) / 2`, which controls
  the spread of small Irr clumps

For standard classification, the package's existing seed controls orientation
only. Packages with no recognized constructs use the current seeded default
morphology. Smooth packages with at least 10,000 declarations are the artistic
exception: an E or S0 result is deterministically enriched to S or SB, with the
seed selecting the family and within-family knobs. This prevents the largest
dependency populations from reading as featureless blobs while leaving every
smaller or already-structured package on the aggregate-derived decision path.

At runtime, packages with fewer than `DEPENDENCY_CLOUD_THRESHOLD` (`18`)
declarations use a compact bounded cloud regardless of the classified family,
because their population is too small to render a legible silhouette.

Initial constants (weights, band edges, knob tables) are implementation
guidance, not normative: calibrate against a corpus of real projects (for
example rubylens, a Rails app, a small single-file gem, a test-less script
repo, a large monorepo) so that every family is reachable and typical gems and
apps do not all collapse into one band. The mechanism — smooth ratios, wide
bands, adjacent-family drift — is normative.

Determinism: identical snapshot → identical project and aligned package
morphologies → identical scene. Missing or malformed project inputs fall back
to the current default morphology; malformed package inputs use that same
default with a valid package seed when available instead of failing generation.

## Schema and data flow

### Art model (introduced in `rubylens.art.v12`; current schema `rubylens.art.v13`)

A new `MorphologyClassifier` (new file `lib/rubylens/morphology_classifier.rb`,
invoked from `ArtModelBuilder#build`) emits:

```ruby
"morphology" => {
  "family" => 3,            # 0=E 1=S0 2=S 3=SB 4=Irr
  "designation" => "SBb",   # display-only; pattern /\A(E[0-7]|S0|S[abc]|SB[abc]|Irr)\z/
  "knobs" => [ellipticity, bulgeShare, armCount, winding, armFraction,
              barLength, clumpCount, clumpSpread, phaseSeed],
}
```

All knob values are integers: ratio-like knobs scaled × 1000, counts raw,
`phaseSeed` a uint32. Unused knobs for a family are 0. The art model also emits
one numeric row aligned with each `packages` row:

```ruby
"packageMorphologies" => [
  [family, ellipticity, bulgeShare, armCount, winding, armFraction,
   barLength, clumpCount, clumpSpread, phaseSeed],
]
```

Every row has exactly ten integers. The package name is not part of the row or
the classification input.

### Showcase model (introduced in `rubylens.showcase.v6`; current schema `rubylens.showcase.v7`)

`ShowcaseModel#call` projects the project morphology and aligned package rows
through the existing `numeric_row` validation:

```ruby
"morphology" => [family, *knobs]   # length 10, integers only
"packageMorphologies" => [[family, *knobs], ...]
```

Both minimal and details Showcases include them — they are numeric visual
structure. Designation strings are not shipped in the showcase payload.

### Runtime (`assets/runtime/report.js`)

The runtime reads the project block and each package row once at load time.
Missing or malformed rows use the seeded default, so the runtime remains safe
for an older or malformed embedded model.

## Rendering recipes

The project and package position functions dispatch on `family`, still O(1)
pure functions of `(seed, knobs)` per point — no per-frame cost and no change
to the complete-row WebGL2 path.

- **`corePosition`** — `bulgeShare` knob replaces the hardcoded `.24`.
  - E: single triaxial spheroid; vertical scale multiplied by
    `(1 − ellipticity)`; Sérsic-like radial falloff; no disc population.
  - S0/S/SB: bulge plus exponential disc as today; SB additionally elongates a
    fraction of inner-disc points along the bar axis (length from `barLength`).
  - Irr: points distributed among `clumpCount` Gaussian clumps whose centers
    are seeded offsets within `clumpSpread`.
- **`testPosition`**
  - E: outer spheroid shell (larger radius, same flattening).
  - S0: smooth disc annulus, no arm term.
  - S/SB: today's arm math parameterized by `armCount` (2–6 for S, 2–4 for
    SB), `winding`, `armFraction`; for SB, arm theta origins sit at the bar
    ends. Angular scatter around an arm narrows as arm count grows (about
    0.22 rad at 2–4 arms down to about 0.12 rad at 6) so arms stay readable
    without becoming rails. About half of non-bulge core disc points join the
    arms — the visual prototype showed arms are nearly invisible when drawn
    from test stars alone. Accepted consequence: hiding Tests in the Explorer
    dims the arms but no longer removes arm structure entirely.
  - Irr: same clumps, wider spread.
- **`dependencyAnchor`** — keeps the existing seeded halo placement around
  every family and its inner radius follows the family's outer extent. After
  system and package layout, every cloud center expands uniformly from Core by
  1.15 so pairwise spacing grows without changing any cloud's nominal radius.
- **`dependencyCloudOffset`** — dispatches on the package's independently
  classified family inside its existing package anchor and nominal radius.
  Spiral arms use a deterministic tapered tail that can extend beyond that
  radius; compact, elliptical, lenticular, barred-spiral, and irregular recipes
  remain bounded. Packages below the 18-declaration compact threshold use a
  readable spheroidal fallback instead of trying to draw arms or clumps.
- **`layoutMetricsForCoreCount`** — gains a family-aware scene radius;
  `testOuterRadius`, `dependencyInnerRadius`, and camera fitting derive from
  the actual silhouette extent (an E7 spheroid is more compact than an Sc
  disc).

The accepted morphology change left package/system anchors and grouping,
category colors, Explorer interactions, Showcase rotation and annotation
anchoring, and `prefers-reduced-motion` behavior unchanged. A 2026-07-22
follow-up added rigid package-local rotation without changing those anchors or
morphology recipes. Its dynamical-timescale derivation, shared GPU transform,
motion controls, and exact Showcase/Clip loop are specified in
[Explorer and Showcase rendering](../EXPLORER_SHOWCASE_RENDERING.md).

One project morphology still governs the Core/Test body. Dependency packages
reuse the same visual grammar and classifier implementation, but each family
decision is independent; systems and hosts do not impose a shared morphology.

## Prototype findings (2026-07-14)

A canvas prototype mimicking the report renderer (additive compositing, glow
halo + white-hot cores, camera distance 270 / focal length 440) rendered one
synthetic project through every family recipe side by side. The prototype is
preserved next to this spec as
[`2026-07-14-galaxy-morphology-prototype.html`](2026-07-14-galaxy-morphology-prototype.html)
— a self-contained page; open it directly in a browser. Outcomes folded into
this spec. These findings cover the project/Core-Test body; they are historical
evidence, not a claim about package-family distributions:

- All five families read as distinct silhouettes at report scale; within-family
  knobs (ellipticity E2 vs E6, winding Sa vs Sc, bar length SBa vs SBc)
  produce visible same-family variation.
- Arms drawn only from test stars are nearly invisible; about half of core
  disc points must join the arms (now normative, see rendering recipes).
- Arm counts up to 6 read as a many-armed pinwheel; at 8 the arms blur into a
  grainy disc, and tightening scatter enough to fix that turns arms into
  artificial rails. Hence the 2–6 (S) and 2–4 (SB) ranges.
- E vs S0 differ mainly in tilted views (thickness vs thin disc); top-down
  they look alike. Accepted: the report default camera is tilted and the
  Showcase rotates through angles.

## Privacy

The project and package galaxy classes are derived from coarse code
proportions, so a viewer who knows the bands can infer bucketed traits from a
minimal Showcase's shapes. Package-local geometry can make coarse aggregate
composition more visually legible even though the payload adds no source
names, paths, or declaration identities. This remains numeric visual structure
and must be treated as sensitive when sharing an artifact.

## Edge cases

- **Zero tests:** E/S0 render naturally; spiral families borrow core disc
  points for arms.
- **Zero dependencies:** no halo, as today.
- **Tiny projects:** caught by the Irr floor. Dependency packages below 18
  declarations use the compact runtime form.
- **Huge smooth packages:** E/S0 results at 10,000 declarations or more receive
  the seeded S/SB visual enrichment; naturally structured S/SB decisions and
  seeded fallbacks are preserved.
- **Band-edge projects:** may alternate between adjacent families across
  regenerations if the codebase hovers on an edge; acceptable because the
  neighboring silhouettes are the most similar pair.
- **Huge projects:** every eligible row remains present. Layout is O(1) per
  point with no morphology work added per frame; WebGL2 either renders the
  complete scene or presents the explicit unsupported state.

## Testing

- Unit tests for `MorphologyClassifier`: project snapshots and package
  aggregates → expected family, designation, and knobs; band-edge values;
  stability under small perturbations; ordinary orientation seeds; the large
  smooth-package enrichment threshold and deterministic seed split; fallback on
  malformed input.
- Schema tests: current art v13 project block and package-row alignment; showcase v7
  integer row length, alignment, and validation.
- End-to-end: report and showcase generation include the morphology block and
  parse.
- The pinned report SHA is recomputed last, after all runtime edits, with
  `LC_ALL=en_US.UTF-8` (established project procedure).
- Acceptance check: generate reports for a corpus of real projects spanning
  the bands and compare screenshots side by side — visible family differences
  are the point of the feature.
