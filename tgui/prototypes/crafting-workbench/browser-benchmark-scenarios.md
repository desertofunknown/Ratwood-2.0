# Disconnected browser benchmark scenarios

The shared opt-in harness accepts `window.workbenchBenchmark.run(scenario)`.
The visible Comparison tools selector exposes the same three scenarios; neither
control starts automatically, and both are disabled throughout a run. Errors and
raw JSON remain visible afterward. Reload before changing scenarios or returning
to design browsing; a prior selection is rejected rather than silently cleared.

- `catalog` is the default for `run()`. It retains the original 1,282 synthetic
  recipes, 40 mounted rows, blank search and no selection. Each iteration clears
  one successive visible recipe's material flag: recipes 0000 through 0034.
- `selected-first` selects Recipe 0000 by clicking its actual rendered row and
  awaiting a public adapter delivery/DOM commit before sampling. It remains the
  first of 40 rows, with its folio open.
- `selected-off-page` first performs the same click and commit. It then renames
  that same recipe object in source slot `Benchmark[0]`, retaining its path
  `/benchmark/recipe/0`, to `Recipe 9999 (selected off-page)`. The old craftability
  key is deleted and the new key initialized to 1 before another setup commit.
  The selected identity and folio survive, while rows 0001 through 0040 remain
  mounted and the selected row is off-page.

Both selected scenarios toggle the selected recipe's material flag 1→0→1 each
iteration; other flags stay at 1. This is intentionally a different mutation
pattern from catalog, not a directly comparable catalog result. Scenario,
mutation pattern, selected name/path/source slot and visible/off-page state are
included in the returned metadata. Before and after each timed delivery the
harness validates a mounted visible document, blank search, 40 rows and expected
selection. Selected checks also validate folio title, material status and the
visible expanded row (or its absence off-page). Invalid state, hidden transitions,
unmount and concurrent runs reject the whole result rather than return samples
from a partially invalid run.

Every scenario uses five warmups followed by 30 recorded samples, with the same
mutable data envelope, recipe array and craftability record delivered repeatedly.
Catalog has one untimed setup delivery, selected-first two, and selected-off-page
three. Setup clicks/commits are outside both clocks. `deliveryToCommitSamplesMs`
ends when the adapter's commit promise resolves; `samplesMs` additionally awaits
two animation frames. All 30 raw samples and outliers are retained. Neither clock
measures CPU, exact paint, startup, memory, native input latency or game timing.

For the guarded-Lua versus row-primitive-tracking A/B, build both arms from
identical shared harness, CSS, adapter, dependency and build inputs, changing only
the Lua renderer. Record those inputs/hashes and scenario with every result;
alternate arm order in the same visible supported client. Historical browser
measurements remain attached to their historical source and harness, not to this
extension. The synthetic-adapter tests verify harness sequencing/invalidation,
not actual React/Svelte/Lua behavior, browser pixels or native-client acceptance.
This tooling is sample-demo-only and creates no game UI/backend integration.

## Existing production-bundle correctness check

After building all three demos from the intended source, run from `tgui`:

```sh
bun run prototypes/crafting-workbench/browser-client-scenarios.ts
```

This explicit CLI requires existing `dist/demo.js`, `svelte/dist/demo.js` and
`lua/dist/demo.js`; it does not build anything and is not part of automatic test
discovery. It starts a fresh Bun child for each of the nine client/scenario pairs,
imports that actual production IIFE into Happy DOM, checks the installed harness,
selection/identity metadata, 40 rendered rows, 30 samples per clock, no backend
actions, and teardown. Visibility and animation frames are stubbed, clock reads
are fixed to zero, and network calls are rejected. It reports correctness only,
not real-browser timing, layout, paint or native-client acceptance. Record build
hashes separately; the check exercises the existing bundles, not unbuilt source.
