"""Read-only regression coverage for DMM dictionary cleanup.

Run from the repository root with PYTHONPATH=tools python -m unittest
mapmerge2.test_remove_unused_keys. Requires the tools/requirements.txt bidict pin.
"""
import contextlib
import hashlib
import io
from pathlib import Path
import random
import unittest
from unittest.mock import patch

from mapmerge2.dmm import Coordinate, DMM, save_dmm, save_tgm
from UpdatePaths.__main__ import update_path

ROOT = Path(__file__).resolve().parents[2]


def legacy_cleanup(dmm, modified_keys=None):
    """Frozen implementation from 851bb446, including its broken default."""
    unused_keys = list(set(modified_keys)) if modified_keys is not None else dmm.dictionary.keys()
    for key in dmm.grid.values():
        if key in unused_keys:
            unused_keys.remove(key)
    for key in unused_keys:
        del dmm.dictionary[key]


def fixture(keys, values):
    dmm = DMM(3, Coordinate(len(values), 1, 1))
    dmm.header = '// cleanup regression fixture'
    dmm.dictionary.update({
        key: (f'/obj/item/fixture{key}', '/turf/open', '/area/test')
        for key in keys
    })
    dmm.grid = {Coordinate(i + 1, 1, 1): key for i, key in enumerate(values)}
    return dmm


def clone(dmm):
    result = DMM(dmm.key_length, dmm.size)
    result.header = dmm.header
    result.dictionary = dmm.dictionary.copy()
    result.grid = dmm.grid.copy()
    return result


def state(dmm):
    return (
        dmm.key_length, dmm.size, dmm.header,
        list(dmm.dictionary.items()), list(dmm.dictionary.inv.items()),
        list(dmm.grid.items()),
    )


def invoke(function, dmm, keys):
    try:
        return ('return', function(dmm, keys))
    except Exception as error:
        return ('error', type(error), error.args)


