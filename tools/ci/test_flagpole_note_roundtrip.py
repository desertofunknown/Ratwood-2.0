#!/usr/bin/env python3
"""Source-bound flagpole note regression; Python model, NOT native DM/UI execution.

Run: python3 tools/ci/test_flagpole_note_roundtrip.py
Only canonical amp/lt/gt/quot fixtures are modeled; this does not certify BYOND's
full entity codec, browser events, networking, or save I/O. Both reviewed caller
expressions are accepted so the original source fails semantic assertions.
"""

from html import unescape
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
FLAGPOLE = 'code/modules/roguetown/roguemachine/rogue_flagpole.dm'
PROMPT = ('\tvar/new_note = tgui_input_text(user, "Enter a new custom note for the '
          '[controlled_role]:", "Update Role Note", DEFAULT, MAX_MESSAGE_LEN)')
TAIL = '''

\tif(!new_note)
\t\treturn
\tvar/trimmed_note = trim(new_note)
\tif(!length(trimmed_note))
\t\tto_chat(user, span_alert("Custom notes cannot be blank."))
\t\treturn

\tif(trimmed_note == current_note)
\t\tto_chat(user, span_notice("The custom note for [controlled_role] is unchanged."))
\t\treturn

\trole_entry["note"] = trimmed_note
\tto_chat(user, span_notice("You have updated the custom note for [controlled_role]."))
'''


def read(path):
    return (ROOT / path).read_text()


def encode(text):
    # Deliberately bounded fixture codec, not an implementation of BYOND.
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('"', '&quot;')


def default_for(stored, fixed):
    value = stored if stored and stored != 'No custom notes.' else ''
    return unescape(value) if fixed else value


def submit(stored, raw, limit):
    # Both reviewed encode=TRUE paths encode then trim to max_length characters.
    # Native null encoding is not asserted: null/empty both hit caller's guard.
    if raw is None:
        return stored, False
    result = encode(raw)[:limit].strip()
    if not result or result == stored:
        return stored, False
    return result, True


class FlagpoleNoteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = read(FLAGPOLE)
        lines = [line for line in cls.source.splitlines() if 'var/new_note = tgui_input_text(' in line]
        if len(lines) != 1 or lines[0] not in [PROMPT.replace('DEFAULT', x) for x in ('default_text', 'html_decode(default_text)')]:
            raise AssertionError('Unreviewed flagpole caller; review model')
        cls.fixed = lines[0] == PROMPT.replace('DEFAULT', 'html_decode(default_text)')
        cls.limit = int(re.search(r'#define MAX_MESSAGE_LEN\s+(\d+)', read('code/__DEFINES/say.dm')).group(1))

    def test_repeated_unchanged_edits_preserve_encoded_storage(self):
        for raw in ('Plain text', 'A&B', '<b>not markup</b>', 'The "Watch"', '&amp;', '&lt;b&gt;', '&#38;'):
            with self.subTest(raw=raw):
                original = encode(raw)
                stored = original
                for _ in range(5):
                    default = default_for(stored, self.fixed)
                    self.assertEqual(default, raw)
                    stored, written = submit(stored, default, self.limit)
                    self.assertEqual(stored, original)
                    self.assertFalse(written)

    def test_full_encoded_limit_does_not_lose_suffix_on_unchanged_edit(self):
        raw = 'A&B' + 'x' * (self.limit - len(encode('A&B')))
        stored = encode(raw)
        self.assertEqual(len(stored), self.limit)
        result, written = submit(stored, default_for(stored, self.fixed), self.limit)
        self.assertEqual(result, stored)
        self.assertFalse(written)
        # Demonstrates the exact old failure independently of source shape.
        old_result, old_written = submit(stored, default_for(stored, False), self.limit)
        self.assertNotEqual(old_result, stored)
        self.assertTrue(old_written)
        self.assertEqual(old_result.count('x'), stored.count('x') - 4)

    def test_cancel_blank_and_default_note_never_overwrite(self):
        for stored in (None, '', 'No custom notes.', encode('A&B'), encode('&amp;')):
            for response in (None, '', '   '):
                self.assertEqual(submit(stored, response, self.limit), (stored, False))
        for stored in (None, '', 'No custom notes.'):
            self.assertEqual(default_for(stored, self.fixed), '')

    def test_explicit_edit_stays_encoded_for_html_consumer(self):
        raw = '<script>alert("x")</script> & literal &amp;'
        result, written = submit(encode('old'), raw, self.limit)
        self.assertTrue(written)
        self.assertEqual(result, encode(raw))
        self.assertNotIn('<script>', result)
        self.assertEqual(unescape(result), raw)

    def test_caller_guards_and_encoded_display_contract(self):
        self.assertIn(TAIL, self.source)
        self.assertIn('if(!can_use(user))\n\t\treturn', self.source)
        self.assertIn('if(choice != "Continue")\n\t\t\treturn', self.source)
        self.assertIn('var/default_text = (current_note && current_note != default_note) ? current_note : ""', self.source)
        self.assertIn('dropdown_html += "<p><em>Note:</em> [role_note]</p>"', self.source)

    def test_frontend_and_native_routes_share_encoding_contract(self):
        backend = read('code/modules/tgui_input/text.dm')
        for token in (
            'multiline = FALSE, encode = TRUE, timeout = 0',
            'if(!user.client.prefs.tgui_pref)',
            'return stripped_input(user, message, title, default, PREVENT_CHARACTER_TRIM_LOSS(max_length))',
            'src.default = default', 'data["placeholder"] = default',
            'var/converted_entry = encode ? html_encode(entry) : entry',
            'src.entry = trim(converted_entry, PREVENT_CHARACTER_TRIM_LOSS(max_length))',
            'if("cancel")\n\t\t\tclosed = TRUE',
        ):
            self.assertIn(token, backend)
        helpers = read('code/__HELPERS/text.dm')
        native = helpers.split('/proc/stripped_input(', 1)[1].split('/proc/stripped_multiline_input(', 1)[0]
        self.assertIn('input(user, message, title, default) as text|null', native)
        self.assertIn('return trim(html_encode(name), max_length)', native)
        self.assertIn('text = copytext(text, 1, max_length)', helpers)
        self.assertIn('#define PREVENT_CHARACTER_TRIM_LOSS(integer) (integer + 1)', read('code/__DEFINES/tgui_bits.dm'))
        frontend = read('tgui/packages/tgui/interfaces/TextInputModal.tsx')
        for token in ("const initialInput = useRef(placeholder || '');", 'const [input, setInput] = useState(initialInput.current);', "act('submit', { entry: input });", 'input={input}', 'value={input}'):
            self.assertIn(token, frontend)


if __name__ == '__main__':
    print('Source-bound Python model only; no native DM, browser, or save I/O.', flush=True)
    unittest.main(verbosity=2)
