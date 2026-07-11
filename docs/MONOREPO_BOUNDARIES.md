# Multi-core monorepo boundary design

RubyLens should treat a large monorepo as a galaxy of first-class Core systems rather than one undifferentiated Core cloud. A repository can configure `apps/*`, `components/*`, and shared infrastructure as separate systems while preserving Tests and Gems as visual roles.

The configuration and Git-selected manifest plumbing described below are implemented. Namespace ownership, group aggregates, and scene behavior remain staged design work.

## Proposed configuration

RubyLens discovers `TARGET/.rubylens.yml` by default. `--config FILE` selects another file and `--no-config` preserves today's single-Core behavior.

Precedence is deterministic: `--no-config`, then an explicit `--config FILE`, then `TARGET/.rubylens.yml`, then unchanged single-project behavior when no configuration exists. Passing `--config` and `--no-config` together is an error. Explicit paths are resolved from the invoking process's working directory and must exist; a missing discovered file is not an error.

```yaml
version: 1

boundaries:
  groups:
    # Ordered explicit group. First matching rule wins.
    - id: shared
      label: Shared core
      paths:
        - lib/**
        - config/**

    # Expand one group for every selected matching directory.
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

Rules use normalized, workspace-relative paths from a tracked-only view of the Git manifest. This is deliberately narrower than the existing indexing selection, which continues to include nonignored untracked files. RubyLens must not scan ignored or untracked files to discover groups.

## Matching contract

- Rules are ordered and the first match wins.
- `paths` creates one explicit group from one or more root-anchored globs.
- `each` expands the directories matching one root-anchored glob and includes their descendants.
- Initial glob support is deliberately small: `/`, `*`, and `**` only.
- Reject absolute paths, `..`, regular expressions, YAML aliases, unknown keys, duplicate IDs, and generated IDs that collide.
- IDs are stable, normalized identifiers used by the compact model. Labels are user-facing text.
- Unmatched files belong to `Other` by default. `ungrouped.mode: error` supports repositories that require complete coverage.
- Do not initially support silently dropping unmatched source.
- Group ownership is independent of Core/Test role. `components/acme-foundation/test/...` belongs to Acme Foundation and remains cyan Test code.
- YAML aliases, object tags, duplicate mapping keys, unknown keys, duplicate or colliding group IDs, absolute paths, `..`, and unsupported glob syntax are rejected.
- `each` groups expand only from directories proven by the tracked-only workspace manifest view. Ignored, untracked, and direct child files cannot create groups, while the broader indexing behavior remains unchanged.

## Namespace ownership

A Ruby class or module can be reopened across files and boundaries. RubyLens keeps one star rather than duplicating it.

Classify every canonical namespace definition by group, then select the visual owner using this deterministic order:

1. most Core definition sites;
2. most total definition sites;
3. earliest matching configuration rule;
4. lexical group ID.

Group-level namespace counts use the dominant owner, while `cross_group_namespaces` records the exact number of owned namespaces reopened across more than one group. This avoids adding a redundant span value to every namespace row. The namespace's existing Core/Test scope still controls its role and colour.

The adapter already assigns a compact component ordinal to each namespace. The implementation should evolve that latent dimension into configured group ownership rather than adding a second ownership field.

## Proposed model evolution

The first implementation should use new contracts so old reports cannot silently misread group ordinals.

```text
rubylens.snapshot.v6 (configured projects only)
  groups:
    [{ id, name, anchor_seed, namespace_counts,
       ruby_counts: { core, tests }, cross_group_namespaces }]
  namespaces:
    [group_ordinal, kind, scope, ..., instance_variables]

rubylens.art.v8 (future scene-metadata checkpoint)
  groupNames: [label, ...]
  groups:
    [seed, core_namespaces, test_namespaces, classes, modules,
     methods, constants, mixed_namespaces]
  groupRanges:
    [first_namespace, length, ...]
  namespaces:
    existing compact row with group ordinal
  totals:
    namespaces, renderedNamespaces, groups, packages, dependencyStars,
    renderedDependencyStars
