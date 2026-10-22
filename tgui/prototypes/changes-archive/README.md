# Disconnected Changes / archive candidates

Bounded new React and Svelte views only. Production Changelog, its route, archive validator/filter, styles, current public previews and crafting fixtures/builds remain unchanged. Nothing here launches BYOND, a browser, a listener, a service or a deployment. No startup/CPU/heap claim is made.

## Reproduce (build/check only)

From the repository root, using the existing pinned Bun 1.2.16 executable:

```
bun tgui/prototypes/changes-archive/build.ts
bun tgui/prototypes/changes-archive/test.ts
```

The Svelte compiler/runtime resolves to the already installed, pinned 5.57.2 package under `../crafting-workbench/svelte/node_modules`; React/ReactDOM/dateformat/js-yaml resolve to existing workspace installations. No dependency, lockfile or existing config changes are required. The build emits only ignored `changes-archive/dist/`; tests emit only ignored `.test-build/`. These commands do not start a preview server or open a browser. `dist/react/index.html` and `dist/svelte/index.html` are the two output pages for separately authorized review.

## Boundary and behavior

- `model.ts` imports the actual, unchanged production `archive.ts` and `filter.ts`. It provides the shared prototype-only injected loader/state controller and scalar row projection. No production state/backend/assets code is imported by a preview build.
- Source-order month choices and UTC date labels are retained. Days use reversed insertion order, not chronological sorting. Empty authors/days, empty rows, duplicate rows, hidden extra keys and scalar descriptions remain accepted. Booleans are searchable via the unchanged filter but render blank, as in React production.
- Six requests, the original 100/150/200/250/300/350ms delays, fresh asset resolution per attempt, captured per-generation action callbacks, stale fetch/body/rejection/timer fences, A→B→A races and unmount cancellation are preserved. Query survives selection/loading/errors; Clear focuses the emptied input; Enter/Escape blur it.
- Both views use the same native controls and shared external palette/control CSS, data, credits and loader. Native select is not represented as identical to the original custom Dropdown: an explicit `Retry this month` button appears only after terminal failure, preserving a same-month retry path even with one available month. Query survives that retry. Native semantic table-role rows use first-key category text (empty category displayed as `unknown`) rather than the original icon font. No fonts/images are included. These are intentional presentation differences, not a production replacement.
- Credits HTML is a trusted static fragment extracted from the original JSX, with no archive/user interpolation. `generate-credits.tsx` can regenerate it locally. Oracle tests compare normalized full credit text and ordered hrefs to actual production render. An outer note identifies these as historical upstream notices, not invented Tithewood support destinations. Credits remain available while loading, on error and without dates.
- `sample.ts` provides sample authors and in-memory request/asset functions only. The real network API is never used. Entry and each sample action/resolution/fetch refuse any present `Byond` or `hubStorage` property, even undefined. No custom native dispatch, host bridge or listeners exist. CSP denies connects/fonts/images/workers. Ordinary external historical credit links are retained; clicking them is user navigation, not sample delivery.
- Identical preview controls select success, retry (third attempt), failure (six attempts) or no archives. Load sample starts a clean sample; close/reopen cleans up and resets it. Two source-order months exercise navigation. Archive selection itself retains the query, while explicit sample replacement/reopen resets state.

## Evidence and limitations

`test.ts` isolates the original-component module mocks in their own process. It runs mounted React/Svelte Happy DOM comparisons (real compiled Svelte production client), then actual original `Changelog.getData` lifecycle comparisons, actual original-render credits/scalars comparison, and the existing unmodified validator/filter suites. The original class lifecycle oracle stubs only external dependencies and synchronous React state updates, not loader logic. It is not a browser screenshot/layout test or an emitted-bundle runtime benchmark.

No new framework performance conclusion follows from output byte counts. Native-host integration, full keyboard/browser fidelity, visual acceptance, actual browser compatibility and rollout remain separate gates. Source-level DOM checks do not substitute for later authorized browser review.

## Licensing and corresponding source

Derived game UI remains governed by the repository's license and historical notices. `dist/manifest.json` records resolved source hashes and dependency names/versions/licenses; `dist/licenses/` copies discovered dependency license files. `NOTICE.txt` states the distribution gate. Before any hosted preview or distribution, provide the exact corresponding repository source with these new files, unchanged imported source, dependency manifests/lockfiles, build instructions and all required notices/license texts. This local build is not a claim to be a complete legal distribution package and does not publish anything. No fonts, game imagery or other new binary assets are used.
