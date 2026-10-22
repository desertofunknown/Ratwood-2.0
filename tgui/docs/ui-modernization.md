# Tithewood UI modernization: staged decision

## Decision status: provisional Svelte integration candidate

Preserve the existing BYOND protocol while comparing React, Svelte and browser Lua with the
same [standalone crafting workbench](../prototypes/crafting-workbench/README.md),
data, CSS and actions. React is the baseline, not the predetermined winner.
None of the prototypes activates a production interface. A new framework must earn
its migration cost through relevant measurements and native-client acceptance.

The current stack is tgui 6, React 19, Rspack and Bun 1.2.16; its
[build target](../rspack.config.ts) is Edge 123 or later. Being modern does not
establish that it is the fastest option. Conversely, generic benchmark rankings
do not establish crafting performance. Compare production client builds, cold
startup, repeated updates, memory and teardown on the same supported client.
Bundle size and pure-data timings are separate evidence, not substitutes for
browser measurements. SvelteKit and a new application server are unnecessary.

### Measured checkpoint, not production approval

The [fresh hosted comparison](../prototypes/crafting-workbench/lua/browser-row-value.md)
is pinned to source `f796d58e5126b6e88d3fa61e3a91f952dba26731` and exact artifact
hashes. In the same visible Chromium at 1180×757, three rotated rounds per cell
retained 90 samples for each of three scenarios and four arms. Lua row-value
tracking lowered pooled delivery-to-DOM-commit medians from 8.20 to 4.85 ms
(catalog), 6.80 to 3.85 ms (selected first), and 14.95 to 13.20 ms (selected
off-page). Off-page P90/maximum worsened, so the gain is not universal.
Fresh React medians were 1.45/1.40/1.60 ms and Svelte 1.30/1.10/1.30 ms in the
same scenario order. These are warmed wall-clock observations, not CPU time.

Svelte remains a **provisional browser-integration candidate**, not a settled
choice. Standalone JavaScript is 77,053 raw/28,621 gzip bytes versus React's
201,301/64,106 at those hashes. React's standalone total includes
a runtime already loaded by production; this is not a Svelte island's marginal
cost or a production saving. The small React/Svelte timing gaps, overlapping
spreads, shared-cloud noise and only three rounds do not establish a definitive
framework ranking. The experiment says nothing about startup, CPU, heap, exact
paint, native BYOND, native LuaJIT or AAA game quality.

The [production-bundler experiment](../prototypes/crafting-workbench/svelte/bundle-experiment/README.md)
now measures retaining each new screen beside the existing application. The
Svelte implementation adds 27,368 gzip bytes including CSS, versus 4,307 for the
matched React workbench. Their CSS is identical; the additional 23,061 gzip JS
bytes include the differing screen, Svelte runtime and required host/adapter,
not an isolated runtime cost. These are offline byte comparisons, not startup,
heap or verified native wire-transfer measurements.

