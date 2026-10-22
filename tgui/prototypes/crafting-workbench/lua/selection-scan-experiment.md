# Nil-selection scan experiment (2026-10-22)

## Scope and exact baseline

Only the selected-identity lookup in `workbench.lua` changes: wrap the existing
loop in `if selectedIdentity ~= nil then`. No row-read optimization, model change,
adapter/lifecycle change, or shared benchmark change is included.

- Baseline commit: `32371549f2fbb14b3b3a11ce8196f47aaddde065`.
- Baseline Lua SHA-256: `02f7e315013d5270ba8906a52e2ed4778816183c1bdcbe81a9d9602b64917f0d`.
- Candidate Lua SHA-256: `ad18bccd484755f3ee1908ee2a82037f57f37e7484660235940296b8415b92ca`.

The exact baseline was saved before editing. The script restores it from the
pinned commit, checks the candidate differs **only** by the guard, and saves both
sources under `.generated/selection-scan/`. This intentionally fails if unrelated
renderer optimizations are added later; it is not a general benchmark utility.

## Reproduce

With the existing frozen dependencies installed, from this Lua directory:

```sh
bun run selection-scan-experiment.ts
bun run test
bun run check
bun run format:check
```

The experiment writes raw samples to `.generated/selection-scan/results.json`.
`selection-scan-results.json` preserves this run's complete raw output; it is not
a generated production asset. Run environment: Bun 1.2.16, Happy DOM 17.6.3,
Fengari 0.1.5 and fengari-interop 0.1.4, cloud Linux workspace.

## Actual-VM read-count evidence

The script bundles the actual production adapter and full Lua source using the
browser/production conditions and Fengari browser defines from the mounted test
runner. In the two count-only variants, a build-time adapter substitution wraps
the filtered array and its entries in JavaScript Proxies. It counts actual
numeric array accesses and `identity` property reads crossing from Fengari into
JavaScript. Production source files are never rewritten by this instrumentation.
Counters reset immediately before the measured update. These totals include
normal visible-row reads, not only the selection loop.

For the neutral 1,282-record catalog, 40 mounted rows, no selected recipe:

| Reads per update          | Baseline | Candidate | Removed |
| ------------------------- | -------: | --------: | ------: |
| Filtered-array entries    |    1,361 |        79 |   1,282 |
| Entry identity properties |    1,402 |       120 |   1,282 |

The script asserts both differences equal 1,282. It then checks selected states
on an 81-record catalog and asserts the baseline and candidate counts match:

| Selection                                           | Entry reads, both | Identity reads, both |
| --------------------------------------------------- | ----------------: | -------------------: |
| First, 40 visible rows                              |                81 |                  121 |
| Last, 81 visible rows                               |               243 |                  324 |
| Last, off-page after filter resets visibility to 40 |               161 |                  201 |

The last/off-page selected lookup still performs the original full selection
scan. This optimization does **not** remove selected-path scan cost, and the
neutral-workload benefit is not universal.

## Noninstrumented local hypothesis check

Separate baseline/candidate bundles use the original adapter with no Proxy
instrumentation. Each runs in a fresh process/VM, with 1,282 records, 40 visible
rows and no selection. As in the shared workload, each update mutates one nested
craftability record, and timing surrounds the synchronous delivery-to-DOM update.
Five updates warm up; 30 samples are retained. Four pairs alternate execution
order (A/B, B/A, A/B, B/A). Median is the mean of sorted samples 15 and 16.
Neither variant is minified for this local experiment. No animation frames are
timed, and no CSS/layout or hosted/browser result is claimed.

| Pair | Baseline median ms | Candidate median ms |
| ---- | -----------------: | ------------------: |
| 1    |             12.178 |               8.938 |
| 2    |             14.406 |               5.903 |
| 3    |             14.721 |               8.623 |
| 4    |             14.051 |               5.971 |

These varying Bun/Happy DOM timings support testing the hypothesis in the hosted
browser; they do not measure browser speed, paint, startup, input latency, game
integration, or native Lua/LuaJIT. Do not compare them numerically with hosted
React/Svelte/Fengari timings. Instrumented runs retain no timing samples.

## Behavioral verification

Unchanged baseline: 28 tests, 273 assertions passed. Candidate: 31 tests,
302 assertions passed, including all existing lifecycle, action, parity and
focus tests. New explicit regressions cover:

- Neutral same-object mutation, empty/filter reset, no accidental selection,
  active search focus and no unsolicited action.
- First and last selection refresh; selected-last becoming off-page after a
  server filter update; fresh detail mutation, exact actions, back expansion and
  row focus restoration.
- Off-page replacement and removal, inert old actions, and no resurrection when
  a removed recipe returns.

Typecheck and formatting pass. Production builds and hosted A/B validation are
separate coordinated gates, not performed by this experiment.
