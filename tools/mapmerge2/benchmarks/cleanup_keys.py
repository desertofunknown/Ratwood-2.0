#!/usr/bin/env python3
"""Read-only cleanup benchmark: frozen 851bb446 baseline vs current production code."""

import sys

sys.dont_write_bytecode = True

import argparse
import contextlib
import gc
import hashlib
import importlib.util
import inspect
import io
import json
from pathlib import Path
import platform
import statistics
import time
import tracemalloc

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools"))

import bidict
from mapmerge2.dmm import Coordinate, DMM, save_dmm, save_tgm

LEGACY_COMMIT = "851bb446133c875b60d41033e84ff1a6d7208cba"
LEGACY_SOURCE = "tools/mapmerge2/dmm.py"
LEGACY_SOURCE_SHA256 = "1ecb1c6012ae7526abfb8b1acfb0f231aa297c77b607e9efa1f6cb792a03def1"
UPDATE_SCRIPT = "tools/UpdatePaths/Scripts/2226_turf_closed_void.txt"
MAPS = (
    "_maps/map_files/roguetest/roguetest.dmm",
    "_maps/map_files/rockhill/rockhill.dmm",
    "_maps/map_files/dun_world/dun_worldredux.dmm",
)
EXPECTED_INPUT_SHA256 = {
    MAPS[0]: "507053d78157fd597fc5a6d353ca19d2ca74fa070848fbcde505bec92b9c5212",
    MAPS[1]: "926bcbf9a6851c11095c76c64ec455cd0ddfb6b9aad14a50adafacdb459298af",
    MAPS[2]: "a7e769a1a9cd6bb79362ed0c79c82dda74fc3476edcbd00bd51bfd50232600c2",
    UPDATE_SCRIPT: "20b4c77181deea4da0c4603d50c1e9aa60b0faa68aebb8c2a2fb18b1f0981138",
}


def legacy_remove_unused_keys(self, modified_keys=None):
    """Verbatim method body from LEGACY_COMMIT, tools/mapmerge2/dmm.py:86-92."""
    unused_keys = list(set(modified_keys)) if modified_keys is not None else self.dictionary.keys()
    for key in self.grid.values():
        if key in unused_keys:
            unused_keys.remove(key)
    for key in unused_keys:
        del self.dictionary[key]


def forbid_map_write(*args, **kwargs):
    raise AssertionError("This benchmark must never write a map file")


# Updates and serialization below work only on memory objects/StringIO.
DMM.to_file = forbid_map_write
CURRENT_CLEANUP = DMM.remove_unused_keys


def sha256_file(relative_path):
    return hashlib.sha256((ROOT / relative_path).read_bytes()).hexdigest()


def check_inputs(expected):
    actual = {path: sha256_file(path) for path in expected}
    if actual != expected:
        changed = [path for path in expected if actual[path] != expected[path]]
        raise AssertionError("Benchmark inputs changed: " + ", ".join(changed))
    return actual


def clone(source):
    result = DMM(source.key_length, source.size)
    result.header = source.header
    result.dictionary = source.dictionary.copy()
    result.grid = source.grid.copy()
    return result


def state(data):
    return (
        data.key_length,
        data.size,
        data.header,
        list(data.dictionary.items()),
        list(data.dictionary.inv.items()),
        list(data.grid.items()),
    )


def validate(data, modified):
    old, new = clone(data), clone(data)
    source_before = state(data)
    modified_before = list(modified)
    assert legacy_remove_unused_keys(old, modified) is None
    assert CURRENT_CLEANUP(new, modified) is None
    assert state(old) == state(new), "Legacy/current cleanup results differ"
    assert state(data) == source_before, "Source fixture mutated"
    assert modified == modified_before, "Caller modified-key list mutated"
    assert list(new.grid.items()) == list(data.grid.items())
    assert (new.key_length, new.size, new.header) == (data.key_length, data.size, data.header)
    used, requested = set(data.grid.values()), set(modified)
    expected = [(key, value) for key, value in data.dictionary.items()
                if key not in requested or key in used]
    assert list(new.dictionary.items()) == expected
    for key, value in new.dictionary.items():
        assert new.dictionary.inv[value] == key
    output_hashes = {}
    for label, writer in (("dmm", save_dmm), ("tgm", save_tgm)):
        left, right = io.StringIO(), io.StringIO()
        writer(old, left)
        writer(new, right)
        assert left.getvalue() == right.getvalue(), label + " serialization differs"
        output_hashes[label] = hashlib.sha256(right.getvalue().encode("utf-8")).hexdigest()
    return len(data.dictionary) - len(new.dictionary), output_hashes


def benchmark(label, data, modified, repeats):
    removed, output_hashes = validate(data, modified)
    functions = {"legacy": legacy_remove_unused_keys, "current_production": CURRENT_CLEANUP}
    samples = {name: [] for name in functions}
    for function in functions.values():
        function(clone(data), modified)  # Untimed warmup.
    for repeat in range(repeats):
        order = list(functions) if repeat % 2 == 0 else list(reversed(functions))
        for name in order:
            working = clone(data)
            gc.collect()
            gc_was_enabled = gc.isenabled()
            gc.disable()
            try:
                start = time.perf_counter_ns()
                functions[name](working, modified)
                samples[name].append((time.perf_counter_ns() - start) / 1e6)
            finally:
                if gc_was_enabled:
                    gc.enable()
    result = {
        "case": label,
        "cells": len(data.grid),
        "dictionary": len(data.dictionary),
        "unique_modified": len(set(modified)),
        "removed": removed,
        "repeats": repeats,
        "serialized_output_sha256": output_hashes,
    }
    for name, function in functions.items():
        working = clone(data)
        gc.collect()
        tracemalloc.start()
        try:
            function(working, modified)
            retained, peak = tracemalloc.get_traced_memory()
        finally:
            tracemalloc.stop()
        result[name] = {
            "samples_ms": samples[name],
            "median_ms": statistics.median(samples[name]),
            "min_ms": min(samples[name]),
            "max_ms": max(samples[name]),
            "peak_extra_bytes": peak,
            "retained_extra_bytes": retained,
        }
    result["saved_ms"] = result["legacy"]["median_ms"] - result["current_production"]["median_ms"]
    result["peak_extra_bytes_saved"] = result["legacy"]["peak_extra_bytes"] - result["current_production"]["peak_extra_bytes"]
    return result


