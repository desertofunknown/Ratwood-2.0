# Matched Svelte 5 crafting comparison

This is a standalone comparison of the adjacent React prototype, not a production replacement or migration. It has no game backend, BYOND bridge, SSR, SvelteKit, server, remote requests or deployment configuration.

## Boundary

- `Workbench.svelte` uses Svelte 5 runes and imports the exact shared `../model.ts`. It matches the React element hierarchy, CSS classes, copy, filters, identity selection, 40-row pagination and action payloads.
- Both demos use `../fixtures.ts`, `../workbench.css`, `../demo.css`, the same local fonts and `../browser-harness.ts`. No duplicate stylesheet or smaller fixture is substituted.
- `Demo.svelte` / `demo.ts` reproduce the demo shell, action log and explicit data-delivery API. `Delivery.svelte` / `adapter.ts` provide the same delivery semantics for mounted component checks. Each delivered object receives a new outer envelope, even when nested backend records were mutated in place. Passing a mutated plain object without a delivery is not a supported update mechanism.
- The material checkbox remains server-controlled. The demo alone simulates acknowledgement. Missing hints never disable crafting or imply readiness.
- Local state belongs to the selected identity, not a recipe snapshot. Removal/replacement closes details; disappearing categories reset to all categories; updates to the same selected recipe preserve active filter focus and detail scroll.
- Nothing in this directory changes the production root package, lockfile, interface registry or game routing.

## Reproduce

Use Bun 1.2.16 and the existing root TGUI development dependencies (React and Happy DOM are reused only for checks):

```sh
cd tgui/prototypes/crafting-workbench/svelte
bun install --frozen-lockfile --ignore-scripts
bun run format:check
bun run check
bun run build
bun run test
```

The subproject pins Svelte 5.57.2 and its development tools, with its own lockfile. It is not a member of the root package workspaces.

`build.ts` uses the official Svelte compiler with `generate: 'client'`, `dev: false`, `css: 'external'`, and `runes: true`, followed by Bun's browser-target, minified production IIFE build with explicit `browser` and `production` resolution conditions. Shared CSS is copied byte-for-byte. Compiler warnings fail the build. The generated `dist/index.html` has a local-only CSP including `connect-src 'none'`.

Bun 1.2.16 resolves the runtime's `esm-env` DEV flag to false but retains some inactive diagnostic branches in its minified output. Their strings are not evidence of active development mode. This is a same-Bun comparison, not the best achievable tree-shaken size for either framework. The Svelte compiler's development instrumentation is off.

Official compiler reference: https://svelte.dev/docs/svelte/svelte-compiler

## What is verified

`mounted-checks.ts` is compiled to production browser client code, then executed in the existing Happy DOM environment. Its filename deliberately avoids automatic discovery by the root test suite, which cannot import raw `.svelte` files. `test.ts` runs the generated tests explicitly.

The checks cover duplicate paths; literal, case-insensitive ingredient/name search; exact default, batch and repeat actions; strict material hints; server-controlled filtering and reset; disappeared categories; source-slot replacement; same-reference nested updates; selected-detail focus/scroll retention; all 1,282 paginated entries; repeated open/back cycles; native control attributes; repeat-key suppression; and matched React/Svelte element hierarchy, CSS classes, control values, ARIA semantics and whitespace-normalized visible text.

These are mounted semantic checks, not a browser rendering or keyboard simulation benchmark. Happy DOM does not establish layout, screenshots, paint, real key activation, input latency, memory, FPS or BYOND embedded-browser compatibility. No real browser was launched for this comparison.

## Evidence and measurement limits

`dist/bundle-sizes.json` records raw and level-9 gzip transfer bytes per output, SHA-256 artifact and source hashes, compiler/bundler versions, resolution conditions and scope. It includes the standalone framework runtime, demo fixture, demo shell and opt-in benchmark harness. Identical CSS and font costs are reported separately.

This standalone size comparison does not equal the incremental cost in an existing React-based TGUI bundle. Loading Svelte alongside the existing runtime can add rather than replace framework cost. No recommendation to migrate production follows from bytes alone.

The shared opt-in `window.workbenchBenchmark.run()` is supplied for later execution in a supported real browser. It is never run automatically. It measures a synthetic delivered update through two animation frames, not exact paint, startup, true input latency or in-game performance. `window.workbenchDemo` exposes actions, awaited update and terminal unmount for controlled evaluation. There are no recorded browser timing, memory or FPS results in this deliverable.
