# Disconnected selection prompt study

Matched React and Svelte candidates for the existing ListInputModal workflow.
This directory alone is new. Production routing, shared theme files, old previews,
backend behavior, client minimums and all other interfaces remain unchanged.
No hosting, publication, transport, audio, network requests, storage or runtime
activation is implemented. The fixture records commands, not native receipts.

## Reproduce locally

Use already installed Bun 1.2.16, React 19 and the unchanged Svelte 5.57.2
compiler under `../crafting-workbench/svelte/node_modules`. From repository root:

```sh
BUN=/workspace/scratch/a84fd1fedcaf/frontend-tools-restored-20261022/node_modules/@oven/bun-linux-x64-baseline/bin/bun
"$BUN" tgui/prototypes/selection-prompt/check.ts
"$BUN" tgui/prototypes/selection-prompt/build.ts
"$BUN" tgui/prototypes/selection-prompt/tests/run.ts
```

Output is only this directory's ignored `dist/`. Open the React and Svelte local
builds through an authorized local static preview. Do not publish this directory.
No dependencies or lockfiles are changed. Build output reports raw standalone
bundle bytes and hashes, not runtime speed, incremental production cost or native
compatibility. Tests are maintained separately under `tests/`; use their documented
commands for the actual-source differential oracle and mounted checks.

## Source and contract

Read alongside `../../packages/tgui/interfaces/ListInputModal.tsx`,
`common/InputButtons.tsx`, `common/Loader.tsx`,
`../../../code/modules/tgui_input/list.dm`, and `../../docs/ui-modernization.md`.
The production component contains inline state/keyboard logic: there is no
pre-existing shared helper. This candidate's controller is local and must be
checked against the actual mounted production component, not against itself.

- Server-emitted strings stay in exact order and retain suffixes, case and
  whitespace in selection and payloads. Rendering follows the original first
  ASCII word-character capitalization, and uses text nodes, never HTML.
- Selection and search visibility initialize only at construction (search when
  item count exceeds eight). Deliveries do not reset either. Missing/numeric
  initial values are not coerced to strings; effective fallback is the first
  filtered result while stored selection remains unchanged.
- Search is immediate, case-insensitive, untrimmed substring filtering. A hidden
  selection falls back visually and on submission without rewriting storage;
  clearing restores the prior selection if still present.
- Arrows wrap without moving DOM focus. Hidden-search ASCII letters/digits
  cycle distinct exact matching values; Shift is allowed, Ctrl/Alt/Meta excluded.
  Choice focus/click, arrows with results, changed search state and a replaced
  items reference reset the shortcut sequence. Same-reference delivery does not.
  Visible-search shortcuts replace the query and remount/focus the input.
- Rows deliberately use focusable role-button divs, matching the original
  captureKeys=false semantics. Row Space does not select/submit; Enter submits
  exactly once through the parent. Double-click submits that exact entry.
  Search/footer buttons explicitly preserve original keydown Enter/Space activation
  while suppressing native double activation; Escape cancels from body
  controls. Input Enter/Escape blurs before the parent action.
- Only submit `{entry}`, cancel and preview_toggle `{entry}` are recorded.
  No-results disables Confirm and Listen, but delivered previewing keeps Stop
  available; its payload falls back to items[0]. Empty items are a defensive
  fixture, not a valid successful DM constructor. Preview never changes
  optimistically and no actual sound is played.
- Timeout is a delivered fraction clamped to [0,1], hidden when zero/missing.
  Native progress rendering avoids inline CSS under strict CSP. There is no
  countdown, autoexpiry or inference of server closure.
- Titlebar Close and fixture suspension dispose locally, without emitting
  Cancel or pretending the native close handshake happened. Cancel/submit are
  merely recorded commands; only explicit fixture close disposes. Fresh mount
  resets state. Obsolete controller callbacks do nothing after close.
- The current DM producer hardcodes large_buttons and swapped_buttons false.
  The defensive true scenario demonstrates layout parity, not working settings.

## Fixture and accessibility

Both arms use identical synthetic strings, local controller, scoped CSS and
unchanged shared tokens/controls. Scenario selection plus Fresh mount selects a
new fixture. Delivery controls change only preview, timeout or items explicitly.
Hide controls removes the QA panel; Show sample controls restores it. Use this
for clean narrow and zoom checks. Long and hostile strings render literally.
Labels, selected markers and keyboard focus remain visible. Choices wrap and
scroll; there are no fonts, images or external resources.

The native-global guard rejects presence of Byond or hubStorage (including
inherited, undefined and separate window properties) at construction, mount,
actions, delivery and lifecycle boundaries. Bundles exclude production backend,
Window shell and transport. CSP blocks connections, workers, fonts, images,
inline scripts/styles, objects and form submission.

Before adoption, separately verify real-browser 340px layouts, short heights,
200% zoom, Tab/Enter/Space and pointer behavior; source-bound differential tests;
actual DM rejection/owner checks, preview cleanup, timeout/close races; native
asset delivery, focus/game-key return, ready/suspend/resume, pooled window reuse,
reconnect and client-version support. Measure integrated startup, update cost
and retained heap against unchanged React. This study establishes none of those
native gates, no framework-wide replacement, and no performance win.

## Licensing and corresponding source

Ratwood-derived source retains the repository GNU Affero General Public License
v3 and original notices. `dist/LICENSE.txt` copies the repository license;
`dist/manifest.json` records exact candidate/build inputs, original source hashes
and dependency license inventory; `dist/licenses/` preserves dependency notices.
No third-party artwork/fonts or copied historical credits are introduced.
Before any separately authorized distribution or hosting, supply exact
corresponding repository source, this directory, original sources and notices,
unchanged shared inputs/compiler helper, manifests/lockfiles, reproduction
instructions and required license texts. Local artifacts are not by themselves
a complete legal distribution package and are not published by this build.
