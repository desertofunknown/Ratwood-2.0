# Disconnected real-Window browser integration

A new, bounded browser fixture for the experimental workbench. The React control
and React-owned Svelte arm use the same real common store, `backendReducer`,
`backendMiddleware`, `sendAct`, `Window`, `TitleBar`, shared sample data and CSS.
The existing `ReactHost.tsx`, adapter and synchronous lifetime observer are reused
unchanged. There is no production activation, route registration, native endpoint,
DM change, dependency/lock change, or performance verdict.

This is separate from the frozen standalone browser measurements and
`svelte/bundle-experiment`. Those inputs and outputs are not rewritten. The build
writes only this directory's ignored `dist/`; mounted tests use `.generated/`.
It starts no server/listener/browser and never executes the emitted browser apps.
Do not import this fixture into production or open it in a native game client.

## Isolation and public data

`bootstrap.ts` runs before production modules. It refuses any existing `Byond` or
`hubStorage` property (even an inherited/undefined one), rather than overwriting
or invoking it. Its fake endpoint only records in-memory `winset`, `winget`,
visibility, suspend and supported sample workbench calls. `subscribe` always
throws. The build forbids `helpers.js` and the native production entrypoint.
No native/message event subscription is installed. Explicit fixture controls
call the real store directly; suspend acknowledgement clears middleware timers.
The ordinary drag/blur and React DOM event handlers remain real and are cleaned
up on root unmount. Geometry uses the existing in-memory storage fallback.

Both pages use the exact nine illustrative recipes from `../fixtures.ts`, emitted
verbatim as `dist/sample-data.json`: Plough, two Wooden bucket variants, Wooden
spoon, Corset, Linen wrap, Travel satchel, Pelt bedsheet and Iron lantern. These
are not a player inventory or a source-derived real recipe catalog. The only
scripted mutation is the second bucket's ingredient text becoming
`SAMPLE UPDATE: 7 wooden planks`, followed by removal and reset. Configuration is
fixed in `runtime.ts`: sample title/window keys, `MiaCraft`/`Window`, boolean
fancy/scale/refreshing, observer 0, and interactive/status-dimmed states. There is
no client identity, address, database, token, credential or private note.

Sample craft actions accept only those nine exact sample paths and amounts
1 (omitted), 2, 3, 5 or repeat. The filter only records a boolean; it does not
pretend to be the server. Click **Acknowledge filter** to deliver that boolean
through the real reducer. Craft calls never modify a game or create an item.

HTML CSP blocks connections, fonts, images, workers, objects and form submissions.
Same-origin scripts/styles are permitted. Inline style properties are permitted
for the real shell's existing geometry and component behavior. CSP is a browser
layer, not a substitute for the endpoint isolation or an OS network sandbox.
No denied native isolation mechanism is retried or bypassed.

## Styling boundaries

`shell.scss` compiles the actual production reset, CSS variables, Layout,
TitleBar and Window SCSS unchanged. The production fixed viewport, scrolling,
dimmer and resize-handle rules therefore remain in use. Fixture-only additions:

- Shared system Georgia/Times serif font, system-ui controls and fixture palette.
- Hide only the close Icon glyph and draw a CSS text × on its existing parent;
  the real close element and mouse/keyboard handlers remain intact.
- Give both arm host containers the same full height and add 8px title padding.
- Show an out-of-band collapsible control panel over the bottom-right viewport.
  Use **Hide QA controls until reload** for unobstructed layout/focus acceptance
  and screenshots, especially at high zoom. Reload restores the controls. Hiding
  removes only this panel, preserves the workbench and read-only inspection API,
  and returns focus to the existing scrollable Window content when available.
  Hiding is disabled while a fixture operation runs. The panel does not resize
  the Window.

No font/image assets, production theme imports or full production stylesheet are
shipped. The workbench stylesheet is copied byte-for-byte. This is a matched
asset-free shell experiment, not visual approval of the game's actual themes or
font rendering. The actual Window dimmer has `pointer-events: none`: it is visual,
not action authorization. `sendAct` does not enforce status permissions; the real
server remains authoritative. Neither arm invents a different policy.

## Reproduce

Use already provisioned Bun 1.2.16 and the frozen root/Svelte dependencies. From
`tgui` (no installation is part of these commands):

