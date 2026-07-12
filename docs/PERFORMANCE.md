# Scale instrumentation

RubyLens first removes model-ineligible synthetic declarations: anonymous namespaces, Rubydex Todo placeholders, and nested singleton classes. Package `declaration_count`, dependency-star totals, Ruby construct totals, signal maxima, and sampling are exact over the remaining model-eligible declaration stream. Sampled dependency rows are capped globally at 18,000. Every nonempty package retains a representative row when the number of nonempty packages fits inside that budget. If nonempty packages exceed the budget, seeded reservoir selection chooses which packages retain representatives, so later manifest packages remain eligible without exceeding the global cap. Eligible declarations without a sampled row still contribute to exact totals and signal maxima.

This removes the previous second full materialization of `graph.declarations` and prevents raw dependency volume from becoming an equally large snapshot before the art-model rendering cap is applied. The Rubydex graph can contain additional synthetic declarations and remains outside this model and memory boundary.

Because `packages[].declarations` is bounded instead of complete, current indexing emits `rubylens.snapshot.v7`. It combines the bounded dependency aggregates introduced in snapshot v5, configured Core-system ownership introduced in snapshot v6, and aggregated constant-reference routes. The model builder continues to accept legacy v4, v5, and v6 inputs. Current Report and Showcase generation use `rubylens.art.v9`; the older art v7 and v8 contracts remain compatibility inputs for their corresponding legacy snapshots.

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

## Reference-route cost boundaries

The adapter derives inbound reference signals and aggregate routes in one pass over resolved constant references. Workspace definition ranges are indexed per document; source attribution uses a binary search followed only by the containing-parent chain rather than scanning every range in the file. Duplicate occurrences at the same span are removed, self-routes are skipped, and repeated source/target relationships collapse into one integer row. The adapter performs the one deterministic edge ordering. Art-model filtering and ordinal remapping preserve that sequence without sorting all edges again.

Configured namespace sampling happens before route serialization. A route survives only when its workspace source and any workspace target are both plotted; dependency targets remap to their retained package hub. This prevents routes from retaining or naming omitted namespace points.

The interactive runtime decodes raw route rows once and immediately removes them from the parsed model. Each plotted edge becomes one canonical object shared by sparse outgoing and incoming indexes; Core-touching edges additionally appear by reference in the static-map subset. There is no second all-edge pointer array. Showcase never decodes or retains route identities.

A locked selection scans only that point's visible adjacency. It maintains a globally ranked top 16 entries for precise pointers or top 8 for coarse pointers with a bounded insertion set, so selection work is O(degree × log(limit)) and retained list state is O(limit). The result and outgoing/incoming counts are cached until the locked selection, category visibility, or pointer limit changes. Animation frames draw only the cached bounded list; they do not filter, map, or sort adjacency.

The optional Core route map is deliberately static. It pauses drift, uses typed projection caches, and draws aggregate edges into an offscreen Canvas in frame-budgeted chunks. Navigation and visibility controls stay disabled while the map is building or visible because moving the camera would invalidate that screen-space cache. Exit restores the previous camera and drift state. A future continuously navigable overview would need a GPU line buffer rather than per-frame Canvas projection and drawing.
