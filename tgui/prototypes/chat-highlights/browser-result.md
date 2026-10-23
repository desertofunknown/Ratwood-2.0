# Prepared-highlighter result: keep production unchanged

Measured 2026-10-23 against source
[`36513eba`](https://github.com/desertofunknown/Ratwood-2.0/commit/36513eba5f8415528c8201e4f4ca0e6de4c75e7e).
The experiment supports a narrow typical-burst improvement, **not production
promotion**: dense rebuild improvement was not established and tail behavior is
unresolved. Do not rerun selectively until favorable results appear.

## Method and result

Visible Chromium 155 on Linux, 1181 × 847 CSS pixels, device scale 1. Six fresh
page runs in order baseline 1, candidate 1, candidate 2, baseline 2, baseline 3,
candidate 3. Each used five warmups and 30 measured samples per scenario/phase.
All samples and outliers are retained. The tab remained selected by the operator;
visibility metadata was recorded at run start, not continuously instrumented.

Pooled medians below describe 90 observations per arm, not 90 independent runs.
Each column is a different workload; see [timing boundaries](README.md#timing-method).
All numbers are milliseconds for the complete 1,000-message operation, not
per-message latency or FPS.

| Scenario            | Single-call burst, baseline → candidate |       Restore |       Rebuild |
| ------------------- | --------------------------------------: | ------------: | ------------: |
| No highlight        |                             5.15 → 5.20 |   4.10 → 4.00 |   4.55 → 4.50 |
| One group           |                           17.85 → 17.10 | 17.00 → 16.30 | 16.30 → 16.20 |
| Multiple groups     |                           37.10 → 34.15 | 36.35 → 34.30 | 34.20 → 34.10 |
| Mixed content       |                           20.90 → 20.20 | 20.40 → 19.75 | 19.25 → 18.30 |
| Sparse highlights   |                            10.00 → 9.05 |   8.90 → 7.85 |   9.00 → 8.00 |
| Sparse no-highlight |                             4.90 → 5.00 |   3.80 → 3.80 |   4.20 → 4.30 |

Multi-group burst candidate run medians (33.65–34.80 ms) were all below baseline
run medians (35.60–39.15 ms). Sparse burst, restore and rebuild also had
nonoverlapping run-median ranges. No-highlight controls were approximately flat.
However, baseline multi-group burst medians drifted downward across runs.

The multi-group rebuild median was essentially flat while its mean increased
34.79 → 36.32 ms and nearest-rank p95 increased 41.90 → 59.80 ms. Candidate
rebuild p95 exceeded baseline in all three correspondingly numbered runs;
numbering does not establish statistical pairing. Sparse burst mean improved
only about 0.17 ms despite its 0.95 ms median improvement. Control tails also
worsened in places, so neither candidate-caused regression nor harmless system
noise is established. No significance or universal speedup is claimed.

Settings and single-message clocks were heavily quantized around 0.1 ms.
First-use here means after settings reset, not cold browser/JIT startup. Sparse
first-use is a matching message; its warm single-message case is nonmatching
after matching priming. Neither is an average sparse-message measurement.

## Correctness and adoption gate

All 15 correctness snapshot objects matched exactly, including captured HTML,
model/order/counts and events. The capture normalizes the transient
`Chat__badge--animate` class; fixture logs also contain expected differing
`createdAt` timestamps outside the compared snapshot objects. Every retained benchmark render signature matched
across all six runs. Five rendered phases have signatures; settingsUpdate does
not. FNV-1a/count signatures are not collision-proof HTML equality proofs.

The candidate retains preparation per parser, never message nodes. Settings
load/import and edits rebuild parsers, including unrelated settings edits;
message arrival does not call setHighlight. That source lifecycle, exception
behavior and regex ordering remain required invariants if reconsidered.

Production renderer/highlighter files and configuration remain unchanged. A
future promotion needs a justified tail/runtime validation plan and fresh review,
not just this median signal. These measurements exclude asynchronous callbacks,
React commits and paint and establish no native BYOND performance, heap, paced
throughput or end-to-end latency result.

## Immutable evidence identity

- Baseline bundle SHA256: `93aded53e1af7e240c48342ecd5595a670b90daffc402b1806ead6ac156fe543`
- Candidate bundle SHA256: `fa7709ded355ddbb7c887f76404bd9b45376dd84f9a49938168b1ced704dcff9`
- Build manifest SHA256: `d79ee19ebcdd0a011e78c0bf556cb24fbf28a46f55f87fa76f2a52a01d21db78`
- Delivered raw evidence archive SHA256: `4fd0696146d7931d01b8bf9c67f8ff8e2425a64a2e09619edbc9c98ce3e0c845`
- Delivered report SHA256: `7d89b1dc4118c342caee54ce730e99e78747216e06da92cf5c2f6311367c1183`

The delivered archive contains six complete raw runs, both correctness captures,
analysis script/output, summaries and provenance. The source-pinned fixture is
reproducible at the commit above; this document does not substitute for raw data.
