"""Source-bound explosion callback argument tests; never executes DM or effects.

Run: python3 tools/ci/test_reagent_explosion_callback.py
Provenance: local contract audit of Ratwood baseline
8e74c17216b475bbf415333218be91c6cf0ffebc (AGPL-3.0).
The spy models only positional forwarding, including omitted arguments as None.
It does not simulate reaction selection, explosions, DM runtime, or game balance.
Exact source checks bind registration, dispatch, inheritance, and unchanged helper
arithmetic. Unsupported callback bodies fail closed and require review.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
PYROTECHNICS = ROOT / 'code/modules/reagents/chemistry/recipes/pyrotechnics.dm'
BASE = '/datum/chemical_reaction/reagent_explosion'
POTASSIUM = BASE + '/potassium_explosion'
HOLY = POTASSIUM + '/holyboom'
SIGNATURE = '(datum/reagents/holder, created_volume)'
HELPER_BODY = '''\tvar/turf/T = get_turf(holder.my_atom)
\tvar/lastkey = holder.my_atom.fingerprintslast
\tlog_game("Reagent explosion reaction occurred at [AREACOORD(T)]. Last Fingerprint: [lastkey ? lastkey : "N/A"]." )
\tvar/datum/effect_system/reagents_explosion/e = new()
\te.set_up(modifier + round(created_volume/strengthdiv, 1), T, 0, 0)
\te.start()
\tholder.clear_reagents()
'''
HOLY_BODY = '''\tif(created_volume >= 150)
\t\tplaysound(get_turf(holder.my_atom), 'sound/blank.ogg', 80, FALSE, round(created_volume/48))
\t\tstrengthdiv = 8
\t..()
'''


def definition(source, path):
    match = re.search(r'^' + re.escape(path) + r'\n(.*?)(?=^/|\Z)', source, re.M | re.S)
    if match is None:
        raise AssertionError('Missing definition: ' + path)
    return match[1].rstrip() + '\n'


def forward_to_spy(source, holder, created_volume):
    body = definition(source, BASE + '/on_reaction' + SIGNATURE)
    # Accept only the historical broken call or the reviewed fixed call.
    if body == '\tdo_explosion()\n':
        arguments = ()
    elif body == '\tdo_explosion(holder, created_volume)\n':
        arguments = (holder, created_volume)
    else:
        raise AssertionError('Unreviewed explosion callback body')
    calls = []

    def spy(received_holder=None, received_volume=None):
        calls.append((received_holder, received_volume))

    spy(*arguments)
    return calls


class ReagentExplosionCallbackTests(unittest.TestCase):
    def test_signature_and_actual_dispatch(self):
        source = PYROTECHNICS.read_text()
        definition(source, BASE + '/on_reaction' + SIGNATURE)
        recipes = (ROOT / 'code/modules/reagents/chemistry/recipes.dm').read_text()
        definition(recipes, '/datum/chemical_reaction/proc/on_reaction' + SIGNATURE)
        holder = (ROOT / 'code/modules/reagents/chemistry/holder.dm').read_text()
        dispatch = definition(holder, '/datum/reagents/proc/handle_reactions()')
        self.assertIn('for(var/reaction in cached_reactions[R.type])', dispatch)
        self.assertIn('multiplier = min(multiplier, round(get_reagent_amount(B) / cached_required_reagents[B]))', dispatch)
        self.assertIn('selected_reaction.on_reaction(src, multiplier)', dispatch)
        add = definition(holder, '/datum/reagents/proc/add_reagent(reagent, amount, list/data=null, reagtemp = 300, no_react = 0, prepend = FALSE)')
        self.assertIn('\tif(!no_react)\n\t\thandle_reactions()\n', add)

    def test_compiled_recipes_and_real_registration(self):
        dme = (ROOT / 'roguetown.dme').read_text()
        self.assertIn('#include "code\\modules\\reagents\\chemistry\\recipes\\pyrotechnics.dm"', dme)
        holder = (ROOT / 'code/modules/reagents/chemistry/holder.dm').read_text()
        registration = definition(holder, '/proc/build_chemical_reactions_list()')
        self.assertIn('var/paths = subtypesof(/datum/chemical_reaction) - typesof(/datum/chemical_reaction/randomized) + subtypesof(/datum/chemical_reaction/randomized)', registration)
        self.assertIn('\tfor(var/path in paths)\n\t\tvar/datum/chemical_reaction/D = new path()\n\t\tvar/list/reaction_ids = list()', registration)
        self.assertIn('\t\tif(!D.id)\n\t\t\tcontinue', registration)
        self.assertIn('\t\tif(D.required_reagents && D.required_reagents.len)\n\t\t\tfor(var/reaction in D.required_reagents)\n\t\t\t\treaction_ids += reaction', registration)
        self.assertIn('\t\tfor(var/id in reaction_ids)\n\t\t\tif(!GLOB.chemical_reactions_list[id])\n\t\t\t\tGLOB.chemical_reactions_list[id] = list()\n\t\t\tGLOB.chemical_reactions_list[id] += D', registration)

    def test_generic_base_is_not_a_recipe_and_child_inputs_are_unchanged(self):
        source = PYROTECHNICS.read_text()
        recipes = (ROOT / 'code/modules/reagents/chemistry/recipes.dm').read_text()
        self.assertIn('\tvar/list/required_reagents = new/list()\n', definition(recipes, '/datum/chemical_reaction'))
        self.assertEqual(definition(source, BASE), '''\tname = "Generic explosive"
\tid = "reagent_explosion"
\tvar/strengthdiv = 10
\tvar/modifier = 0
''')
        self.assertEqual(definition(source, POTASSIUM), '''\tname = "Explosion"
\tid = "potassium_explosion"
\trequired_reagents = list(/datum/reagent/water = 1, /datum/reagent/potassium = 1)
\tstrengthdiv = 20
''')
        self.assertEqual(definition(source, HOLY), '''\tname = "Holy Explosion"
\tid = "holyboom"
\trequired_reagents = list(/datum/reagent/water/holywater = 1, /datum/reagent/potassium = 1)
''')

    def test_subclass_inheritance_and_holy_parent_call_are_preserved(self):
        source = PYROTECHNICS.read_text()
        # No direct potassium override: ordinary potassium inherits BASE.
        self.assertNotIn(POTASSIUM + '/on_reaction(', source)
        self.assertEqual(definition(source, HOLY + '/on_reaction' + SIGNATURE), HOLY_BODY)
        expected = {BASE + '/on_reaction' + SIGNATURE, HOLY + '/on_reaction' + SIGNATURE}
        actual = set()
        for directory in ('code', 'modular'):
            for path in (ROOT / directory).rglob('*.dm'):
                actual.update(re.findall(r'^' + re.escape(BASE) + r'(?:/[^\n(]+)?/on_reaction\([^\n]*\)', path.read_text(errors='replace'), re.M))
        self.assertEqual(actual, expected)

    def test_holder_identity_and_volume_reach_helper_exactly_once(self):
        holder = object()
        for volume in (0, 1, 20, 149, 150, 275):
            with self.subTest(volume=volume):
                calls = forward_to_spy(PYROTECHNICS.read_text(), holder, volume)
                self.assertEqual(len(calls), 1)
                self.assertIs(calls[0][0], holder)
                self.assertEqual(calls[0][1], volume)

    def test_original_missing_arguments_are_detected(self):
        source = PYROTECHNICS.read_text()
        broken = source.replace('\tdo_explosion(holder, created_volume)\n', '\tdo_explosion()\n')
        self.assertEqual(forward_to_spy(broken, object(), 20), [(None, None)])

    def test_unreviewed_argument_or_control_flow_changes_are_rejected(self):
        source = PYROTECHNICS.read_text()
        for replacement in ('do_explosion(created_volume, holder)',
                            'do_explosion(holder)',
                            'do_explosion(holder, created_volume * 2)',
                            'do_explosion(holder, created_volume)\n\tunexpected_side_effect()'):
            with self.subTest(replacement=replacement):
                changed = re.sub(r'\tdo_explosion\([^\n]*\)', '\t' + replacement, source)
                with self.assertRaises(AssertionError):
                    forward_to_spy(changed, object(), 20)

    def test_helper_argument_uses_and_all_effect_arithmetic_are_unchanged(self):
        # Static only: never call or model this effect-producing helper.
        source = PYROTECHNICS.read_text()
        self.assertEqual(definition(source, BASE + '/proc/do_explosion' + SIGNATURE), HELPER_BODY)


if __name__ == '__main__':
    unittest.main()
