#!/usr/bin/env python3
"""Source-bound numeric bark-speed prompt regressions, not DM execution.

Run: python3 tools/ci/test_bark_speed_default.py
Models only the reviewed prompt expression, positive finite numeric bounds,
constructor range checks, null cancellation and existing setter. No client,
server, audio, savefile I/O, full randomization or DM interpreter is exercised.
The race-change producer is a possible outcome, not a deterministic RNG claim.
"""
from pathlib import Path
import math
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
PREFS = ROOT / 'code/modules/client/preferences.dm'
SETUP = ROOT / 'code/modules/mob/dead/new_player/preferences_setup.dm'
BARKS = ROOT / 'code/modules/blooper/bark.dm'
DEFINES = ROOT / 'code/__DEFINES/barks.dm'
NUMBER = ROOT / 'code/modules/tgui_input/number.dm'
DEFAULT = 'clamp(bark_speed, initial(B.minspeed), initial(B.maxspeed))'
EXPECTED = '''\
\t\t\t\tif("barkspeed")
\t\t\t\t\tvar/datum/bark/B = GLOB.bark_list[bark_id]
\t\t\t\t\tvar/borkset = tgui_input_number(user, "Choose your bark speed. Higher is slower; lower is faster.", "Bark speed", DEFAULT, initial(B.maxspeed), initial(B.minspeed))
\t\t\t\t\tif(!isnull(borkset))
\t\t\t\t\t\tbark_speed = round(clamp(borkset, initial(B.minspeed), initial(B.maxspeed)), 1)
'''.replace('DEFAULT', DEFAULT)


def handler(source):
    match = re.findall(r'^\t{4}if\("barkspeed"\)\n.*?(?=^\t{4}if\(|\Z)', source, re.M | re.S)
    if len(match) != 1:
        raise AssertionError('Expected one bark-speed handler')
    return match[0].rstrip() + '\n'


def contract(source):
    if handler(source) != EXPECTED:
        raise AssertionError('Only the prompt default may clamp; preserve bounds, null guard and setter')


def definition(source, path):
    match = re.findall(r'^' + re.escape(path) + r'[^\n]*\n(.*?)(?=^/|\Z)', source, re.M | re.S)
    if len(match) != 1:
        raise AssertionError(f'Expected one definition: {path}')
    return match[0]


def bounds(bark):
    source = BARKS.read_text()
    # The exact-path delimiter prevents matching subtype declarations.
    base = re.search(r'^/datum/bark\n(.*?)(?=^/)', source, re.M | re.S)[1]
    specific = definition(source, '/datum/bark/' + bark)
    values = []
    for field, macro in [('minspeed', 'MINSPEED'), ('maxspeed', 'MAXSPEED')]:
        assert f'var/{field} = BARK_DEFAULT_{macro}' in base
        fallback = int(re.search(r'^#define BARK_DEFAULT_' + macro + r' (\d+)$', DEFINES.read_text(), re.M)[1])
        override = re.findall(r'^\t' + field + r' = (\d+)(?:\s*//[^\n]*)?$', specific, re.M)
        values.append(int(override[0]) if override else fallback)
    return tuple(values)


def clamp(value, low, high):
    return min(max(value, low), high)


def prompt_default(source, stored, limits):
    """Recognize only baseline/fixed source, so the model cannot silently pass rollback."""
    block = handler(source)
    if block == EXPECTED:
        return clamp(stored, *limits)
    if block == EXPECTED.replace(DEFAULT, 'bark_speed', 1):
        return stored
    raise AssertionError('Unreviewed prompt source')


def constructor(default, limits):
    low, high = limits
    if default > high:
        raise ValueError('Default value is greater than max value.')
    return max(default, low)


def setter(stored, response, limits):
    # DM round(value, 1) rounds to nearest; fixtures avoid half-tie ambiguity.
    return stored if response is None else math.floor(clamp(response, *limits) + 0.5)


