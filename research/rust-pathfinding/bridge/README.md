# Optional isolated BYOND string-ABI bridge research

This opt-in, source-only extension adds experimental C-ABI libraries and tiny DM
harnesses. The parent crate code is preserved unchanged; its README describes
that original standalone crate. Repository attribution in the parent provenance
has been corrected. This extension is not linked
into the game, does not apply paths to gameplay, and is not production-ready.

All source and fixtures are covered by the parent AGPL-3.0 license (`../LICENSE`);
see `PROVENANCE.md`. No game art, maps, saves, raw object references, credentials,
raw capture fingerprints, binaries, runtime logs or toolchains are included.

## Prerequisites and configurable build

Use already installed Rust, Python 3.9 or newer, Bash, GNU `timeout`, and `file`.
Do not use Python `-O` or `PYTHONOPTIMIZE`: all verification entry points reject
optimization rather than silently skipping their assertion-based checks.
BYOND 516 Linux requires i686 Rust
std and a compatible 32-bit linker/libc development environment. Merely installing
Rust target std does not supply CRT/libc objects. No script installs software or
downloads dependencies. Rust 1.99.1 / BYOND 516.1673 were verified; other versions
are not established. There are no third-party Rust crates.

From this directory:

    python3 verify_source.py
    python3 validate_fixtures.py
    OUT_DIR=/chosen/build-directory RUSTC=rustc TARGET=i686-unknown-linux-gnu ./build.sh

Optional variables:
- `RUST_SYSROOT`: Rust target sysroot, passed to rustc; omit for a normal toolchain.
- `LINKER`: existing linker executable or wrapper for the selected target.
- `CC`: optional C compiler wrapper targeting i686; builds the null-pointer probe.
- `OUT_DIR`: generated code/binaries only; defaults to `.build` (ignored by Git).
  It must not exist, even if empty. Choose a fresh output directory for every
  build, including after a failure; existing artifacts are never reused.

The build copies the unchanged parent `src` into the output directory and verifies
an exact single-match edit to set the worker stack to 2 MiB there. No parent source
is modified. This build-only kernel matches the experimentally reviewed kernel.
The original 30 tests remain included and are built alongside four parser tests.
Only a completed build writes `build-manifest.json`, recording source and
generated-kernel hashes, artifact hashes/modes, target, Rust version, and selected
compiler/linker executable hashes. A runner refuses missing or mismatched evidence.
The build records its inputs before compilation and requires them to match afterward.

For a host-only portability check, set TARGET to the installed host target,
leave RUST_SYSROOT/LINKER unset as appropriate, and run with NATIVE_ONLY=1. Host
libraries must never be loaded into the 32-bit BYOND process; the runner checks ELF32.

## Isolated execution

`run.sh` requires `PROCESS_WRAPPER`, an already authorized executable wrapper that
enforces the caller's isolated offline test policy. It does not install such a
wrapper or change host security/network settings. `EXEC_WRAPPER` optionally names
an executable script configuring QEMU plus the local i386 runtime/sysroot for
Rust/C programs; omit for native i386 execution. The wrapper must pass through
arguments, return exit status and configure shared-library paths when running the
optional native C probe. `BYOND_DM` and `BYOND_DD` similarly select existing engine
executables/wrappers (defaults DreamMaker and DreamDaemon).

    OUT_DIR=/chosen/build-directory PROCESS_WRAPPER=/chosen/isolation-wrapper \
      EXEC_WRAPPER=/chosen/i386-runtime-wrapper \
      BYOND_DM=/chosen/DreamMaker BYOND_DD=/chosen/DreamDaemon ./run.sh

By default, no `-trusted` flag is added. If the user has authorized that disposable
BYOND test profile, set ALLOW_DISPOSABLE_TRUST=1. BYOND's process-local trusted mode
permits external library/file/shell access within OS permissions; it is not an
isolation mechanism. Never install these libraries into a permanent trusted
location or accept unexpected permission prompts automatically.

Each run requires a new RUN_DIR (default OUT_DIR/run), preserving prior evidence.
The runner sets HOME to a fresh home subdirectory inside RUN_DIR for child processes.
The runner copies the small harness/fixtures/libraries there and retains logs and
comparison.json only there. External timeouts apply. NATIVE_ONLY=1 executes the
parser/kernel/direct replay checks without BYOND; it does not establish ABI parity.
The runner freezes the build manifest in RUN_DIR and verifies the original source
and build artifacts before and after execution. `run-manifest.json` records and rechecks the
selected executable wrapper/tool hashes and Python version, without capturing the
environment or wrapper contents. Use absolute paths or PATH-resolved command names
for wrappers. These local evidence files may contain machine-specific paths; do
not publish them. Hashes detect accidental drift, not malicious replacement, and
do not fully inventory transitive linker/runtime/sysroot dependencies. BYOND version
evidence remains in the compiler/runtime logs, not inferred from a wrapper name.

## What is tested

`echo.rs` / `smoke.dm` establish version/echo, argument shape, bounds and return
copy ownership. `bridge.rs` / `wire.rs` transport the eight self-contained numeric
snapshots through actual `call_ext`. `cases.json` contains frozen expected DM
outcomes separately from numeric requests. `compare.py` requires exact identity,
outcome and path-order agreement with both frozen DM controls and direct Rust.
The tiny world also checks malformed envelopes, busy admission, cancellation,
supersession, expiry, stop invalidation, panic containment and completed joins.
`parser_tests.rs` meters allocations and confirms no heap allocation during full
validation of accepted or rejected payloads, plus ownership and blocked attempts.

No full game starts; the fixtures are frozen captures. Identities are synthetic
transport probes, not current entity/revision bindings. Actual frozen-scene
transport parity says nothing about unverified live snapshot coherence/application.
No production speedup, hard real-time/nonblocking cost, reboot or unload safety is
claimed. A native-target performance and live identity/application contract would
require separate work and review.

## ABI, bounds and shutdown

Exports are `bridge` and `snapshot_bridge`, each C ABI `(u32, char**) -> const char*`.
Only genuine BYOND pointers and serialized non-reentrant main-thread calls are
supported. Rust copies the request; worker never retains DM pointers or invokes DM.
Output is library-owned and retained through return until a subsequent serialized
call; BYOND copies it. Reentry guards do not make concurrent response copying safe.

See `WIRE.md` for protocol and supported subset. Caps are 64 KiB input, 144 nodes,
576 directional-accounting entries, 144 path nodes, one worker/job, 100,000 work
checkpoints, 24 MiB accounted worker payload (including 8 MiB result reservation),
explicit 2 MiB worker stack, and 8 KiB response. Dense adaptation is <=104,400 logical
bytes. Parser stack, retained DM copies, trace/runtime/allocator overhead are
separate; the ledger is not process RSS.

Stop request is not thread exit. `JOINED` follows synchronous Worker destruction
and completed join, including on failed assertions. Never unload code before that
acknowledgement. If teardown stalls, the external timeout terminates the whole
isolated process, not an individual library. Caught unwind panic fails closed and
retains the worker for controlled teardown; abort/OOM/segfault remain process-fatal.
