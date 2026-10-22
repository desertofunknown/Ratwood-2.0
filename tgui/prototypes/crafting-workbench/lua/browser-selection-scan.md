# Hosted selection-scan A/B (2026-10-22)

The [nil-selection guard](selection-scan-experiment.md) reduced the measured
neutral-state update cost in a real Chromium browser. This supports retaining
that guard, not selecting Lua as the production framework.

## Matched artifacts and method

Candidate source: [5f0f25b](https://github.com/desertofunknown/Ratwood-2.0/commit/5f0f25b24908dd2371ea25fcb9f063c167c82b1e).
The baseline uses the unchanged JavaScript from
[32371549](https://github.com/desertofunknown/Ratwood-2.0/commit/32371549f2fbb14b3b3a11ce8196f47aaddde065).
Both routes use the candidate's identical shared CSS. Exact artifact hashes and
every raw sample are in [browser-selection-scan-results.json](browser-selection-scan-results.json).

- Existing visible cloud Chromium, reported Chrome/155.0.0.0 on Linux x86_64.
  This reduced user agent does not identify the installed patch version.
- Same 1180×757 CSS viewport, 100% zoom, 1,282 synthetic recipes, 40 rendered rows,
  and no selected recipe. No game-server connection.
- Fresh page navigation and the visible comparison button for each run.
  Five warmups, then 30 recorded deliveries per run; three runs per arm.
- Execution order: baseline, candidate, candidate, baseline, baseline, candidate.
  The harness recorded visible document state throughout.
- Timing surrounds delivery through the adapter's DOM-commit acknowledgment.
  The separately retained two-animation-frame samples are not substituted for it.

## Observations (milliseconds)

| Arm      | Run medians           | Pooled median | P10–P90     | Retained maximum |
| -------- | --------------------- | ------------: | ----------- | ---------------: |
| Baseline | 15.25 / 14.15 / 15.50 |         15.35 | 10.90–30.70 |           192.20 |
| Guard    | 6.00 / 5.70 / 8.20    |          6.70 | 4.60–13.20  |            45.90 |

Each arm retains all 90 samples, including outliers. Medians average the middle
pair; pooled P10/P90 use sorted indices 9 and 80. The pooled median fell by
8.65 ms, approximately 56%. Pooled samples are descriptive, not independent
statistical replicates. The shared cloud machine was not exclusively reserved
or resource-isolated; these results do not establish a tail-latency guarantee.

The actual-VM counter experiment separately establishes the mechanism: neutral
updates avoid 1,282 filtered-entry reads and 1,282 identity-property reads through
interop. Selected first/last/off-page cases retain the original scan. Their
performance was **not** measured in this hosted A/B, so the gain is not universal.

These are warm wall-clock update measurements, not isolated CPU time, startup,
memory, exact paint, input latency, game FPS, native BYOND-client acceptance, or
native Lua/LuaJIT performance. Earlier React/Svelte measurements were separate
runs, not simultaneous controls for this A/B. No framework migration follows
from this result; production integration and broader workload evaluation remain
separate decisions.
