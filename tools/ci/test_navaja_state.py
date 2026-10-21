"""Static assignment-state regression for folding navaja damage caches.

Run: python3 tools/ci/test_navaja_state.py
The narrow model executes extracted constant assignments, not DM or combat.
"""

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
KNIVES = ROOT / "code/game/objects/items/rogueweapons/melee/knives.dm"
BASE = "/obj/item/rogueweapon/huntingknife/idagger/navaja"


def definition(source, path):
    match = re.search(r"^" + re.escape(path) + r"\n(.*?)(?=^/|\Z)", source, re.M | re.S)
    if match is None:
        raise AssertionError(f"Missing definition: {path}")
    return match[1]


def toggle_branches(path):
    body = definition(KNIVES.read_text(), path + "/attack_self(mob/user)")
    if body.count("\textended = !extended\n") != 1:
        raise AssertionError("Unsupported toggle condition")
    opening, closing = body.split("\tif(extended)\n", 1)[1].split("\telse\n")
    result = []
    for branch in (opening, closing):
        assignments = re.findall(r"^\t\t(force(?:_dynamic)?) = (.+)$", branch, re.M)
        if any(not value.isdigit() for _, value in assignments):
            raise AssertionError("Only literal damage assignments are supported")
        result.append([(field, int(value)) for field, value in assignments])
    return result


def toggle(state, branches):
    state = dict(state)
    state["extended"] = not state["extended"]
    for field, value in branches[0 if state["extended"] else 1]:
        state[field] = value
    return state


class NavajaStateTests(unittest.TestCase):
    def test_new_closed_knife_opens_with_current_damage(self):
        initial = definition(KNIVES.read_text(), BASE)
        self.assertIn("\tforce = 5\n", initial)
        self.assertIn("\tvar/extended = 0\n", initial)
        state = toggle({"extended": False, "force": 5, "force_dynamic": 5}, toggle_branches(BASE))
        self.assertEqual(state, {"extended": True, "force": 20, "force_dynamic": 20})

    def test_repeated_open_close_resynchronizes_both_variants(self):
        for path in [BASE, BASE + "/freifechter"]:
            for extended in [False, True]:
                for stale in [0, 5, 20, 99]:
                    with self.subTest(path=path, extended=extended, stale=stale):
                        state = {"extended": extended, "force": 20 if extended else 5, "force_dynamic": stale}
                        for _ in range(8):
                            state = toggle(state, toggle_branches(path))
                            expected = 20 if state["extended"] else 5
                            self.assertEqual(state["force"], expected)
                            self.assertEqual(state["force_dynamic"], expected)

    def test_base_matches_existing_freifechter_damage_assignments(self):
        expected = [[("force", 20), ("force_dynamic", 20)], [("force", 5), ("force_dynamic", 5)]]
        self.assertEqual(toggle_branches(BASE), expected)
        self.assertEqual(toggle_branches(BASE + "/freifechter"), expected)

    def test_item_initialization_and_actual_damage_consumer_use_cache(self):
        items = (ROOT / "code/game/objects/items.dm").read_text()
        self.assertIn("\tupdate_force_dynamic()\n", definition(items, "/obj/item/Initialize(mapload)"))
        self.assertIn("force_dynamic = (wielded ? force_wielded : force)", definition(items, "/obj/item/proc/update_force_dynamic()"))
        attacks = (ROOT / "code/_onclick/item_attack.dm").read_text()
        damage = definition(attacks, "/proc/get_complex_damage(obj/item/I, mob/living/user, blade_dulling, turf/closed/mineral/T)")
        self.assertIn("var/newforce = I.force_dynamic", damage)


if __name__ == "__main__":
    unittest.main()
