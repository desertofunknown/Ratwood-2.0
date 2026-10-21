# Blueprint cell classification benchmark

From `tgui`, run:

```sh
bun tools/benchmark-blueprint-summary.ts --json --samples=13 --batch-ms=25 --warmup-ms=150
```

The benchmark compares the original grouping/classification expressions with
`buildCellSummaries` and the actual cached lookup expressions. It includes initial
index construction, edit/rebuild, and cached-render paths with equivalent output
consumption. The synthetic fixtures cover 49/441 displayed cells, one/four stored
floors, and empty/sparse/dense grids. They are not captured player workloads.

## Observations and tradeoffs

Bun 1.2.16, Linux x64, AMD EPYC 9V74; batch-average medians, not individual event
latencies. In two 13-sample runs, dense 441-cell/four-floor cached classification
fell from 0.353–0.406 ms to 0.243–0.250 ms. Default sparse 49-cell classification
fell from approximately 8 microseconds to 4 microseconds. This does **not** measure
React rendering, DOM updates, paint, the BYOND browser, FPS, or game-server speed.

Build/rebuild results are warmup-sensitive. An independent default-duration run
(11 samples, 12 ms batches, 25 ms warmup) measured dense 49-cell/four-floor initial
construction at 188→213 microseconds and an edit at 194→201 microseconds, despite
small improvements in longer-warmup runs. Its cached classification saving was
32 microseconds, recovering that initial penalty after one cached render; using
the lower corresponding saving from longer runs gives two. Do not generalize
these synthetic ratios into a universal improvement or a player workload mix.

An unretained reviewer observation from a low-warmup probe (three samples,
2 ms batches, 5 ms warmup) was less favorable:
dense 49-cell/one-floor edits rose from 63.26 to 93.25 microseconds, while cached
classification fell from 23.97 to 14.67 microseconds, requiring four cached
renders to recover the edit penalty. This reinforces the sensitivity to JIT/GC
and the distinction between edit-heavy and repeated-hover workloads.

Caching retains more memory: one summary object plus one border array per
occupied coordinate replaces one raw-cell array. Grid-cell objects are shared,
not copied. An isolated heap-delta probe retaining 30 indexes over the same input,
with explicit GC and three fresh-process repeats, estimated about 292→366 KB per
index for a dense 441-cell/four-floor grid (+74 KB), 23.5→45.7 KB for a sparse one,
and 1.0→2.0 KB for a default sparse grid. These are Bun heap estimates, not browser
resident-memory measurements; allocator and GC behavior vary.

The cache is invalidated by replacement of the grid or buildable-type catalog.
Current edit handlers and backend updates replace those references. Mutating
those inputs in place would violate the memoization contract. Hover/focus changes
reuse summaries; first-match identity, border ordering, exact cardinal directions,
and lower wall/floor/first-any priority are covered by differential tests.
