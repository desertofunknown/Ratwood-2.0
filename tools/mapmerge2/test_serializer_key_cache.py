"""Exact old/new writer comparisons; no checked-in map files are written.

PYTHONPATH=tools python -B -m unittest mapmerge2.test_serializer_key_cache
"""

import contextlib
import gc
import io
import random
import unittest
import weakref
from functools import lru_cache
from unittest.mock import patch

from mapmerge2 import dmm
from mapmerge2.benchmarks import serializer_reference as reference


WRITERS = ((reference.save_tgm, dmm.save_tgm), (reference.save_dmm, dmm.save_dmm))


def fixture(keys=(0, 1, 51), values=(1, 1, 0, 51), key_length=2):
    result = dmm.DMM(key_length, dmm.Coordinate(len(values), 1, 1))
    result.header = '// serializer regression fixture'
    result.dictionary.update({key: (
        f'/obj/item/key{key}{{name = "A; B"; pixel_x = 2}}',
        '/turf/open', '/area/test',
    ) for key in keys})
    result.grid = {(i + 1, 1, 1): key for i, key in enumerate(values)}
    return result


def clone(source):
    result = dmm.DMM(source.key_length, source.size)
    result.header = source.header
    result.dictionary = source.dictionary.copy()
    result.grid = source.grid.copy()
    return result


def state(source):
    return (source.key_length, source.size, source.header,
            list(source.dictionary.items()), list(source.dictionary.inv.items()),
            list(source.grid.items()))


class RecordingOutput(io.StringIO):
    def __init__(self, on_write=None):
        super().__init__()
        self.chunks = []
        self.on_write = on_write

    def write(self, chunk):
        if self.on_write is not None:
            self.on_write(chunk, len(self.chunks))
        self.chunks.append(chunk)
        return super().write(chunk)


def capture(writer, source, output=None):
    output = RecordingOutput() if output is None else output
    diagnostic = io.StringIO()
    with contextlib.redirect_stdout(diagnostic):
        try:
            result = ('return', writer(source, output))
        except Exception as error:
            result = ('error', type(error), error.args)
    return result, output.getvalue(), output.chunks, diagnostic.getvalue()


