# Hosted row-value comparison (2026-10-22)

The [retained-row primitive tracking experiment](row-value-experiment.md)
reduced pooled median delivery-to-DOM-commit time in all three tested scenarios.
The selected-off-page gain was smaller, and its P90 and maximum were worse.
React and Svelte remained faster in this synthetic workload. Keep the measured
Lua improvement, but do not treat it as a framework, language or native-game win.

[All raw results and provenance](browser-row-value-results.json) retain 36 runs,
1,080 samples per clock, original per-run sample order and metadata, every outlier,
source/artifact hashes, and independently recomputed per-run/pooled statistics.
The report below rounds values for readability; the JSON retains recorded precision.

## Exact measured builds

Candidate/shared source is
[`f796d58e5126b6e88d3fa61e3a91f952dba26731`](https://github.com/desertofunknown/Ratwood-2.0/commit/f796d58e5126b6e88d3fa61e3a91f952dba26731).
The `lua-row-baseline` arm substitutes only the exact `workbench.lua` from
`fe543e16f56032100b197f3d9452767a1db56e5b`. Both Lua arms use the same f796d58e
harness, adapters, model, fixture, styles, build code and pinned dependencies.
Only `workbench.lua` differs among their twelve recorded source inputs. This is
a matched hybrid baseline, **not a whole fe543e build** or the historical
`lua-baseline` artifact. React and Svelte were freshly measured with the same
f796d58e harness, styles and scenario definitions.

All listed source hashes were independently checked against these Git objects;
artifact hashes and bytes match hosting commit
`fe7baee04c6dac51e5a5aa79fc224327d26572b0`, Site version 6, deployment
`appgdep_6ad9d02bca148191bb41335464497296`. The
[sample-only preview](https://ratwood-crafting-comparison-20261022.bloomy-pixie-6942.chatgpt.site)
is a mutable URL: these observations attach to the recorded hashes, not a future
version served there. No new build or deployment was used to assemble this report.
The JSON distinguishes build-generated manifests from the React source manifest
reconstructed from the measured Git source.

| Arm                     | Measured `demo.js` SHA-256                                         |
| ----------------------- | ------------------------------------------------------------------ |
| Lua guarded baseline    | `5f24c3bb6357c91a86bb7c6dd02fab7abbb5fa9c022ac55d3e2aaf7c1cf0aa62` |
| Lua row-value candidate | `92c28a8f10338b017dcebf3431790bc6bd0fd355825548572c1e256a47db406a` |
| React                   | `694f76abd53326f35caaa1bb8eb5ed97cb326f383b77a55a691590a5ff0a6211` |
| Svelte                  | `25a1f30ae1d7071640bf8c961b31f94ed2813d223ea6a37567c8f6d2ac0964f9` |

Lua here is Fengari 0.1.5 plus interop 0.1.4: Lua 5.3 implemented in JavaScript,
not WebAssembly, Wasmoon or native LuaJIT. Its source is parsed at mount. The
measured change avoids repeated conversions and DOM reads for unchanged
renderer-owned row fields; it is not a language-only comparison.

## Method

- Measured 22 October 2026, approximately 08:59–09:01 UTC, in the same visible
  cloud Chromium, reported Chrome/155.0.0.0 on Linux x86_64. The reduced user agent
  does not expose the installed patch version. Content viewport: 1180×757 CSS
  pixels, 100% zoom. CPU model, device scale factor and power settings were not
  recorded; the shared machine was not resource-isolated or exclusively reserved.
- Four arms × three scenarios × three rounds = 36 runs. Each run used a fresh
  navigation, five warmups and 30 measured updates. Navigation does not imply
  a cold cache. All runs were triggered by the visible comparison controls.
- The arm order for each scenario was baseline/Lua/React/Svelte, then
  Lua/React/Svelte/baseline, then React/Svelte/baseline/Lua. Three rotated rounds
  are not a fully counterbalanced four-arm design.
- Every scenario uses 1,282 synthetic recipes, 40 mounted rows and repeated
  delivery of the same mutable envelope, recipe array and material record.
  `catalog` has no selection and clears successive visible material flags.
  `selected-first` keeps Recipe 0000 selected on-page; `selected-off-page`
  keeps that identity and folio after renaming it outside the first page.
  Both selected scenarios toggle the selected material flag on each iteration.
  Different mutation patterns must not be treated as the same workload.
- Setup clicks/deliveries are excluded. The harness asserts visible mounted
  state, row count and expected selection/folio/material state around updates.
  All 36 records pass metadata/sample-count validation. See the precise
  [scenario definitions](../browser-benchmark-scenarios.md).

`deliveryToCommitSamplesMs` is wall-clock delivery through the adapter's
DOM-commit acknowledgment: React uses `flushSync`, Svelte awaits `tick`, and
Fengari completes its synchronous renderer. It includes promise scheduling and
any competing browser work, not isolated CPU time. `samplesMs` retains the
broader interval through two animation-frame waits, not exact paint duration.

## Delivery-to-DOM-commit observations (milliseconds)

Each cell pools 90 samples. Medians average the middle pair. P10/P90 use the
nearest-rank method: sort ascending and take 1-based rank `ceil(p × n)`;
for 90 samples these are zero-based indices 8 and 80. No sample is removed.
The JSON also reports minimums, both clocks' spreads, and every per-run summary.

| Scenario          | Arm           | Run medians           | Pooled median | P10–P90     | Maximum |
| ----------------- | ------------- | --------------------- | ------------: | ----------- | ------: |
| Catalog           | Lua baseline  | 8.15 / 10.55 / 5.65   |          8.20 | 4.80–15.80  |   36.60 |
| Catalog           | Lua candidate | 5.00 / 4.15 / 4.75    |          4.85 | 2.90–10.10  |   20.90 |
| Catalog           | React         | 1.90 / 1.30 / 1.45    |          1.45 | 1.10–3.00   |    7.30 |
| Catalog           | Svelte        | 1.55 / 1.60 / 1.00    |          1.30 | 0.90–2.70   |    3.70 |
| Selected first    | Lua baseline  | 6.30 / 6.90 / 7.65    |          6.80 | 4.50–15.10  |   73.90 |
| Selected first    | Lua candidate | 3.60 / 4.95 / 3.70    |          3.85 | 3.00–8.90   |   26.10 |
| Selected first    | React         | 1.55 / 1.50 / 1.20    |          1.40 | 1.00–2.20   |    4.00 |
| Selected first    | Svelte        | 1.20 / 1.15 / 1.10    |          1.10 | 0.90–1.60   |    2.80 |
| Selected off-page | Lua baseline  | 14.30 / 14.95 / 16.05 |         14.95 | 11.90–20.00 |   40.50 |
| Selected off-page | Lua candidate | 11.90 / 14.15 / 14.55 |         13.20 | 9.80–21.80  |   42.40 |
| Selected off-page | React         | 1.40 / 1.60 / 1.90    |          1.60 | 1.20–2.60   |   11.30 |
| Selected off-page | Svelte        | 1.15 / 1.40 / 1.40    |          1.30 | 1.00–2.00   |    3.60 |

Lua's pooled median fell approximately 41% for catalog, 43% for selected-first,
and 12% for selected-off-page. The off-page tail did **not** improve: P90 rose
from 20.00 to 21.80 ms and maximum from 40.50 to 42.40 ms. These descriptive
observations support retaining the optimization, not a universal speedup or
latency guarantee. The remaining off-page work is not evidence about native LuaJIT.

The two-frame pooled medians lie between 33.10 and 33.20 ms for every cell,
consistent with a large frame-scheduling component. Their retained maxima include
203.80 ms for off-page Lua and 129.20 ms for off-page React. Neither two-frame
scheduling nor the maxima may be relabeled as renderer CPU cost or exact paint.

## Standalone artifact bytes for these hashes

All arms use Bun 1.2.16 production/minified IIFE output and identical external
CSS. React is 19.1.0; Svelte is 5.57.2 with production client compilation. Gzip
uses the same Node 24.19.0 `node:zlib` level-9 compressor, separately per file
(zlib 1.3.2.1-motley-3246f1b). These bytes were independently recomputed from the
recorded hosted artifacts, not extrapolated from an older controls-free build.

| Standalone demo JavaScript | Raw bytes | Gzip bytes |
| -------------------------- | --------: | ---------: |
| Lua guarded baseline       |   237,006 |     78,650 |
| Lua row-value candidate    |   237,778 |     78,839 |
| React                      |   201,301 |     64,106 |
| Svelte                     |    77,053 |     28,621 |

All four share the same 7,541-byte workbench CSS and 1,623-byte demo CSS
(2,062 and 705 bytes gzip respectively). No font files are redistributed.
These include each standalone runtime, fixture, adapter and benchmark controls.
Production already loads React; this table is **not the marginal cost of a
Svelte island**, nor the amount of production JavaScript a migration would save.
The existing production UI and its dependency graph remain unchanged.

## Provisional assessment and remaining gates

Svelte is the provisional browser-integration candidate because its standalone
artifact is smaller and its tested wall-clock update results are favorable.
That is enough to investigate an isolated protocol-preserving adapter, not to
activate it or declare a final framework winner. React/Svelte pooled median gaps
are only 0.15–0.30 ms here, distributions overlap, and individual run medians can
reverse their order. Shared-cloud noise, timer granularity and only three rounds
limit conclusions. Pooled samples are not independent experimental replicates;
no statistical-significance or population-performance claim is made.

Retain the Lua experiment and these measured gains. Further tuning solely to
force Lua to win is not the next step. Keep React as the production baseline,
test the isolated Svelte adapter against the existing transport/lifecycle/action
contract, then require native-client acceptance and measure actual integration
cost before a separate activation decision. This is not a framework-wide rewrite.

No startup, CPU, heap, exact paint, input latency, game FPS, native BYOND or native
LuaJIT result follows. Nor does a timing table establish AAA visual quality.
Historical scan-guard and earlier React/Svelte timing series are not pooled here.
This iteration checked benchmark state and a final off-page screenshot only:
earlier full layout/focus QA belongs to fe543e, not a new all-layout certification
of f796d58e. The prior minor focus-outline edge limitation is not claimed resolved.
Keep the [staged architecture and acceptance gates](../../../docs/ui-modernization.md),
project credits and licenses intact.