class BarkSpeedSourceTests(unittest.TestCase):
    def test_exact_handler(self):
        contract(PREFS.read_text())

    def test_source_ranges_and_random_eligibility(self):
        self.assertEqual(bounds('meow'), (5, 11))
        self.assertEqual(bounds('mutedc3'), (2, 8))
        bark = BARKS.read_text()
        self.assertIn('\tallow_random = TRUE\n', definition(bark, '/datum/bark/mutedc3'))
        self.assertIn('\t\tif(path::allow_random)\n\t\t\t.[path::id] = path\n', definition(bark, '/proc/init_random_bark_list()'))

    def test_reachable_race_change_retains_speed(self):
        prefs = PREFS.read_text()
        species = prefs.rsplit('\t\t\t\tif("species")\n', 1)[1].split('\t\t\t\tif("update_mutant_colors")')[0]
        self.assertIn('\t\t\t\t\tif(result)\n\t\t\t\t\t\tset_new_race(result, user)', species)
        self.assertIn('\trandom_character(gender, FALSE, FALSE)\n', definition(prefs, '/datum/preferences/proc/set_new_race('))
        random = definition(SETUP.read_text(), '/datum/preferences/proc/random_character(')
        self.assertEqual([line for line in random.splitlines() if 'bark_' in line], [
            '\tbark_id = pick(GLOB.bark_random_list)', '\tbark_pitch = BARK_PITCH_RAND(gender)', '\tbark_variance = BARK_VARIANCE_RAND'])
        self.assertIn('\tvar/bark_speed = 4\n', prefs)

    def test_constructor_native_fallback_and_response_rounding(self):
        number = NUMBER.read_text()
        self.assertIn('\tif(default < min_value)\n\t\tsrc.default = min_value\n\tif(default > max_value)\n\t\tCRASH("Default value is greater than max value.")', number)
        self.assertIn('input(user, message, title, default) as null|num', number)
        self.assertIn('return clamp(round_value ? round(input_number) : input_number, min_value, max_value)', number)
        self.assertIn('var/choice = round_value ? round(params["entry"]) : params["entry"]', number)
        self.assertIn('default = 0, max_value = INFINITY, min_value = 0, timeout = 0, round_value = TRUE', number)


class BarkSpeedModelTests(unittest.TestCase):
    def test_meow_eleven_to_muted_default_eight_without_eager_write(self):
        self.assertLessEqual(11, bounds('meow')[1])
        stored = 11  # Valid Meow speed retained when race randomization picks mutedc3.
        limits = bounds('mutedc3')
        default = prompt_default(PREFS.read_text(), stored, limits)
        self.assertEqual(default, 8)
        self.assertEqual(constructor(default, limits), 8)
        self.assertEqual(stored, 11)
        self.assertEqual(setter(stored, None, limits), 11)
        self.assertEqual(setter(stored, default, limits), 8)

    def test_lower_default_and_valid_endpoints_both_ui_paths(self):
        for bark in ('meow', 'mutedc3'):
            limits = bounds(bark)
            for stored in limits:
                with self.subTest(bark=bark, stored=stored):
                    default = prompt_default(PREFS.read_text(), stored, limits)
                    self.assertEqual(default, stored)  # Native fallback receives this too.
                    self.assertEqual(constructor(default, limits), stored)
        default = prompt_default(PREFS.read_text(), 4, bounds('meow'))
        self.assertEqual(default, 5)
        self.assertEqual(constructor(default, bounds('meow')), 5)
        self.assertEqual(setter(4, None, bounds('meow')), 4)

    def test_existing_setter_clamp_rounding_and_cancel(self):
        contract(PREFS.read_text())
        for response, expected in [(None, 11), (2, 2), (8, 8), (-1, 2), (12, 8), (4.2, 4), (4.8, 5)]:
            self.assertEqual(setter(11, response, bounds('mutedc3')), expected)
        # Real input helper floors submissions first, unchanged by this patch.
        self.assertEqual(setter(11, math.floor(4.8), bounds('mutedc3')), 4)


class BarkSpeedMutationTests(unittest.TestCase):
    def test_prompt_setter_bounds_and_cancellation_mutations_rejected(self):
        source = PREFS.read_text()
        contract(source)
        block = handler(source)
        for old, new in [
            (DEFAULT, 'bark_speed'),
            (DEFAULT, 'clamp(bark_speed, initial(B.maxspeed), initial(B.minspeed))'),
            ('initial(B.maxspeed), initial(B.minspeed))', 'initial(B.minspeed), initial(B.maxspeed))'),
            ('if(!isnull(borkset))', 'if(borkset)'),
            ('round(clamp(borkset, initial(B.minspeed), initial(B.maxspeed)), 1)', 'borkset'),
            ('\t\t\t\t\tvar/borkset', '\t\t\t\t\tbark_speed = 8\n\t\t\t\t\tvar/borkset'),
        ]:
            with self.subTest(replacement=new):
                mutated = block.replace(old, new, 1)
                self.assertNotEqual(mutated, block)
                with self.assertRaises(AssertionError):
                    contract(source.replace(block.rstrip(), mutated.rstrip(), 1))

    def test_rollback_reproduces_constructor_failure_and_native_bad_default(self):
        source = PREFS.read_text()
        block = handler(source)
        baseline = source.replace(block.rstrip(), block.replace(DEFAULT, 'bark_speed', 1).rstrip(), 1)
        default = prompt_default(baseline, 11, bounds('mutedc3'))
        self.assertEqual(default, 11)
        with self.assertRaisesRegex(ValueError, 'greater than max'):
            constructor(default, bounds('mutedc3'))


if __name__ == '__main__':
    unittest.main()
