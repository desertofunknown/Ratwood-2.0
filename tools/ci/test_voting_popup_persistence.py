#!/usr/bin/env python3
"""Source-bound voting-popup persistence regression; no DM execution or save I/O.

Run: python3 tools/ci/test_voting_popup_persistence.py
The small model checks reviewed mappings and sanitize_integer semantics, not
BYOND serialization, disk failures, UI rendering, or a real server restart.
Fresh preferences construction reloads the saved value; a same-server reconnect
may reuse the cached preferences datum and is not necessarily a fresh load.
Missing fields are modeled as null, as documented for savefile input:
https://www.byond.com/docs/ref/#/savefile/operator/>>
One-argument round() floors before the range check, rather than rounding to the
nearest integer or rejecting all fractional numbers:
https://www.byond.com/docs/ref/#/proc/round
"""

import math
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
SAVEFILE = ROOT / "code/modules/client/preferences_savefile.dm"
PREFERENCES = ROOT / "code/modules/client/preferences.dm"
TOGGLES = ROOT / "code/modules/client/preferences_toggles.dm"
SANITIZERS = ROOT / "code/__HELPERS/sanitize_values.dm"
FIELD = "voting_popup"


def definition(source, path):
    match = re.search(r"^" + re.escape(path) + r"\n(.*?)(?=^/|\Z)", source, re.M | re.S)
    if match is None:
        raise AssertionError(f"Missing definition: {path}")
    return match[1]


def persistence_contract(source):
    """Reject missing, duplicated, conditional, or unreviewed field mappings."""
    load = definition(source, "/datum/preferences/proc/load_preferences()")
    save = definition(source, "/datum/preferences/proc/save_preferences()")
    read_pattern = r'^\tS\["(voting_popup)"\][ \t]+>> voting_popup$'
    write_pattern = r'^\tWRITE_FILE\(S\["(voting_popup)"\], voting_popup\)$'
    sanitize_pattern = (
        r"^\tvoting_popup[ \t]*= sanitize_integer\(voting_popup, (0), (1), "
        r"initial\(voting_popup\)\)$"
    )
    reads = list(re.finditer(read_pattern, load, re.M))
    writes = list(re.finditer(write_pattern, save, re.M))
    sanitizers = list(re.finditer(sanitize_pattern, load, re.M))
    if (len(reads), len(writes), len(sanitizers)) != (1, 1, 1):
        raise AssertionError("Expected one reviewed voting_popup read, write, and sanitizer")
    if sum(FIELD in line for line in source.splitlines()) != 3:
        raise AssertionError("Unreviewed extra voting_popup handling")
    if not load.index('\tS.cd = "/"\n') < reads[0].start() < sanitizers[0].start():
        raise AssertionError("Read and sanitize must occur in order at the preferences root")
    if not save.index('\tS.cd = "/"\n') < writes[0].start() < save.rindex('\treturn TRUE'):
        raise AssertionError("Write must occur before success at the preferences root")
    return reads[0][1], writes[0][1], int(sanitizers[0][1]), int(sanitizers[0][2])


def initial_value(source):
    values = re.findall(r"^\tvar/voting_popup = (TRUE|FALSE)$", source, re.M)
    if values != ["TRUE"]:
        raise AssertionError("The existing TRUE default must be preserved")
    return 1


def sanitize_integer_contract(source):
    body = definition(source, "/proc/sanitize_integer(number, min=0, max=1, default=0)")
    expected = (
        "\tif(isnum(number))\n"
        "\t\tnumber = round(number)\n"
        "\t\tif(min <= number && number <= max)\n"
        "\t\t\treturn number\n"
        "\treturn default"
    )
    if body.rstrip() != expected:
        raise AssertionError("Unreviewed sanitize_integer implementation; update the model")


def modeled_load(stored, contract, default):
    """Model the reviewed field only, using finite numeric test fixtures."""
    read_key, _, minimum, maximum = contract
    value = stored.get(read_key)
    if isinstance(value, (int, float)):
        value = math.floor(value)
        if minimum <= value <= maximum:
            return value
    return default


