#!/usr/bin/env bash
set -euo pipefail
B=$(cd "$(dirname "$0")" && pwd)
OUT_DIR=${OUT_DIR:-"$B/.build"}
mkdir -p "$OUT_DIR"
OUT_DIR=$(cd "$OUT_DIR" && pwd)
RUSTC=${RUSTC:-rustc}
TARGET=${TARGET:-i686-unknown-linux-gnu}
common=(--target="$TARGET" -C opt-level=1 -C debuginfo=0)
if [[ -n ${RUST_SYSROOT:-} ]]; then common+=(--sysroot="$RUST_SYSROOT"); fi
if [[ -n ${LINKER:-} ]]; then common+=(-C linker="$LINKER"); fi
# Preserve original research crate. This generated build-only copy matches the
# reviewed bridge kernel: a single explicit 2 MiB stack configuration difference.
python3 - "$B/../src" "$OUT_DIR/kernel-src" <<'PY'
import pathlib,shutil,sys
source,dest=map(pathlib.Path,sys.argv[1:]);shutil.copytree(source,dest,dirs_exist_ok=True)
p=dest/'lib.rs';s=p.read_text();old='thread::Builder::new().name("path-prototype".into()).spawn';assert s.count(old)==1
p.write_text(s.replace(old,'thread::Builder::new().name("path-prototype".into()).stack_size(2 * 1024 * 1024).spawn'))
PY
"$RUSTC" "$OUT_DIR/kernel-src/lib.rs" --edition=2021 --crate-name=kernel --crate-type=rlib "${common[@]}" -o "$OUT_DIR/libkernel.rlib"
"$RUSTC" "$B/echo.rs" --edition=2024 --crate-type=cdylib "${common[@]}" -o "$OUT_DIR/libbridge.so"
"$RUSTC" "$B/bridge.rs" --edition=2024 --crate-type=cdylib --extern kernel="$OUT_DIR/libkernel.rlib" "${common[@]}" -o "$OUT_DIR/libsnapshot.so"
"$RUSTC" "$B/bridge.rs" --edition=2024 --extern kernel="$OUT_DIR/libkernel.rlib" "${common[@]}" -o "$OUT_DIR/direct"
"$RUSTC" "$B/parser_tests.rs" --edition=2024 --test --extern kernel="$OUT_DIR/libkernel.rlib" "${common[@]}" -o "$OUT_DIR/parser-tests"
"$RUSTC" "$OUT_DIR/kernel-src/lib.rs" --edition=2021 --test "${common[@]}" -o "$OUT_DIR/kernel-tests"
# Native null-pointer probe is optional; CC must already target TARGET.
if [[ -n ${CC:-} ]]; then "$CC" "$B/native.c" -L"$OUT_DIR" -lbridge -o "$OUT_DIR/native-probe"; fi
printf 'Source-only bridge built in %s for %s\n' "$OUT_DIR" "$TARGET"
