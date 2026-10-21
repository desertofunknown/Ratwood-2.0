# MiaCraft craftability lookup

From `tgui`, generate a disposable workload and run the benchmark:

```sh
python3 tools/extract-miacraft-workload.py /tmp/miacraft-fixture.json
bun tools/benchmark-miacraft-lookup.ts /tmp/miacraft-fixture.json /tmp/miacraft-results.json
```

The extractor reads explicit DM includes and current literal recipe inheritance,
excluding hidden, learned-only and tech-gated recipes. It is not a DM parser and
does not evaluate runtime changes, macros or conditionals. Its 1,282-recipe,
21-category workload at the parent revision `f37f615` approximates an ordinary
catalog; it is not a captured player payload or proof of runtime recipe order.
Craftability fractions of 0%, 10%, 50% and 100% are simulated deterministically.

The benchmark preserves the original category/recipe sorting, search filtering,
and strict name/value membership expressions. It compares those repeated scans
with a fresh Set and the actual `isRecipeCraftable` helper. Every iteration
includes entry-array/Set construction or a fresh predicate; no cross-render
cache is assumed. It covers only-craftable on/off, blank/topic searches and
closed/one-open/all-open categories. Closed categories do not mount recipe rows,
so the no-lookup path is included rather than assuming every row is visible.

## Measured result

A warm Bun 1.2.16 run used seven batches of 25 iterations per arm after 25 warmup
iterations, rotating arm order. With only-craftable enabled (the backend default),
closed categories and blank search, original batch medians were 7.121, 6.997,
6.404 and 4.081 ms for the four craftable fractions. Actual-helper medians were
0.217, 0.198, 0.350 and 0.555 ms, respectively: about 3.53–6.90 ms less derived-data
work per pass in these workloads. Individual batches varied with host/JIT/GC
conditions; these are not event-latency percentiles or universal speedups.

Full-list closed-category cases do no membership lookups, so no substantial gain
is claimed there. An eager Set adds unnecessary work in that case and is not used
in production. The retained direct lookup needs no index or invalidation cache.
This benchmark excludes React rendering, DOM/layout/paint, the BYOND client,
networking and server simulation. It does not establish FPS or native-game speed.

## Preserved behavior

The backend supplies a JSON name-keyed craftability record and ORs duplicate
recipe names. A match still requires a string name, an own enumerable property
and the numeric value `1`. Inherited/non-enumerable names, boolean `true` and string
`"1"` are not craftable. Prototype-like own names remain valid. No equivalence is
claimed for getters, proxies or data mutated during a render.

The per-render predicate stays fresh, preserving the previous memo dependency
invalidation, including same-reference updates between renders. Recipe ordering,
search behavior, grey/unavailable presentation and craft-action payloads are
unchanged. Pure tests compare against the original expression; mounted tests
exercise real categories, controls, backend updates and submissions with only
the native window shell replaced. Synthetic DOM coverage is not native-client
acceptance.
