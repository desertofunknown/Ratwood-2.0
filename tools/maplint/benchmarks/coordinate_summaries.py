"""Read-only actual-production versus frozen-reference maplint benchmark."""
import argparse
import gc
import hashlib
import inspect
import json
from pathlib import Path
import platform
import statistics
import sys
import textwrap
import time
import tracemalloc
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

import yaml

from tools.maplint.source.dmm import DMM, parse_dmm
from tools.maplint.source.lint import Lint
from tools.maplint.tests import lint_run_reference as reference
from tools.maplint.tests.test_coordinate_summaries import diagnostics


MAPS = {
    'roguetest': ('_maps/map_files/roguetest/roguetest.dmm',
                 '507053d78157fd597fc5a6d353ca19d2ca74fa070848fbcde505bec92b9c5212'),
    'rockhill': ('_maps/map_files/rockhill/rockhill.dmm',
                '926bcbf9a6851c11095c76c64ec455cd0ddfb6b9aad14a50adafacdb459298af'),
    'dun_worldredux': ('_maps/map_files/dun_world/dun_worldredux.dmm',
                      'a7e769a1a9cd6bb79362ed0c79c82dda74fc3476edcbd00bd51bfd50232600c2'),
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run_all(function, lints, map_data):
    return [error for lint in lints.values() for error in function(lint, map_data)]


def timed(function, lints, map_data):
    gc.collect()
    enabled = gc.isenabled()
    gc.disable()
    try:
        start = time.perf_counter()
        errors = run_all(function, lints, map_data)
        elapsed = time.perf_counter() - start
    finally:
        if enabled:
            gc.enable()
    return elapsed, errors


def scan_counts(lints, map_data):
    """Count baseline lookups without scanning; not part of timing or parity."""
    calls = []

    def empty_coordinates(self, pop):
        calls.append(pop)
        return iter(())

    counts = {}
    with patch.object(DMM, 'turfs_for_pop', empty_coordinates):
        for name, lint in lints.items():
            before = len(calls)
            reference.run(lint, map_data)
            if len(calls) > before:
                counts[name] = len(calls) - before
    return counts, len(set(calls))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repeats', type=int, default=5)
    parser.add_argument('--maps', nargs='+', choices=MAPS, default=list(MAPS))
    parser.add_argument('--memory', action='store_true',
                        help='Also measure incremental tracemalloc peaks; substantially slower.')
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error('--repeats must be positive')

    reference_source = textwrap.dedent(inspect.getsource(reference.run))
    assert hashlib.sha256(reference_source.encode()).hexdigest() == reference.BASELINE_RUN_SHA256
    lint_paths = sorted((ROOT / 'tools/maplint/lints').glob('*.yml'))
    lints = {path.name: Lint(yaml.safe_load(path.read_text())) for path in lint_paths}
    hashes = {str(path.relative_to(ROOT)): sha256(path) for path in lint_paths}
    result = {
        'schema_version': 1,
        'baseline': {
            'commit': reference.BASELINE_COMMIT,
            'path': reference.BASELINE_PATH,
            'source_file_sha256': reference.BASELINE_FILE_SHA256,
            'dedented_run_sha256': reference.BASELINE_RUN_SHA256,
        },
        'production': {
            'path': reference.BASELINE_PATH,
            'source_file_sha256': sha256(ROOT / reference.BASELINE_PATH),
            'function': 'tools.maplint.source.lint.Lint.run',
        },
        'runtime': {'python': sys.version, 'platform': platform.platform(),
                    'pyyaml': yaml.__version__},
        'method': {
            'scope': 'All default .yml lints on each parsed map; no map writes.',
            'timing_excludes': 'Parsing, validation, hashing, GC collection and scan counting.',
            'timing': 'One untimed reference/production warmup, then alternating function order; GC disabled during timed calls.',
            'equivalence': 'Full diagnostic-field multisets, including duplicate multiplicities. Existing set return leaves order unspecified.',
            'scan_counts': 'Reference lookup calls are counted with a stub outside timing; production counts follow one pass per affected lint, separately unit-tested.',
            'memory': 'Optional separate incremental tracemalloc peak, not RSS or total map memory.',
            'limits': 'Developer tooling only, not gameplay/client FPS or whole-CI speedup; machine load affects timings.',
        },
        'lint_files_sha256': hashes,
        'samples': [],
    }

    for name in args.maps:
        relative_path, expected_hash = MAPS[name]
        path = ROOT / relative_path
        assert sha256(path) == expected_hash, f'Fixture changed: {relative_path}'
        start = time.perf_counter()
        with path.open() as reader:
            map_data = parse_dmm(reader)
        parse_seconds = time.perf_counter() - start

        expected = diagnostics(run_all(reference.run, lints, map_data))
        assert diagnostics(run_all(Lint.run, lints, map_data)) == expected
        counts, unique_pops = scan_counts(lints, map_data)
        tiles = sum(len(column) for level in map_data.turfs for column in level)
        record = {
            'map': relative_path, 'sha256': expected_hash,
            'tiles': tiles, 'dictionary_pops': len(map_data.pops),
            'diagnostics': sum(expected.values()), 'parse_seconds': parse_seconds,
            'baseline_full_scans_by_lint': counts,
            'baseline_full_scans': sum(counts.values()),
            'production_full_scans': len(counts),
            'unique_failing_pops': unique_pops,
            'baseline_seconds': [], 'production_seconds': [],
            'full_field_multisets_equal': True,
        }
        for repetition in range(args.repeats):
            functions = [('baseline_seconds', reference.run), ('production_seconds', Lint.run)]
            if repetition % 2:
                functions.reverse()
            for field, function in functions:
                elapsed, errors = timed(function, lints, map_data)
                assert diagnostics(errors) == expected
                record[field].append(elapsed)

        for label in ['baseline', 'production']:
            record[label + '_median_seconds'] = statistics.median(record[label + '_seconds'])
        if args.memory:
            for label, function in [('baseline', reference.run), ('production', Lint.run)]:
                gc.collect()
                tracemalloc.start()
                errors = run_all(function, lints, map_data)
                _, peak = tracemalloc.get_traced_memory()
                tracemalloc.stop()
                assert diagnostics(errors) == expected
                record[label + '_incremental_peak_bytes'] = peak

        assert sha256(path) == expected_hash, f'Fixture modified: {relative_path}'
        record['map_hash_unchanged'] = True
        result['samples'].append(record)

    assert all(sha256(ROOT / path) == digest for path, digest in hashes.items())
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
