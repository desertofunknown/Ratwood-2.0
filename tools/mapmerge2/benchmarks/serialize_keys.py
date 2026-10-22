#!/usr/bin/env python3
"""Read-only actual-production serializer A/B with an attributed frozen baseline."""

import sys

sys.dont_write_bytecode = True

import argparse
import datetime
import gc
import hashlib
import inspect
import io
import json
from pathlib import Path
import platform
import shutil
import statistics
import time
import tracemalloc
import weakref
from functools import lru_cache
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools'))

import bidict
from mapmerge2 import dmm
from mapmerge2.benchmarks import serializer_reference as reference

MAPS = {
    '_maps/map_files/roguetest/roguetest.dmm':
        '507053d78157fd597fc5a6d353ca19d2ca74fa070848fbcde505bec92b9c5212',
    '_maps/map_files/rogueworld/rogueworld.dmm':
        '179cf19ea8ca79120134106d0a1f13cffe3b5175a70578ffd535841113f7e7a3',
    '_maps/map_files/deserttown/deserttown.dmm':
        'eebde27aeffcaffe6b6376fdc862e6f303b4e5de429d04de6f7265f3e482860b',
}
WRITERS = {
    'tgm': {'baseline': reference.save_tgm, 'current_production': dmm.save_tgm},
    'dmm': {'baseline': reference.save_dmm, 'current_production': dmm.save_dmm},
}


def check_inputs():
    actual = {path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest() for path in MAPS}
    if actual != MAPS:
        raise AssertionError('A pinned map input changed')
    return actual


def state(source):
    return (source.key_length, source.size, source.header,
            list(source.dictionary.items()), list(source.dictionary.inv.items()),
            list(source.grid.items()))


def observe_cache(writer, source, expected):
    """Untimed factory instrumentation only; no monkeypatch during A/B or memory runs."""
    references = []

    def factory(*, maxsize, typed):
        assert maxsize is None and typed is True
        def decorate(function):
            cache = lru_cache(maxsize=maxsize, typed=typed)(function)
            references.append(weakref.ref(cache))
            return cache
        return decorate

    class ObservedOutput(io.StringIO):
        def write(self, chunk):
            self.last_info = references[-1]().cache_info()
            return super().write(chunk)

    output = ObservedOutput()
    with patch.object(dmm, 'lru_cache', side_effect=factory):
        writer(source, output)
    assert output.getvalue() == expected
    assert len(references) == 1
    gc.collect()
    assert references[0]() is None, 'A cache escaped the save call'
    info = output.last_info
    distinct = len(set(source.dictionary) | set(source.grid.values()))
    old_calls = len(source.dictionary) + len(source.grid)
    assert info.currsize == info.misses == distinct
    assert info.hits + info.misses == old_calls
    return {
        'baseline_encoder_calls_from_existing_call_sites': old_calls,
        'production_cache_hits_observed': info.hits,
        'production_encoder_calls_and_entries_observed': info.misses,
        'distinct_integer_keys': distinct,
        'cached_text_characters': distinct * source.key_length,
        'key_argument_types': ['int', 'int'],
        'typed': True,
        'maxsize': info.maxsize,
        'cache_released_after_save': True,
        'scope': 'One cache entry per distinct (key, key_length, argument types); '
                 'text character count excludes Python object and hash-table overhead.',
    }


def measure_memory(writer, source, expected):
    gc.collect()
    tracemalloc.start()
    try:
        output = io.StringIO()
        writer(source, output)
        retained_with_output, peak = tracemalloc.get_traced_memory()
        assert output.getvalue() == expected
        output.close()
        del output
        gc.collect()
        retained_after_output_release = tracemalloc.get_traced_memory()[0]
    finally:
        tracemalloc.stop()
    return {
        'incremental_peak_bytes_including_output': peak,
        'retained_bytes_with_output': retained_with_output,
        'retained_bytes_after_output_release_and_gc': retained_after_output_release,
    }


