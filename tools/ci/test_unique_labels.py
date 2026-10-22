"""Source contracts and Python models, not DM execution. Run directly with Python3."""
import itertools
from pathlib import Path
import random
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]


def baseline(name, used):
    if not name or not isinstance(used, dict):
        return None
    if used.get(name):
        used[name] += 1
        return f"{name} ({used[name]})"
    used[name] = 1
    return name


def corrected(name, used):
    if not name or not isinstance(used, dict):
        return None
    base = name
    while used.get(name):
        used[base] += 1
        name = f"{base} ({used[base]})"
    used[name] = 1
    return name


def labels(names, allocator):
    used = {}
    return [allocator(name, used) for name in names]


class LabelModelTests(unittest.TestCase):
    def test_baseline_loses_distinct_option_identity(self):
        for names in (["X", "X", "X (2)"], ["X", "X (2)", "X"]):
            old = labels(names, baseline)
            self.assertEqual(len(dict(zip(old, range(3)))), 2)
            new = labels(names, corrected)
            self.assertEqual(len(dict(zip(new, range(3)))), 3)

    def test_suffix_reservations_in_both_orders(self):
        self.assertEqual(labels(["X", "X", "X (2)"], corrected), ["X", "X (2)", "X (2) (2)"])
        self.assertEqual(labels(["X", "X (2)", "X"], corrected), ["X", "X (2)", "X (3)"])
        self.assertEqual(labels(["X (2)", "X (3)", "X", "X"], corrected),
                         ["X (2)", "X (3)", "X", "X (4)"])

    def test_ordinary_labels_unchanged(self):
        for names in ([], ["A"], ["A"] * 100, ["A", "B", "A", "C", "B"], ["a", "A", "a"]):
            self.assertEqual(labels(names, corrected), labels(names, baseline))

    def test_invalid_input_unchanged_and_no_mutation(self):
        for name in (None, ""):
            used = {"A": 1}
            self.assertEqual(corrected(name, used), baseline(name, used))
            self.assertEqual(used, {"A": 1})
        self.assertIsNone(corrected("A", None))

    def test_exhaustive_short_adversarial_sequences(self):
        names = ["A", "A (2)", "A (3)", "A (2) (2)", "B"]
        for length in range(7):
            for sequence in itertools.product(names, repeat=length):
                result = labels(sequence, corrected)
                self.assertEqual(len(set(result)), len(sequence), sequence)
                # The exact selected label still maps to its own original item.
                items = [object() for _ in sequence]
                mapping = dict(zip(result, items))
                self.assertEqual([mapping[label] for label in result], items)

    def test_large_repeated_group(self):
        result = labels(["A"] * 10000, corrected)
        self.assertEqual(result, ["A"] + [f"A ({i})" for i in range(2, 10001)])

    def test_seeded_long_sequences(self):
        rng = random.Random(18408)
        names = [f"name{i}" for i in range(8)]
        names += [f"{name} ({n})" for name in names[:] for n in range(2, 12)]
        for _ in range(500):
            sequence = rng.choices(names, k=200)
            result = labels(sequence, corrected)
            self.assertEqual(len(set(result)), len(sequence))


class SourceContractTests(unittest.TestCase):
    def test_helper_reserves_emitted_labels_and_skips_collisions(self):
        source = (ROOT / "code/__HELPERS/_lists.dm").read_text()
        match = re.search(r"^/proc/avoid_assoc_duplicate_keys\(input_key, list/used_key_list\)\n(.*?)(?=^/|\Z)", source, re.M | re.S)
        self.assertIsNotNone(match)
        statements = [line for line in match[1].splitlines() if line.strip() and not line.lstrip().startswith("//")]
        self.assertEqual(statements, [
            '\tif(!input_key || !istype(used_key_list))', '\t\treturn',
            '\tvar/base_key = input_key', '\twhile(used_key_list[input_key])',
            '\t\tused_key_list[base_key]++',
            '\t\tinput_key = "[base_key] ([used_key_list[base_key]])"',
            '\tused_key_list[input_key] = 1', '\treturn input_key',
        ])

    def test_active_consumers_key_identity_maps_with_helper_output(self):
        source = (ROOT / "code/modules/tgui_input/list.dm").read_text()
        self.assertIn("string_key = avoid_assoc_duplicate_keys(string_key, repeat_items)", source)
        self.assertIn("src.items_map[string_key] = i", source)
        source = (ROOT / "code/modules/roguetown/roguejobs/mages/ritualrunes.dm").read_text()
        self.assertIn("potential_runes[avoid_assoc_duplicate_keys(teleport_rune.listkey, teleportnames)] = teleport_rune", source)


if __name__ == "__main__":
    unittest.main()
