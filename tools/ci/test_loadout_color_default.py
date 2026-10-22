#!/usr/bin/env python3
"""Source-bound Python model of loadout color default/selection/consumer.

Run: python3 tools/ci/test_loadout_color_default.py
This does NOT execute DM, React, a browser, serialization, or actual save I/O.
The model accepts only the reviewed old/new caller bodies and checks the actual
palette, backend transport, frontend exact-selection expression, and consumer.
Baseline is intentionally supported to demonstrate semantic failures, not merely
an absent source token. Source-contract changes require reviewing this model.
"""

from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]


def read(path):
    return (ROOT / path).read_text()


OLD_BRANCH = (
    '\t\t\tif("color")\n'
    '\t\t\t\tvar/datum/loadout_item/current = vars[slot_var]\n'
    '\t\t\t\tif(!current)\n'
    '\t\t\t\t\treturn\n'
    '\t\t\t\t\n'
    '\t\t\t\t// Use dye bin colors for more variety\n'
    '\t\t\t\tvar/list/color_choices = list("None")\n'
    '\t\t\t\tfor(var/color_name in GLOB.colorlist)\n'
    '\t\t\t\t\tcolor_choices += color_name\n'
    '\t\t\t\t\n'
    '\t\t\t\tvar/new_color = tgui_input_list(usr, "Choose a color for this item:", "Item Color", color_choices, vars["loadout_[slot]_hex"])\n'
    '\t\t\t\t\n'
    '\t\t\t\tif(new_color)\n'
    '\t\t\t\t\tif(new_color == "None")\n'
    '\t\t\t\t\t\tvars["loadout_[slot]_hex"] = null\n'
    '\t\t\t\t\telse\n'
    '\t\t\t\t\t\t// Look up the hex value from GLOB.colorlist\n'
    '\t\t\t\t\t\tvars["loadout_[slot]_hex"] = GLOB.colorlist[new_color]\n'
    '\t\t\t\t\topen_vices_menu(usr)\n'
    '\t\t\t\treturn\n'
    '\t'
)

NEW_BRANCH = (
    '\t\t\tif("color")\n'
    '\t\t\t\tvar/datum/loadout_item/current = vars[slot_var]\n'
    '\t\t\t\tif(!current)\n'
    '\t\t\t\t\treturn\n'
    '\t\t\t\t\n'
    '\t\t\t\t// Use dye bin colors for more variety\n'
    '\t\t\t\tvar/list/color_choices = list("None")\n'
    '\t\t\t\tfor(var/color_name in GLOB.colorlist)\n'
    '\t\t\t\t\tcolor_choices += color_name\n'
    '\t\t\t\t\n'
    '\t\t\t\t// The picker takes a palette name, while loadout colors are stored as hex.\n'
    '\t\t\t\tvar/default_color = vars["loadout_[slot]_hex"]\n'
    '\t\t\t\tfor(var/color_name in GLOB.colorlist)\n'
    '\t\t\t\t\tif(GLOB.colorlist[color_name] == default_color)\n'
    '\t\t\t\t\t\tdefault_color = color_name\n'
    '\t\t\t\t\t\tbreak\n'
    '\n'
    '\t\t\t\tvar/new_color = tgui_input_list(usr, "Choose a color for this item:", "Item Color", color_choices, default_color)\n'
    '\t\t\t\t\n'
    '\t\t\t\tif(new_color)\n'
    '\t\t\t\t\tif(new_color == "None")\n'
    '\t\t\t\t\t\tvars["loadout_[slot]_hex"] = null\n'
    '\t\t\t\t\telse\n'
    '\t\t\t\t\t\t// Look up the hex value from GLOB.colorlist\n'
    '\t\t\t\t\t\tvars["loadout_[slot]_hex"] = GLOB.colorlist[new_color]\n'
    '\t\t\t\t\topen_vices_menu(usr)\n'
    '\t\t\t\treturn\n'
    '\t'
)

def caller_contract(source):
    start = source.index('\t\t\tif("color")', source.index('\tif(href_list["loadout_action"])'))
    end = source.index('\n\tif(href_list["language_action"])', start)
    branch = source[start:end]
    if branch not in (OLD_BRANCH, NEW_BRANCH):
        raise AssertionError("Unreviewed color caller/consumer; update model")
    return branch == NEW_BRANCH


def palette_contract():
    source = read("code/modules/roguetown/roguejobs/tailor/dyer.dm")
    body = source.split("GLOBAL_LIST_INIT(colorlist, list(\n", 1)[1].split("\n))", 1)[0]
    pairs = []
    for line in body.splitlines():
        match = re.fullmatch(r'\s*"([^"\n]+)"\s*=\s*"(#[0-9a-fA-F]{6})",', line)
        if not match:
            raise AssertionError("Unreviewed palette entry")
        pairs.append(match.groups())
    if len(dict(pairs)) != len(pairs) or not pairs:
        raise AssertionError("Palette names must be unique and nonempty")
    return pairs


def modeled_default(stored, palette, fixed):
    # Exact string comparison, preserving case and unmatched types/values.
    if fixed:
        for name, value in palette:
            if value == stored:
                return name
    return stored


def modeled_selection(default, palette):
    # Empty search, source-bound to init_value and Math.max(0, indexOf()).
    items = ["None"] + [name for name, _ in palette]
    selection = default or items[0]
    return items[items.index(selection) if selection in items else 0]


def modeled_consumer(stored, response, palette):
    # Source-bound caller: cancel is false/null; None clears; names map to hex.
    if not response:
        return stored, False
    return (None if response == "None" else dict(palette)[response]), True


class LoadoutColorDefaultTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = read("code/modules/client/vices_menu.dm")
        cls.fixed = caller_contract(cls.source)
        cls.palette = palette_contract()

    def default(self, value, palette=None):
        return modeled_default(value, self.palette if palette is None else palette, self.fixed)

    def test_every_palette_hex_reopens_and_confirms_unchanged(self):
        for name, value in self.palette:
            with self.subTest(name=name, hex=value):
                expected_name = next(n for n, v in self.palette if v == value)
                chosen = modeled_selection(self.default(value), self.palette)
                self.assertEqual(chosen, expected_name)
                self.assertEqual(modeled_consumer(value, chosen, self.palette), (value, True))

    def test_aliases_use_first_name_without_changing_options(self):
        palette = [("First", "#123abc"), ("Alias", "#123abc"), ("Other", "#fedcba")]
        original = palette.copy()
        self.assertEqual(self.default("#123abc", palette), "First")
        self.assertEqual(palette, original)
        self.assertEqual(modeled_consumer("#123abc", "Alias", palette), ("#123abc", True))

    def test_unmatched_and_legacy_defaults_are_preserved(self):
        values = [None, "None", "", "invalid", "#nothex", 0, 17]
        values += [name for name, _ in self.palette]
        values += [value.swapcase() for _, value in self.palette
                   if value.swapcase() not in dict(self.palette).values()]
        for value in values:
            with self.subTest(value=value):
                self.assertEqual(self.default(value), value)
                expected = value if value in dict(self.palette) else "None"
                self.assertEqual(modeled_selection(self.default(value), self.palette), expected)

    def test_valid_custom_hex_keeps_existing_fallback_and_cancel(self):
        custom = "#123456"
        self.assertNotIn(custom, dict(self.palette).values())
        self.assertEqual(self.default(custom), custom)
        chosen = modeled_selection(self.default(custom), self.palette)
        self.assertEqual(chosen, "None")
        self.assertEqual(modeled_consumer(custom, None, self.palette), (custom, False))
        self.assertEqual(modeled_consumer(custom, chosen, self.palette), (None, True))

    def test_cancel_and_explicit_clearing(self):
        for stored in [None, "None", "invalid", 17] + [v for _, v in self.palette]:
            with self.subTest(stored=stored):
                self.assertEqual(modeled_consumer(stored, None, self.palette), (stored, False))
                self.assertEqual(modeled_consumer(stored, "None", self.palette), (None, True))
        for name, value in self.palette:
            self.assertEqual(modeled_consumer(None, name, self.palette), (value, True))

    def test_frontend_and_backend_selection_contract(self):
        frontend = read("tgui/packages/tgui/interfaces/ListInputModal.tsx")
        for token in (
            "const [selection, setSelection] = useState(init_value);",
            "const [searchQuery, setSearchQuery] = useState('');",
            "const filteredItems = items.filter((item) =>\n    item.toLowerCase().includes(searchQuery.toLowerCase()),\n  );",
            "const selected = Math.max(0, filteredItems.indexOf(selection));",
            "const selectedItem = filteredItems[selected];",
            "act('submit', { entry: selectedItem });",
            "entry: selectedItem ?? items[0],",
        ):
            self.assertIn(token, frontend)
        backend = read("code/modules/tgui_input/list.dm")
        for token in (
            "src.default = default", 'data["init_value"] = default || items[1]',
            'data["items"] = items', "src.items_map[string_key] = i",
            'set_choice(items_map[params["entry"]])',
            'if (!(params["entry"] in items))\n\t\t\t\treturn',
            'if("cancel")\n\t\t\tstop_preview()\n\t\t\tclosed = TRUE',
            '. = input.choice', 'var/choice',
        ):
            self.assertIn(token, backend)
        # Current printable, unique names survive backend string-key handling.
        names = ["None"] + [n for n, _ in self.palette]
        self.assertEqual(len(names), len(set(names)))
        self.assertTrue(all(all(0x20 <= ord(c) <= 0x8000 for c in n) for n in names))

    def test_raw_persistence_and_copy_writers(self):
        savefile = read("code/modules/client/preferences_savefile.dm")
        hex_lines = [line for line in savefile.splitlines() if re.search(r'loadout_.*hex', line)]
        expected = []
        for i in range(1, 11):
            field = f"loadout_{i}_hex"
            expected.extend([f'\tS["{field}"] >> {field}', f'\tWRITE_FILE(S["{field}"], {field})'])
            self.assertIn(f'{field} = snapshot["{field}"]', self.source)
            self.assertIn(f'{field} = preset["{field}"]', self.source)
        self.assertCountEqual(hex_lines, expected)

    def test_owner_slot_occupied_and_history_guards(self):
        self.assertIn('if(usr?.client?.prefs != src)\n\t\treturn', self.source)
        self.assertIn('if(!slot || slot < 1 || slot > 10)\n\t\t\treturn', self.source)
        self.assertIn('if(href_list["loadout_action"])\n\t\t// Save state before any loadout change\n\t\tsave_to_history()', self.source)
        # Full branch fixtures also bind occupied guard, exact None+name order,
        # response mapping, cancellation, menu refresh, and absence of save calls.
        self.assertIn('if(!current)\n\t\t\t\t\treturn', NEW_BRANCH)


if __name__ == "__main__":
    print("Python/source-derived model only; no DM/browser/savefile execution.", flush=True)
    unittest.main(verbosity=2)
