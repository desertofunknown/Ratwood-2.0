# Verification record

2026-10-20: 30 Rust unit tests passed, zero failed, ignored or filtered out;
zero doctests. Rust/cargo 1.99.1, offline, one build job and one test thread.
All six Rust source files in SOURCE-SHA256.json are byte-identical to that run.
The copied portable package then independently passed the same 30-test command
and cargo check, offline and serial, using the existing toolchain and target cache.
No external fixture data is required for these tests.

Included tests cover deterministic Dijkstra behavior, cancellation/generation/
deadline and graph/path/work limits; queue/outbox accounting and contention;
close/poison/panic cleanup; replay numeric and source-order behavior; controlled
active cancellation/supersession/expiry; retained capacities, replay node/trace
bounds, exact identity matching, and mixed Dijkstra/replay shared admission.

The tests are bounded correctness checks, not exhaustive interleaving coverage,
security certification, hard-latency guarantees or performance benchmarks. No
full-game or live-world execution is performed by this portable test suite.
