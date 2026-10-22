"""Source-bound acorn coffee callback contract tests; never executes DM.

Port provenance: Arturlang, Rotwood-Vale/Ratwood-2.0 commit
3850517fcb74ac18c472ef59f0454b1145dc2f9f (AGPL-3.0), drink_reagents hunk only.
Run: python3 tools/ci/test_acorn_coffee_reaction.py
This verifies source wiring and a narrow stub model, not in-game chemistry.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
DRINKS = ROOT / 'code/modules/reagents/chemistry/reagents/drink_reagents.dm'
REACTION = '/datum/chemical_reaction/alch/acoffee'
SIGNATURE = '(datum/reagents/holder, created_volume)'
WATER = '/datum/reagent/water'
BODY = '''\t. = ..()
\tif(holder)
\t\t// Remove all leftover water
\t\tholder.del_reagent(/datum/reagent/water)
'''


def definition(source, path):
    match = re.search(r'^' + re.escape(path) + r'\n(.*?)(?=^/|\Z)', source, re.M | re.S)
    if match is None:
        raise AssertionError('Missing definition: ' + path)
    return match[1].rstrip() + '\n'


def run_callback(source, holder, created_volume):
    # Fail closed: this stub models only the reviewed callback, not arbitrary DM.
    body = definition(source, REACTION + '/on_reaction' + SIGNATURE)
    if body != BODY:
        raise AssertionError('Unreviewed callback body')
    if holder is not None:
        holder.del_reagent(WATER)


class Holder:
    def __init__(self):
        self.contents = {WATER: 7, '/datum/reagent/consumable/Acoffee': 6,
                         '/datum/reagent/consumable/milk': 2}
        self.calls = []

    def del_reagent(self, reagent):
        self.calls.append(reagent)
        self.contents.pop(reagent, None)


class AcornCoffeeReactionTests(unittest.TestCase):
    def test_signature_matches_base_and_actual_dispatch(self):
        definition(DRINKS.read_text(), REACTION + '/on_reaction' + SIGNATURE)
        base = (ROOT / 'code/modules/reagents/chemistry/recipes.dm').read_text()
        definition(base, '/datum/chemical_reaction/proc/on_reaction' + SIGNATURE)
        dispatch = (ROOT / 'code/modules/reagents/chemistry/holder.dm').read_text()
        self.assertIn('selected_reaction.on_reaction(src, multiplier)', dispatch)
        self.assertIn('multiplier = max(multiplier, 1)', dispatch)

    def test_numeric_volume_never_becomes_container_and_only_water_is_removed(self):
        for volume in [1, 2, 10, 100]:
            with self.subTest(volume=volume):
                holder = Holder()
                run_callback(DRINKS.read_text(), holder, volume)
                self.assertEqual(holder.calls, [WATER])
                self.assertEqual(holder.contents, {'/datum/reagent/consumable/Acoffee': 6,
                                                   '/datum/reagent/consumable/milk': 2})

    def test_null_holder_does_not_dereference_volume(self):
        for volume in [0, 1, 100]:
            run_callback(DRINKS.read_text(), None, volume)

    def test_recipe_temperature_inputs_and_yield_are_preserved(self):
        self.assertEqual(definition(DRINKS.read_text(), REACTION), '''\tname = "coffee-acorn"
\tmix_sound = 'sound/items/fillbottle.ogg'
\tid = /datum/reagent/consumable/Acoffee
\trequired_temp = 374
\tresults = list(/datum/reagent/consumable/Acoffee = 6)
\trequired_reagents = list(/datum/reagent/consumable/acorn_powder = 1, /datum/reagent/water = 5)
''')

    def test_original_signature_and_unreviewed_body_are_rejected(self):
        source = DRINKS.read_text()
        old = source.replace(REACTION + '/on_reaction' + SIGNATURE,
                             REACTION + '/on_reaction(mob/user, obj/item/reagent_containers/container, total_volume)')
        with self.assertRaises(AssertionError):
            run_callback(old, Holder(), 1)
        altered = source.replace('holder.del_reagent(/datum/reagent/water)',
                                 'holder.del_reagent(/datum/reagent/consumable/Acoffee)')
        with self.assertRaises(AssertionError):
            run_callback(altered, Holder(), 1)


if __name__ == '__main__':
    unittest.main()