def fixture(cells, modified_count):
    data = DMM(3, Coordinate(cells, 1, 1))
    data.header = "// cleanup benchmark fixture"
    data.dictionary.update({
        key: (f"/obj/item/test{key}", "/turf/open", "/area/test")
        for key in range(modified_count + 1)
    })
    data.grid = {(index + 1, 1, 1): index % (modified_count // 2)
                 for index in range(cells)}
    return data, list(range(modified_count))


def check_default_api():
    cases = []
    for label, empty_grid, expected_error in (
        ("used_grid_key", False, AttributeError),
        ("empty_grid", True, RuntimeError),
    ):
        data, _ = fixture(1, 2)
        if empty_grid:
            data.grid.clear()
        old, new = clone(data), clone(data)
        try:
            legacy_remove_unused_keys(old)
        except expected_error as error:
            old_error = type(error).__name__ + ": " + str(error)
        else:
            raise AssertionError("Frozen legacy default failure was not reproduced")
        CURRENT_CLEANUP(new)
        used = set(data.grid.values())
        assert list(new.dictionary.items()) == [(key, value) for key, value in data.dictionary.items() if key in used]
        assert list(new.grid.items()) == list(data.grid.items())
        cases.append({"case": label, "legacy_error": old_error, "current_status": "pass"})
    return cases


def load_update_paths():
    spec = importlib.util.spec_from_file_location("cleanup_benchmark_update_paths", ROOT / "tools/UpdatePaths/__main__.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--quick", action="store_true", help="Run only the default bounded cases (already the default)")
    parser.add_argument("--large-synthetic", action="store_true", help="Also run a 630,000-cell/1,024-candidate half-unused fixture")
    parser.add_argument("--illustrative-merge", action="store_true", help="Also simulate broad railing removal on a Rockhill memory copy; slow legacy runs, no map writes")
    parser.add_argument("--repeats", type=int, default=3, help="Timed repetitions per function, 1–9 (default: 3)")
    args = parser.parse_args()
    if args.quick and (args.large_synthetic or args.illustrative_merge):
        parser.error("--quick cannot be combined with stress-case flags")
    if not 1 <= args.repeats <= 9:
        parser.error("--repeats must be between 1 and 9")
    if bidict.__version__ != "0.22.0":
        parser.error("Use the tools/requirements.txt pin bidict==0.22.0 for this comparison")
    if not __debug__:
        parser.error("Do not use python -O: equivalence assertions must remain enabled")
    inputs_before = check_inputs(EXPECTED_INPUT_SHA256)
    report = {
        "comparison": "frozen attributed legacy method vs actual imported current DMM.remove_unused_keys",
        "legacy_commit": LEGACY_COMMIT,
        "legacy_source": LEGACY_SOURCE,
        "legacy_source_sha256": LEGACY_SOURCE_SHA256,
        "current_method_source_sha256": hashlib.sha256(inspect.getsource(CURRENT_CLEANUP).encode("utf-8")).hexdigest(),
        "runtime": {"python": platform.python_version(), "implementation": platform.python_implementation(), "platform": platform.platform(), "bidict": bidict.__version__},
        "inputs_sha256": inputs_before,
        "timing_scope": "cleanup only; excludes parsing, path updates, cloning, validation, serialization; alternating order; GC disabled only during timed calls",
        "memory_scope": "separate tracemalloc incremental cleanup peak; excludes fixture creation; not RSS or whole-map memory",
        "default_api_checks": check_default_api(),
        "results": [],
    }
    try:
        data, modified = fixture(5000, 64)
        report["results"].append(benchmark("synthetic_small_half_unused", data, modified, args.repeats))
        if args.large_synthetic:
            data, modified = fixture(630000, 1024)
            report["results"].append(benchmark("synthetic_large_half_unused", data, modified, args.repeats))
        update_paths = load_update_paths()
        updates = [line for line in (ROOT / UPDATE_SCRIPT).read_text(encoding="utf-8").splitlines()
                   if line.strip() and not line.lstrip().startswith("#")]
        for relative_path in MAPS:
            data = DMM.from_file(ROOT / relative_path)
            working = clone(data)
            modified = []
            with contextlib.redirect_stdout(io.StringIO()):
                for update in updates:
                    modified.extend(update_paths.update_path(working, update))
            report["results"].append(benchmark(relative_path + " | actual 2226 update in memory", working, modified, args.repeats))
            if args.illustrative_merge and relative_path == MAPS[1]:
                working = clone(data)
                with contextlib.redirect_stdout(io.StringIO()):
                    modified = update_paths.update_path(working, "/obj/structure/fluff/railing/@SUBTYPES : @DELETE")
                report["results"].append(benchmark(relative_path + " | illustrative railing removal in memory (NOT a proposed map edit)", working, modified, args.repeats))
    finally:
        report["inputs_unchanged"] = check_inputs(inputs_before) == inputs_before
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