class RemoveUnusedKeysTests(unittest.TestCase):
    def assert_matches_legacy(self, original, keys_factory):
        before = state(original)
        old, new = clone(original), clone(original)
        dictionary, inverse, grid = new.dictionary, new.dictionary.inv, new.grid
        old_result = invoke(legacy_cleanup, old, keys_factory())
        new_result = invoke(DMM.remove_unused_keys, new, keys_factory())
        self.assertEqual(new_result, old_result)
        self.assertEqual(state(new), state(old))
        self.assertEqual(state(original), before)
        self.assertIs(new.dictionary, dictionary)
        self.assertIs(new.dictionary.inv, inverse)
        self.assertIs(new.grid, grid)
        return old, new

    def test_default_removes_only_unused_keys(self):
        dmm = fixture([8, 3, 1, 9], [3, 3, 9])
        dictionary, inverse, grid = dmm.dictionary, dmm.dictionary.inv, dmm.grid
        self.assertIsNone(dmm.remove_unused_keys())
        self.assertEqual(list(dmm.dictionary), [3, 9])
        self.assertEqual(list(dmm.dictionary.inv.values()), [3, 9])
        self.assertIs(dmm.dictionary, dictionary)
        self.assertIs(dmm.dictionary.inv, inverse)
        self.assertIs(dmm.grid, grid)
        self.assertEqual(list(dmm.grid.values()), [3, 3, 9])

    def test_default_empty_grid_removes_every_definition(self):
        dmm = fixture([4, 2, 7], [])
        self.assertIsNone(dmm.remove_unused_keys())
        self.assertEqual(list(dmm.dictionary.items()), [])
        self.assertEqual(list(dmm.dictionary.inv.items()), [])
        self.assertEqual(dmm.grid, {})

    def test_empty_dictionary_and_grid(self):
        dmm = fixture([], [])
        self.assertIsNone(dmm.remove_unused_keys())
        self.assert_matches_legacy(dmm, lambda: [])

    def test_explicit_empty_candidates_do_not_scan_grid(self):
        class UnreadGrid(dict):
            def values(self):
                raise AssertionError('Empty cleanup must not scan tiles')

        dmm = fixture([0, 1], [0])
        dmm.grid = UnreadGrid(dmm.grid)
        self.assertIsNone(dmm.remove_unused_keys([]))
        self.assertEqual(list(dmm.dictionary), [0, 1])

    def test_explicit_scope_duplicates_and_input_preserved(self):
        dmm = fixture([7, 2, 0, 4], [2, 2])
        keys = [7, 2, 7, 2]
        old, new = self.assert_matches_legacy(dmm, lambda: keys)
        self.assertEqual(keys, [7, 2, 7, 2])
        self.assertEqual(list(new.dictionary), [2, 0, 4])

    def test_iterable_inputs(self):
        dmm = fixture([0, 2, 8, 3], [0, 3])
        keys = [8, 2, 0, 8]
        factories = [
            lambda: list(keys), lambda: tuple(keys), lambda: set(keys),
            lambda: iter(keys), lambda: dict.fromkeys(keys).keys(),
        ]
        for factory in factories:
            with self.subTest(factory=factories.index(factory)):
                self.assert_matches_legacy(dmm, factory)

    def test_missing_candidate_used_by_grid_does_not_raise(self):
        dmm = fixture([0, 1], [0, 99])
        _, new = self.assert_matches_legacy(dmm, lambda: [99, 1])
        self.assertEqual(list(new.dictionary), [0])
        self.assertEqual(list(new.grid.values()), [0, 99])

    def test_missing_unused_candidate_preserves_exception_partial_state(self):
        # Derive the legacy set order rather than assume integer set ordering.
        keys = [8, 3, 99, 2, 8]
        ordered = list(set(keys))
        missing = ordered[len(ordered) // 2]
        dmm = fixture([key for key in ordered if key != missing], [])
        _, new = self.assert_matches_legacy(dmm, lambda: keys)
        self.assertEqual(list(new.dictionary), ordered[ordered.index(missing) + 1:])

    def test_randomized_explicit_and_default_contracts(self):
        rng = random.Random(4221)
        for case in range(1000):
            keys = rng.sample(range(65530), rng.randrange(0, 80))
            domain = keys + [65530]
            values = rng.choices(domain, k=rng.randrange(0, 100))
            dmm = fixture(keys, values)
            modified = rng.choices(domain, k=rng.randrange(0, 100))
            with self.subTest(case=case):
                self.assert_matches_legacy(dmm, lambda: list(modified))
                current = clone(dmm)
                current.remove_unused_keys()
                used = set(values)
                expected = [(key, value) for key, value in dmm.dictionary.items() if key in used]
                self.assertEqual(list(current.dictionary.items()), expected)
                self.assertEqual(list(current.dictionary.inv.items()), [(value, key) for key, value in expected])
                self.assertEqual(current.grid, dmm.grid)
                self.assertEqual((current.key_length, current.size, current.header), (dmm.key_length, dmm.size, dmm.header))

    def test_serialized_dmm_and_tgm_match(self):
        dmm = fixture([8, 3, 1, 9], [3, 3, 9, 9])
        old, new = self.assert_matches_legacy(dmm, lambda: [8, 3, 1])
        for writer in [save_dmm, save_tgm]:
            left, right = io.StringIO(), io.StringIO()
            writer(old, left)
            writer(new, right)
            self.assertEqual(right.getvalue(), left.getvalue())
            reparsed = DMM.from_bytes(right.getvalue().encode('utf-8'))
            self.assertEqual(reparsed.grid, new.grid)
            self.assertEqual(dict(reparsed.dictionary), dict(new.dictionary))

    def test_checked_in_rockhill_update_is_read_only_and_equivalent(self):
        path = ROOT / '_maps/map_files/rockhill/rockhill.dmm'
        original_hash = hashlib.sha256(path.read_bytes()).digest()
        dmm = DMM.from_file(path)
        updates = ROOT / 'tools/UpdatePaths/Scripts/2226_turf_closed_void.txt'
        modified = []
        with patch.object(DMM, 'to_file', side_effect=AssertionError('No map writes')), contextlib.redirect_stdout(io.StringIO()):
            for line in updates.read_text().splitlines():
                if line and not line.startswith('#') and not line.isspace():
                    modified.extend(update_path(dmm, line))
            self.assert_matches_legacy(dmm, lambda: list(modified))
        self.assertEqual(hashlib.sha256(path.read_bytes()).digest(), original_hash)


if __name__ == '__main__':
    unittest.main()
