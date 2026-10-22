# Disconnected production-bundler cost experiment

This is a **build-only feasibility and byte-cost measurement**, not a production
route, runtime benchmark, or rollout. It imports the real `tgui/rspack.config.ts`
after changing the working directory to `tgui`. No generated bundle is evaluated,
mounted, served, or sent to a native client. There is no network listener or new
dependency installation.

## Result

Measured against source `83cbb387801dbccfa0bc8614640217f9a13c2fb0`, with the
experiment source hashes in [measurement.json](measurement.json). The existing
standalone and bridge artifacts, components, adapters, styles, production config,
routes, packages, locks, DM, helpers, and production public outputs are unchanged.

The Svelte candidate **does build through production Rspack**, but adding it while
keeping the existing React application costs bytes. Its smaller standalone demo
does not translate into a production bundle saving.

| Addition/comparison                      | JS raw delta | JS gzip delta | CSS raw delta | CSS gzip delta |
| ---------------------------------------- | -----------: | ------------: | ------------: | -------------: |
| Ordinary → empty retention control       |          +48 |           +43 |             0 |              0 |
| Ordinary → React workbench               |      +11,544 |        +2,934 |        +6,503 |         +1,373 |
| Ordinary → React-hosted Svelte workbench |      +93,978 |       +25,995 |        +6,503 |         +1,373 |
| Empty control → Svelte candidate         |      +93,930 |       +25,952 |        +6,503 |         +1,373 |
| React workbench → Svelte candidate       |      +82,434 |       +23,061 |             0 |              0 |

The whole Svelte addition is **100,481 raw / 27,368 gzip bytes** above ordinary
production, including its host, lifecycle observer, model, adapter, compiled UI,
Svelte client/runtime, CSS, shim, and whole-build minifier/module-ID effects. It is
not an isolated runtime size. Compared with retaining the equivalent React
workbench, the additional implementation-choice cost is **82,434 raw / 23,061 gzip
bytes**, with identical CSS. The React component is a direct React boundary;
Svelte additionally needs its existing React ownership host and delivery adapter.
No new adapter was invented to force symmetry.

Exact popup asset totals (not deltas):

| Build arm        | tgui JS raw | tgui JS gzip | tgui CSS raw | tgui CSS gzip |
| ---------------- | ----------: | -----------: | -----------: | ------------: |
| Ordinary         |   1,235,058 |      309,447 |      386,967 |        68,789 |
| Empty control    |   1,235,106 |      309,490 |      386,967 |        68,789 |
| React workbench  |   1,246,602 |      312,381 |      393,470 |        70,162 |
| Svelte candidate |   1,329,036 |      335,442 |      393,470 |        70,162 |

The second production entry, `tgui-panel`, is byte-identical in every arm:
454,378 raw / 127,303 gzip JS and 80,305 raw / 14,451 gzip CSS. All 23 emitted
font files are also byte-identical. Production fonts and license handling were
not replaced or edited. Totals for every emitted file, including fonts, are in
the machine-readable report; a popup-only total must not be confused with both
application entries or with a standalone demo.

## Why this comparison is bounded and fair

1. **Ordinary:** the actual production configuration with only `output.path`
   redirected to the experiment's ignored output directory.
2. **Empty control:** the same configuration, appending a generated entry that
   assigns `null` to `globalThis.__TITHEWOOD_BUILD_ONLY_RETAIN__`.
3. **React:** the same appended entry position and global property, retaining
   `{ Component: CraftingWorkbench, observeWorkbenchLifetime }` and importing
   the untouched shared `workbench.css`.
4. **Svelte candidate:** the same descriptor keys, retaining
   `{ Component: ReactWorkbenchHost, observeWorkbenchLifetime }`, the same CSS,
   and the existing Svelte delivery adapter and components reachable from that
   host. A scoped `.svelte` rule is the only compiler integration addition.

The observable global assignment deliberately prevents elimination of the
candidate. It is artificial instrumentation, not a route registration, and is
never executed. Ordinary → candidate is the deployment-shaped **add-on** delta;
control → candidate is a diagnostic comparison, not a magic subtraction of all
instrumentation effects. Existing production interfaces, including MiaCraft,
remain present in every build. This does not measure replacing an old interface.

The loader uses the installed official Svelte 5.57.2 `compile` API with exactly
`generate: 'client'`, `dev: false`, `css: 'external'`, and `runes: true`. Compiler
warnings and unexpected component CSS fail the build. Compiled JavaScript then
passes through the existing production SWC loader chain, rather than bypassing
it because the filename ends in `.svelte`. All existing target, optimization,
minifier, extraction, resolution, image/font asset rules, and aliases are kept.
The target remains `web` / `browserslist:edge >= 123`.

