# Disconnected Treasury Ledger candidates

New React and Svelte presentation candidates only. Production routes, native UI/backend, shared CSS, existing prototypes, dependency manifests and lockfiles are unchanged. Nothing here starts BYOND, a browser, a listener or a deployment.

## Build and check

From the repository root with the existing pinned Bun 1.2.16 executable:

```sh
bun tgui/prototypes/treasury-ledger/build.ts
bun tgui/prototypes/treasury-ledger/test.ts
bun tgui/prototypes/treasury-ledger/check.ts
```

Build first so inventory checks read current output. Only ignored `dist/` and `.test-build/` are emitted. React/ReactDOM resolve from the existing workspace; Svelte 5.57.2 resolves from the already installed `crafting-workbench/svelte/node_modules`. Both builds reuse unchanged `changes-archive/build-options.ts` plugins, not Changes models/controllers. No install or lockfile change is needed. Output pages are `dist/react/index.html` and `dist/svelte/index.html`; opening or hosting them is a separate authorization gate.

## Contract and intentional limits

- Source of truth: `packages/tgui/interfaces/StewardTrade/LedgerView.tsx`, `StewardTrade.tsx` ledger-tab effects, `StewardTrade/types.ts`, and `code/modules/roguetown/roguemachine/steward/steward_trade_tgui.dm`. The latter attributes its original economy port to Azure-Peak PR #7000.
- The two views are pure props. Shared controller/sample injection is prototype-only; neither browser bundle imports production runtime, backend, `useBackend`, `Window`, native transport or bridge code. Native type imports are erased. Presence of `Byond` or `hubStorage`, including inherited/undefined/window properties, rejects mounting and subsequent local actions/deliveries. CSP denies connects, fonts, images, workers and inline code/styles.
- Synthetic Crown records only, in append order. The sample reverses newest first, filters the entire record set on from/to/reason, then pages by the real 50-entry size. An oldest-only match proves filtering is not limited to the displayed page. JavaScript `trim`/case-insensitive literal substring matching is a sample convenience, not verified DM `findtext`/Unicode matching. The sample does not recreate treasury account visibility or authorization rules.
- Preserve original account display, reasons, amount suffix/signs (even unusual supplied numeric signs), unknown-kind fallback, duplicate rows, supplied page counts and disabled boundaries. Missing page says “Opening the ledger...”; actual empty and filtered-empty pages remain distinct. No extra balances, timestamps, permissions, error/retry states or fabricated economics are introduced.
- Search emits the latest untrimmed draft after 250 ms, not on mount. Clear replaces pending input through the same debounce; page/refresh do not clear the draft or cancel its timer. Open/close use the existing exact command names and payloads. Reopen resets draft/page/filter; disposal cancels pending local work, and prior-session callbacks cannot overwrite a new session. Every page delivery copies nested entries, including same-reference deliveries. Same-session deliveries are not response-ID-fenced because production has no such protocol.
- Clear invokes its existing callback once, then returns focus to that view's existing search input using an owned element reference. This is an intentional accessibility improvement over the original `LedgerView`, not exact keyboard parity. Input Enter/Escape behavior is unchanged.
- Both arms use identical external `tokens.css`, `controls.css`, `ledger.css` and `preview.css`. Conspicuous synthetic-only notice and fixture/lifecycle controls are outside the ledger in normal document flow. This is a presentation candidate: fixed column proportions and full amount wrapping intentionally differ from production automatic column sizing and nowrap amounts. Native geometry, pixel parity, full browser/keyboard fidelity and performance are not claimed.

## Evidence

`test.ts` runs one shared mounted React/Svelte journey and lifecycle harness, an isolated actual production `LedgerView` rendering/action oracle, build/source/license/CSP checks, and only the existing unchanged “Treasury ledger” cases in `steward-desk.test.tsx`. Actual-component mocks are isolated in their own process; the native transport is not loaded by the new oracle. Tripwires reject fetch, XHR, WebSocket, EventSource, workers and sendBeacon, with zero attempts during mounted flows.

The mounted harness runs compiled Svelte production client code in Happy DOM, not a browser or an emitted-bundle runtime benchmark. Installed Happy DOM 17.6.3 drops standalone `<tr>` template tags; `test-dom.ts` corrects only this test parser context using a table/tbody wrapper. Its regression checks preserve actual row/cell types, attributes and text, and unchanged ordinary templates. The correction is never bundled into either preview. Browser layout, compatibility, visual acceptance and native-host integration remain separate gates.

Separate mounted React and compiled-Svelte Clear regressions focus and activate the button, then check callback order/count, cleared draft, focus on the same owned input (not an unrelated search field), and exactly one empty filter at the 250 ms boundary. Before the focus correction, both cases failed because focus fell to `BODY`; the existing mounted lifecycle cases passed. These are Happy DOM regressions, not native-browser keyboard validation.

`check.ts` generates only ignored temporary configs. It runs strict TypeScript and Svelte diagnostics for the disconnected boundary, and checks the actual-component oracle with the existing workspace's non-strict native settings. It changes no existing compiler/build configuration.

## Licensing and corresponding source

Ratwood-derived work retains the repository GNU Affero General Public License v3 and original notices, including Azure-Peak provenance. `dist/manifest.json` records exact source hashes, build inputs and dependency names/versions/licenses; `dist/licenses/` copies dependency licenses and `dist/LICENSE.txt` preserves the repository license. `NOTICE.txt` states the distribution gate. No unrelated Changes support destinations or third-party art/fonts are copied.

Before any hosted preview/distribution, provide the exact corresponding public repository source checkpoint, these new files, unchanged shared inputs, dependency manifests/lockfiles, reproduction instructions and all required original notices/license texts. This local build does not publish anything and is not by itself a complete legal distribution package.
