# Disconnected UI evaluation hub

One static workshop entry groups existing samples by player journey: prepare,
work/trade, and read/respond. Integrated RealWindow crafting is the main crafting
pair. Standalone React, Svelte and browser-Lua remain a separate research comparison.
React remains the production baseline; Svelte is provisional. No framework choice,
performance result, native-client acceptance or accessibility conformance is claimed.

## Boundaries

Only this new directory is authored. Shared tokens and every existing prototype,
bundle, route, manifest, lockfile and production file remain unchanged. There is
no game connection, backend import, client JavaScript, framework runtime, form,
preference storage, tracking, font, image or remote asset. Native links open the
fixed same-origin destinations in the same tab. Use browser Back to return to the
hub; no navigation is injected into old studies and no cross-study state is carried.

The intended mount is `/evaluation/` beside the approved routes.
`approved-routes.json` pins the verified v17 hosting inventory and source commit.
`routes.mjs` owns editorial grouping; `build.mjs` rejects unknown/missing/duplicate
route IDs and unsafe paths. The independent contract tests pin the allowed links.
Historical Lua baseline routes and the original root crafting landing stay unchanged.
Do not mount this output at another depth without an explicitly reviewed registry
update. The CSP denies scripts, connections, images, fonts, workers, objects,
base changes and form submissions; only same-origin CSS is permitted.

## Build

From the repository root, using an existing Node 22+ or Bun installation:

```sh
node tgui/prototypes/evaluation-hub/build.mjs
```

No dependency install, game, compiler, browser, server or listener is needed.
Output goes to ignored `dist/`. A build refuses a nonempty destination rather than
deleting it or including stale artifacts. Move a previous output aside before
rebuilding, or import `buildHub({ outputDir })` to write to a fresh child of `dist/`
or `.test-build/`. Outputs cannot target old studies. `renderHub(inventory)` is
async; `validateRegistry(inventory)` returns fixed relative navigation hrefs.

The artifact contains `index.html`, unchanged `tokens.css`, hub-only `hub.css`,
`LICENSE.txt`, `NOTICE.txt`, exact `source/` inputs and a deterministic
`manifest.json`. Manifest source paths are repository-relative. Artifact paths are
output-relative and cover every emitted file except the manifest itself. SHA-256
hashes cover bytes, not acceptance claims. No timestamp or machine path is emitted.
To reproduce from a distributed artifact, enter its `source/` directory and run
the command above. No other repository file is needed to rebuild this hub.

## Evaluation

Run `python3 tgui/prototypes/evaluation-hub/tests/check_hub.py` for independent
static and deterministic-build contracts. This does not establish browser behavior.
Before a hosting release, review its routes against the exact approved inventory,
verify all older output bytes remain unchanged, and test the final served artifact:

1. The hub contains no scripts. Open it, follow every study link, then use browser Back.
2. Tab from the skip link through each journey; verify focus remains visible.
3. Compare narrow and wide layouts and enlarged text for clipping and reading order.
4. Where available browser tooling permits, inspect requests for only the hub HTML
   and two local stylesheets; study requests
   after navigation belong to the studies and are not hub network evidence.
5. Verify keyboard and screen-reader names in a real browser; record environment
   and limitations instead of inferring conformance from source checks.

Building does not publish. Preserve notices, license and exact corresponding
source for the hub and independently for every linked study before distribution.
