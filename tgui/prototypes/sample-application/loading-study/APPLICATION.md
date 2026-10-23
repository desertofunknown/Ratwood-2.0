# Shared application loading study

This is a disconnected experiment, not a production route, client policy change
or framework migration. The previous eager sample application and standalone
studies remain available for comparison. The React shell, store, real Window,
sample data, CSS and existing screen controllers are reused in both arms.

## One initial screen, one deferred group

Crafting is available initially. Treasury, market quotes, readability, the
archive and owned prompts share one auxiliary module group, requested on the
first visit to any of those routes. A logical group is not a promise of one HTTP
request: the emitted graph can contain shared chunks. All CSS remains eager.

The small workbench adapters reuse extracted ownership primitives from the
existing eager screen wrappers. The original eager exports remain regression
controls. Neither adapter imports the auxiliary controller/view barrel.

The synchronous route factory returns a lease-owned loading session. Even a
cached module creates its controller on a microtask, after the manager publishes
that lease. Only current attempts construct the original session, and a
construction-triggered navigation retires the stale candidate. Ready rendering
delegates to the existing screen renderer with the latest data. Controllers,
drafts and subscriptions are never cached between route visits.

Leaving a route cancels its interest, not the browser's module fetch/evaluation.
An unresolved import is never added to tracked view-disposal promises. Actual
view disposal still follows the existing immediate-detach and pending-cleanup
contract. Import/controller errors produce a local failure state with manual
Retry. Resetting the application's rejected promise does not reset a browser's
module map: a cached evaluation failure may require reloading the page.

## Installed bootstrap and native boundary

Each arm uses exactly one external `endpoint-binding.js`. The fake-only
`application-bootstrap.js` installs the owned endpoint before requesting
`app.js`. Every emitted application/shared chunk validates that binding before
its body, including real storage and drag module initialization.

The original runtime bootstrap imports resolve through `application-context.ts`
to the same already-installed module URL. That shim preserves the literal URL
on pinned Bun 1.2.16, whose external resolver does not rename an original import
specifier as newer tooling assumptions might suggest. The original per-script
bootstrap must be absent from the emitted source inventory. No facade is placed
on a browser global, no transport helper is loaded, and no native subscription
is started. Retired or foreign ownership fails closed, including cached startup
calls. A fresh page is required for a new endpoint binding.

## Matched builds and accounting

`build-application.ts` produces workbench-only, eager-six-screen and lazy variants
for both React and React-hosted Svelte. The workbench variant is a build control,
not a functional six-screen preview. The original eager IIFE build is a separate
historical denominator; switching to ESM alone changes output/compression.

Per-variant manifests list hashes, source/build-recipe inventory, and AST-derived
static/dynamic import edges. Initial workbench bytes include the launcher,
installed bootstrap, singleton, unconditional dynamic application startup and
all their static dependencies. They are not merely the small entry-file size.
Deferred bytes count the remaining emitted modules once; total bytes count the
union. CSS is reported separately and checked against the frozen eager hashes.
The graph includes this disconnected application's bundled sample fixtures;
these byte totals are not a prediction of the live game's payload or bundle.

Gzip sizes are the reproducible sum of per-file `gzipSync` output from pinned
Bun 1.2.16, not a guarantee of a host's HTTP encoding or transferred bytes.
Splitting can reduce initial code while increasing total bytes and requests.
The existing 102,400 raw / 30,720 gzip incremental review thresholds are not
raised or silently reinterpreted as an initial-only budget. A smaller initial
graph does not make an over-budget total graph pass that review.

## Measured build snapshot

With matched owner-mount observations included, the pinned build produces these
JavaScript byte totals. Each cell is raw / summed per-file gzip bytes.

| Arm and mode     | Complete initial graph | Deferred unique graph |       Total graph |
| ---------------- | ---------------------: | --------------------: | ----------------: |
| React workbench  |      316,031 / 106,109 |                 0 / 0 | 316,031 / 106,109 |
| Svelte workbench |      380,763 / 130,334 |                 0 / 0 | 380,763 / 130,334 |
| React eager      |      441,447 / 146,585 |                 0 / 0 | 441,447 / 146,585 |
| Svelte eager     |      519,132 / 176,638 |                 0 / 0 | 519,132 / 176,638 |
| React lazy       |      325,003 / 109,766 |      121,341 / 40,031 | 446,344 / 149,797 |
| Svelte lazy      |      390,245 / 134,613 |      134,011 / 45,047 | 524,256 / 179,660 |

Lazy loading reduces the initial JavaScript graph by 36,819 gzip bytes for React
and 42,025 for Svelte, while adding 3,212 and 3,022 gzip bytes respectively to total
JavaScript.
These are transfer estimates, not measured startup or rendering improvements.
The eager controls contain four JavaScript files; lazy initial graphs contain
five and each deferred group adds one. Both stylesheets still load eagerly.
The total incremental cost over the matching workbench control remains above
the existing review thresholds in both arms. First auxiliary navigation incurs
module loading/evaluation work that the eager build performs before that visit.

## Reproduce

Use the accepted dependencies and Bun 1.2.16. On a fresh checkout, build the
parent eager application once to supply its matching asset-free CSS. Do not
overwrite an archived comparison's artifacts when doing local experiments.

From `sample-application`:

```sh
bun build.ts
bun check.ts
cd loading-study
bun build-proof.ts
bun run-proof.ts
bun build-application.ts
bun run-application.ts workbench eager lazy
bun test --preload ../../../happydom.ts tests
```

The parent `check.ts` typechecks application study sources as well as the eager
screen extraction and its mounted parity tests. This directory's `tsconfig.json`
is deliberately the narrower phase-1 proof configuration. The emitted-application
runner verifies hashes before importing and uses a fresh process for each
scenario, without cache-busting singleton URLs. Its production-target JavaScript
runs in Bun/Happy DOM with network tripwires, not in the BYOND client.

## Acceptance limits

Source-model tests, emitted-module tests, transfer accounting and hosted browser
observations are separate evidence. Browser first-open observations must retain
loading/failure/retry context and distinguish an application's first auxiliary
visit from a verified cold browser cache. Session-request to owner-mount time is
not input latency, paint, CPU, startup, heap usage or native-game performance.
It does not await asynchronous fixture data, such as the Treasury opening delay.
No successful compile or browser sample justifies activating this route in the
game or changing the existing native-client acceptance gate.

The pinned Bun emitted-module tests exposed an important limitation: after an
ownership guard rejects cold auxiliary evaluation, a same-URL retry can expose a
partially initialized module namespace rather than repeat the original error.
In the tested Treasury path, the subsequent sample-array construction throws
before its subscriber/timer setup. Both attempts remain visibly failed with no
accepted auxiliary view, foreign getter reads or additional endpoint calls.
The two exact errors are retained in the test results. This is Bun-only evidence,
not a claim that a browser has identical module-cache behavior or that arbitrary
failed module initialization is recoverable. No cache-busting workaround is used.
