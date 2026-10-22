# Disconnected Display & Readability candidates

A bounded Graphics / Visuals presentation candidate, not a replacement for the
whole Toggles menu or a framework decision. React remains the production
baseline; Svelte is provisional. Production, the native backend, shared tokens,
existing previews, manifests and lockfiles are unchanged. Nothing here starts a
browser, game server, native compiler, listener or deployment.

## Build and check

From the repository root using existing pinned Bun 1.2.16:

```sh
bun tgui/prototypes/display-readability/build.ts
bun tgui/prototypes/display-readability/test.ts
bun tgui/prototypes/display-readability/check.ts
python3 tgui/prototypes/ui-shared/check_parity.py
```

Build first for current inventory checks. Only ignored `dist/` and `.test-build/`
are emitted. React/ReactDOM resolve from the existing tgui workspace; Svelte
5.57.2 and svelte-check resolve from the already installed
`crafting-workbench/svelte/node_modules`. Both arms reuse the unchanged
`changes-archive/build-options.ts` compiler plugins, not Changes/Treasury state
or application logic. No install or lockfile change is needed. Candidate pages
are `dist/react/index.html` and `dist/svelte/index.html`. Building does not host,
publish or activate them.

## Existing contract, intentionally preserved

The authority is `packages/tgui/interfaces/ToggleOptionsMenu.tsx` and
`code/modules/client/preferences_toggles.dm`, with palette values/labels from
`code/__DEFINES/hud.dm` and `code/_onclick/hud/hud.dm`.

- Only ordered Graphics and Visuals: 13 toggle rows and one HUD palette. Source
  labels, descriptions, enabled polarity and option order are unchanged. Other
  categories and all character-sheet/chat-panel preferences remain outside scope.
- Data is ordered categories with entries `{ id, label, enabled, desc }` and
  optional selects `{ id, label, value, desc, options: [{ label, value }] }`.
  Pure `ReactView` and `SvelteView` receive `data`, `onToggle(id)` and
  `onSelect(id, value)` only.
- Exact actions are `toggle` with `{ id }` and `select` with `{ id, value }`.
  Repeated toggles remain repeated commands. Clicking the already-selected
  palette still emits once. There is no desired boolean, debounce, batching,
  fabricated request/response ID, Save/Apply/Reset, error result or save receipt.
- Only delivered state is displayed. Each delivery copies categories, entries,
  selects and options, including mutated same-reference input. Unchanged and
  older-looking same-session deliveries remain authoritative. Local close/reopen
  fences former subscriptions but emits no invented backend lifecycle commands.
- In the actual game, all included controls except TGUI Multiline invoke account
  preference saving. TGUI Multiline affects the current mob only. The display
  cannot verify disk-save success, and a changed delivery is not a save receipt.
  No character slot is changed by this prototype.

## Presentation and sample behavior

The two arms use identical external, unchanged `ui-shared/tokens.css` and
`controls.css`, then local `settings.css` and `preview.css`. Native buttons keep
source labels as accessible names, explicit visible On/Off text, `aria-pressed`,
visible associated descriptions, category names and a labelled palette group.
Selected options remain enabled. Layout wraps naturally and the whole document
scrolls for narrow/short windows, without a fixed footer, overlay or hidden
scroll region. This is not a native geometry or pixel-parity claim.

Synthetic fixture states are not defaults or user settings. The conspicuous
sample controls live in normal document flow. Activating a candidate control
queues a sample state; “Deliver next sample update” releases the next delivery.
This exposes the no-optimistic-update contract. Repeated activations enqueue
separate snapshots. Close/reopen disposes the old source and starts fresh.
These local demonstration inversions/selections do not execute native effects,
simulate account saving, or provide persistence. The sample contains no timer,
network, storage, fullscreen, map filter, HUD asset or native transport adapter.

Presence of `Byond` or `hubStorage`, including inherited properties, explicit
undefined and distinct window globals, fails closed at construction/mount and
local action/delivery boundaries. Shipped bundles import no production runtime,
backend, shell or transport. Strict CSP blocks connections, fonts, images,
workers, inline code/styles and form submission.

## Evidence and limits

`test.ts` runs a shared mounted React/compiled-Svelte parity and lifecycle
harness; a separate-process actual ToggleOptionsMenu oracle; exact source-bound
fixture/polarity/persistence checks; and build/CSP/license/source-hash checks.
The mounted harness covers every action, already-selected options, repeated
clicks, unchanged delivery, same-reference nested mutation, removed rows/options,
empty/omitted groups, literal hostile/long text, focus retained on stable controls,
reentrant close, close/reopen, obsolete callbacks and unmount/disposal. Test-only
network/worker/storage tripwires must remain at zero attempts. They are not
bundled in either candidate. No ledger table-parser workaround is needed.

`check.ts` generates ignored configs for strict TypeScript and Svelte diagnostics,
plus the actual-component oracle under existing workspace native settings. Happy
DOM execution is not real-browser layout/keyboard validation, native behavior,
savefile execution or a performance result. Source-bound checks are not DM tests.

Before adoption, separately validate 340px/short-height layout and 200% zoom in a
real browser; the supported DreamSeeker/WebView2 matrix; real asset delivery and
native geometry; ready/suspend/resume, reconnect and pooled-window lifecycle;
keyboard/game-focus return; invalid/rejected selections and owner/session
routing; actual native effects; account persistence after a fresh load; and
multiline remaining transient with no character-slot changes. Then measure
integrated startup, repeated-update cost and retained memory against unchanged
React. No frontend-only test clears these rollout gates. Rollback must require
only restoring the original presentation, not a savefile/backend migration.

## Licensing and corresponding source

Ratwood-derived source retains the repository GNU Affero General Public License
v3 and original notices. `dist/manifest.json` records exact source hashes,
provenance, build inputs and dependency names/versions/licenses;
`dist/licenses/` preserves dependency license texts and `dist/LICENSE.txt` the
repository license. Before any authorized hosting/distribution, provide exact
corresponding source for the reviewed checkpoint, these files, unchanged shared
inputs/compiler helper, manifests/lockfiles, reproduction instructions and all
required notices. This local output does not publish anything and is not by
itself a complete legal distribution package. Preview distribution, framework
selection and production activation are separate decisions.