```

`namespace_counts` is `[core, tests, mixed]`. Each `ruby_counts` value is `[classes, modules, methods, constants]`, matching `category_stats`; group values must sum elementwise to the repository totals.

Until `art.v8` lands, the art builder rejects configured `snapshot.v6` rather than allowing an `art.v7` report to silently interpret group ordinals as legacy component ordinals.

Only labels, aggregate values, ordinals, and derived seeds enter the HTML. Do not embed configured patterns, full boundary paths, or the configuration file path.

Reference-route aggregation is intentionally outside the first boundary implementation. If it returns, follow [the archived route design](REFERENCE_ROUTES_FUTURE.md) and attribute each source from its actual reference file rather than the namespace's dominant owner.

## Galaxy layout

The overview is a clustered, compound graph whose primary objects are systems—not every individual declaration. Synthetic scale tests cover up to 100,000 namespaces without implying the shape of any real repository.

- Give every group a stable 3D anchor derived from its ID.
- Size its local system by `sqrt(namespace_count)`.
- Resolve overlaps with a fixed, deterministic number of spatial-hash passes. Do not use a route-driven force layout; small semantic changes must not reshuffle the whole galaxy.
- Render Core as the dense centre of each system and its Tests as a cyan outer halo.
- Keep Gems as smaller yellow systems around the monorepo as a whole.
- Communicate boundaries through separation, density, labels, and focus state. Do not invent hundreds of arbitrary group colours.
- At overview, draw one hub or density mark per group and directly label only the most important systems.
- Selecting a group uses the existing smooth top-down camera flight. Individual namespace stars become interactive only inside the focused system or above a zoom threshold.

The explorer should show `Core systems · N`, offer search, and virtualize the group list. Desktop keeps the list in the side panel. Mobile portrait defaults to one selected system plus a searchable bottom sheet rather than shrinking the entire monorepo into an unusable view.

## Autonomous Showcase

Showcase should frame the bounding volume of all configured systems rather than reusing a camera tuned for one Core cloud. Its bounded sample must keep every group hub and a minimum quota from every nonempty group before distributing the remaining points by group size. This prevents a small application or component from disappearing in a large monorepo presentation.

The default share overlay should say `Core systems · N` alongside repository-wide Ruby counts. Configured group labels can reveal internal product names, so they stay out of the Showcase payload and pixels. A later system-flyover preset can visit selected groups, but the first implementation should remain one stable overview loop.

## Large-monorepo safeguards

- Separate indexed namespace totals from plotted namespace points, matching the existing dependency-star contract.
- Use 25,000–30,000 workspace stars as a provisional synthetic-test threshold, then tune with profiling from representative public or user-authorized repositories.
- Give each nonempty group a minimum point quota; distribute the remaining budget proportional to `sqrt(group_size)`.
- Always retain group hubs, high-signal namespaces, explorer-highlight winners, and cross-group namespaces before deterministic sampling.
- Store each group's plotted namespaces contiguously and expose `groupRanges`, so focus and hit testing do not scan every point.
- At overview, disable per-star hit testing. Enable it only for the focused group.
- Suppress most labels when group counts are extreme and require search or focus for detail.
- Keep Canvas 2D with hierarchical level of detail first. Move plotted marks to WebGL only if profiling shows animated mark throughput—not model construction or payload size—is the remaining bottleneck.

## Implementation batches

1. Strict configuration loader, safe glob matcher, discovery/CLI plumbing, group ownership, and `snapshot.v6`.
2. `art.v8` group metadata, deterministic anchors, overview level of detail, and smooth group focus.
3. Workspace-star sampling, contiguous group ranges, explorer search/virtualization, and mobile group selection.
4. Synthetic 100,000-namespace/1,000-group tests plus profiling against a representative public or user-authorized large monorepo and visual tuning.

Each batch needs path-leak tests, deterministic ordering tests, owner-only report checks, and desktop/mobile screenshot review.
