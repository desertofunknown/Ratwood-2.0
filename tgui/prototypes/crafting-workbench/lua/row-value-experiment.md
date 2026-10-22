# Retained-row primitive tracking experiment

This disconnected Lua candidate tracks four last-rendered primitive values per
mounted recipe row: string name, normalized string ingredients, material-match
boolean and expanded boolean. It still reads current fields on every delivery;
it does not memoize recipe objects or delivered data by reference. Removed row
records and their listeners are discarded normally.

The previous helpers already avoided unchanged DOM **writes**. This experiment
instead avoids repeated JavaScript `String` calls and DOM reads across Fengari.
Unsupported text values still take the original conversion path each time and
invalidate the remembered string. Empty/nullish ingredient normalization,
false-valued initialization, category headings, detail rendering and keyed
reconciliation remain unchanged.

The row nodes are renderer-owned. Unlike the old helper checks, an unchanged
primitive does not incidentally repair arbitrary external edits to its DOM text
or attribute. This is an explicit ownership assumption, not equivalence under
every possible third-party DOM mutation. The additional retained state is four
primitive fields per mounted row; no heap-size estimate is claimed.

## Reproduce the operation counts

Use the pinned dependencies and Bun version documented in [README](README.md).
The checkout must contain Git object
`fe543e16f56032100b197f3d9452767a1db56e5b`, the guarded, focus-fixed baseline.
From this directory:

```sh
bun row-value-experiment.ts
```

The script reads the exact baseline with `git show`, records both source hashes,
and instruments narrowly checked helper sites in disposable generated copies.
Original conversions, reads, comparisons and writes still execute. It runs both
actual Lua programs through Fengari with Happy DOM, asserts identical DOM/focus
snapshots in ten scenarios, and writes `.generated/row-value/results.json`.
Instrumentation is not part of the demo builds.

| Scenario                              | Text helper / String / textContent read, before → after | Attribute helper / getAttribute read, before → after |
| ------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| Unchanged 40 rows                     | 121 → 1                                                 | 80 → 0                                               |
| One material flag changes             | 121 → 2                                                 | 80 → 1                                               |
| One name and ingredient string change | 121 → 3                                                 | 80 → 0                                               |
| Selection or Back                     | 121 → 1                                                 | 80 → 1                                               |
| Unchanged 80 rows                     | 241 → 1                                                 | 160 → 0                                              |

Each listed text count applies separately to the helper, conversion and read;
likewise for the attribute helper and read. The remaining text operation is the
unchanged category heading. New/reinserted rows still receive full
initialization. These counts exclude other UI/detail work and do not enumerate
every VM/JavaScript crossing.

These are instrumented operation counts, **not timing or browser-speed results**.
Lua comparisons and retained-value bookkeeping add work. A noninstrumented
browser A/B must compare the guarded baseline and candidate with identical
harness, styles and scenario data, retaining raw samples and selected-state
results before drawing performance conclusions. The earlier
[scan-guard browser result](browser-selection-scan.md) is a different experiment.

For that A/B, build both arms from the same current source and pinned tools in
separate disposable copies. Replace only the baseline copy's `workbench.lua`
with the exact Git version above; do not use an older bundled harness. Compare
the generated `bundle-sizes.json` source hashes: only `workbench.lua` should
differ among the twelve recorded inputs, and both CSS files must be identical.
Run the shared scenario correctness checks before hosting either build.
