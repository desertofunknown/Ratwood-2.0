# Disconnected Tithewood application study

This experimental application composes the existing crafting workbench, treasury
ledger, market quote and display/readability studies in one actual React-owned
Window and backend store. The React control and Svelte-backed arm use the same
host, sample data, external styles and screen lifecycle. It is not a production
route, a framework migration, a native-client acceptance result or a game server.

## Ownership and compatibility

The application rejects an existing native `Byond` or `hubStorage` before startup.
Its sample controllers receive a validator for the exact endpoint owned by this
fixture. The existing standalone controller factories still default to their
strict disconnected checks; native-looking object shapes or marker flags do not
grant access. The sample build also binds production host references to a lexical
facade, validating each call against that owned endpoint. This includes Window
close, drag and retained callbacks, not only screen-controller actions. The endpoint facade is lexical,
not a browser-global property. The endpoint records only the existing
narrow workbench/Window commands. Treasury and settings actions stay in private in-memory sample sources;
market quotes cannot dispatch shipments.

One synchronous screen lease is active at a time. Navigation invalidates the old
lease before React commits, retires its controllers and removes its owned view.
An asynchronous Svelte disposal cannot remove the next screen. Returning to a
screen creates fresh local state; selecting the current navigation item is a
no-op. Host suspension, refresh or pooled-window identity changes invalidate the
lease independently of local navigation. Sample delivery is not a receipt from a
server and settings changes are not saved to player preferences.

Existing domain views, quote calculations, debounce behavior and local keyboard
policies are reused. There is no new router, event bus or persistence layer.
Previous hosted studies remain separate immutable artifacts, not rewritten by
this build. The five controller/sample factory seams are explicit optional
validator injection, not relaxed default transport guards.

## Local checks and build

From `tgui/prototypes/sample-application`, using the repository's pinned Bun and
installed dependencies:

```sh
bun test.ts
bun ../../node_modules/typescript/bin/tsc --project tsconfig.json
bun build.ts
bun build-controls.ts
```

The source-mounted test bundle uses Happy DOM and real store/Window modules with
network tripwires. It is not a native BYOND run or a browser timing measurement.
Build output stays in this directory's ignored `dist/`; it does not overwrite
production assets or previous prototype artifacts. The build emits source
inventory hashes and dependency license notices. Distribution requires matching
reviewed immutable source, not merely a link to the repository's moving branch.

## Evaluation gates

Review the two arms through identical screen journeys, including pending ledger
filters, delayed quote responses, settings deliveries, close/reopen and rapid
navigation before a UI commit. Record actual test totals and disposal diagnostics;
compiled tests must not be described as executed tests.

Report full minified and gzip JavaScript and shared CSS bytes. Compare against
workbench-only controls built with the same production compiler, aliases and
conditions, rather than summing unrelated standalone artifacts. More screens
necessarily add code; transfer size alone is not startup, CPU, memory or FPS.

Before any production activation, native-client compatibility and minimum-client
policy, actual game transport/data lifecycle, persistent state and failure
behavior, keyboard/accessibility and real rendering performance still require
separate acceptance. This study changes none of those policies or routes.

## Checked development snapshot (2026-10-23)

Independent review covered 109 distinct focused tests / 1,419 assertions: 27
source-mounted integration cases and 82 boundary, lifecycle and failure cases.
The complete ordinary suite passed 951 cases (including those 82 unit cases),
plus the existing isolated suites of 36, 24 and 44 cases. TypeScript, the
production build and seven lint-regression cases passed. Full production lint
still reports 115 existing findings; it is not clean. The six production JS/CSS
assets and 141 retained prior preview artifacts are byte-identical to their
recorded baseline. No DM source changed, so no engine compile/run is implied.

Build-only transfer accounting, bytes (gzip is per-file):

- react: 350,120 JS / 114,141 gzip; workbench-only control 310,405 / 101,793; additional 39,715 / 12,348.
- svelte: 419,350 JS / 141,277 gzip; workbench-only control 374,641 / 126,293; additional 44,709 / 14,984.
- Shared shell CSS: 6,489 / 2,064 gzip; unchanged concatenated screen CSS: 21,518 / 4,227 gzip.

Controls are built by `build-controls.ts` using the same client resolver, lexical
endpoint binding and minifier; only their original bootstrap import is replaced
with this application’s owned sample bootstrap. They are transfer controls, not
a rerun of historical browser benchmarks. The four-screen application remains
within the proposed +100 KiB raw / +30 KiB gzip JS review thresholds. Shared
shell CSS includes real production shell rules, not only new navigation styles.
No speedup, memory saving or whole-UI migration conclusion follows.

Hosted-browser acceptance of this combined application remains pending. Earlier
standalone browser results do not prove the new composition. Native BYOND client,
screen-reader, real network/transport and game acceptance remain separate gates.
