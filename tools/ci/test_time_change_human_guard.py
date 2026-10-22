"""Source-bound day/night human-field guard regression; no DM execution.

Exact time.dm two-guard port from Arturlang, Rotwood-Vale/Ratwood-2.0
3850517fcb74ac18c472ef59f0454b1145dc2f9f (AGPL-3.0).
Run: python3 tools/ci/test_time_change_human_guard.py
The model tests only reviewed guards/bit operations, not timers or UI behavior.
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
TIME = ROOT / 'code/__HELPERS/time.dm'
HUMAN = '/mob/living/carbon/human'


def blocks(source):
    pattern = (r'\t\tvar/mob/living/carbon/human/H = src\n'
               r'\t\tif\(([^\n]+)\)\n'
               r'\t\t\tH.time_flags &= ~\(TIME_OF_DAY_BIT_DAY \| TIME_OF_DAY_BIT_NIGHT\)[ \t]*(?://[^\n]*)?\n'
               r'\t\t\tH.time_flags \|= TIME_OF_DAY_BIT_(DAY|NIGHT)[ \t]*(?://[^\n]*)?\n')
    found = re.findall(pattern, source)
    if len(found) != 2 or [part[1] for part in found] != ['DAY', 'NIGHT']:
        raise AssertionError('Unreviewed day/night field assignment structure')
    if any(guard not in ['H', 'ishuman(H)'] for guard, _ in found):
        raise AssertionError('Unreviewed guard')
    return found


def apply(block, mob_type, flags):
    guard, phase = block
    # ishuman is istype, so all descendants count, not only human species.
    is_human = mob_type == HUMAN or mob_type.startswith(HUMAN + '/')
    allowed = bool(mob_type) if guard == 'H' else is_human
    if not allowed:
        return flags, 0
    if not is_human:
        raise AttributeError('Nonhuman mob has no time_flags')
    return (flags & ~3) | (1 if phase == 'DAY' else 2), 1


class TimeChangeGuardTests(unittest.TestCase):
    def test_nonhuman_players_never_access_human_field(self):
        for block in blocks(TIME.read_text()):
            for mob in ['/mob/living/simple_animal/pet/familiar', '/mob/living/carbon/monkey']:
                with self.subTest(phase=block[1], mob=mob):
                    self.assertEqual(apply(block, mob, None), (None, 0))

    def test_human_subtypes_preserve_unrelated_bits_and_set_only_current_phase(self):
        for block in blocks(TIME.read_text()):
            for mob in [HUMAN, HUMAN + '/species/elf/dark', HUMAN + '/species/human/northern']:
                for flags in range(32):
                    expected = (flags & ~3) | (1 if block[1] == 'DAY' else 2)
                    self.assertEqual(apply(block, mob, flags), (expected, 1))

    def test_original_nonnull_guard_is_detected(self):
        for block in blocks(TIME.read_text()):
            self.assertEqual(block[0], 'ishuman(H)')
            with self.assertRaises(AttributeError):
                apply(('H', block[1]), '/mob/living/simple_animal/pet/familiar', None)

    def test_model_is_bound_to_predicate_constants_and_actual_reachability(self):
        helpers = (ROOT / 'code/__DEFINES/is_helpers.dm').read_text()
        self.assertIn('#define ishuman(A) (istype(A, /mob/living/carbon/human))', helpers)
        constants = (ROOT / 'code/__DEFINES/mobs.dm').read_text()
        for name, shift in [('DAY', 0), ('NIGHT', 1)]:
            self.assertRegex(constants, rf'#define TIME_OF_DAY_BIT_{name}\s+\(1 << {shift}\)')
        source = TIME.read_text()
        self.assertIn('for(var/mob/living/player in GLOB.mob_list)\n\t\t\tif(player.stat != DEAD && player.client)\n\t\t\t\tplayer.do_time_change()', source)
        familiar = (ROOT / 'code/modules/spells/spell_types/wizard/conjure/find_familiar.dm').read_text()
        self.assertIn('var/mob/living/simple_animal/pet/familiar/awakener = new prefs.familiar_specie(spawn_turf)', familiar)
        self.assertIn('chosen_one.mind.transfer_to(awakener, 1)', familiar)
        mind = (ROOT / 'code/datums/mind.dm').read_text()
        self.assertIn('new_character.key = key', mind)
        self.assertIn('var/time_flags = 0', (ROOT / 'code/modules/mob/living/carbon/human/human_defines.dm').read_text())

    def test_model_rejects_unreviewed_assignment_changes(self):
        source = TIME.read_text()
        with self.assertRaises(AssertionError):
            blocks(source.replace('H.time_flags &= ~', 'H.time_flags &= '))

    def test_model_rejects_executable_assignment_suffixes(self):
        source = TIME.read_text()
        mutations = [
            ('H.time_flags &= ~(TIME_OF_DAY_BIT_DAY | TIME_OF_DAY_BIT_NIGHT)', ' & 0'),
            ('H.time_flags |= TIME_OF_DAY_BIT_DAY', ' | TIME_OF_DAY_BIT_NIGHT'),
        ]
        for expression, suffix in mutations:
            with self.subTest(expression=expression):
                self.assertIn(expression, source)
                with self.assertRaises(AssertionError):
                    blocks(source.replace(expression, expression + suffix))


if __name__ == '__main__':
    unittest.main()
