# Disconnected Tithewood application study

This experimental application composes the existing crafting workbench, treasury
ledger, market quote, display/readability, Changes/archive and prompt-family
studies in one actual React-owned Window and backend store. The React control and Svelte-backed arm use the same
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
market quotes cannot dispatch shipments. Archive content is supplied by the
existing in-memory samples, not a network request or a game archive service.

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
this build. The controller/sample factory seams are explicit optional validator
injection, not relaxed default transport guards. The archive sample additionally
accepts an injected clock and fetch function for deterministic lifecycle tests;
its default remains the original in-memory sample loader.

## Local checks and build

From `tgui/prototypes/sample-application`, using the repository's pinned Bun and
installed dependencies:

```sh
bun check.ts
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

## Original four-screen development snapshot (2026-10-23, 225e99f8)

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

The original four-screen composition has separate hosted-browser evidence. That
evidence does not establish acceptance of later extensions. Native BYOND client,
screen-reader, real network/transport and game acceptance remain separate gates.

## Changes/archive extension (2026-10-23)

The fifth screen reuses the original archive controller and both domain views.
Its success, transient retry, terminal failure and empty scenarios remain
sample-only. Leaving the screen or replacing its sample synchronously retires
the prior request generation, timers and subscriptions. Late fetch/body delivery
cannot update the replacement screen. Loss of the fixture's exact endpoint
ownership also retires the archive and reports once, rather than scheduling an
unhandled retry. Returning to the archive starts fresh local state.

The additional mounted suite covers 36 cases / 2,073 assertions in simulated
DOM. These are not native-client, browser-rendering or performance results.
The ordinary suite, including five CSS extraction cases, passes 956 cases, with
the separate 36/24/44 isolated suites also passing. TypeScript, production build and seven lint
regressions pass; full production lint still reports 115 existing findings.

Build-only transfer accounting (raw / per-file gzip bytes):

- React: 407,673 / 133,798; additional 97,268 / 32,005 versus its workbench-only control.
- Svelte-backed: 479,537 / 161,841; additional 104,896 / 35,548 versus its workbench-only control.
- Archive extension alone versus the four-screen build: React +57,553 / +19,657; Svelte-backed +60,187 / +20,564.
- Shared shell CSS: 6,524 / 2,077; combined screen CSS: 23,537 / 4,522.

The original +100 KiB raw / +30 KiB gzip JS review thresholds are unchanged.
The React arm now exceeds the gzip threshold, and the Svelte-backed arm exceeds
both. Existing YAML/date/archive logic is eagerly included in each single-script
sample bundle. This is an explicit feature/transfer-cost tradeoff, not a passed
size gate or evidence that either framework is faster. A later route-lazy design
would need its own first-open, failure and disposal measurements; this extension
does not introduce one. The five-screen source `df107bc4` subsequently passed sampled hosted Chromium
journeys in both arms: search/month/Clear/credits, success/retry/failure/empty,
leave-return reset and Close/acknowledge/resume. The retained report contains
49 observations, including narrow 340×600 CSS and 200% zoom checks. Exact pending
request races remain mounted-test coverage, not instrumented browser evidence.
There is still no native-client or performance acceptance.


## Owned prompt-family extension

The sixth screen composes the existing selection, text, number and confirmation
studies into the same screen lease. It is a local launcher with one active
prompt subtree, not a new modal focus trap or a replacement for game routing.
Existing prompt views keep their original keyboard, validation, local buffer,
choice identity, preview and delivered-timeout behavior.

Submit, Cancel and Choose record their exact local command but do not invent an
immediate server acknowledgement. The explicit sample acknowledgement disposes
the current prompt. Its titlebar Close is distinct from Cancel. Replacement,
route departure and host/root retirement synchronously fence old controller
methods and subscriptions. Returning starts a fresh local prompt session.
Only a still-current, connected launcher can receive return focus after a local
close or acknowledgement. No timeout countdown, audio or game command is run.

Domain styles are extracted with a selector allowlist and scoped to this sample;
standalone page and fixture chrome are excluded. The original studies and their
published artifacts remain separate, unchanged controls. This extension adds no
production routing, minimum-client policy, persistence or native fallback change.
Endpoint ownership loss also notifies the current wrapper after revoking every
capability, removing its prompt subtree without returning focus to a launcher.
Observer failures and reentrant retirement/replacement are covered explicitly.

Build-only transfer accounting (raw / per-file gzip bytes):

- React: 437,797 / 143,485; prompt extension +30,124 / +9,687 versus five screens.
- Svelte-backed: 515,186 / 173,241; prompt extension +35,649 / +11,400.
- Versus the unchanged workbench-only controls, additional React 127,392 / 41,692 and Svelte-backed 140,545 / 46,948.
- Shared shell CSS remains 6,524 / 2,077; combined screen CSS is 36,613 / 6,165.

Both arms now exceed both original review thresholds (+100 KiB raw / +30 KiB
gzip). These budgets have not been raised. Existing prompt editor/control code
is eagerly included alongside the archive logic, not fetched on first open.
The additional screen is an explicit functionality/transfer-cost tradeoff,
not a passed size gate, production rollout, or speed claim. Build auditing finds
zero unbound native endpoint identifiers in either arm. Hosted-browser acceptance
of this six-screen extension remains pending.


Validation for this extension: 207 distinct focused cases / 5,544 assertions
(27 existing host, 36 archive, 25 prompt mounted cases, and 119 unit/failure/style
cases). The ordinary suite passes 988 cases, including those 119 unit cases;
the separate 36/24/44 isolated suites also pass. TypeScript, production build and
seven lint-regression cases pass. Full production lint retains 115 existing
findings. The prompt mounted cases use simulated DOM, not native browser input.
Independent review additionally reproduced and checked throwing-observer and
reentrant replacement cleanup before clearance. Existing production JS/CSS and
other retained preview artifacts remain byte-identical to this checkpoint's
baseline. No DM source changed and no engine run is implied.
