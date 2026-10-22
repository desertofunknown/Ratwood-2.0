# Map-key cleanup benchmark

This read-only harness compares the actual current `DMM.remove_unused_keys` with a frozen method body from commit `851bb446133c875b60d41033e84ff1a6d7208cba`, `tools/mapmerge2/dmm.py:86–92`. It does not substitute an inline candidate for production code.

Use Python with `bidict==0.22.0`, the pin in `tools/requirements.txt`. From the repository root:

```sh
python -B tools/mapmerge2/benchmarks/cleanup_keys.py --quick
```

The default is the same bounded quick selection: one 5,000-cell synthetic case and the checked-in `2226_turf_closed_void.txt` update applied only to memory copies of roguetest, Rockhill and Dunworldredux. There are three timed repetitions per function by default; `--repeats 1` reduces them. Output is JSON on stdout. The script installs nothing and writes no files. `DMM.to_file` is guarded to fail, serialization uses `StringIO`, and original map/update-script SHA-256 hashes must match before and after. The fixed input hashes intentionally reject changed maps rather than silently presenting a different workload as the same comparison.

Optional stress cases are explicit and can take substantially longer:

```sh
python -B tools/mapmerge2/benchmarks/cleanup_keys.py --large-synthetic
python -B tools/mapmerge2/benchmarks/cleanup_keys.py --illustrative-merge
```

The latter simulates broad railing-path removal on a Rockhill memory copy using the real `update_path`/merge/reassignment pipeline. It is neither a requested nor a proposed map edit. Historical legacy cleanup took about 14 seconds per call, and validation, warmup and memory measurement add calls beyond the timed repetitions. Neither stress case runs by default.

## What is measured

- Timings cover cleanup only, excluding parsing, path updates, cloning, validation and serialization. Function order alternates; garbage collection is disabled only during timed calls.
- Memory is a separate `tracemalloc` incremental cleanup peak, not process RSS, total map memory or game RAM.
- Before timing, the harness checks dictionary and inverse mapping order/content, grid order/content, metadata, unchanged caller input and source fixture, and identical in-memory DMM/TGM output. It also reproduces the legacy default-argument failures and checks the production default behavior.
- This is tooling evidence, not an engine/client benchmark or a whole-UpdatePaths speed claim. It assumes the existing DMM contract: integer keys, a `bidict` tile dictionary and ordinary coordinate-to-key grid dict. Dedicated regression tests cover additional malformed-request/error-order cases.

## Separate regression checks

From the repository root, with the same dependency environment:

```sh
PYTHONPATH=tools python -B -m unittest mapmerge2.test_remove_unused_keys
PYTHONPATH=tools python -B -m mapmerge2.dmm_test
```

The focused suite currently contains 11 cleanup tests. The second command is a separate read-only parser check across the map corpus (149 files in this checkout), not cleanup coverage on every map.

## Retained historical measurements

`cleanup_keys_baseline_2026-10-22.json` contains the original raw samples from **before the production patch**. Those compared the actual baseline function with a standalone candidate using the same algorithm subsequently adopted: preserved candidate-key sequence, a remaining-key set, `difference_update`, and empty-input early return. They are **not production reruns**. The project harness above now measures the actual production implementation; its new results may differ by machine/load/runtime.

Historical medians:

| Workload | Legacy | Pre-patch candidate | Absolute saving |
|---|---:|---:|---:|
| Actual Rockhill update: 548,250 cells, 10 changed keys, 2 deleted | 34.290 ms | 10.232 ms | 24.059 ms |
| Actual Dunworldredux no-op: 630,000 cells | 15.906 ms | 0.0086 ms | 15.898 ms |
| Illustrative merge-heavy Rockhill copy: 3,030 changed keys, 2,201 deleted | 14.210 s | 15.130 ms | 14.195 s |

The ordinary Rockhill saving is only about **24 ms**; a separate single read-only probe took about **1.85 s to parse Rockhill** and **2.96 s to parse Dunworldredux**, before updates/serialization. Do not generalize the stress-case speedup to normal editing. Cleanup peak allocations were unchanged or slightly higher, including +280 bytes for the ordinary Rockhill update and +24,296 bytes for the illustrative merge-heavy case. No memory reduction is claimed.
