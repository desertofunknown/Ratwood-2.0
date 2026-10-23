# Single-owned ESM endpoint proof, phase 1

This page documents the phase-1 proof only. The subsequent matched application
study has its own [architecture, reproduction and limits](APPLICATION.md).

This is an isolated loading feasibility test, not the six-screen application or
an implementation of lazy routes. This proof does not modify original sample
sources, builds, dist assets, production configuration or native transport. No server,
browser, listener or engine is started. Test execution is Bun 1.2.16 with Happy
DOM, with browser network API tripwires and only the existing in-memory endpoint.

## Ownership and evaluation

1. `module-binding.ts` bundles the existing validated binding factory exactly
   once into `dist/endpoint-binding.js`.
2. The independently built `host-bootstrap.js` has a fake-only static dependency
   closure. `createOwnedModuleHost()` installs the exact frozen fake through the
   existing boundary and once-only binding before requesting real host imports.
3. Both the production-host entry and deferred probe share genuine emitted
   production code, including backend, storage and drag. Every emitted production
   entry/common chunk imports the exact same relative singleton URL and invokes
   its validator before its body. This also fences storage's eager hubStorage
   probe and drag's eager windowId read when ownership changes during an import.
4. The wrappers validate before requesting and after receiving an import. Any
   validation/import failure terminally retires this proof host. `retire()` is
   page-host retirement, not screen/route cancellation. A future route loader
   needs its own lease and retry policy rather than disposing this singleton.

The endpoint facade and excluded-story function are lexical imports, never
browser-global facade properties or native marker flags. The owned raw fake
`Byond` property is installed only by the original strict boundary; it is not
discovered, reused or treated as a fallback. Retained callbacks always validate.
ESM caches successful and failed evaluations. Retirement cannot abort import or
erase evaluated code, but neither cached nor newly evaluated code gains action
authority. No cache-busting URL or fresh binding is used to retry.

`endpoint-binding.d.ts` is a type-only bridge to the emitted external URL.
Explicit `.js` source specifiers are deliberate: the installed Bun 1.2.16 probe
showed that an external onResolve result with a different path did not rewrite
the emitted original specifier. No newer Bun option is assumed. The existing
React and pinned Svelte resolver plugins are reused; real useState/tick function
identity is checked across both modules. No Svelte screen is mounted here.

## Reproduce

From this directory, put the already installed Bun 1.2.16 on PATH, then run:

```sh
bun build-proof.ts
bun ../../../node_modules/typescript/bin/tsc --project tsconfig.json --pretty false
bun run-proof.ts
```

The runner checks actual emitted hashes, source inventory hashes and build
recipe hashes before importing artifacts. Each scenario is a new process with
the same emitted URLs, so a previous successful import cannot mask a cold
evaluation failure. `.generated/proof-results.json` records 24 isolated passing
cases / 504 assertions, including own/inherited foreign accessors, cold and
cached imports, pending retirement, real backend/drag actions, and zero attempted
network calls. This is not browser or native-client acceptance. The parent
sample's test command is unchanged; this is a separate explicit test suite.

## Build evidence

`dist/manifest.json` records AST-discovered static/dynamic import edges, full
emitted SHA-256 hashes, conservative resolved-source hashes and graph-based
transfer accounting. A source inventory may include tree-shaken inputs; it is
not a claim that every visited file ships or evaluates. Closure accounting counts
each emitted file once, including the external singleton and shared chunks.

Final phase-1 build, raw bytes / sum of per-file gzip bytes:

- Bootstrap-only static closure: 6,238 / 2,732. This cannot display the real UI.
- Bootstrap plus real host static closure: 333,668 / 113,227.
- Deferred probe unique after host: 517 / 317.
- All current emitted graph files: 334,185 / 113,544.

These are synthetic proof graph costs, not a route-lazy application size result,
startup timing, memory, FPS, CPU comparison or a passed application size gate.
The manifest describes only the current emitted graph, not stale unreferenced
files that an older local build may have left in the ignored output directory.
No deployment, public distribution or permission change is performed; any later
distribution requires matching reviewed source and applicable license notices.

The current official [Bun bundler documentation](https://bun.sh/docs/bundler)
describes a newer version. Supported flags here were checked against installed
types and the executable build/import probes, not inferred from that page.