Keep the Lua experiment and its measured gains without further tuning just to
force a win. The [disconnected adapter fixture](../prototypes/crafting-workbench/svelte/BRIDGE-HARNESS.md)
now exercises the real store, action transport and Window shell with a fake native
endpoint. Native acceptance, supported-client policy and incremental startup/heap
cost remain open, with React retained as the production baseline. Existing production
interfaces remain unchanged. A [disconnected browser integration fixture](../prototypes/crafting-workbench/browser-integration/README.md)
adds matched React/Svelte arms with the actual Window shell, store and captured
sample actions for browser layout, focus and lifecycle checks. The
[8fa9742b checkpoint](https://github.com/desertofunknown/Ratwood-2.0/commit/8fa9742b1460768baa66ae11aeb276b0ff2bb557)
passed matched cloud-browser keyboard, Close/acknowledge/resume, narrow/short
layout and 200% zoom checks, including 340×600 CSS pixels. The original fixture
also passed 25 visible lifecycle checks three times per arm. The final follow-up
removed an obstructing QA panel; it did not change either workbench. These are
sample-only browser observations with system fonts and limited shell styles,
not production-theme, network-isolation or native-client acceptance. No new
startup, heap or performance metric was collected. This recommendation is neither
automatic activation nor a framework-wide replacement; the gates below still
apply. Later builds need their own measurements and acceptance.

## Four surfaces, not one web application

| Surface            | Existing owner                                     | Safe modernization boundary                                                                                                                       |
| ------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Popup interfaces   | `packages/tgui`, DM tgui data/actions              | Scoped visual primitives and workflow layouts; preserve interface names, window lifecycle and action payloads.                                    |
| Chat panel         | `packages/tgui-panel` and its custom chat renderer | First improve chrome and readability; separately validate ordering, sanitization, scrolling, history and root disposal before changing rendering. |
| Native window skin | [`interface/skin.dmf`](../../interface/skin.dmf)   | Preserve map, splitters, command input and legacy output; validate changes in the supported native client.                                        |
| Sprite HUD         | [`code/_onclick/hud`](../../code/_onclick/hud)     | Preserve hit targets, screen locations, inventory/combat actions and colorblind variants; treat artwork/scaling as a separate phase.              |

The existing browser bridge handles asset delivery, ready queues, refresh,
suspension, visibility and chunked messages. DM remains authoritative. A React
screen can use the normal `Window`, `useBackend` and `act` adapter; a Svelte
screen needs an equivalent lifecycle/state/action adapter without replacing the
transport. A React-hosted Svelte island retains both runtimes, so its incremental
cost must be reported separately from standalone bundle size. In either case, the standalone demo deliberately has no such connection.

## Compatibility gate

These are separate checked-in constraints, not a resolved support policy:

- [`dependencies.sh`](../../dependencies.sh#L7-L8) pins the build toolchain to
  BYOND 516.1673; it does not set client admission requirements.
- [`rspack.config.ts`](../rspack.config.ts#L135) targets Edge 123 or later.
- [`config/config.txt`](../../config/config.txt#L433-L444) declares client version
  511 and build 1421. [`client_procs.dm`](../../code/modules/client/client_procs.dm#L451-L466)
  actually checks both configured limits at connection, with an administrator
  exemption. Changing these values can exclude clients; it is not a docs-only fix.

The deployed configuration and DreamSeeker/WebView2 versions have not been
verified. Establish and test the intended client/browser matrix, then make an
explicit support-policy decision before rollout. Do not silently raise the
minimum or promise older-client compatibility from a compiler pin, modern cloud
browser or frontend tests.

## First workflow: workshop ledger

Use the existing bone/burgundy family, restrained binding rules, clear text
labels and a consistent serif hierarchy. The disconnected previews use the same
system font stack rather than redistribute the inherited Pterra font with its
ambiguous license notice; production fonts remain untouched. Body text must
remain readable; decorative
type belongs in short headings rather than ingredients or controls. Selection,
material hints and focus must not rely on color alone.

The existing crafting window requests 340×600 despite a larger DM declaration.
Design compact-first, with a recipe index and working folio that can sit beside
each other when space permits. Search, filter, back navigation and craft actions
must remain usable at small sizes and enlarged text. Avoid ornamental cards,
blur, remote assets, idle animations or a second hidden copy of the interface.

The prototype preserves these contracts:

- Search recipe name OR displayed ingredients using the existing literal,
  case-insensitive matcher, including its whitespace behavior.
- Preserve category/recipe ordering and distinct same-name variants.
- Treat the strict numeric-1, name-keyed material record as advisory. The backend
  combines same-name variants; it is not full per-path readiness or permission.
- Send exactly `craft` with `item`, optional `amount` 2/3/5, or `auto: true`.
  A single craft omits `amount`. The filter action remains
  `checkboxonlycraftable` with `state`, following backend acknowledgement.
- Do not infer progress, a queue, cancellation, exact missing quantities or
  guaranteed success from the current schema. The transmitted `busy` field does
  not currently supply a dependable crafting lifecycle.

## Performance and accessibility gates

Keep optimization work independently reviewable from visual changes. Preserve
same-reference backend updates; memoizing only by object identity can hide
changes already covered by the crafting tests. Do not add lazy chunks without
validating the game's asset registration and recovery path.

Initial prototype budgets are targets, not measured claims:

- No production bundle changes, runtime dependencies, polling or remote assets.
- One mounted folio; a bounded initial recipe list with all remaining entries
  reachable through labelled pagination, not silently omitted.
- Measure source-derived large catalogs as well as the small illustrative demo.
  Record derivation, DOM work and browser interaction separately.
- Aim for ordinary rendering work within a 16 ms frame and search response below
  100 ms on a specified test machine. Investigate attributable tasks over 50 ms.
  Native client results, not a synthetic DOM or Bun benchmark, govern rollout.
- Body/control text contrast at least 4.5:1, essential non-text/focus indicators
  at least 3:1, controls at least 24 CSS pixels, visible labels and focus.
- Exercise Tab/Enter/Space, repeated actions, clear/no-results, filter changes,
  removed selections, back/close/reopen and same-reference data updates.

## Rollout sequence

1. Review the standalone crafting design and interaction evidence. Keep existing
   production behavior unchanged during this stage.
2. Resolve client support. Validate native asset and chunked action delivery, ready/suspend/resume,
   refresh/reconnect, game-key focus, scaling, fancy/native chrome, resize
   cancellation and actual server permission rejection in a disposable test
   environment. The disconnected fixture does not exercise those native paths.
3. Compare representative integrated startup, update cost and retained memory
   against the existing React control. Keep the measured hybrid byte cost visible.
   Only then consider a separately reviewed opt-in route with immediate React
   rollback, using the existing bridge, preferences, themes and `Window` shell.
4. Extract only proven reusable [tokens and controls](../prototypes/ui-shared/README.md).
   The disconnected [Changes archive](../prototypes/changes-archive/README.md)
   and [Treasury ledger](../prototypes/treasury-ledger/README.md) cover information
   workflows without replacing their production routes. The next
   [Display & Readability candidate](../prototypes/display-readability/README.md)
   covers only the existing Graphics and Visuals toggle/palette contract, not a
   new preferences backend. Preserve delivered state and exact actions; do not
   merge account writes, current-mob state, character-slot saves or chat's browser
   storage. Native effects and persistence still require separate acceptance.
   Expand by workflow family rather than replacing all screens at once. Keep
   core optimization independently measured and reviewed.
5. Modernize chat chrome separately from its sanitizer/message renderer, then
   native skin/HUD with dedicated client acceptance. Do not replace protocol,
   gameplay or an entire framework as a side effect of a visual migration.

Production activation is a separate reviewed change. Existing backend gameplay,
licensing, attribution and compatibility identifiers remain intact. Source,
static browser rendering and synthetic tests do not establish native gameplay
or a universal performance improvement.

## Language/framework alternatives

[Svelte's compiler](https://svelte.dev/docs/svelte/svelte-compiler) produces client
JavaScript; external CSS keeps the stylesheet boundary equivalent to React.
Use its [documented browser support](https://svelte.dev/docs/svelte/browser-support)
as another client-matrix input, not evidence that an untested DreamSeeker works.
The isolated candidate pins Svelte 5.57.2. Preserve the explicit delivered-update
contract even when a backend mutates nested records in place. A production
adapter still needs ready/suspend/resume, chunked actions, focus and game-key
passthrough, not merely a call to `Byond.sendMessage`.

Lua is a separate, plausible scripting choice, not an automatic renderer:

- [Fengari](https://github.com/fengari-lua/fengari) runs Lua in JavaScript;
  [its browser integration](https://github.com/fengari-lua/fengari-web) and
  [interop](https://github.com/fengari-lua/fengari-interop) can expose DOM/CSS and
  the existing JS bridge. This is browser Lua, not native LuaJIT.
- [Wasmoon](https://github.com/ceifa/wasmoon) provides a WebAssembly Lua runtime
  and JS bindings. It likewise needs rendering and bridge glue; frequent
  cross-language calls, initialization and memory must be measured.
- [Native LuaJIT](https://luajit.org/install.html) builds a native executable or
  library. This repository's browser asset path does not host it. A native
  renderer/companion would add distribution and integration work outside this
  prototype, not become a drop-in replacement for tgui.

The current asset loader recognizes JS/CSS, not automatic Lua/WASM execution.
Any browser-Lua trial needs explicit asset mapping, schema conversion (including
Lua's truthy zero versus DM's 0/1 flags), action chunking and deterministic
cleanup across pooled-window suspension/reuse. Keep the current transport shell
and test one equivalent UI body before considering migration.

The isolated [Lua workbench](../prototypes/crafting-workbench/lua/README.md) uses
Fengari 0.1.5 and interop 0.1.4. Lua owns its UI state and keyed DOM updates;
the shared search/data model remains JavaScript. Its adapter must explicitly
retain JavaScript listener identities and close the VM only after active calls
finish. These are additional maintenance obligations, not framework features
provided by the existing tgui shell. Lua source is parsed at mount, so that cost
belongs in startup measurements. This candidate does not evaluate Wasmoon or
native LuaJIT. Language choice alone establishes neither visual quality nor a
speedup, and transfer sizes do not establish browser performance.
