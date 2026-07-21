# Scale instrumentation

RubyLens first removes model-ineligible synthetic declarations: anonymous namespaces, Rubydex Todo placeholders, and nested singleton classes. Package declaration totals, dependency totals, Ruby construct totals, and signal maxima are exact over the remaining model-eligible declaration stream.

Explorer and Showcase retain every eligible dependency declaration in their snapshots and standalone HTML so WebGL2 can plot the complete dependency scene. If WebGL2 is unavailable, rejected by the point-size capability check, fails to initialize, or loses its context, the runtime plots no scene and presents an explicit unsupported state. Exact totals and gem aggregates remain complete in the artifact; neither mode silently changes the visualized population.

Payload shapes and the versioning rule are specified in [SCHEMAS.md](SCHEMAS.md). What matters for scale: `packages[].declarations` contains every eligible row in every schema, and `DependencyAggregation` and `RubydexAdapter` do not expose a row-limit or sampling configuration. All three payloads carry complete package and dependency populations; the Showcase schema is the privacy-filtered projection used by its Minimal and Details surfaces.

Project morphology classification reads only the snapshot's existing namespace rows, namespace names, exact dependency declaration totals, and project name. Each package classification reads only that package's declaration rows, Ruby construct counts, and existing deterministic package seed. Classification performs no indexing, file walking, or subprocess discovery. At load time the renderer decodes the project row once and each aligned package row once. Core/Test positions and package-local dependency offsets remain O(1) per point, including the compact-cloud rule for packages below `DEPENDENCY_CLOUD_THRESHOLD`; no morphology work enters the per-frame CPU path.

Dependency aggregation retains every eligible declaration row by package while computing exact package totals, Ruby construct counts, and signal maxima. This complete-only policy makes memory and snapshot size O(eligible dependency declarations) for every caller; there is no lower-volume sampled mode, and the runtime carries no sampled-data presentation state. Art-model construction sorts package rows before deterministic seeded layout, so persisted output does not depend on index stream order.

`totals.dependencyStars` is the exact eligible declaration total. The snapshot carries no separate per-package declaration count — every consumer derives counts from the retained `declarations` rows themselves, so a payload that advertises more stars than it embeds cannot be expressed. Explorer and Showcase runtime state expose the full embedded count as plotted under WebGL2 and zero when rendering is unavailable.

Run the synthetic benchmark with the project Ruby activated:

```sh
bundle exec ruby benchmark/dependency_aggregation.rb
```

The default aggregation benchmark feeds 200,000 synthetic declaration rows across 250 packages. That is deliberately above the public 164,000-row proof scale while keeping the complete-retention benchmark practical to run locally. It reports:

- retained row cardinality and retention ratio;
- serialized aggregate bytes and live-heap slot delta;
- elapsed time and a deterministic SHA-256 digest.

On Ruby 4.0.5 for arm64 macOS against the pre-v8 payload shape, two default runs retained all 200,000 rows and preserved the exact declaration total: the package payload serialized to 3,896,777 bytes with `Marshal`, the accumulator retained 200,012 additional live heap slots after garbage collection, aggregation completed in 0.126 and 0.128 seconds, and both runs produced the same digest. The v8 snapshot dropped the redundant per-package `declaration_count` field, so absolute bytes and digests differ slightly today; the complete-retention property and determinism assertion are unchanged. These figures are a local comparison baseline, not end-to-end Rubydex or peak-RSS measurements.

Set `DECLARATIONS` or `PACKAGES` to compare other complete shapes. Repeated runs with the same Ruby implementation and inputs must produce the same digest; the benchmark asserts that the retained rows equal the configured declaration count. Complete aggregation intentionally scales with the eligible dependency declaration count and must be evaluated with standalone HTML size/load and WebGL2 performance, not inferred from this accumulator benchmark alone. The benchmark uses synthetic integer rows and does not inspect source files, repository paths, or network state.
