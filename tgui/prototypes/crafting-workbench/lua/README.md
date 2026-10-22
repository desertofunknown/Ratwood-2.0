# Browser-Lua crafting workbench comparison

This isolated prototype is one evidence-gathering browser-Lua candidate, not a
migration and not a verdict on native LuaJIT, other Lua/WASM implementations, or
in-game performance. It has no BYOND bridge, server connection, save access, or
network actions. Production game source, root dependencies and root lockfile are
unchanged by this subproject.

## Implementation boundary

- `workbench.lua` owns local search/category/pagination/selection state, event
  behavior, DOM creation and keyed updates, recipe details, focus and scroll.
- `adapter.ts` loads one real Fengari VM per mounted workbench, delivers data and
  actions, and closes it. Its small event bridge retains the exact JavaScript
  listener identity: Fengari wraps a Lua function anew when converting it to JS.
  The bridge also ignores detached controls and delays VM close until any active
  Lua callback has unwound. Unmount removes DOM/listeners synchronously.
- The exact shared `../model.ts` remains JavaScript deliberately, so all three
  candidates use the same sorting, search, identity and strict material-hint
  rules. This isolates the UI implementation rather than comparing different
  catalog algorithms. Lua explicitly converts the boolean/number material flag
  to JS-compatible truthiness, including 0 and NaN.
- `demo.ts` only builds the shared demo shell and records/simulates acknowledgment
  of actions. No React or Svelte runtime is in the Lua production demo.
- The exact shared `workbench.css`, `demo.css` and fixture are used. All three
  standalone previews use the same Georgia / Times New Roman / serif system-font
  stack, with no bundled font files. Production game assets remain unchanged.
  `installBenchmark(adapter, true)` installs the same opt-in visible benchmark
  control as the other demos. Nothing runs automatically.

The Lua renderer is manually written, not a framework-generated reconciler.
Rows are keyed by shared recipe identity; unchanged rows/details/control nodes
are retained, and text/attributes are only rewritten when changed. The selected
folio is replaced when its identity changes, removing its old event handlers.
This saves unnecessary DOM replacement but adds handwritten lifecycle code and
maintenance cost. It is not a claim that manual Lua rendering is better.

Lua source is bundled as text and parsed at each mount. The transfer total
includes the complete browser-target Fengari VM, its standard libraries and
interop, not just the Lua UI. Startup/parsing, memory, input latency and game
integration are **not measured** by the shared update harness. It separately
records delivery-to-DOM-commit and two-animation-frame wall-clock intervals,
not CPU or exact paint time. No libraries are stripped to improve reported size. Lua package file
searchers are disabled because all code is bundled and the demo needs no
runtime module fetches. Interop has DOM/global access; this is **not a security
sandbox**.

## Pinned dependencies and sources

Verified against the official npm registry and upstream repositories on
2026-10-22:

- `fengari@0.1.5`, MIT, [official source](https://github.com/fengari-lua/fengari).
  Implements Lua 5.3 semantics in JavaScript. This is not native LuaJIT.
- `fengari-interop@0.1.4`, MIT,
  [official source](https://github.com/fengari-lua/fengari-interop).
- Fengari's bundled string-formatting dependency `sprintf-js@1.1.3`, BSD-3-Clause.
  Node-only `readline-sync@1.4.10` and `tmp@0.2.7` are locked but eliminated from
  the browser bundle.
- Bun `1.2.16`, TypeScript `5.8.3`, Prettier `3.6.2`.

`bun.lock` records exact registry integrities. Browser defines follow the
[official fengari-web build](https://github.com/fengari-lua/fengari-web/blob/master/webpack.config.js):
Fengari configuration is absent and Node-only paths are eliminated. No eval of
JavaScript or remote Lua source is needed.

`build.ts` copies complete Fengari, interop and sprintf-js licenses into
`dist/THIRD-PARTY-NOTICES.txt`, plus the repository's unchanged root license and
README for original project attribution. The repository's blanket asset notice
and font-specific metadata are not treated as interchangeable: the original
pterra.ttf identifies Gravy Fonts / Margo Chase Design and says all rights
reserved, whereas the repository README gives a blanket CC BY-SA asset notice
unless otherwise indicated. Rather than assume redistribution permission, all
three standalone previews omit the repository font files and use identical
system-font fallbacks. The original game fonts are untouched. This preview-only
substitution must not be mistaken for production typography validation.

## Reproduce

Use Bun 1.2.16. Restore the existing root dependencies and sibling Svelte test
fixture dependencies with their frozen lockfiles first, then this subproject:

```sh
cd tgui
bun install --frozen-lockfile --ignore-scripts
cd prototypes/crafting-workbench/svelte
bun install --frozen-lockfile --ignore-scripts
cd ../lua
bun install --frozen-lockfile --ignore-scripts
bun run test
bun run check
bun run format:check
bun run build
```

The isolated dependency installation changes no root package/lockfiles. The test
bundle includes the existing React and Svelte clients for parity assertions;
they are **not** included by the production demo build. Lua source is compiled
and executed by Fengari in both tests and the actual browser bundle.

## Verification and limits

`mounted-checks.ts` executes the production browser-target VM in Happy DOM and
covers the existing 18-test parity surface plus Lua-specific lifetime and
conversion regressions:

- Exact action paths and default/batch/repeat payloads, controlled material
  toggle acknowledgment, strict hints, 0/1/NaN conversion and 0/null text.
- Same-name variants, special characters, Unicode search, removed categories,
  removed/replaced selections and in-place delivered record updates.
- 1,282 rows, initial 40-row page, expansion/reset, HTML button/handler semantics,
  repeated keydown suppression, focus/scroll restoration and repeated open/back.
- Normalized React/Svelte/Lua DOM hierarchy, classes, text, values and ARIA.
- Keyed DOM retention, independent VM instances, synchronous acknowledgment,
  exact listener add/remove identity, stale detached buttons, idempotent unmount
  and callback-driven unmount without closing an active VM stack.
- Error-event capture ensures Happy DOM cannot silently log post-close VM
  exceptions while a test still reports success.

Happy DOM is not a layout engine and does not establish actual browser keyboard,
paint, memory or speed results. Hosted browser QA is a separate gate. The build
uses the same Bun browser/IIFE/production/minified conditions, external CSS,
fixture and harness as the framework demos. `dist/bundle-sizes.json` records
source SHA-256 hashes and raw/gzip-9 sizes with the same compressor per file.
Those are transfer bytes, not evidence of render speed. License files are
shipped alongside the demo and are not requested at initial page load.