class SerializerKeyCacheTests(unittest.TestCase):
    def assert_equivalent(self, source):
        before = state(source)
        for old, new in WRITERS:
            with self.subTest(writer=new.__name__):
                expected = capture(old, source)
                actual = capture(new, source)
                self.assertEqual(actual, expected)
                self.assertEqual(state(source), before)
        return actual

    def test_frozen_reference_and_unchanged_key_helpers(self):
        reference.verify_reference()

    def test_dictionary_sorting_headers_and_atom_format(self):
        for header in (None, '', '// custom header\n// second line'):
            source = fixture(keys=(51, 0, 1))
            source.header = header
            self.assert_equivalent(source)

    def test_all_key_widths_and_boundaries(self):
        for width in (1, 2, 3):
            keys = tuple(dict.fromkeys((0, 1, 51, dmm.max_key_for(width) - 1)))
            self.assert_equivalent(fixture(keys, keys * 3, width))

    def test_empty_map_and_dictionary(self):
        self.assert_equivalent(fixture((), ()))
        self.assert_equivalent(fixture((), (0, 1, 51)))

    def test_unknown_integer_grid_keys_still_encode(self):
        result = self.assert_equivalent(fixture((0,), (0, 7, 7, 100)))
        self.assertEqual(result[0], ('return', None))

    def test_missing_grid_entries_keep_writer_specific_behavior(self):
        source = fixture()
        del source.grid[2, 1, 1]
        self.assert_equivalent(source)
        self.assertEqual(capture(dmm.save_tgm, source)[0], ('error', KeyError, ((2, 1, 1),)))
        result = capture(dmm.save_dmm, source)
        self.assertEqual(result[0], ('return', None))
        self.assertEqual(result[3], 'Key error: (2, 1, 1)\n')

    def test_dictionary_overflow_preserves_partial_output(self):
        for width in (1, 2, 3):
            self.assert_equivalent(fixture((0, dmm.max_key_for(width)), (), width))

    def test_grid_overflow_and_reserved_range_preserve_errors(self):
        for width in (1, 2, 3):
            for key in (dmm.max_key_for(width), 52 ** width, 10 ** 100):
                result = self.assert_equivalent(fixture((0,), (0, 0, key), width))
                self.assertEqual(result[0][1], dmm.KeyTooLarge)

    def test_builtin_malformed_grid_keys_keep_errors(self):
        for key in (None, 'a', b'a', 1.5, 1.0, float('nan'), float('inf')):
            # Cached integer 1 must not make malformed float 1.0 succeed.
            result = self.assert_equivalent(fixture((0, 1), (1, 1, key)))
            self.assertEqual(result[0][0], 'error')

    def test_bool_int_and_zero_float_aliases_remain_distinct(self):
        for values in ((1, True, 0, False, 0.0), (False, 0.0, 0, True, 1)):
            self.assert_equivalent(fixture((0, 1), values))
        self.assert_equivalent(fixture((False, True), (False, 0.0, 0, True, 1)))
        for keys in ((0, 1.0), (False, 1.0)):
            self.assert_equivalent(fixture(keys, ()))

    def test_repeated_saves_after_map_and_key_length_mutation(self):
        source = fixture()
        self.assert_equivalent(source)
        source.key_length = 3
        source.dictionary[65529] = ('/obj/new', '/turf/new', '/area/new')
        source.grid[2, 1, 1] = 65529
        source.header = '// changed'
        self.assert_equivalent(source)
        source.grid[2, 1, 1] = 1
        del source.dictionary[65529]
        source.key_length = 1
        self.assert_equivalent(source)
        source.grid[4, 1, 1] = 52
        self.assert_equivalent(source)

    def test_key_length_is_read_at_each_existing_call_site(self):
        for old, new in WRITERS:
            results = []
            for writer in (old, new):
                source = fixture((1,), (1, 1), 1)
                def change_width(chunk, count):
                    if chunk.endswith(')\n'):
                        source.key_length = 2
                results.append(capture(writer, source, RecordingOutput(change_width)))
            self.assertEqual(*results)
            self.assertIn('ab', results[1][1])

    def test_key_length_type_alias_does_not_hide_error(self):
        for old, new in WRITERS:
            results = []
            for writer in (old, new):
                source = fixture((0,), (0,), 1)
                def change_type(chunk, count):
                    if chunk.endswith(')\n'):
                        source.key_length = 1.0
                results.append(capture(writer, source, RecordingOutput(change_type)))
            self.assertEqual(*results)
            self.assertEqual(results[1][0][1], TypeError)

    def test_output_failures_preserve_attempt_order_and_partial_output(self):
        source = fixture()
        for old, new in WRITERS:
            count = len(capture(old, source)[2])
            for failure_index in (0, 1, count // 2, count - 1):
                def fail(chunk, index):
                    if index == failure_index:
                        raise OSError('test output failure')
                self.assertEqual(capture(old, source, RecordingOutput(fail)),
                                 capture(new, source, RecordingOutput(fail)))

    def test_multiple_dimensions_and_seeded_integer_maps(self):
        rng = random.Random(20261022)
        for case in range(200):
            width = rng.choice((1, 2, 3))
            keys = rng.sample(range(dmm.max_key_for(width)), rng.randrange(1, 12))
            source = fixture(keys, (), width)
            source.size = dmm.Coordinate(*(rng.randrange(1, 5) for _ in range(3)))
            source.grid = {(x, y, z): rng.choice(keys)
                           for z in source.coords_z for y, x in source.coords_yx}
            with self.subTest(case=case):
                self.assert_equivalent(source)

    def test_cache_is_per_save_and_reuses_unknown_keys(self):
        source = fixture((0, 1), (1, 7, 7, 0, 1) * 100)
        for _, writer in WRITERS:
            with patch.object(dmm, 'num_to_key', wraps=dmm.num_to_key) as encoder:
                writer(source, io.StringIO())
                self.assertEqual(encoder.call_count, 3)
                writer(source, io.StringIO())
                self.assertEqual(encoder.call_count, 6)

    def test_cache_types_and_successful_entries_release_on_return_or_error(self):
        for _, writer in WRITERS:
            for values in ((0, False, 0.0, 1, True, 1), (0, False, 0.0, 1, True, 1.0)):
                refs, stats = [], []
                def make_cache(*, maxsize, typed):
                    self.assertIsNone(maxsize)
                    self.assertTrue(typed)
                    def decorate(function):
                        cache = lru_cache(maxsize=maxsize, typed=typed)(function)
                        refs.append(weakref.ref(cache))
                        return cache
                    return decorate
                def inspect_cache(chunk, count):
                    stats.append(refs[-1]().cache_info())
                source = fixture((0, 1), values)
                with patch.object(dmm, 'lru_cache', side_effect=make_cache):
                    capture(writer, source, RecordingOutput(inspect_cache))
                self.assertEqual(stats[-1].currsize, 5)
                gc.collect()
                self.assertIsNone(refs[-1]())

    def test_public_to_bytes_uses_current_writers_after_mutation(self):
        source = fixture()
        for width in (2, 3, 1):
            source.key_length = width
            for old, new in WRITERS:
                expected_source = clone(source)
                expected_source._presave_checks()
                expected = capture(old, expected_source)[1].encode('utf-8')
                self.assertEqual(source.to_bytes(tgm=new is dmm.save_tgm), expected)


if __name__ == '__main__':
    unittest.main()