```sh
bun run prototypes/crafting-workbench/browser-integration/test.ts
bun node_modules/typescript/bin/tsc -p prototypes/crafting-workbench/browser-integration/tsconfig.json
bun node_modules/eslint/bin/eslint.js prototypes/crafting-workbench/browser-integration --ext .ts,.tsx --ignore-pattern '**/.generated/**' --ignore-pattern '**/dist/**'
(cd prototypes/crafting-workbench/svelte && bun node_modules/prettier/bin/prettier.cjs --check '../browser-integration/*.{ts,tsx,json,scss,md}')
bun run prototypes/crafting-workbench/browser-integration/build.ts
```

Bun emits minified browser IIFEs under production/browser conditions. The same
production `tgui-core` keyboard/base aliases are applied to both arms. The Svelte
compiler is the existing pinned 5.57.2 production-client compiler. The eager
debug barrel's Rspack-only development story lookup is replaced by a fixture
function which throws if used; no story is loaded or fabricated. This is not
another Rspack incremental-bundle experiment and its bytes must not replace the
frozen production-bundler evidence. The build refuses to proceed with <=10 GiB
free and emits no source maps or absolute workspace paths in the inventory.

## Visible checks and interpretation

The **Run lifecycle and action checks** button runs only on request and disables
fixture buttons until completion. Failures are visible. The shared script checks
real shell/title rendering, duplicate-name payload identity, all craft counts,
same-object mutation, selected removal, server-controlled filter acknowledgement,
real Close to suspendStart/ack/resume, coalesced suspend/resume fencing, refresh,
route replacement, pooled-key replacement, status dimmer, root unmount/remount,
subscription/disposal accounting and zero native subscription attempts/errors.
Its controls work without an exposed arbitrary dispatch API. The read-only
`window.workbenchIntegration.read()` returns current bounded call log, state and
last result. **Refresh recorded calls** refreshes the displayed JSON after manual
workbench actions. The log retains the newest 200 calls and reports dropped and monotonic total
counts. Stale-action assertions compare the total, so rollover cannot hide a newly
recorded call.

The mounted test runs the identical script three times per arm with a prefilled
log, covering repeated rollover with real production-mode React/Svelte in Happy
DOM. A targeted regression demonstrates that a new craft call increases the total
even when the retained action count stays at 200. Test-only network API tripwires are
installed before application imports; fetch, XHR, WebSocket, EventSource, Worker
and sendBeacon attempts must remain zero. Additional tests cover endpoint
installation refusal and rejected subscriptions/non-sample actions. Teardown
asserts zero subscriptions, balanced mount/disposal and no pending disposal.
Actual page-level tests cover panel hiding in both arms, unchanged workbench
identity and subscriptions, zero additional endpoint calls, focus transfer, busy-run
blocking, read-only inspection API preservation and restoration on fresh page
initialization. Tests remove page-owned handlers and restore inspection globals.
This is source-mounted behavioral evidence, not browser layout or native proof.
The 20ms shared settle delay is a scheduling allowance, not a timing sample.

No startup, CPU, frame, paint or heap measurement is exposed. No browser has been
launched by this build or these tests. The next authorized visible-browser pass
should use the same browser/viewport/scale for each arm, record artifact hashes,
and prioritize:

1. Wide and narrow layouts, short heights, 200% zoom and actual scrolling.
2. Native Tab/Enter/Space activation, focus return on Back and selected removal,
   search typing/clearing, category changes and controlled filter acknowledgement.
3. All visible scripted checks, repeated run, real Close/ack/resume and paused
   refresh/route/pool transitions. Inspect logged sample actions only.
4. Unmount/remount, including after title dragging, and absence of duplicate
   workbench nodes. Real browser DOM/focus observations are not native acceptance.
5. No network requests beyond initial same-origin fixture assets; no font/image,
   API, socket or native connection. Keep browser errors and any unmet checks.

## Source and license inventory

`dist/manifest.json` records build/tool metadata and hashes. `source-inventory.json`
lists conservatively resolved input files/hashes, including tree-shaken imports;
it is not a per-module shipped-code attribution. `NOTICE.txt` includes the root
license and complete notices for all encountered installed dependency packages.
No font license is inferred and no font file is redistributed.

The repository root is AGPL-3.0; many imported tgui files instead carry explicit
MIT headers. New fixture/prototype files without separate headers retain the
repository default. The project repository,
[desertofunknown/Ratwood-2.0](https://github.com/desertofunknown/Ratwood-2.0), is
public. An inventory or repository link alone does not cover uncommitted fixture
changes. Before any public preview, the publisher must provide the matching
reviewed corresponding source at an immutable public commit or source archive,
with applicable notices. This build does not release source or publish/deploy
anything. Review is still required before publication; the output is not an
automatic approval gate.
