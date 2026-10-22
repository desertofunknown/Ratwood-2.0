# Crafting workbench comparison

Experimental, disconnected UI candidates. No production interface, DM action,
asset registration, package manifest or lockfile is changed. All displayed demo
recipes are illustrative. All three previews use the same system serif font stack
(Georgia, Times New Roman, serif), with no redistributed font files. This
preview-only substitution avoids an ambiguous license notice in the inherited
Pterra font. Production game fonts and their attribution are unchanged.

## Reproduce the React baseline

From `tgui`, using the repository's Bun 1.2.16 and frozen dependencies:

```sh
bun install --frozen-lockfile --ignore-scripts
bun test prototypes/crafting-workbench/model.test.ts prototypes/crafting-workbench/Workbench.test.tsx
bun x --no-install tsc --project prototypes/crafting-workbench/tsconfig.json --noEmit
bun run prototypes/crafting-workbench/build.ts
```

The last command produces an ignored `dist/index.html`; it starts no server and
imports no BYOND connection. The Svelte comparison has an isolated pinned
subproject in `svelte/`. It shares the data model, styles, fonts and sample data;
its dependencies are not added to the production application.
The [browser-Lua candidate](lua/README.md) is likewise isolated and uses the same
model, assets and actions. It runs Lua through Fengari, not native LuaJIT.

## What to compare

Use the same visible browser/client, viewport, device scale, fonts, machine and
power settings, with no unrelated tabs or development instrumentation. Record
OS, CPU, browser/WebView2 version, commit, dependency versions and build hashes.
Use minified production builds, not development versus production. Alternate
candidate order and retain every sample, median and spread rather than selecting
the best run. Compare fresh/cold contexts separately from warmed interactions.

