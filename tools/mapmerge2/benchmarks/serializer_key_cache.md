# Per-save serializer key reuse

`save_tgm` and `save_dmm` now create a local
`lru_cache(maxsize=None, typed=True)(num_to_key)` and use it at their four existing
encoder call sites. Repeated cells reuse the encoded text. The cache includes
the current key length and argument types in its key and never persists on a map
or at module scope. It is released when the save frame is released; a caller
retaining an exception traceback also retains that frame and its local cache
until the traceback is released.
No parser, key-helper, traversal, formatting or presave-check logic is changed.

## Equivalence and scope

The supported workload is ordinary maps with built-in nonnegative integer keys
and built-in integer key lengths. Temporary cache storage is O(distinct
key/width/type tuples) encountered in that save, not O(cells). With an unchanged
integer width this is one entry per distinct integer key. This is additional
temporary storage, not an unconditional memory optimization. Unknown integer grid keys
still pass through the original encoder. Overflow checks, missing-grid behavior,
output chunk order and partial output on errors remain at their old call sites.
The default `allow_overflow=False` is unchanged.

`typed=True` matters: a cached integer `1` must not suppress the old error for
float `1.0`. Safe malformed built-ins, bool/int/float aliases, repeated saves and
even a sink changing the key length during a save are checked. Total equivalence
for arbitrary custom objects is **not** claimed: hashing is now required and
cache hits skip repeated arithmetic/comparison effects. Custom hash/equality,
unhashable key objects, dynamically replaced encoder functions and effectful
arithmetic are outside the ordinary-map contract. Negative integers already
cause nontermination in the original encoder and are deliberately neither run
nor repaired here.

## Reproduction

Use the existing `tools/requirements.txt` pin `bidict==0.22.0`, not the historical
pin in `tools/mapmerge2/requirements.txt`. From the repository root:

```sh
PYTHONPATH=tools python -B -m unittest mapmerge2.test_serializer_key_cache mapmerge2.test_remove_unused_keys
python -B tools/mapmerge2/benchmarks/serialize_keys.py --repeats 5
```

The focused suite has 18 tests, including 200 deterministic generated maps and
exact comparisons of return/exception type and arguments, diagnostics, full
output text and individual write chunks. It checks cache reuse and release after
normal returns and caught/discarded exceptions, as well as unchanged source maps.
It does not test externally retained tracebacks. The combined serializer/cleanup suite has 29
tests. These are Python tooling checks, not BYOND runtime or client acceptance.

`serializer_reference.py` preserves the two writer bodies verbatim from
`a529d4ddd18b3b0387829dcace31fad2887603c5`, whose complete `dmm.py` SHA-256 was
`ea4e8665ab6e7e1ff0ec45df5bfb9ef97dd36877e70466cbc7e63d63a45d455e`.
Reference function and unchanged helper hashes are checked before comparison.
The candidate side always invokes the actual imported production writer, not a
standalone imitation.

The benchmark reads three pinned tracked maps and writes only JSON to stdout.
It never calls `to_file` or writes maps. It checks input hashes before and after,
parsed-map immutability, and full exact output equality after every warmup,
timed call and memory probe. Timings include cache construction and the writer
to `StringIO`, but exclude parsing, presave checks, `getvalue`, validation and
filesystem I/O. Five samples per helper alternate baseline/current order, with
one warmup each; GC is disabled only during timed calls. Run on an otherwise
quiet machine and keep more than 10 GiB free.

Memory is measured in separate `tracemalloc` runs, including cache and output
allocations but excluding parsed maps and the later `getvalue` call. It is not
RSS, total map memory or game RAM. An additional untimed probe observes cache
hits/entries and release using a temporary factory patch. Timed and memory
measurements use unpatched production helpers. Raw samples, source/input hashes,
runtime, output hashes, allocation peaks and cache accounting are retained in
`serialize_keys_production_2026-10-22.json`.

## Recorded production comparison

Measured on 2026-10-22 with CPython 3.12.14 and bidict 0.22.0 in the restored
cloud checkout. These are newly recorded five-sample medians, not recovered
pre-reset estimates. Small/medium/large refer to actual input size and cells,
not a promise of representative user editing frequency.

| Tracked map | Format | Baseline | Production | Absolute saving |
|---|---|---:|---:|---:|
| roguetest: 61 KB, 5,000 cells | TGM | 4.804 ms | 3.405 ms | 1.399 ms |
| roguetest | DMM | 2.531 ms | 1.169 ms | 1.362 ms |
| rogueworld: 1.0 MB, 325,125 cells | TGM | 167.752 ms | 77.161 ms | 90.591 ms |
| rogueworld | DMM | 175.625 ms | 81.788 ms | 93.836 ms |
| deserttown: 4.6 MB, 589,000 cells | TGM | 569.133 ms | 305.167 ms | 263.966 ms |
| deserttown | DMM | 547.310 ms | 288.203 ms | 259.107 ms |

Observed encoder misses/cache entries were 248, 115 and 13,229 respectively,
versus 5,248, 325,240 and 602,229 original encoder calls. Deserttown therefore
reuses 589,000 encodings and retains 39,687 encoded-text characters during the
save, plus cache tuple/type/hash-table and Python string overhead. Its measured
incremental allocation peak **increased by 2,125,516 bytes** in both formats:
10,300,048 to 12,425,564 bytes for TGM and 8,003,680 to 10,129,196 for DMM.
The smaller maps' peak increases were about 19–39 KB. No memory reduction is
claimed; weak-reference probes confirm release after the measured successful
calls and the tests' caught/discarded exceptions, not while an external caller
retains a failed save's traceback.

All exact-output and unchanged-input checks passed. The small-map absolute
benefit is only about 1.4 ms. The larger savings apply to the serialization
helper, not parsing, full editing workflows, engine throughput or game RAM.
