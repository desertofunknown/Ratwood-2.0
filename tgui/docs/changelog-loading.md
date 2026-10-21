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

## Search the loaded month

Search matches a trimmed, case-insensitive substring of the displayed author,
category key, or description. It filters only the loaded archive, never fetches
other months, and preserves matching rows and their original order. Blank or
whitespace-only queries show the unfiltered archive. Credits and license links
remain visible even when no change matches.

The query stays in place while navigating months, loading, or showing a load
failure, so the same topic can be followed through adjacent months. Match counts
and the no-results message appear only after an archive loads. Clear resets the
query and returns focus to the search input; reopening the window starts with an
empty query. Enter and Escape keep the input component's normal blur behavior
without submitting a server action or resetting the query.

## Malformed archive data

Parsed YAML is checked before rendering: dates must be accepted by the existing
formatter, author groups must be records, changes must be lists of records, and
the displayed first description must be a scalar (or absent). Invalid shapes use
the same bounded retry path as syntax failures instead of throwing during render.
No entries are rewritten or silently removed. Empty groups/rows, unknown
categories, extra undisplayed keys and scalar descriptions remain accepted.
Compatibility tests cover every checked-in monthly archive; mounted tests verify
malformed-data recovery. These are not native-client or full-game tests.
