# Disconnected React-owned Svelte bridge fixture

This is an integration-test artifact, not an enabled interface or a framework
replacement. The measured Svelte adapter, components, CSS, browser harness and
`dist` are unchanged. No production route, transport, store, build, package,
lockfile or DM registration is changed. Baseline executable source:
`f796d58e5126b6e88d3fa61e3a91f952dba26731`.

## Ownership and delivery contract

- `ReactHost.tsx` lets React own one container and gives each Svelte generation a
  separate child target. Svelte exclusively owns that target's descendants.
- The input is the complete `backendReducer`-merged data, not a transport patch.
  Missing initial recipe/craftability collections become empty collections. Every
  committed host render delivers a fresh outer envelope, even if the caller
  explicitly reuses and mutates the same snapshot. React-coalesced deliveries
  render the latest state; this does not promise to paint intermediate snapshots.
- Initial mount renders once without an immediate duplicate update. A stable
  per-generation action forwarder uses the latest committed callback and passes
  the original payload object, without copying or serializing it.
- The real `sendAct` remains responsible for payload validation, serialization and
  oversize negotiation. It does **not** enforce lifecycle or status authorization.
- Disposal fences callbacks and detaches the old target before calling the
  Promise-returning Svelte unmount. Old completion/rejection cannot target a new
  generation. Mount/update/unmount errors reach `onError`; failed updates also
  retire their own uncertain generation. Recovery needs another explicit commit,
  not an automatic retry loop. The error reporter must not throw.

## Why the tiny notification observer exists

The preserved `REPRO` test demonstrates a bug in a **naive new commit-only host**,
not a discovered production-game bug: a suspend acknowledgement and resume update
in one synchronous turn leave the final React-observed suspended flag unchanged.
The old callback then still reaches real `sendAct`. This test intentionally asserts
that unsafe baseline; the guarded counterpart rejects the same old callback and
button both before and after React commits.

`bridge/lifetime.ts` observes only the existing common store notifications. It
increments a local epoch when active-route state or pooled identity changes. Its
predicate uses actual `suspended`, `suspending`, `config.refreshing`, interface
name/layout and window key. The refreshing flag follows the real `routes.tsx`
RefreshingWindow branch; there is no invented refresh message. The observer is
installed before the fixture's ordinary `useSyncExternalStore` subscription and
has idempotent cleanup. It adds no cache, reducer, transport listener or general
subscription framework. A production owner/placement decision is still needed.

An update during `suspending` is **not** treated as acknowledgement. Tests use the
real suspend acknowledgement to clear middleware retry/payload timers before
resuming. `helpers.js` is never loaded; the in-memory `Byond.subscribe` throws if
called. The production `tgui/index.tsx` remains the sole native subscription owner.

## Run and check

From this directory, using the already provisioned Bun and pinned dependencies:

```sh
bun run bridge-test.ts
bun run check
bun node_modules/typescript/bin/tsc -p bridge/tsconfig.json
bun run test.ts
bun node_modules/prettier/bin/prettier.cjs --check ReactHost.tsx bridge-test.ts BRIDGE-HARNESS.md tsconfig.json 'bridge/*.{ts,tsx,json}'
```

The runner compiles real Svelte production-client components, resolves production
React/browser conditions and executes an isolated Happy DOM child. It mirrors the
production exact `tgui-core/components` keyboard adapter and base-component aliases.
The debug barrel eagerly imports Rspack-only development-story discovery, so the
fixture replaces only `import.meta.webpackContext` with a context whose story
access throws. No stories are used or silently fabricated. Backend, middleware,
common store, sendAct, Window, TitleBar, drag and keyboard components remain real.

The host and tiny lifetime observer stay under the existing strict prototype
check. The integration fixture separately extends the existing legacy production
TypeScript settings. No strict check was weakened and no `ts-ignore` was added.
Warnings are not suppressed; the expected in-memory storage fallback warning is
visible. Teardown restores global descriptors, globalStore, focus, root/body styles
and root class; it acknowledges suspend, awaits pending disposal and cleans owned
subscriptions and drag/blur listeners. This child never contacts a native client,
server or database, creates a network listener, or starts a browser.

## Coverage and limits

The 19 cases cover initial suspension/missing recipes, static/dynamic/config-only
merging, same-object nested mutation, rapid delivery, exact craft 1/2/3/5/repeat and
server-controlled filter actions, duplicate-name paths, callback/payload identity,
selected removal, real chunk negotiation, suspendStart/ack/resume, coalesced
suspend/refresh/route transitions, pooled keys, pending-tick unmount, repeat disposal
and remount, mount/update/unmount failures, and old callback/button fencing.

The separate real-Window group checks title, visibility/close calls, existing
observer/status dimmer thresholds and owned drag/blur listener cleanup. It preserves
existing policy: Window's dimmer controls ordinary browser interaction and the DM
server owns action permission. A programmatic Happy DOM click can bypass hit testing;
its captured sendAct call is **not** server acceptance or permission to craft.

Repeated-root cleanup is tested; development React StrictMode replay is not. Happy
DOM does not establish CSS layout, real scrolling, native focus/keyboard acceptance,
startup, memory or incremental hybrid bundle/runtime cost. No new performance claim
is made. The real browser evidence only provisionally favors Svelte. Production's
Edge >=123 target versus checked-in BYOND client min511/build1421 remains a rollout
gate. No native runtime was launched. Activation, production bundling and native
validation require later decisions.
