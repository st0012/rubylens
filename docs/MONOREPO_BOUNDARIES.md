# Scale-adaptive Core and monorepo boundaries

RubyLens always presents workspace code as one continuous host galaxy. A boundary configuration does not split that host into smaller peer systems. It adds named, navigable Core regions whose stars occupy soft arc windows and arm knots in the same disk.

The geometry is artistic rather than architectural: nearby regions are not inferred to depend on one another, distance is not coupling, and no hierarchy is encoded by position. Boundary count never changes the host diameter. The diameter comes only from the exact pre-sample Core class/module population.

## Configuration

RubyLens discovers `TARGET/.rubylens.yml` by default. `--config FILE` selects another file and `--no-config` disables boundary configuration.

```yaml
version: 1

boundaries:
  groups:
    - id: shared
      label: Shared core
      paths:
        - lib/**
        - config/**

    - each: apps/*
      id_prefix: app
      label: "App · %{basename}"

    - each: components/*
      id_prefix: component
      label: "Component · %{basename}"

  ungrouped:
    mode: group
    label: Other
```

Precedence is deterministic: `--no-config`, explicit `--config FILE`, discovered `TARGET/.rubylens.yml`, then the anonymous single-region default.

- Rules are ordered and the first match wins.
- `paths` creates one explicit group from root-anchored globs.
- `each` expands tracked directories matching one root-anchored glob.
- IDs are stable lowercase dash-separated identifiers. Labels appear only in Explorer.
- Unmatched files belong to `Other` by default. `ungrouped.mode: error` requires complete coverage.
- Expansion uses the tracked workspace manifest; untracked files cannot create regions.
- Aliases, object tags, duplicate keys or IDs, unknown keys, escaping paths, and unsupported globs are rejected.

The retired `presentation.explorer_layout` option is rejected. There is no atlas or peer-system mode to select.

## Namespace ownership

A class or module reopened across boundaries still produces one canonical star. RubyLens assigns one deterministic owner:

1. most Core definition sites;
2. most total definition sites;
3. earliest matching rule;
4. lexical group ID.

`cross_group_namespaces` records how many owned namespaces span boundaries. Scope remains independent: a test namespace owned by a component is still a cyan Test star.

Configured indexing uses `rubylens.snapshot.v6`. It retains stable IDs and labels only long enough to build the private Explorer model. Paths, patterns, configuration locations, source, comments, and definition sites are not serialized.

## Unified art contract

Configured and unconfigured projects both emit `rubylens.art.v9`:

```text
workspaceRadius:  host radius in thousandths
workspaceDensity: exact Core/Test and rendered Core/Test populations, plus max weight
regions:          anonymous aggregate numeric rows
regionRanges:     first retained namespace row and length
regionLods:       mid length and retained length
regionBounds:     soft angular window and radial bounds
regionCentroids:  navigation target in the common disk plane
regionNames:      optional Explorer-only labels for configured boundaries
namespaces:       compact visual row plus exact represented weight
```

Unconfigured projects have one anonymous internal region, regardless of legacy component discovery. Configured labels and contiguous ranges exist only to support Explorer navigation. Showcase emits `rubylens.showcase.v3` and removes region labels, namespace names, and gem names; its remaining visual rows are numeric.

## Scale-adaptive host radius

Let `N` be the exact pre-sample Core class/module population (`core + mixed`). A Tests-only repository falls back to its exact Test class/module population so it remains visible. Let `p = N / 50,000`.

```text
N = 0:      R = 0
0 < p ≤ 1:  R = 4 + (42 - 4) × p^0.32
1 < p ≤ 8:  R = 42 × p^0.35
p > 8:      R = 42 × 8^0.35 × (p / 8)^0.58
```

The branches are continuous and monotone. The final branch expands very large hosts more strongly without a literal exponential or a discontinuous jump. The constants live in `Model::WorkspaceLayout` so public-project visual tuning remains a small explicit change.

Changing, adding, or removing boundaries at fixed `N` cannot change `R`.

## One disk, soft regions, external dependencies

Core stars share one oblate bulge and disk. Most disk radii use area-spreading rather than center-heavy sampling, then follow logarithmic arm phases. Configured regions softly blend those arm phases toward weighted arc windows; they do not receive local spheres, independent inclinations, canvases, rotations, or lighting rigs.

Cyan Tests form a thinner local envelope and outer halo around the same host. Gold dependency gems remain separate satellite clouds beyond `workspaceRadius`, with deterministic radial and vertical variation rather than a perfect ring.

Exact represented weights and a restrained aggregate haze preserve the impression of full population after sampling. Additive glow and central bulge probability are capped to avoid turning every large project into the same saturated circle.

## Budgets, LOD, and interaction cost

Report retains at most 100,000 namespace rows; Showcase retains at most 50,000. Exact totals and signal domains remain unsampled.

The allocator:

1. retains nonempty-region and Core/Test representatives when the budget permits;
2. distributes remaining capacity linearly by exact region population;
3. resolves remainders by stable lexical keys;
4. selects rows by stable hash rank, independent of input order;
5. assigns integer represented weights that reconcile Core and Test populations separately.

Every region has nested mid and retained ranges. Explorer renders the normal overview, category focus, region focus, and expanded gem clouds through one WebGL2 point buffer. Canvas2D remains the no-WebGL/context-loss fallback. CPU projection and picking are bounded to 4,000 overview namespaces or 12,000 namespaces from the focused region, plus aggregate region and gem landmarks. Dependency stars are never individually hoverable.

Showcase keeps its accepted fixed stage and one-minute autonomous camera orbit. The model's physical radius is not normalized back to a fixed display diameter; large hosts therefore occupy more of the frame and may crop modestly.

## Synthetic acceptance contract

The synthetic benchmark exercises a large namespace population and many configured boundaries at explicit budgets. It asserts:

- exact budget sums, deterministic reordered input, and contiguous ranges;
- exact Core/Test represented-weight reconciliation;
- monotone continuous radius and fixed-population boundary-count invariance;
- one-turn region arc coverage and a common plane;
- exact aggregate reconciliation and Showcase privacy;
- model time, payload bytes, and live-heap slot delta.

The fixture is generic and contains no private-project measurements.
