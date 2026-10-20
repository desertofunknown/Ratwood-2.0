#!/usr/bin/env bash
set -euo pipefail
B=$(cd "$(dirname "$0")" && pwd)
python3 "$B/validate_fixtures.py"
OUT_DIR=${OUT_DIR:-"$B/.build"}
OUT_DIR=$(cd "$OUT_DIR" && pwd)
# Supplied executable wrappers can configure an existing QEMU/sysroot or native
# execution. PROCESS_WRAPPER must enforce the caller's isolated offline policy.
: "${PROCESS_WRAPPER:?Set PROCESS_WRAPPER to an existing process isolation wrapper}"
EXEC_WRAPPER=${EXEC_WRAPPER:-}
BYOND_DM=${BYOND_DM:-DreamMaker}
BYOND_DD=${BYOND_DD:-DreamDaemon}
RUN_DIR=${RUN_DIR:-"$OUT_DIR/run"}
if [[ -e "$RUN_DIR" ]]; then echo 'Use a new RUN_DIR to preserve prior results' >&2; exit 2; fi
mkdir -p "$RUN_DIR/logs"
RUN_DIR=$(cd "$RUN_DIR" && pwd)
mkdir -p "$RUN_DIR/home"
export HOME="$RUN_DIR/home"
cp "$B/"*.dm "$B/"*.dme "$OUT_DIR/libbridge.so" "$OUT_DIR/libsnapshot.so" "$RUN_DIR/"
cp -R "$B/payloads" "$RUN_DIR/"
cd "$RUN_DIR"
run_native() { if [[ -n "$EXEC_WRAPPER" ]]; then timeout --kill-after=3s 60s "$PROCESS_WRAPPER" "$EXEC_WRAPPER" "$@"; else timeout --kill-after=3s 60s "$PROCESS_WRAPPER" "$@"; fi; }
if [[ -x "$OUT_DIR/native-probe" ]]; then run_native "$OUT_DIR/native-probe" >logs/native-probe.log 2>&1; fi
run_native "$OUT_DIR/parser-tests" --test-threads=1 >logs/parser-tests.log 2>&1
run_native "$OUT_DIR/kernel-tests" --test-threads=1 >logs/kernel-tests.log 2>&1
run_native "$OUT_DIR/direct" payloads/human_*.txt >logs/direct.log 2>&1
# Test mode permits host-only parser/kernel checks without a BYOND installation.
if [[ ${NATIVE_ONLY:-0} == 1 ]]; then python3 "$B/compare.py" "$B" "$RUN_DIR" --native-only; echo NATIVE_CHECKS_PASS; exit 0; fi
# BYOND 516 Linux requires ELF32. Reject accidental host x86_64 library builds.
file libsnapshot.so | grep -q 'ELF 32-bit'
flags=(-close -invisible)
if [[ ${ALLOW_DISPOSABLE_TRUST:-0} == 1 ]]; then flags+=(-trusted); fi
for world in smoke harness; do
 timeout --kill-after=3s 60s "$PROCESS_WRAPPER" "$BYOND_DM" "$world.dme" >"logs/$world-compile.log" 2>&1
 timeout --kill-after=3s 60s "$PROCESS_WRAPPER" "$BYOND_DD" "$world.dmb" "${flags[@]}" >"logs/$world-runtime.log" 2>&1
 ! grep -q FAIL "logs/$world-runtime.log"
done
grep -q BRIDGE_SMOKE_PASS logs/smoke-runtime.log
grep -q SNAPSHOT_BRIDGE_PASS logs/harness-runtime.log
python3 "$B/compare.py" "$B" "$RUN_DIR"
echo PORTABLE_BRIDGE_PASS
