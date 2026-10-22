"""Read-only regression tests for batched lint failure coordinates.

Run from the repository root: python -B -m unittest
tools.maplint.tests.test_coordinate_summaries
"""
from collections import Counter
import copy
import hashlib
import inspect
import random
import textwrap
import unittest

from tools.maplint.source.common import Typepath
from tools.maplint.source.dmm import Content, DMM
from tools.maplint.source.lint import Lint
from tools.maplint.tests import lint_run_reference as reference


def diagnostics(errors):
    """Order is unspecified by the existing identity-based set return."""
    return Counter((error.args, error.file_name, error.line_number,
                    error.coordinates, error.pop_id, error.help)
                   for error in errors)


def content(path='/obj/item', line=1, variables=None):
    return Content(Typepath(path), 'fixture.dmm', line, variables or {})


class CoordinateSummaryTests(unittest.TestCase):
    def assert_matches_reference(self, lint, dmm):
        before = copy.deepcopy(dmm)
        old = reference.run(lint, dmm)
        new = Lint.run(lint, dmm)
        self.assertEqual(diagnostics(new), diagnostics(old))
        self.assertEqual(dmm, before)
        return new

    def test_frozen_reference_source_hash(self):
        self.assertEqual(reference.BASELINE_COMMIT,
                         '18408e4248f567dc0def4245dc8b3f910cf7aed7')
        self.assertEqual(reference.BASELINE_FILE_SHA256,
                         'a8c792f972a429b9dc456b3116c0f59e47be2401cb680c515d2f324e8c92bb5b')
        expected = '5d79ee92019473f045e983f8e03bad03e41768b61b86d35b35516f5c2c7f0654'
        self.assertEqual(reference.BASELINE_RUN_SHA256, expected)
        source = textwrap.dedent(inspect.getsource(reference.run))
        self.assertEqual(hashlib.sha256(source.encode()).hexdigest(), expected)

    def test_zero_through_four_occurrences_and_unused_pop(self):
        lint = Lint({'help': 'Keep this help.', '/obj/item': {'banned': True}})
        for count in range(5):
            with self.subTest(count=count):
                dmm = DMM({'a': [content()], 'b': [content('/turf/open')]},
                          [[['a'] * count + ['b'] * (4 - count)]])
                errors = self.assert_matches_reference(lint, dmm)
                texts = [f'(1, {4 - y}, 1)' for y in range(min(count, 3))]
                if count > 3:
                    texts.append('and 1 more')
                self.assertEqual(errors[0].coordinates, ', '.join(texts))
                self.assertEqual(errors[0].help, 'Keep this help.')

    def test_coordinate_order_is_z_then_x_then_y(self):
        dmm = DMM({'a': [content()], 'b': [content('/turf/open')]},
                  [[['b', 'a'], ['a', 'b']], [['a', 'a']]])
        errors = self.assert_matches_reference(Lint({'/obj': {'banned': True}}), dmm)
        self.assertEqual(errors[0].coordinates,
                         '(1, 1, 1), (2, 2, 1), (1, 2, 2), and 1 more')

    def test_preserves_duplicate_diagnostics_and_multiple_rules(self):
        dmm = DMM({'a': [content(variables={'step_x': 1}),
                         content(variables={'step_x': 1})]}, [[['a']]])
        lint = Lint({'*': {'banned_variables': ['step_x']},
                     '/obj': {'banned_neighbors': ['/obj']}})
        errors = self.assert_matches_reference(lint, dmm)
        self.assertEqual(len(errors), 4)
        self.assertEqual(sorted(diagnostics(errors).values()), [2, 2])

    def test_clean_lint_does_not_iterate_turfs(self):
        class UnreadTurfs(list):
            def __iter__(self):
                raise AssertionError('Clean lint must not scan turfs')

        dmm = DMM({'a': [content('/turf/open')]}, UnreadTurfs([[['a']]]))
        self.assertEqual(Lint({'/obj': {'banned': True}}).run(dmm), [])

    def test_failing_lint_visits_each_column_only_once(self):
        class CountedColumn(list):
            visits = 0

            def __iter__(self):
                self.visits += 1
                return super().__iter__()

        columns = [CountedColumn(['a', 'a']), CountedColumn(['b', 'a'])]
        dmm = DMM({'a': [content(), content()], 'b': [content()]}, [columns])
        errors = Lint({'/obj': {'banned': True}}).run(dmm)
        self.assertEqual(len(errors), 3)
        self.assertEqual([column.visits for column in columns], [1, 1])

    def test_ragged_levels_empty_columns_and_unknown_grid_key(self):
        dmm = DMM({'a': [content()], 'unused': [content()]},
                  [[[], ['a', 'unknown', 'a']], [], [['a']]])
        errors = self.assert_matches_reference(Lint({'/obj': {'banned': True}}), dmm)
        by_pop = {error.pop_id: error.coordinates for error in errors}
        self.assertEqual(by_pop['a'], '(2, 0, 1), (2, -2, 1), (1, 0, 3)')
        self.assertEqual(by_pop['unused'], '')

    def test_empty_map_shapes_keep_original_outcomes(self):
        lint = Lint({'/obj': {'banned': True}})
        for turfs in [[], [[]]]:
            dmm = DMM({'a': [content()]}, turfs)
            outcomes = []
            for function in [reference.run, Lint.run]:
                with self.assertRaises(IndexError) as raised:
                    function(lint, dmm)
                outcomes.append(raised.exception.args)
            self.assertEqual(outcomes[0], outcomes[1])
        for pops in [{}, {'a': [content()]}]:
            self.assert_matches_reference(lint, DMM(pops, [[[]]]))

    def test_repeated_runs_do_not_cache_stale_coordinates(self):
        dmm = DMM({'a': [content()], 'b': [content('/turf/open')]}, [[['a', 'b']]])
        lint = Lint({'/obj': {'banned': True}})
        first = self.assert_matches_reference(lint, dmm)[0].coordinates
        dmm.turfs[0][0].reverse()
        second = self.assert_matches_reference(lint, dmm)[0].coordinates
        self.assertNotEqual(first, second)

    def test_randomized_full_diagnostic_multisets(self):
        rng = random.Random(20261022)
        for case in range(1000):
            pops = {
                key: [content(rng.choice(['/obj/item', '/obj/structure/table',
                                          '/turf/open', '/area/rogue']), index + 1,
                              {'step_x': 1} if rng.randrange(3) == 0 else {})
                      for index in range(rng.randrange(1, 5))]
                for key in 'abcde'
            }
            turfs = [[[rng.choice('abcde') for _ in range(rng.randrange(0, 8))]
                      for _ in range(rng.randrange(1, 7))]
                     for _ in range(rng.randrange(1, 5))]
            lint = Lint({'help': 'fixture help', '*': {'banned_variables': ['step_x']},
                         '/obj': {'banned_neighbors': ['/obj']},
                         '=/area/rogue': {'banned': True}})
            with self.subTest(case=case):
                self.assert_matches_reference(lint, DMM(pops, turfs))


if __name__ == '__main__':
    unittest.main()