def benchmark(source, format_name, repeats):
    writers = WRITERS[format_name]
    expected_output = io.StringIO()
    writers['baseline'](source, expected_output)
    expected = expected_output.getvalue()
    expected_output.close()
    samples = {name: [] for name in writers}
    # Both actual helpers are called for each warmup and timed sample. Compare
    # exact full text after every call, not just an output size or digest.
    for writer in writers.values():
        output = io.StringIO()
        writer(source, output)
        assert output.getvalue() == expected
        output.close()
    for repeat in range(repeats):
        order = list(writers) if repeat % 2 == 0 else list(reversed(writers))
        for name in order:
            output = io.StringIO()
            gc.collect()
            enabled = gc.isenabled()
            gc.disable()
            try:
                start = time.perf_counter_ns()
                writers[name](source, output)
                elapsed = time.perf_counter_ns() - start
            finally:
                if enabled:
                    gc.enable()
            samples[name].append(elapsed / 1e6)
            assert output.getvalue() == expected
            output.close()
    result = {
        'format': format_name,
        'output_utf8_bytes': len(expected.encode('utf-8')),
        'output_sha256': hashlib.sha256(expected.encode('utf-8')).hexdigest(),
        'exact_output_equal_for_every_call': True,
        'repeats_per_helper': repeats,
    }
    for name, writer in writers.items():
        result[name] = {
            'samples_ms': samples[name],
            'median_ms': statistics.median(samples[name]),
            'min_ms': min(samples[name]),
            'max_ms': max(samples[name]),
            **measure_memory(writer, source, expected),
        }
    baseline = result['baseline']['median_ms']
    current = result['current_production']['median_ms']
    result['median_saved_ms'] = baseline - current
    result['median_time_reduction_percent'] = 100 * (baseline - current) / baseline
    result['cache_structure'] = observe_cache(writers['current_production'], source, expected)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repeats', type=int, default=5, help='Alternating timed samples per helper (1–15; default 5)')
    args = parser.parse_args()
    if not 1 <= args.repeats <= 15:
        parser.error('--repeats must be between 1 and 15')
    if not __debug__:
        parser.error('Do not use python -O: equality assertions must remain enabled')
    if bidict.__version__ != '0.22.0':
        parser.error('Use bidict==0.22.0 from tools/requirements.txt')
    if shutil.disk_usage(ROOT).free < 10 * 1024 ** 3:
        parser.error('Keep more than 10 GiB free before running')
    reference.verify_reference()
    report = {
        'recorded_at_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'comparison': 'Frozen verbatim baseline writers vs actual imported production writers',
        'baseline_commit': reference.BASELINE_COMMIT,
        'baseline_source_sha256': reference.BASELINE_SOURCE_SHA256,
        'baseline_function_sha256': reference.BASELINE_FUNCTION_SHA256,
        'production_writer_sha256': {
            name: hashlib.sha256(inspect.getsource(writers['current_production']).rstrip('\n').encode()).hexdigest()
            for name, writers in WRITERS.items()
        },
        'runtime': {'python': platform.python_version(), 'implementation': platform.python_implementation(),
                    'platform': platform.platform(), 'bidict': bidict.__version__},
        'inputs_sha256': check_inputs(),
        'timing_scope': 'Save helper to StringIO only; includes cache construction; excludes parsing, '
                        'presave checks, getvalue, equality checks, hashing and filesystem I/O. '
                        'Alternating A/B order, one warmup each, GC disabled only within timed calls.',
        'memory_scope': 'Separate tracemalloc runs from an existing parsed map to StringIO; includes '
                        'cache and output allocations, excludes parsing and later getvalue/equality '
                        'allocations from the recorded peak. Not RSS or whole-map/game memory.',
        'structural_scope': 'Separate untimed instrumentation observes the cache factory and last '
                            'write. Timed and memory calls use unpatched production helpers.',
        'results': [],
    }
    try:
        for path in MAPS:
            source = dmm.DMM.from_file(ROOT / path)
            assert all(type(key) is int for key in source.dictionary)
            assert all(type(key) is int for key in source.grid.values())
            assert len(source.grid) == source.size.x * source.size.y * source.size.z
            before = state(source)
            record = {
                'map': path, 'input_bytes': (ROOT / path).stat().st_size,
                'cells': len(source.grid), 'dictionary_keys': len(source.dictionary),
                'size': list(source.size), 'key_length': source.key_length,
                'serializers': [benchmark(source, name, args.repeats) for name in WRITERS],
            }
            assert state(source) == before, 'Serialization mutated the parsed map'
            record['parsed_map_unchanged'] = True
            report['results'].append(record)
    finally:
        report['inputs_unchanged'] = check_inputs() == report['inputs_sha256']
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
