"""Bind isolated bridge evidence to source and artifacts; not a trust signature."""
import hashlib
import json
import os
import pathlib
import platform
import shutil
import subprocess
import sys

if not __debug__:
    raise SystemExit("Python optimization is unsupported; unset PYTHONOPTIMIZE and omit -O.")

ARTIFACTS = (
    "libkernel.rlib", "libbridge.so", "libsnapshot.so",
    "direct", "parser-tests", "kernel-tests",
)
MANIFEST = "build-manifest.json"
INPUTS = "build-inputs.json"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def fingerprint(path):
    require(path.is_file() and not path.is_symlink(), f"Expected regular file: {path}")
    return {
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "bytes": path.stat().st_size,
        "mode": oct(path.stat().st_mode & 0o777),
    }


def source_inventory(root):
    names = {"SOURCE-SHA256.json", "bridge/SOURCE-SHA256.json"}
    for name in tuple(names):
        names.update(json.loads((root / name).read_text()))
    result = {}
    for name in sorted(names):
        path = root / name
        require(path.resolve().is_relative_to(root.resolve()), "Source path escapes package")
        result[name] = fingerprint(path)
    return result


def kernel_inventory(out):
    paths = sorted((out / "kernel-src").rglob("*"))
    result = {str(p.relative_to(out)): fingerprint(p) for p in paths if p.is_file()}
    require(bool(result), "Missing generated kernel sources")
    return result


def artifact_inventory(out):
    result = {name: fingerprint(out / name) for name in ARTIFACTS}
    if (out / "native-probe").exists():
        result["native-probe"] = fingerprint(out / "native-probe")
    return result


def tool_record(command, required=True):
    if not command:
        return None
    found = shutil.which(command)
    if not found:
        require(not required, f"Executable not found: {command}")
        return {"available": False}
    # Record the invoked path as well as the resolved executable. Do not read
    # wrapper text into evidence, inspect credentials, or dump the environment.
    path = pathlib.Path(found).absolute()
    resolved = path.resolve()
    return {"path": str(path), "resolved": str(resolved), **fingerprint(resolved)}


def write_new(path, value):
    with path.open("x") as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.write("\n")


def build_inputs(root):
    rustc = os.environ.get("RUSTC", "rustc")
    version = subprocess.run(
        [rustc, "--version", "--verbose"], check=True, capture_output=True,
        text=True, timeout=15,
    ).stdout.strip()
    return {
        "sources": source_inventory(root),
        "build": {
            "target": os.environ.get("TARGET", "i686-unknown-linux-gnu"),
            "rust_sysroot": os.environ.get("RUST_SYSROOT") or None,
            "rustc_version": version,
            "rustc": tool_record(rustc),
            "linker": tool_record(os.environ.get("LINKER")),
            "cc": tool_record(os.environ.get("CC")),
            "python": platform.python_version(),
            "platform": platform.system(),
            "machine": platform.machine(),
        },
    }


def verify(root, out, manifest_path):
    saved = json.loads(manifest_path.read_text())
    require(saved.get("version") == 1, "Unsupported build manifest")
    require(saved["sources"] == source_inventory(root), "Source differs from successful build")
    require(saved["generated_kernel"] == kernel_inventory(out), "Generated kernel differs from build")
    require(saved["artifacts"] == artifact_inventory(out), "Build artifact differs or is missing")
    return saved


def main():
    action, root_arg, out_arg, *rest = sys.argv[1:]
    root, out = pathlib.Path(root_arg).resolve(), pathlib.Path(out_arg).resolve()
    if action == "begin":
        require(not rest, "Unexpected begin arguments")
        write_new(out / INPUTS, build_inputs(root))
        print("Build inputs recorded")
    elif action == "create":
        require(not rest, "Unexpected create arguments")
        inputs = json.loads((out / INPUTS).read_text())
        require(inputs == build_inputs(root), "Source or selected toolchain changed during build")
        write_new(out / MANIFEST, {
            "version": 1,
            **inputs,
            "generated_kernel": kernel_inventory(out),
            "artifacts": artifact_inventory(out),
        })
        verify(root, out, out / MANIFEST)
        print("Build source/artifact manifest created and verified")
    elif action == "verify":
        require(len(rest) <= 1, "Unexpected verify arguments")
        verify(root, out, pathlib.Path(rest[0]) if rest else out / MANIFEST)
        print("Build source/artifact manifest matches")
    elif action in ("record-run", "verify-run"):
        require(len(rest) == 1, f"{action} requires RUN_DIR")
        run = pathlib.Path(rest[0]).resolve()
        native = os.environ.get("NATIVE_ONLY", "0") == "1"
        evidence = {
            "version": 1,
            "build_manifest": fingerprint(run / MANIFEST),
            "native_only": native,
            "disposable_trust": os.environ.get("ALLOW_DISPOSABLE_TRUST", "0") == "1",
            "tools": {
                "process_wrapper": tool_record(os.environ["PROCESS_WRAPPER"]),
                "exec_wrapper": tool_record(os.environ.get("EXEC_WRAPPER")),
                "byond_dm": tool_record(os.environ.get("BYOND_DM", "DreamMaker"), not native),
                "byond_dd": tool_record(os.environ.get("BYOND_DD", "DreamDaemon"), not native),
                "timeout": tool_record("timeout"),
                "file": tool_record("file", not native),
                "python": platform.python_version(),
            },
        }
        if action == "record-run":
            write_new(run / "run-manifest.json", evidence)
            print("Run wrapper/tool evidence recorded")
        else:
            require(
                json.loads((run / "run-manifest.json").read_text()) == evidence,
                "Selected run wrapper/tool or frozen manifest changed during execution",
            )
            verify(root, out, run / MANIFEST)
            print("Run wrapper/tools and frozen build manifest still match")
    else:
        raise ValueError(f"Unknown action: {action}")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        raise SystemExit(f"Reproducibility check failed: {error}")
