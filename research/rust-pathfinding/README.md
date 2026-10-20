# Isolated Rust pathfinding research checkpoint

This standard-library-only experimental crate is a source backup and correctness
research package. It is not linked to Ratwood, has no FFI or live DM callbacks,
does not apply paths to gameplay, and is not a deployment or performance change.

## Run the portable checks

From this directory, using an already installed Rust toolchain:

    cargo test --offline -j 1 -- --test-threads=1
    cargo check --offline -j 1

The package has no third-party crate dependencies. Its 30 unit tests are included
in src and need no game checkout, engine, network, captured map, server, saves,
database, external files or environment-specific paths. Rust/cargo 1.99.1 was the
verification toolchain; older compilers have not been established as supported.
There are no standalone examples or benchmarks in this portable checkpoint.
Cargo publish is disabled. Use a separate target directory if disk space is tight.

## Architecture

Worker owns exactly one background thread. Its original submit(Job) runs a bounded
integer-cost Dijkstra experiment over owned CSR arrays. The explicit
submit_replay(ReplayJob) variant runs the synchronous source-order AStar replay
machine over an independently constructed owned snapshot. Both use the same
bounded pending queue, completed-result queue and reservation ledger.

The original Dijkstra algorithm is not a gameplay-AStar replacement: its cost,
tie, endpoint and other semantics deliberately differ. The replay variant retains
ordered directional attempts, denied candidates, persistent records, reverse-bit
pruning, original heap ordering and explicit separately rounded f32 operations.
It preserves raw false/null/path outcomes and has explicit Unsupported states.
A different valid or shorter route is not exact parity.

Creation is explicit and off the game tick. Admission reserves one job slot, its
accounted memory and a future result slot. Completed-but-unpolled results keep
those reservations until poll. Submit, poll and close use try_lock, distinguishing
Contention from capacity Busy and an empty outbox. Drop joins the worker and may
block; it belongs in controlled teardown. A worker panic/poison fails closed and
discards outstanding internal state rather than continuing a poisoned search.
Panic abort, OOM, process termination and memory corruption are not contained.

## Limits and result handling

- Replay inputs are capped at 256 nodes; worker node and candidate limits also
  apply. The dense per-node distance/allowed matrices must have exact shape.
- Replay retains the 4096-event and 4 MiB accounted trace-payload caps. Admission
  charges actual input Vec capacities, 8 MiB conservative retained-result reserve,
  512 bytes/node scratch reserve and 8 KiB envelope slack. Returned event and nested
  vector capacities are checked against the result reserve before publication.
- The default total worker budget is 8 MiB, intentionally too small for a replay
  job plus its reserve. Select a deliberate larger bounded Limits.bytes value
  when using ReplayJob, for example 24 MiB with two admitted job slots.
- Limits.path_nodes bounds replay reconstruction; Limits.work_per_job bounds
  cooperative algorithmic chunks. Checkpoints cover validation rows, expansion,
  directions, events and reconstruction. A chunk may contain a 256-node heap
  scan/copy or 257-value validation row. These are not CPU-instruction bounds or
  hard latency guarantees.
- Deadline, cancellation and requester-generation supersession are checked during
  work and before returning a result. Expired, cancelled, superseded, work-limit,
  path-limit and Unsupported outcomes are not NoPath. Interrupted work exposes no
  route. ReplayComplete holds the exact replay result in Answer.replay, while
  Answer.path remains the original Dijkstra-result field.

Accounting is not a hard process/RSS cap. Thread stack, allocator metadata, caller
inputs/rejected payload destruction, coordinator clones, polled/retained answers,
and outside identity mappings need their own budgets. Allocation, deallocation
and scheduling are not hard-real-time bounded. No game-tick safety is claimed.

## Caller identity and snapshot obligations

Every answer carries request, round, requester, requester_generation,
scene_revision, target_revision and capability_revision. Answer.matches_identity
checks all seven fields and tests reject each field independently. This is an
advisory equality helper: it neither reads a world nor automatically rejects a
stale route at application time.

A future caller must supply a coherent, bounded, independently captured snapshot;
never build it from the pathfinder's observed callback trace. It must account for
all callback dependencies and unknown frontier rows, then compare the full
current identity, deadline, entities and route legality before applying any result.
Requester generation alone cannot detect a changed world, target or capability.
Even a complete identity comparison can immediately become stale without a sound
mutation/versioning and apply protocol. Fingerprint equality cannot rule out
mutate-and-revert changes. No such live coordinator is implemented here.

## Verification scope

The exact source files in this package passed 30 Rust tests in the isolated
verification workspace: the previous 14 worker tests, eight replay/numeric tests,
and eight replay-worker integration groups. See TEST-RESULTS.md for the evidence
boundary and source identifiers. Test-only deterministic gates and expiry/failure
injection are absent from non-test builds.

Separately retained external differential evidence showed unchanged complete
outputs for ten synthetic anchors, a 100-case seeded corpus, and eight real-scene
requests after adding cooperative hooks. The eight actual-DM requests also matched
through the single worker (six paths, two false outcomes; 358 observed production
DIST/ADJ callbacks). The real fixture covered only one sealed floor/wall scene and
two ordinary-human adjacency profiles. Raw adjacency values were normalized to
truthiness. These evidence data and the full game exporter are intentionally not
included; portable tests alone cannot reproduce or broaden that DM result.

Doors, access policy, stairs, hazards, arbitrary callbacks, live-world mutation,
production scheduling, FFI integration and end-to-end performance remain unproven.
There is no speedup claim or recommendation to adopt this into a live runtime.

## Provenance and license

See PROVENANCE.md and the unchanged upstream LICENSE copied with this package.
This checkpoint does not invent a new license, authorship or copyright assignment.
