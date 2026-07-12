# Multi-core monorepo boundaries

RubyLens can present a large monorepo as one coherent association of compact Core systems. A repository can configure `apps/*`, `components/*`, and shared infrastructure as separate systems while Core, Tests, and Gems keep their existing visual roles.

Without configuration, RubyLens preserves the existing single-project snapshot, art model, Report, and Showcase behavior. Configured projects use the versioned contracts described below.

## Configuration

RubyLens discovers `TARGET/.rubylens.yml` by default. `--config FILE` selects another file and `--no-config` forces the unchanged single-project behavior.

Precedence is deterministic: `--no-config`, then an explicit `--config FILE`, then `TARGET/.rubylens.yml`, then unchanged behavior when no configuration exists. Passing `--config` and `--no-config` together is an error. Explicit paths are resolved from the invoking process's working directory and must exist; a missing discovered file is not an error.

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

    # One group for every tracked matching directory.
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

An Explorer with unusually many systems can opt into the atlas fallback:

```yaml
version: 1
presentation:
  explorer_layout: atlas
boundaries:
  groups:
    - each: components/*
      id_prefix: component
      label: "Component · %{basename}"
```

`presentation.explorer_layout` accepts `association` (the default) or `atlas`. Atlas affects only the interactive Report; Showcase always uses the coherent association.

## Matching and safety contract

- Rules are ordered and the first match wins.
- `paths` creates one explicit group from one or more root-anchored globs.
- `each` expands directories matching one root-anchored glob and includes their descendants.
- Initial glob support is deliberately small: `/`, `*`, and a final `**` segment only.
- IDs are stable lowercase dash-separated identifiers. Labels are Report-facing text.
- Unmatched files belong to `Other` by default. `ungrouped.mode: error` requires complete coverage.
- Group ownership is independent of Core/Test role. A test path owned by a component remains cyan Test code.
- The YAML stream must contain exactly one nonempty document. Aliases, object tags, duplicate keys or IDs, unknown keys, absolute or escaping paths, and unsupported globs are rejected.
- `each` expansion uses only the tracked workspace manifest (`git ls-files --cached`). Ignored and nonignored untracked files cannot create groups. RubyLens's pre-existing indexing selection remains unchanged.

## Namespace ownership and aggregates

A Ruby class or module can be reopened across files and boundaries. RubyLens emits one canonical star and selects one deterministic owner:

1. most Core definition sites;
2. most total definition sites;
3. earliest matching configuration rule;
4. lexical group ID.

`cross_group_namespaces` records the exact number of owned namespaces reopened across multiple systems. Report can expose that aggregate span count without serializing definition sites or duplicating stars. Core/Test scope still controls colour and local morphology.

Configured indexing uses `rubylens.snapshot.v6`. Each group contains its stable ID and name, a derived anchor seed, `[core, tests, mixed]` namespace counts, exact Core/Test `[classes, modules, methods, constants]` counts, and the cross-system namespace count. Namespace rows add only the compact owner ordinal needed for plotting. Paths, patterns, configuration locations, source, comments, and raw definition sites are excluded.

Configured presentation uses `rubylens.art.v8`:

```text
groupNames:     [Report label, ...]
groups:         [ordinal, core namespaces, test namespaces, mixed namespaces,
                 cross-system namespaces, Core Ruby counts..., Test Ruby counts...]
groupRanges:    [first namespace row, length]
groupLods:      [mid length, retained length]
groupAnchors:   [x, y, z]
groupRadii:     radius in thousandths
namespaces:     existing compact visual row plus owner ordinal
```

All plotted namespace rows for a system are contiguous. Report is the only group-identity-bearing surface: it may contain group labels, namespace names, and package names. Showcase still includes the project name by design, but `rubylens.showcase.v2` otherwise retains only numeric rows and aggregate statistics, stripping group IDs and labels, namespace names, package names, and the Explorer layout choice.

## Core-system geometry

Every nonempty boundary receives a stable, noncentral 3D anchor. The active anchors have an empty barycenter and deterministic overlap resolution. Truly empty groups retain only ordinal placeholders and do not change association scale; a Tests-only group remains visible at the minimum system radius. Systems receive restrained deterministic inclinations, but no relationship lines, bridges, shared spiral, route force, independent rotation, or proximity-derived hierarchy.

System area represents the exact full canonical Core namespace count (`core + mixed`) rather than the plotted sample or Test count. The model uses one documented transform:

```text
radius = clamp(3.5 + 0.55 × sqrt(core + mixed), 4.0, 16.0)
```

Pink Core stars form the dense interior. Existing cyan Tests form a lower-density local envelope; RubyLens does not invent Tests for a system that has none. Gold dependency systems are positioned outside the full workspace-system volume and are not assigned to a nearby Core system. Sampling never brightens individual stars to compensate for omitted detail.

## Bounded plotting and level of detail

Configured namespace sampling happens before HTML serialization. Report retains at most 100,000 namespace rows and Showcase at most 50,000; dependency hubs and bounded dependency detail are counted separately. These are separate surface caps rather than one universal product budget. The explicit allocator:

1. retains a representative for each nonempty system when the budget permits;
2. preserves Core and Test category representatives when the budget permits;
3. distributes remaining capacity by `sqrt(full namespace count)`;
4. resolves largest-remainder ties by stable lexical group ID;
5. selects rows by stable hash rank, independent of input order.

Each artifact has nested far, mid, and near levels: one aggregate hub per nonempty system; deterministic mid representatives from every visible system; and the full retained contiguous range for the selected system. Overview picking checks system hubs only. Focus picking scans only the selected `groupRanges` slice. Report exposes a narrow numeric `RubyLensCoreSystems` focus/clear/range hook for integration without adding search or a second point model.

The whole association uses one active renderer, with no per-system canvases, contexts, materials, framebuffers, or animation loops. Showcase uses its existing single WebGL renderer with the existing Canvas 2D fallback; WebGL uploads one immutable packed point buffer and draws contiguous LOD ranges from it. Showcase remains autonomous, anonymous, and noninteractive, with the accepted fixed stage and one-minute camera orbit. On configured mobile views, RubyLens reduces backing render scale, glow, white-core detail, and faint dependency detail before dropping system hubs, Core/Test representatives, system size, or orientation. Unconfigured Showcase pixels and motion do not take these branches.

## Synthetic acceptance contract

Generic synthetic fixtures cover 100,000 namespaces and 1,000 groups at explicit 18,000, 50,000, and 100,000 namespace budgets. They must prove:

- exact quota sums and bounds, group/category minimums, and stable reordered-input results;
- contiguous ranges, nested per-artifact LODs, and direct range slicing;
- stable anchors, an empty barycenter, no active system at the origin, bounded overlap resolution, and the documented radius transform;
- exact aggregate reconciliation and privacy separation between Report and Showcase;
- unchanged unconfigured `snapshot.v5`/`art.v7` digest and presentation behavior;
- desktop, portrait, landscape, reduced-motion, atlas, WebGL, and Canvas fallback behavior;
- payload size, model/runtime timing, and peak resident memory at each explicit budget.

The numeric fixtures are synthetic and are not measurements of any company or private repository. A representative public repository can be generated once only after the synthetic gate passes.

## Deferred work

Search and virtualization, a mobile bottom sheet, system camera tours, WebGL picking/readback, reference routes, relationship edges, and new animation presets are outside this slice. The atlas remains an explicit high-group-count Report fallback, not the default Showcase layout.