No SvelteKit, new application server, framework plugin, external-React API,
new lazy chunks, or changed asset-delivery protocol is introduced. A separate
Svelte artifact with external React was not estimated: production does not
expose React as a suitable standalone module/global contract.

## Verification and attribution

- A fresh genuine Rspack CLI build with its supported `--outputPath` override
  is byte-for-byte identical to the ordinary programmatic build for all 27
  emitted files. Those files also match the existing public artifacts exactly.
- The ordinary full `tgui:build` helper-preparation step is intentionally not
  rerun because it writes production `public/helpers.min.js`. Rspack itself is
  run unchanged, and the complete public tree is hashed before and after.
- All 627 pre-existing tracked `tgui` files are hashed before and after. Common
  compilation inputs are checked for identical hashes between arms. The two
  package locks, compiler/config source, dependency package metadata, and native
  Rspack binding binary are recorded.
  The only tracked-file exclusion is this experiment's own `measurement.json`,
  which is intentionally refreshed after those checks. Once tracked, the
  experiment's source, tests, and documentation are protected like other inputs.
- Graph evidence confirms the host, lifetime observer, adapter, Delivery,
  Workbench, shared model/CSS, Svelte browser entry, and client rendering module
  belong to emitted chunks. Concatenated children can still have `orphan: true`;
  their emitted parent/chunk and used exports are retained in the evidence.
  Static strings in the minified output independently confirm the retention
  descriptor, host container, observer, and workflow. Nothing is evaluated.
- The original `webpack`, `production`, `browser` conditions resolve Svelte to
  `index-client.js`; active graph reasons resolve `esm-env/development` to
  `false.js` and `esm-env/browser` to `true.js`. The compiler, server entry, demo,
  fixtures, and browser timing harness are absent from emitted candidate code.
- The candidate reuses one existing React package, rather than introducing a
  duplicate React. New dependency package paths in the emitted graph are Svelte
  5.57.2 and esm-env 1.2.2. Their installed MIT license notices are copied intact
  beside the ignored build evidence. No vendored runtime source is committed.
- `addedModuleAttribution` lists added leaf graph records and their transformed,
  **pre-minification** sizes. These are not exact minified package contributions
  and cannot be added up to explain gzip deltas. Whole-asset measurements are
  the authoritative byte comparison.
- Four loader tests pass: existing components match the official compiler API,
  compiler warnings fail, unexpected scoped CSS fails, and invalid Svelte fails.
  All four builds and the CLI equivalence assertion pass with zero build
  warnings. Node's harmless typeless-package warning is visible, not suppressed.

Measured toolchain: actual Node 24.19.0, zlib `1.3.2.1-motley-3246f1b`,
Rspack core/CLI/native binding 1.4.3, Svelte 5.57.2, css-loader 7.1.2,
sass-loader 16.0.5, and sass-embedded 1.89.2. The runner rejects Bun execution;
all assets use the same real Node `gzipSync` at level 9, independently per file.
Gzip is an offline comparison encoding, not verified BYOND wire compression.

## Reproduce

Use the already installed dependencies and Node 24 from this `svelte` directory:

```sh
node --test bundle-experiment/loader.test.mjs
node bundle-experiment/run.mjs
node node_modules/prettier/bin/prettier.cjs --check \
  bundle-experiment/run.mjs bundle-experiment/svelte-loader.cjs \
  bundle-experiment/loader.test.mjs bundle-experiment/README.md
```

Each run creates a new ignored `.generated/<timestamp>/` directory, with per-arm
assets, full stats, normalized configuration, flattened module evidence, input
hashes, CLI verification log, intact new-runtime license notices, and a report.
Generated retention entries also stay ignored. `measurement.json` is the compact
JSON result intended for review; **each rerun intentionally replaces it** with
the new measurements and evidence paths. It uses ordinary two-space
`JSON.stringify` formatting. All outputs stay under this experiment. No output is cleaned from
another directory. The runner checks that more than 10 GiB free remains.

## What this does not establish

This closes only the bounded production-bundler feasibility and marginal-byte
question. It does not measure startup, CPU, heap, DOM/rendering, input latency,
paint, native focus, lifecycle correctness, real asset-loader recovery, or
supported DreamSeeker/WebView2 behavior. Earlier browser timing and disconnected
bridge results remain separate evidence. The checked-in older client minimum
versus Edge 123 target policy mismatch remains unresolved. No production
activation, migration, framework-wide winner, or native acceptance follows.

References: [Svelte compiler API](https://svelte.dev/docs/svelte/svelte-compiler),
[Rspack compiler API](https://rspack.rs/api/javascript-api/compiler),
the actual [production configuration](../../../../rspack.config.ts), and the
unchanged [bridge contract](../BRIDGE-HARNESS.md).