The [JS Framework Benchmark](https://github.com/krausest/js-framework-benchmark)
provides useful methodological examples: common DOM/CSS, correct keyed identity,
visible browser execution and separate CPU/startup/memory cases. Its generic
rankings are not measurements of this game. All candidates here retain keyed
recipe identities and perform the same interactions.

Measure separately:

- Raw and gzip JS, CSS and fonts, without counting shared assets twice. Standalone
  React versus standalone Svelte is not the incremental cost of a Svelte island
  inside an application that still loads React elsewhere.
- Cold navigation through first usable controls, downloaded bytes and browser
  scripting/layout/paint traces. Repeat with warm cache and report cache policy.
- Search typing/clearing, category/filter change, open/back, show more, same-object
  backend updates, selected recipe removal and repeated teardown/remount.
- Heap snapshots after equivalent settled work and after teardown, with the same
  collection procedure. DOM node counts are not heap memory measurements.
- Real keyboard activation/focus, narrow and wide layout, 200% zoom, long text,
  short windows and theme contrast; then native window/bridge lifecycle.

The collapsed “Comparison tools” panel provides a visible run button and raw JSON
results for supported browser testing. Nothing runs automatically; the button is
disabled during a run, failures are shown, and the panel is removed on teardown.
It replaces the sample catalog, so reload before returning to design browsing.

`deliveryToCommitSamplesMs` measures wall-clock time until the adapter's update
promise resolves after its DOM commit. React uses `flushSync`, Svelte awaits
`tick`, and Lua completes its synchronous renderer; this is the standalone
adapter boundary, not native game scheduling. `samplesMs` retains the broader
interval through two animation frames. Both arrays contain the same 30 measured
iterations after five warmups. The first metric excludes those frame waits, but
still includes promise scheduling and any unrelated browser work; neither is
CPU time or proof that pixels have painted.
The same panel and layout are used in each candidate.

Each demo exposes `window.workbenchDemo` (update, unmount, captured actions) and
an opt-in `window.workbenchBenchmark.run()`. The latter applies identical
synthetic 1,282-recipe snapshots, including nested in-place updates, with five
warmups and 30 samples. It returns raw update-through-two-animation-frame times
and environment metadata. It does not claim exact paint duration, startup,
input latency or memory. Run it only in an authorized supported visible browser;
keep the returned JSON with the build hashes. It deliberately runs no network
requests and starts no automatic benchmark. For real search/craft interactions,
use the displayed controls and capture a browser performance trace.

## Current evidence boundary

Mounted tests use Happy DOM: they cover DOM events, action payloads, filtering,
focus bookkeeping and stale selections, not rendered pixels or native keyboard
activation. This environment has not produced a usable browser screenshot or
browser performance result. Startup, render/update speed, heap cost and native
client acceptance remain unmeasured. Do not choose a framework on bundle bytes
alone or call a synthetic DOM benchmark a browser benchmark.

`benchmark.ts` is a separate warm Bun derived-data cost check against the current
category/filter/search expressions. It compares ordered identities across 24
cases using a source-derived recipe catalog and explicitly synthetic ingredients
and material distributions. The prototype also computes advisory hints, so the
work is not an identical rendering pipeline. This is neither React-versus-Svelte
performance nor evidence of game FPS. Shared data logic avoids attributing an
algorithm change to the framework.

See [the staged architecture assessment](../../docs/ui-modernization.md) for the
transport, chat, skin/HUD, client-support and rollout boundaries.

### Derived-data observation (Bun 1.2.16)

The source extractor at main `4c2e57966c6875e50edda2e789508776c96bcc60`
produced 1,282 recipes in 21 categories. One local warm run (20 warmups,
7 alternating batches of 40 passes per arm) verified all 24 ordered-identity
cases. Case medians were 0.213–0.830 ms for the reference expressions and
0.664–1.016 ms for the prototype pipeline; the largest prototype penalty was
0.565 ms. This additional work includes preparing advisory hints and identities.
It is a small measured derivation cost, not a performance improvement and not a
framework verdict. Reproduce rather than generalize these machine-specific
numbers; browser rendering remains the important missing measurement.

```sh
python3 tools/extract-miacraft-workload.py /tmp/crafting-fixture.json
bun run prototypes/crafting-workbench/benchmark.ts /tmp/crafting-fixture.json /tmp/crafting-derived-results.json
```

### Matched standalone build observation at `e93f118`

Both arms use Bun 1.2.16, minification, IIFE browser output, production conditions,
identical shared CSS/fonts/fixture, and the opt-in harness. React is 19.1.0;
Svelte is 5.57.2 with production client compilation and external CSS.

| Standalone demo JavaScript | Raw bytes | Gzip level 9 bytes |
| -------------------------- | --------: | -----------------: |
| React                      |   198,102 |             63,008 |
| Svelte                     |    73,852 |             27,543 |

Compressed sizes use the same `node:zlib` `gzipSync` implementation/options for
both artifacts (Node 24.19.0; zlib 1.3.2.1-motley-3246f1b), not mixed compressors.
CSS and each font were hash-identical between builds and are excluded from this
JS-only table. The smaller Svelte artifact is a concrete reason to continue the
comparison, not proof of lower browser CPU or heap usage. Bun retains some
inactive Svelte diagnostic branches despite the production setting; this is not
a claim about the smallest output another bundler could produce. No production
React cost is removed by this disconnected prototype.

### Three-candidate build observation with visible controls

All three current demos share the visible comparison panel, system-font CSS,
sample catalog and action contract. No font files are redistributed. Using the
same Node 24.19.0 gzip-9 compressor for each artifact:

| Standalone demo JavaScript | Raw bytes | Gzip level 9 bytes |
| -------------------------- | --------: | -----------------: |
| React                      |   199,153 |             63,407 |
| Svelte                     |    74,905 |             27,930 |
| Browser Lua (Fengari)      |   234,796 |             77,928 |

Lua includes its VM, interop and Lua source, which is parsed at mount. It is not
native LuaJIT. The shared CSS adds the same bytes to every candidate; these are
JS-only transfer measurements, not startup, update CPU, memory or game-speed
results. Regenerate sizes and hashes before hosted comparisons, and do not mix
these controls-enabled builds with the earlier controls-free snapshot.

The Lua candidate now skips selection lookup when nothing is selected. The
[isolated experiment](lua/selection-scan-experiment.md) records exact VM property
read counts, selected-state parity, and separately labeled local timing samples.
The [hosted browser A/B](lua/browser-selection-scan.md) subsequently measured the
neutral-state improvement with all raw samples retained. This is not a framework
verdict or a selected-state/native-game performance claim.

All candidates share a [short-height layout adjustment](short-height-layout.md)
for high zoom and small windows. Its browser scrolling/focus acceptance checklist
is separate from the mounted DOM tests.
