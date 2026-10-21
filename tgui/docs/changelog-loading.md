# Changelog request lifecycle

Each month selection owns one request generation and at most one retry timer.
Selecting another month or unmounting invalidates the generation and clears its
scheduled retry. A generation identifier, rather than date equality, prevents an
older October request from replacing a newer October request after navigating
October → September → October. Already-started fetches are not aborted; their
results and failures are ignored after invalidation.

Missing assets, fetch failures, body-read failures, and YAML syntax errors share
the existing six-attempt limit and backoff. A retry uses the action callback
captured for its request generation and resolves the asset URL again, allowing
backend asset mappings to arrive between attempts. Existing status wording,
month ordering, archive rendering, credits, links, and layout are unchanged.

## Regression coverage

Run `bun test packages/tgui/__tests__/changelog-loading.test.tsx` from `tgui`.
The test launches a bounded isolated Bun subprocess so its layout-only mock does
not affect other tests. It mounts the production Changelog with real React,
backend state and asset resolution; controlled fetch promises and retry timers
exercise failures, recovery, exhaustion, stale requests and unmount/reopen.
Success assertions inspect rendered change-description cells.

The Window shell is substituted because the real layout imports webpack-only
debug discovery. These are component request-lifecycle tests, not native-window,
DreamSeeker, visual, network-transport cancellation or full-game acceptance.
