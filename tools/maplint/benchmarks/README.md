# Maplint coordinate-summary benchmark

`Lint.run` still performs the same rule matching and emits the same diagnostics.
After finding failures, it now visits the map once per failing lint and retains
only the first three coordinates and a count for each failing pop. Previously,
every failing content/rule pair independently scanned the entire map, including
the remaining coordinates needed for the `and N more` suffix.

The existing `list(set(all_failures))` return does not promise diagnostic order.
Tests compare full-field multisets, including duplicate multiplicities, rather
than claiming stable output ordering. Coordinate traversal remains Z, then X,
then Y; coordinate conversion and first-three/count formatting are unchanged.
Unused failing pops still receive an empty coordinate string.

There is no persistent cache, no index of every tile, and no map mutation.
Clean lints return without iterating the grid. Rule matching is unchanged; the
coordinate work falls from O(failing content/rule pairs × tiles) to O(tiles +
diagnostics) per failing lint, with O(failing pops) summary space. Multiple lints
can still scan the same map independently. This intentionally avoids a wider
shared-cache lifecycle change.

## Focused tests

From the repository root:

```sh
python -B -m unittest tools.maplint.tests.test_coordinate_summaries
```

These ten tests need no third-party dependency. They cover the frozen reference
source hash, zero through four occurrences, unused pops, Z/X/Y ordering, help
and every other diagnostic field, duplicate diagnostics, the clean-map fast
path, exactly one visit per column, ragged/empty shapes supported by the old
code, unknown string grid keys, repeated calls after map changes, and 1,000
deterministic randomized maps and rules. Shapes that already failed in
`DMM.size()` still raise the same `IndexError`. The data contract is the existing
maplint `DMM`: string pop keys and nested lists of string grid entries, as
produced by its read-only parser. Arbitrary replacement lookup methods and
non-string/unhashable grid entries are not a supported parser output.

## Reproduce actual-production measurements

Use Python with PyYAML available (`tools/requirements.txt` pins 6.0.1):

```sh
python -B tools/maplint/benchmarks/coordinate_summaries.py
```

The default is five alternating-order samples on roguetest, Rockhill, and
Dunworldredux. The harness runs all 36 default `.yml` rules, just like the CLI;
it does not change which rule-file extensions the CLI loads. It installs
nothing, writes no files, and emits JSON to stdout. The three map fixture hashes
are pinned and checked before/after; lint-file hashes are also checked. Existing
map diagnostics are expected comparison data, not newly introduced failures.

For a shorter run, or an optional substantially slower allocation probe:

```sh
python -B tools/maplint/benchmarks/coordinate_summaries.py --maps roguetest --repeats 1
python -B tools/maplint/benchmarks/coordinate_summaries.py --memory
```

Timings cover actual current `tools.maplint.source.lint.Lint.run`, not a copied
candidate, against `tests/lint_run_reference.py`. The reference is the unmodified,
dedented method from commit `18408e4248f567dc0def4245dc8b3f910cf7aed7`,
`tools/maplint/source/lint.py:236–274`. Its original file SHA-256 is
`a8c792f972a429b9dc456b3116c0f59e47be2401cb680c515d2f324e8c92bb5b`, and
its dedented function SHA-256 is
`5d79ee92019473f045e983f8e03bad03e41768b61b86d35b35516f5c2c7f0654`.
The focused suite and harness verify the frozen function hash. Result JSON binds
the current production source hash and records Python, platform, PyYAML, inputs,
raw samples, medians, diagnostic parity, and scan counts.

Both functions receive the same parsed maps and loaded rules. Parsing, hashing,
validation, scan counting, and explicit GC collection are outside the timed
region. Each function gets an untimed warmup; order alternates and GC is disabled
only while timing. Optional `tracemalloc` measurements are separate incremental
peaks, not process RSS, total map memory, or game RAM. Run timing comparisons
without other intentional CPU-heavy work.

These are developer-tool measurements, not gameplay/client FPS or whole-CI
speedup claims. Clean maps need no coordinate work and should not be expected
to benefit. The actual fixture counts are 80 → 4 full scans on Rockhill and
38 → 5 on Dunworldredux; roguetest needs zero in both versions.

## Retained production measurements

`coordinate_summaries_2026-10-22.json` retains the actual-production run above,
with five raw samples per function and fixture. Python was 3.12.14 and the
already-installed PyYAML was 6.0.3, not the repository's 6.0.1 pin. Sibling
CPU-heavy benchmark runs were serialized for this run; this is still a shared
cloud machine, not a guaranteed isolated benchmark host. Earlier contended,
standalone-candidate probes are not presented as production evidence here.
Reference lookup counts are instrumented outside timing; production scan counts
follow one pass per affected lint, with the one-pass property independently
covered by the focused suite.

| All 36 lints, parsing excluded | Reference median | Production median | Change |
|---|---:|---:|---:|
| Rockhill, 548,250 tiles, 88 diagnostics | 2.918 s | 1.568 s | 46.3% less time |
| Dunworldredux, 630,000 tiles, 38 diagnostics | 2.454 s | 1.860 s | 24.2% less time |
| Roguetest, 5,000 tiles, no diagnostics | 15.17 ms | 15.59 ms | No useful benefit |

All full diagnostic-field multisets and original map hashes matched. These
measurements did not enable the optional allocation probe, so no production
memory-reduction claim is made.
