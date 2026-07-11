# Scale instrumentation

RubyLens bounds the compact dependency rows retained after Rubydex indexing. Exact package declaration totals, Ruby construct totals, and signal maxima remain unbounded counters, while sampled declaration rows are capped globally at 18,000. Every nonempty package retains a representative row when the number of nonempty packages fits inside that budget. If nonempty packages exceed the budget, seeded reservoir selection chooses which packages retain representatives, so later manifest packages remain eligible without exceeding the global cap. Packages without a sampled row still contribute to exact totals and signal maxima.

This removes the previous second full materialization of `graph.declarations` and prevents one million dependency declarations from becoming one million snapshot rows before the art-model rendering cap is applied. The Rubydex graph itself remains outside this memory boundary.

Because `packages[].declarations` is now bounded instead of complete, the internal handoff is `rubylens.snapshot.v5`. The model builder continues to accept the old v4 shape, where declaration arrays are complete and aggregate count/maxima fields are absent. The persisted public artifact stays `rubylens.art.v7`: exact package populations, dependency totals, signal domains, and deterministic rendering retain their existing meanings.

Run the synthetic benchmark with the project Ruby activated:

```sh
bundle exec ruby benchmark/dependency_aggregation.rb
```

The default aggregation benchmark feeds one million synthetic declaration rows across 250 packages and reports:

- exact indexed and per-package declaration totals;
- retained row cardinality and retention ratio;
- serialized aggregate bytes and live-heap slot delta;
- elapsed time and a deterministic SHA-256 digest.

On Ruby 4.0.5 for arm64 macOS, the default run retained 18,000 of 1,000,000 rows (1.8%) and preserved an exact total of 1,000,000. The projected package payload serialized to 357,003 bytes with `Marshal`; before that projection, the accumulator retained 36,017 additional live heap slots after garbage collection. Aggregation completed in 0.808 seconds. These figures prove the aggregation cardinality bound and provide a local comparison baseline; they are not end-to-end Rubydex or peak-RSS measurements.

Set `DECLARATIONS`, `PACKAGES`, or `ROW_LIMIT` to compare other shapes. Repeated runs with the same Ruby implementation and inputs must produce the same digest; the benchmark asserts the row bound and exact total itself. The aggregation temporarily creates another bounded set of row references when producing package hashes, so retained Ruby-side references remain O(18,000), not exactly 18,000. The benchmark uses synthetic integer rows and does not inspect source files, repository paths, or network state. A later full-pipeline integration benchmark will compare index-only and full-pipeline peak RSS.
