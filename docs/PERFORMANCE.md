# Scale instrumentation

RubyLens first removes model-ineligible synthetic declarations: anonymous namespaces, Rubydex Todo placeholders, and nested singleton classes. Package declaration totals, dependency totals, Ruby construct totals, and signal maxima are exact over the remaining model-eligible declaration stream.

Explorer and Showcase retain every eligible dependency declaration in their snapshots and standalone HTML so WebGL2 can plot the complete dependency scene. If WebGL2 is unavailable, rejected by the point-size capability check, fails to initialize, or loses its context, the runtime plots no scene and presents an explicit unsupported state. Exact totals and gem aggregates remain complete in the artifact; neither mode silently changes the visualized population.

The internal handoff remains `rubylens.snapshot.v6`. `packages[].declarations` contains every eligible row for every caller. `DependencyAggregation` and `RubydexAdapter` do not expose a row-limit or sampling configuration. The model builder continues to accept the old v4 shape, where declaration arrays are complete and aggregate count/maxima fields are absent. The persisted public artifact remains `rubylens.art.v9`: exact package populations, dependency totals, signal domains, deterministic rendering, and the integer morphology block retain their existing meanings.

Morphology classification reads only the snapshot's existing namespace rows, namespace names, exact dependency declaration totals, and project name. It performs no indexing, file walking, or subprocess discovery. The renderer still decodes morphology once, precomputes at most five irregular clump centres, then evaluates each Core/Test position in O(1); full Explorer and Showcase dependency rows do not change those calculations.

Dependency aggregation retains every eligible declaration row by package while computing exact package totals, Ruby construct counts, and signal maxima. This complete-only policy makes memory and snapshot size O(eligible dependency declarations) for every caller; there is no lower-volume sampled mode. Art-model construction continues to sort package rows before deterministic seeded layout, so removing the sampler does not make persisted output depend on index stream order.

This aggregation policy does not change the `rubylens.snapshot.v6` or `rubylens.art.v9` schemas. `totals.dependencyStars` is the exact eligible declaration total. `totals.renderedDependencyStars` is the number of declaration rows embedded in that artifact, not a dependency or gem count. Explorer and Showcase runtime state expose the full embedded count as plotted under WebGL2 and zero when rendering is unavailable.

Run the synthetic benchmark with the project Ruby activated:

```sh
bundle exec ruby benchmark/dependency_aggregation.rb
```

The default aggregation benchmark feeds 200,000 synthetic declaration rows across 250 packages. That is deliberately above the public 164,000-row proof scale while keeping the complete-retention benchmark practical to run locally. It reports:

- exact indexed and per-package declaration totals;
- retained row cardinality and retention ratio;
- serialized aggregate bytes and live-heap slot delta;
- elapsed time and a deterministic SHA-256 digest.

On Ruby 4.0.5 for arm64 macOS, two default runs retained all 200,000 rows and preserved the exact declaration total. The package payload serialized to 3,896,777 bytes with `Marshal`; before that projection, the accumulator retained 200,012 additional live heap slots after garbage collection. Aggregation completed in 0.126 and 0.128 seconds, and both runs produced the same `6da3c91d...f2653ca` digest. These figures prove complete retention and provide a local comparison baseline; they are not end-to-end Rubydex or peak-RSS measurements.

Set `DECLARATIONS` or `PACKAGES` to compare other complete shapes. Repeated runs with the same Ruby implementation and inputs must produce the same digest; the benchmark asserts that retained rows and exact totals both equal the configured declaration count. Complete aggregation intentionally scales with the eligible dependency declaration count and must be evaluated with standalone HTML size/load and WebGL2 performance, not inferred from this accumulator benchmark alone. The benchmark uses synthetic integer rows and does not inspect source files, repository paths, or network state.
