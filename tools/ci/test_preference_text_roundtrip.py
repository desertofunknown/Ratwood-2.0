#!/usr/bin/env python3
"""Source-bound preference text regressions, not native DM/UI/save execution.

Models only complete amp/lt/gt/quot entities emitted by the fixture encoder.
Literal entity-looking input is encoded first. This is NOT BYOND codec parity,
a migration of old double encoding, or a guarantee to repair clipped entities.
The original and fixed caller expressions are accepted to expose baseline failures.
Run: python3 tools/ci/test_preference_text_roundtrip.py
"""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = 'code/modules/client/vices_menu.dm'
CALLS = {
    'scent': ('new_scent = tgui_input_text(usr, scent_prompt, "Redolent", DEFAULT, max_length = 100, multiline = TRUE, preview_leadin = scent_leadin)', 'redolent_scent', 100),
    'name': ('var/new_name = tgui_input_text(usr, "Enter a custom name for this item (leave blank to use default):", "Rename Item", DEFAULT, MAX_NAME_LEN)', 'vars["loadout_[slot]_name"]', 42),
    'desc': ('var/new_desc = tgui_input_text(usr, "Enter a custom description for this item (leave blank to use default):", "Describe Item", DEFAULT, max_length = 500, multiline = TRUE)', 'vars["loadout_[slot]_desc"]', 500),
}


def read(path):
    return (ROOT / path).read_text()


def encode(value):
    return value.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def decode_once(value):
    entities = {'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"'}
    return re.sub(r'&(amp|lt|gt|quot);', lambda m: entities[m[1]], value)


def fixed_expression(value):
    return f'isnull({value}) ? null : html_decode({value})'


def default_for(value, fixed):
    return decode_once(value) if fixed and value is not None else value


def submit(stored, response, kind, limit):
    # Models a null returned by the helper, NOT native html_encode(null).
    if response is None:
        return stored
    result = encode(response)[:limit].strip()
    if kind == 'scent' and not result:
        return 'earth and sweat'  # Default scent for the modeled Neutral selection.
    return result


class PreferenceTextTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = read(SOURCE)
        cls.fixed = {}
        for kind, (template, value, _) in CALLS.items():
            old = template.replace('DEFAULT', value)
            new = template.replace('DEFAULT', fixed_expression(value))
            lines = [line.strip() for line in cls.source.splitlines() if template.split('DEFAULT')[0] in line]
            if len(lines) != 1 or lines[0] not in (old, new):
                raise AssertionError(f'Unreviewed {kind} caller; review model')
            cls.fixed[kind] = lines[0] == new

    def test_repeated_unchanged_edits_and_literal_entities(self):
        for kind, (_, _, limit) in CALLS.items():
            for raw in ('Plain text', 'A&B', '<b>text</b>', '"Watch"', '&amp;', '&lt;b&gt;', '&#38;', '&amp;amp;'):
                with self.subTest(kind=kind, raw=raw):
                    original = encode(raw)
                    stored = original
                    for _ in range(5):
                        default = default_for(stored, self.fixed[kind])
                        self.assertEqual(default, raw)
                        stored = submit(stored, default, kind, limit)
                        self.assertEqual(stored, original)

    def test_each_encoded_limit_preserves_suffix(self):
        for kind, (_, _, limit) in CALLS.items():
            with self.subTest(kind=kind, limit=limit):
                raw = 'A&B' + 'x' * (limit - len(encode('A&B')) - 3) + 'END'
                stored = encode(raw)
                self.assertEqual(len(stored), limit)
                result = submit(stored, default_for(stored, self.fixed[kind]), kind, limit)
                self.assertEqual(result, stored)
                self.assertTrue(result.endswith('END'))
                old_result = submit(stored, default_for(stored, False), kind, limit)
                self.assertNotEqual(old_result, stored)
                self.assertFalse(old_result.endswith('END'))

    def test_null_default_and_cancel_preserve_stored_value(self):
        for kind, (_, _, limit) in CALLS.items():
            self.assertIsNone(default_for(None, self.fixed[kind]))
            for stored in (None, '', encode('A&B'), encode('&amp;')):
                self.assertEqual(submit(stored, None, kind, limit), stored)

    def test_empty_and_whitespace_keep_existing_clear_or_fallback(self):
        for kind, (_, _, limit) in CALLS.items():
            self.assertEqual(default_for('', self.fixed[kind]), '')
            for raw in ('', '   '):
                self.assertEqual(submit(encode('A&B'), raw, kind, limit), 'earth and sweat' if kind == 'scent' else '')

    def test_new_values_are_encoded_and_limited(self):
        for kind, (_, _, limit) in CALLS.items():
            raw = '<tag>"x" & literal &amp;'
            self.assertEqual(submit('old', raw, kind, limit), encode(raw)[:limit])
            self.assertEqual(len(submit('old', 'x' * (limit + 10), kind, limit)), limit)

    def test_cancel_storage_and_default_source_contracts(self):
        for token in (
            'if(isnull(new_scent))\n\t\t\t\treturn',
            'if(!length(trim(new_scent)))\n\t\t\t\tnew_scent = get_default_redolent_scent(new_scent_type)',
            'if(scent_action == "Use default")\n\t\t\tnew_scent = get_default_redolent_scent(new_scent_type)',
            'save_to_history()\n\t\tredolent_type = new_scent_type\n\t\tredolent_scent = new_scent',
        ):
            self.assertIn(token, self.source)
        for field in ('name', 'desc'):
            self.assertIn(f'if(new_{field} != null) // Allow empty string to clear\n\t\t\t\t\tvars["loadout_[slot]_{field}"] = new_{field}', self.source)
        self.assertRegex(read('code/__DEFINES/say.dm'), r'#define MAX_NAME_LEN\s+42\b')
        self.assertIn('return "earth and sweat"', read('code/modules/client/preferences.dm'))

    def test_persistence_presets_and_existing_consumers_stay_encoded(self):
        save = read('code/modules/client/preferences_savefile.dm')
        fields = ['redolent_scent'] + [f'loadout_{slot}_{field}' for slot in range(1, 11) for field in ('name', 'desc')]
        for field in fields:
            self.assertIn(f'S["{field}"] >> {field}', save)
            self.assertIn(f'WRITE_FILE(S["{field}"], {field})', save)
            self.assertIn(f'"{field}" = {field},', self.source)
            self.assertIn(f'{field} = snapshot["{field}"]', self.source)
            self.assertIn(f'{field} = preset["{field}"]', self.source)
        # These mixed consumer paths are intentionally NOT normalized by this fix.
        self.assertIn('[redolent_type]</b>: [scent_display]</div>', self.source)
        self.assertIn('[html_encode(custom_name ? custom_name : current_item.name)]', self.source)
        self.assertIn('[html_encode(custom_desc ? custom_desc : (item_desc ? item_desc : current_item.desc))]', self.source)

    def test_helper_frontend_and_native_route_contracts(self):
        backend = read('code/modules/tgui_input/text.dm')
        for token in ('multiline = FALSE, encode = TRUE, timeout = 0', 'if(!user.client.prefs.tgui_pref)',
                      'return stripped_input(user, message, title, default, PREVENT_CHARACTER_TRIM_LOSS(max_length))',
                      'return stripped_multiline_input(user, message, title, default, PREVENT_CHARACTER_TRIM_LOSS(max_length))',
                      'src.default = default', 'data["placeholder"] = default',
                      'var/converted_entry = encode ? html_encode(entry) : entry',
                      'src.entry = trim(converted_entry, PREVENT_CHARACTER_TRIM_LOSS(max_length))',
                      'if("cancel")\n\t\t\tclosed = TRUE'):
            self.assertIn(token, backend)
        helpers = read('code/__HELPERS/text.dm')
        for proc, next_proc, input_type in (('stripped_input', 'stripped_multiline_input', 'text'), ('stripped_multiline_input', 'reject_bad_name', 'message')):
            body = helpers.split(f'/proc/{proc}(', 1)[1].split(f'/proc/{next_proc}(', 1)[0]
            self.assertIn(f'input(user, message, title, default) as {input_type}|null', body)
            self.assertIn('return trim(html_encode(name), max_length)', body)
        self.assertIn('text = copytext(text, 1, max_length)', helpers)
        self.assertIn('#define PREVENT_CHARACTER_TRIM_LOSS(integer) (integer + 1)', read('code/__DEFINES/tgui_bits.dm'))
        frontend = read('tgui/packages/tgui/interfaces/TextInputModal.tsx')
        for token in ("const initialInput = useRef(placeholder || '');", 'const [input, setInput] = useState(initialInput.current);', "act('submit', { entry: input });"):
            self.assertIn(token, frontend)


if __name__ == '__main__':
    print('Bounded-entity source-bound Python model only; no BYOND runtime, UI, or save I/O.', flush=True)
    unittest.main(verbosity=2)
