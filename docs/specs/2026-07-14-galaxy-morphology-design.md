# Galaxy morphology design

2026-07-14

## Problem

Every RubyLens scene uses one hardcoded morphology: 24% bulge, exponential disc,
three fixed arms at 38% in-arm probability (`corePosition`/`testPosition` in
`assets/runtime/report.js`). The only per-project variation is scale
(`layoutMetricsForCoreCount`). Two different projects side by side look like the
same galaxy at different sizes.

## Goal

Derive a per-project galaxy morphology from data RubyLens already extracts, so
different projects produce visibly different galaxy types, modeled on the Hubble
classification (elliptical, lenticular, spiral, barred spiral, irregular).

Decisions made during brainstorming:

- **Statistical fingerprint, not a semantic claim.** Morphology is a
  deterministic function of aggregate code statistics. RubyLens does not claim
  the shape "means" anything about code quality or architecture.
- **Discrete families with within-family variation.** Five unmistakably
  different silhouettes; knobs vary the details inside each family.
- **Stable under normal churn.** Classification reads coarse, slow-moving
  ratios. A week of commits keeps the same family; crossing a band edge moves a
  project to the adjacent family on the tuning fork, never a random one.
- **Applies to Explorer reports and both Showcase modes**, which share the same
  layout runtime.

## Non-goals

- Interacting/peculiar galaxies for multi-component monorepos, dwarf-specific
  treatments, ring galaxies (future extension once recipes are parameterized).
- Displaying the designation (for example "SBb") in any UI. The value is stored
  in the art model but has no visual consumer yet.
- Any change to dependency-halo layout semantics, colors, interactions, camera
  controls, drift, bloom, or the WebGL2 rendering path.
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

Computed in Ruby from the snapshot. All are cheap aggregates:

- `N` — core (non-test) namespace count; `T` — test namespace count
- `D` — indexed dependency declaration count; `P` — package count
- `moduleFraction` — modules among core namespaces / max(N, 1)
- `testShare` — T / max(N + T, 1)
- `depShare` — D / max(D + N, 1)
- `rootConcentration` — Herfindahl index over top-level roots of core
  namespace names: Σ (rootCount / N)² across distinct first segments
- `size` — N + T

### Mechanics

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

Initial constants (weights, band edges, knob tables) are implementation
guidance, not normative: calibrate against a corpus of real projects (for
example rubylens, a Rails app, a small single-file gem, a test-less script
repo, a large monorepo) so that every family is reachable and typical gems and
apps do not all collapse into one band. The mechanism — smooth ratios, wide
bands, adjacent-family drift — is normative.

Determinism: identical snapshot → identical morphology → identical scene.
Missing or malformed inputs (zero namespaces, absent fields) fall back to the
current default morphology (today's three-arm spiral) instead of failing
generation.

## Schema and data flow

### Art model (`rubylens.art.v9`)

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
`phaseSeed` a uint32. Unused knobs for a family are 0.

### Showcase model (`rubylens.showcase.v3`)

`ShowcaseModel#call` projects morphology as a single integer row through the
existing `numeric_row` validation:

```ruby
"morphology" => [family, *knobs]   # length 10, integers only
```

Both minimal and details Showcases include it — it is numeric visual
structure. The designation string is not shipped in the showcase payload.

### Runtime (`assets/runtime/report.js`)

The runtime reads the morphology block; when absent it uses defaults equal to
today's layout, so the runtime remains correct for any model it is embedded
with.

## Rendering recipes

The three position functions become recipe dispatchers on `family`, still O(1)
pure functions of `(seed, knobs)` per point — no per-frame cost, no change to
the WebGL2 100k-scale path.

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
- **`dependencyAnchor`** — unchanged recipe (satellite systems read well around
  every family); only its inner radius follows the family's outer extent.
- **`layoutMetricsForCoreCount`** — gains a family-aware scene radius;
  `testOuterRadius`, `dependencyInnerRadius`, and camera fitting derive from
  the actual silhouette extent (an E7 spheroid is more compact than an Sc
  disc).

Unchanged: category colors, signal-weighted brightness and sizes, Explorer
interactions (toggles, focus fly-to, pan, drift), Showcase rotation and
annotation anchoring, `prefers-reduced-motion` behavior.

This stays within the existing stellar-design rule that a single morphology
governs the scene (`docs/STELLAR_DESIGN_RESEARCH.md`): the family varies per
project, not per group within a scene.

## Prototype findings (2026-07-14)

A canvas prototype mimicking the report renderer (additive compositing, glow
halo + white-hot cores, camera distance 270 / focal length 440) rendered one
synthetic project through every family recipe side by side. The prototype is
preserved next to this spec as
[`2026-07-14-galaxy-morphology-prototype.html`](2026-07-14-galaxy-morphology-prototype.html)
— a self-contained page; open it directly in a browser. Outcomes folded into
this spec:

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

The galaxy class is derived from coarse code proportions, so a viewer who
knows the bands can infer bucketed ratios (roughly "test-light" or
"module-heavy" granularity) from a minimal Showcase's shape. This is
consistent with the documented "numeric visual structure" disclosure but is a
new derived signal; the README privacy paragraphs gain a sentence saying so.

## Edge cases

- **Zero tests:** E/S0 render naturally; spiral families borrow core disc
  points for arms.
- **Zero dependencies:** no halo, as today.
- **Tiny projects:** caught by the Irr floor.
- **Band-edge projects:** may alternate between adjacent families across
  regenerations if the codebase hovers on an edge; acceptable because the
  neighboring silhouettes are the most similar pair.
- **Huge projects:** recipes are per-point O(1); the existing sampling and
  WebGL2 tiers are unaffected.

## Testing

- Unit tests for `MorphologyClassifier`: fixture snapshots → expected family,
  designation, and knobs; band-edge values; stability under small
  perturbations (±1 namespace does not change family away from an edge);
  fallback on malformed input.
- Schema tests: art v9 morphology block shape; showcase v3 integer row length
  and validation.
- End-to-end: report and showcase generation include the morphology block and
  parse.
- The pinned report SHA is recomputed last, after all runtime edits, with
  `LC_ALL=en_US.UTF-8` (established project procedure).
- Acceptance check: generate reports for a corpus of real projects spanning
  the bands and compare screenshots side by side — visible family differences
  are the point of the feature.