class VotingPopupPersistenceTests(unittest.TestCase):
    def contract(self):
        sanitize_integer_contract(SANITIZERS.read_text())
        return persistence_contract(SAVEFILE.read_text())

    def default(self):
        return initial_value(PREFERENCES.read_text())

    def test_false_and_true_survive_modeled_fresh_load(self):
        contract = self.contract()
        for value in (0, 1):
            with self.subTest(value=value):
                stored = {contract[1]: value}
                self.assertEqual(modeled_load(stored, contract, self.default()), value)

    def test_absent_and_null_legacy_fields_keep_true_default(self):
        contract = self.contract()
        for stored in ({}, {FIELD: None}):
            with self.subTest(stored=stored):
                self.assertEqual(modeled_load(stored, contract, self.default()), 1)

    def test_invalid_types_and_out_of_range_values_use_initial_default(self):
        contract = self.contract()
        for value in ("0", "1", "FALSE", "", [], {}, -10, -1, 2, 100):
            with self.subTest(value=value):
                self.assertEqual(modeled_load({FIELD: value}, contract, self.default()), 1)

    def test_fractional_values_follow_existing_floor_then_range_semantics(self):
        contract = self.contract()
        for value, expected in ((-0.25, 1), (0.25, 0), (0.75, 0), (1.25, 1), (1.75, 1), (2.25, 1)):
            with self.subTest(value=value):
                self.assertEqual(modeled_load({FIELD: value}, contract, self.default()), expected)

    def test_new_preferences_keep_existing_true_default(self):
        self.assertEqual(self.default(), 1)
        with self.assertRaises(AssertionError):
            initial_value(PREFERENCES.read_text().replace("var/voting_popup = TRUE", "var/voting_popup = FALSE"))

    def test_write_macro_does_not_filter_out_false(self):
        logging = (ROOT / "code/__HELPERS/_logging.dm").read_text()
        self.assertIn("#define WRITE_FILE(file, text) DIRECT_OUTPUT(file, text)\n", logging)
        self.assertIn("#define DIRECT_OUTPUT(A, B) A << B\n", logging)

    def test_existing_ui_dispatch_and_toggle_still_save_the_same_field(self):
        source = TOGGLES.read_text()
        self.assertIn('list("id" = "voting_popup", "label" = "Enable Voting UI Popup", "enabled" = !!owner.prefs.voting_popup, "desc" = "Allow a popup of the voting-ui."),', source)
        self.assertIn('\t\t\tif("voting_popup")\n\t\t\t\towner.toggle_voting_popup()\n', source)
        expected = (
            '\tset category = "Options"\n'
            '\tset name = "Toggle Voting Popup"\n'
            '\tset hidden = 1\n'
            '\tif(!prefs)\n\t\treturn\n\n'
            '\tprefs.voting_popup = !prefs.voting_popup\n'
            '\tprefs.save_preferences()\n'
            '\tif(prefs.voting_popup)\n'
            '\t\tto_chat(src, "You will see a popup of the voting ui as a vote is called.")\n'
            '\telse\n'
            '\t\tto_chat(src, "You will no longer see a popup of the voting ui as a vote is called.")'
        )
        self.assertEqual(definition(source, "/client/verb/toggle_voting_popup()").rstrip(), expected)

    def test_actual_vote_popup_consumer_remains_gated_by_preference(self):
        source = (ROOT / "code/controllers/subsystem/vote.dm").read_text()
        self.assertEqual(source.count("new_voter.prefs.voting_popup"), 1)
        self.assertIn('\t\tif(SSvote.initialized && new_voter.prefs.voting_popup)\n\t\t\tSSvote.ui_interact(new_voter.mob)\n', source)

    def test_fresh_construction_loads_but_reconnect_can_reuse_cached_datum(self):
        construction = definition(PREFERENCES.read_text(), "/datum/preferences/New(client/C)")
        self.assertIn('\tvar/loaded_preferences_successfully = load_preferences()\n', construction)
        clients = (ROOT / "code/modules/client/client_procs.dm").read_text()
        self.assertIn(
            '\tprefs = GLOB.preferences_datums[ckey]\n'
            '\tif(prefs)\n\t\tprefs.parent = src\n'
            '\telse\n\t\tprefs = new /datum/preferences(src)\n', clients)

    def test_missing_or_modified_mappings_are_rejected(self):
        source = SAVEFILE.read_text()
        self.contract()
        lines = [line for line in source.splitlines(keepends=True) if FIELD in line]
        for line in lines:
            for replacement in ("", line + line, "\t" + line, line.rstrip() + " || TRUE\n"):
                with self.subTest(line=line.strip(), replacement=replacement.strip()):
                    with self.assertRaises(AssertionError):
                        persistence_contract(source.replace(line, replacement, 1))
        for original, replacement in (
            ('S["voting_popup"]', 'S["wrong_key"]'),
            ('>> voting_popup', '>> compliance_notifs'),
            ('S["voting_popup"], voting_popup)', 'S["voting_popup"], TRUE)'),
            ('initial(voting_popup)', 'FALSE'),
            ('sanitize_integer(voting_popup, 0, 1', 'sanitize_integer(voting_popup, 0, 2'),
        ):
            with self.subTest(replacement=replacement):
                with self.assertRaises(AssertionError):
                    persistence_contract(source.replace(original, replacement, 1))

    def test_changed_sanitizer_semantics_are_rejected(self):
        source = SANITIZERS.read_text()
        sanitize_integer_contract(source)
        for original, replacement in (
            ('round(number)', 'round(number, 1)'),
            ('min <= number && number <= max', 'min < number && number < max'),
            ('return default', 'return 0'),
        ):
            with self.subTest(replacement=replacement):
                with self.assertRaises(AssertionError):
                    sanitize_integer_contract(source.replace(original, replacement, 1))


if __name__ == "__main__":
    unittest.main()
