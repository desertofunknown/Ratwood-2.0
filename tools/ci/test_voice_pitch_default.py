#!/usr/bin/env python3
"""Source-bound regression for the original Voice Pitch caller's default.

Run: python3 tools/ci/test_voice_pitch_default.py
Python model only: does not execute DM, React, browser UI, or save/load I/O.
The reviewed original, direct-default, and guarded-default callers are accepted
so baseline failures show modeled value loss, not a missing replacement token.
Intentional pre-compile refinement: invalid legacy values retain default 1;
opening/canceling must not clamp, normalize, or write the stored preference.
"""

from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
VALUES = (0.8, 0.95, 1, 1.2, 1.35)
LEGACY_VALUES = (-1, 0.79, 1.36, 2, None, 0, '', '1.2', 'invalid')
SAFE_DEFAULT = ('(isnum(voice_pitch) && voice_pitch >= MIN_VOICE_PITCH '
                '&& voice_pitch <= MAX_VOICE_PITCH) ? voice_pitch : 1')
BRANCH = '''\t\t\t\tif("voice_pitch")
\t\t\t\t\tvar/new_voice_pitch = tgui_input_number(user, "Choose your character's voice pitch ([MIN_VOICE_PITCH] to [MAX_VOICE_PITCH], lower is deeper):", "Voice Pitch", DEFAULT, 1.35, 0.8, round_value = FALSE)
\t\t\t\t\tif(new_voice_pitch)
\t\t\t\t\t\tif(new_voice_pitch < MIN_VOICE_PITCH || new_voice_pitch > MAX_VOICE_PITCH)
\t\t\t\t\t\t\tto_chat(user, "<font color='red'>Value must be between [MIN_VOICE_PITCH] and [MAX_VOICE_PITCH].</font>")
\t\t\t\t\t\t\treturn
\t\t\t\t\t\tvoice_pitch = new_voice_pitch
'''


def read(path):
    return (ROOT / path).read_text()


def caller_default():
    source = read('code/modules/client/preferences.dm')
    start = source.index('\t\t\t\tif("voice_pitch")\n')
    end = source.index('\n\t\t\t\tif("barksound")', start)
    body = source[start:end]
    for default in ('1', 'voice_pitch', SAFE_DEFAULT):
        if body == BRANCH.replace('DEFAULT', default):
            return default
    raise AssertionError('Unreviewed Voice Pitch caller/consumer; review model')


def consume(stored, response):
    # Mirrors the caller's truthy-response and inclusive range guards.
    if not response or response < 0.8 or response > 1.35:
        return stored
    return response


class VoicePitchDefaultTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.default_expression = caller_default()

    def initial_value(self, stored):
        # DM default -> init_value -> React value -> InputButtons entry.
        if self.default_expression == 'voice_pitch':
            return stored
        if self.default_expression == SAFE_DEFAULT:
            # isnum short-circuits comparisons; opening never writes the field.
            if isinstance(stored, (int, float)) and 0.8 <= stored <= 1.35:
                return stored
        return 1

    def test_unchanged_confirm_preserves_each_valid_pitch(self):
        for stored in VALUES:
            with self.subTest(stored=stored):
                self.assertEqual(consume(stored, self.initial_value(stored)), stored)

    def test_legacy_values_use_original_default_without_changing_on_cancel(self):
        for stored in LEGACY_VALUES:
            with self.subTest(stored=stored):
                self.assertEqual(self.initial_value(stored), 1)
                self.assertEqual(consume(stored, None), stored)
                # Explicit Confirm retains original default-1 behavior.
                self.assertEqual(consume(stored, self.initial_value(stored)), 1)

    def test_cancel_preserves_each_valid_pitch(self):
        for stored in VALUES:
            with self.subTest(stored=stored):
                self.assertEqual(consume(stored, None), stored)

    def test_explicit_edits_preserve_fractional_values_and_endpoints(self):
        for stored in VALUES:
            for edited in VALUES:
                with self.subTest(stored=stored, edited=edited):
                    self.assertEqual(consume(stored, edited), edited)

    def test_caller_rejects_out_of_range_or_false_response(self):
        for response in (0, 0.79, 1.36):
            self.assertEqual(consume(1.2, response), 1.2)

    def test_bound_and_backend_contract(self):
        definitions = read('code/__DEFINES/preferences.dm')
        for name, value in (('MIN_VOICE_PITCH', '0.8'), ('MAX_VOICE_PITCH', '1.35')):
            self.assertRegex(definitions, rf'(?m)^#define {name}\s+{re.escape(value)}$')
        backend = read('code/modules/tgui_input/number.dm')
        for token in (
            'default = 0, max_value = INFINITY, min_value = 0, timeout = 0, round_value = TRUE',
            'new(user, message, title, default, max_value, min_value, timeout, round_value, ui_state)',
            'src.default = default', 'src.max_value = max_value',
            'src.min_value = min_value', 'src.round_value = round_value',
            'data["init_value"] = default', 'data["max_value"] = max_value',
            'data["min_value"] = min_value', 'data["round_value"] = round_value',
            'var/choice = round_value ? round(params["entry"]) : params["entry"]',
            'if(choice > max_value)', 'if(choice < min_value)',
            'set_entry(choice)', 'src.entry = entry', '. = number_input.entry',
            'var/entry\n',
            'if("cancel")\n\t\t\tclosed = TRUE\n\t\t\tSStgui.close_uis(src)\n\t\t\treturn TRUE',
            'input(user, message, title, default) as null|num',
            'return clamp(round_value ? round(input_number) : input_number, min_value, max_value)',
        ):
            self.assertIn(token, backend)

    def test_frontend_initial_value_and_confirm_contract(self):
        frontend = read('tgui/packages/tgui/interfaces/NumberInputModal.tsx')
        for token in (
            'const [value, setValue] = useState(init_value);',
            'const [isValid, setIsValid] = useState(true);',
            'const step = round_value ? 1 : 0.01;',
            'allowFloats={!round_value}', 'minValue={min_value}',
            'maxValue={max_value}', 'value={value}',
            '<InputButtons input={value} disabled={!isValid} />',
            "act('submit', { entry: value });",
        ):
            self.assertIn(token, frontend)
        buttons = read('tgui/packages/tgui/interfaces/common/InputButtons.tsx')
        self.assertIn("onClick={on_submit || (() => act('submit', { entry: input }))}", buttons)
        self.assertIn('Confirm', buttons)

    def test_storage_and_character_consumer_contract(self):
        savefile = read('code/modules/client/preferences_savefile.dm')
        self.assertRegex(savefile, r'S\["voice_pitch"\]\s*>> voice_pitch')
        self.assertIn('if (!voice_pitch)\n\t\tvoice_pitch = 1', savefile)
        self.assertRegex(savefile, r'WRITE_FILE\(S\["voice_pitch"\]\s*, voice_pitch\)')
        human = read('code/modules/mob/living/carbon/human/human.dm')
        self.assertIn('voice_pitch = client.prefs.voice_pitch', human)


if __name__ == '__main__':
    print('Source-bound Python model only; no DM/runtime/frontend/save execution.', flush=True)
    unittest.main(verbosity=2)
