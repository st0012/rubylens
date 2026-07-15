# Scale instrumentation

RubyLens first removes model-ineligible synthetic declarations: anonymous namespaces, Rubydex Todo placeholders, and nested singleton classes. Package declaration totals, dependency totals, Ruby construct totals, and signal maxima are exact over the remaining model-eligible declaration stream.

Explorer and Showcase retain every eligible dependency declaration in their snapshots and standalone HTML so WebGL2 can plot the complete dependency scene. If WebGL2 is unavailable, rejected by the point-size capability check, fails to initialize, or loses its context, the runtime plots no scene and presents an explicit unsupported state. Exact totals and gem aggregates remain complete in the artifact; neither mode silently changes the visualized population.

The internal handoff remains `rubylens.snapshot.v6`. `packages[].declarations` contains every eligible row for Explorer and Showcase. Direct `GenerationPipeline` and default `RubydexAdapter` callers retain the bounded deterministic default unless they explicitly pass `dependency_row_limit: nil`. The model builder continues to accept the old v4 shape, where declaration arrays are complete and aggregate count/maxima fields are absent. The persisted public artifact remains `rubylens.art.v9`: exact package populations, dependency totals, signal domains, deterministic rendering, and the integer morphology block retain their existing meanings.

Morphology classification reads only the snapshot's existing namespace rows, namespace names, exact dependency declaration totals, and project name. It performs no indexing, file walking, or subprocess discovery. The renderer still decodes morphology once, precomputes at most five irregular clump centres, then evaluates each Core/Test position in O(1); full Explorer and Showcase dependency rows do not change those calculations.

Direct `GenerationPipeline` and default `RubydexAdapter` callers use the bounded aggregation default before art-model construction. Their order-independent priority sample is capped globally at 18,000 rows, retains a representative from every nonempty package when possible, and keeps eligible declarations without a retained row in exact totals, Ruby construct counts, and signal maxima. Explorer and Showcase explicitly opt out because their WebGL2 contract is a complete scene rather than a bounded projection.

This caller-specific aggregation policy does not change the `rubylens.snapshot.v6` or `rubylens.art.v9` schemas. `totals.dependencyStars` is the exact eligible declaration total. `totals.renderedDependencyStars` is the number of declaration rows embedded in that artifact, not a dependency or gem count. Explorer and Showcase runtime state expose the full embedded count as plotted under WebGL2 and zero when rendering is unavailable.

Run the synthetic benchmark with the project Ruby activated:

```sh
bundle exec ruby benchmark/dependency_aggregation.rb
```

The default aggregation benchmark feeds one million synthetic declaration rows across 250 packages and reports:

- exact indexed and per-package declaration totals;
- retained row cardinality and retention ratio;
- serialized aggregate bytes and live-heap slot delta;
- elapsed time and a deterministic SHA-256 digest.

On Ruby 4.0.5 for arm64 macOS, the default run retained 18,000 of 1,000,000 rows (1.8%) and preserved an exact total of 1,000,000. The projected package payload serialized to 356,676 bytes with `Marshal`; before that projection, the accumulator retained 54,094 additional live heap slots after garbage collection. Aggregation completed in 1.901 seconds. Two repeated runs produced the same `a96ebc60...dccdb8c3` digest. These figures prove the aggregation cardinality bound and provide a local comparison baseline; they are not end-to-end Rubydex or peak-RSS measurements.

Set `DECLARATIONS`, `PACKAGES`, or `ROW_LIMIT` to compare other shapes; `ROW_LIMIT=unlimited` exercises the full-artifact aggregation mode used by Explorer and Showcase. Repeated runs with the same Ruby implementation and inputs must produce the same digest; the benchmark asserts the configured row bound and exact total itself. The bounded aggregation temporarily creates another bounded set of row references when producing package hashes, so retained Ruby-side references remain O(18,000), not exactly 18,000. The unlimited mode intentionally scales with the eligible dependency declaration count and must be evaluated with standalone HTML size/load and WebGL2 performance, not inferred from the bounded benchmark. The benchmark uses synthetic integer rows and does not inspect source files, repository paths, or network state.
