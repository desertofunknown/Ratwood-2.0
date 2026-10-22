#!/usr/bin/env python3
"""Source-bound Hear Vocal Barks regressions; no DM execution or savefile I/O.

Run: python3 tools/ci/test_bark_slot_persistence.py

The Python model exercises only the reviewed narrow saver and bark-field read.
It is not a DM interpreter, BYOND serialization test, full character loader, or
disk-failure simulation. Its toggle wrapper records the existing root-save call
without emulating that routine's many writes and in-memory side effects. Claims
about unchanged fields apply to the narrow character-slot update, not the whole
file after save_preferences(). Fresh construction can reload a character;
same-server reconnects may instead reuse the cached preferences datum.

BYOND savefile directories are nodes with optional data and children. Fixture
dicts represent child names, while scalar nodes have no child version. Membership
uses child names without a slash, and writing a nonexistent path creates it:
https://www.byond.com/docs/guide/chap12.html (sections 3 and 4)
Missing savefile input is null, not the preference's initial TRUE value:
https://www.byond.com/docs/ref/#/savefile/operator/>>
Version fixtures include NaN and both infinities, which are numeric but invalid:
https://www.byond.com/docs/ref/#/proc/isnan
https://www.byond.com/docs/ref/#/proc/isinf
Slot fixtures use finite numbers; one-argument round() floors:
https://www.byond.com/docs/ref/#/proc/round
"""

from copy import deepcopy
from dataclasses import dataclass, field
import math
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
SAVEFILE = ROOT / "code/modules/client/preferences_savefile.dm"
TOGGLES = ROOT / "code/modules/client/preferences_toggles.dm"
PREFERENCES = ROOT / "code/modules/client/preferences.dm"
LOGGING = ROOT / "code/__HELPERS/_logging.dm"
FIELD = "hear_barks"
SAVER_PATH = "/datum/preferences/proc/save_hear_barks()"
TOGGLE_PATH = "/client/verb/vocal_barks()"

EXPECTED_SAVER = '''\
	if(!path)
		return FALSE
	if(!fexists(path))
		return FALSE

	var/slot = default_slot
	if(!isnum(slot) || slot < 1 || slot > max_save_slots || slot != round(slot))
		return FALSE

	var/savefile/S = new /savefile(path)
	if(!S)
		return FALSE
	S.cd = "/"
	var/slot_directory = "character[slot]"
	if(!(slot_directory in S.dir))
		return FALSE
	S.cd = "/[slot_directory]"

	var/savefile_version
	S["version"] >> savefile_version
	if(!isnum(savefile_version) || isnan(savefile_version) || isinf(savefile_version) || savefile_version < SAVEFILE_VERSION_MIN)
		return FALSE

	WRITE_FILE(S["hear_barks"], hear_barks)
	return TRUE
'''

EXPECTED_TOGGLE = '''\
	set name = "Hear Vocal Barks"
	set category = "Options"
	set desc = ""
	set hidden = 1
	if(prefs)
		prefs.hear_barks = !prefs.hear_barks
		prefs.save_preferences()
		prefs.save_hear_barks()
	to_chat(src, "You will [prefs.hear_barks ? "" : "not "]hear vocal barks.")
'''


def definition(source, path):
    matches = list(re.finditer(r"^" + re.escape(path) + r"\n(.*?)(?=^/(?![/*])|\Z)", source, re.M | re.S))
    if len(matches) != 1:
        raise AssertionError(f"Expected exactly one definition: {path}")
    return matches[0][1]


def code_lines(source):
    """Keep indentation/order; ignore blank lines and whole-line comments only."""
    return [line for line in source.splitlines() if line.strip() and not line.lstrip().startswith("//")]


def saver_contract(source):
    # Exact statements bind the model to every guard, ordering and sole write.
    # Reject fallback sanitization, migration, broad saves, Flush/Lock and extra
    # character/version writes, rather than treating unknown code as harmless.
    if code_lines(definition(source, SAVER_PATH)) != code_lines(EXPECTED_SAVER):
        raise AssertionError("Narrow bark saver differs from the reviewed read-only guards and sole write")


def toggle_contract(source):
    # Preserve the entire preexisting verb, including its null/message behavior.
    if definition(source, TOGGLE_PATH).rstrip() != EXPECTED_TOGGLE.rstrip():
        raise AssertionError("Toggle must add only the narrow save after the existing root save")


def version_contract(source):
    expected = '''\
	var/savefile_version
	S["version"] >> savefile_version

	if(savefile_version < SAVEFILE_VERSION_MIN)
		S.dir.Cut()
		return -2
	if(savefile_version < SAVEFILE_VERSION_MAX)
		return savefile_version
	return -1
'''
    if code_lines(definition(source, "/datum/preferences/proc/savefile_needs_update(savefile/S)")) != code_lines(expected):
        raise AssertionError("Re-review loader version semantics before changing this model")
    minimum = re.findall(r"^#define SAVEFILE_VERSION_MIN\s+(\d+)$", source, re.M)
    current = re.findall(r"^#define SAVEFILE_VERSION_MAX\s+(\d+)$", source, re.M)
    if len(minimum) != 1 or len(current) != 1:
        raise AssertionError("Expected numeric version boundaries")
    return int(minimum[0]), int(current[0])


def reader_contract(source):
    bark_load = definition(source, "/datum/preferences/proc/_load_barks(S)")
    field_lines = [line for line in bark_load.splitlines() if FIELD in line]
    if field_lines != ['\tS["hear_barks"] >> hear_barks']:
        raise AssertionError("Bark loading must keep the existing direct read and missing-key semantics")
    load = definition(source, "/datum/preferences/proc/load_character(slot)")
    sequence = ('\tS.cd = "/character[slot]"\n', '\tvar/needs_update = savefile_needs_update(S)\n', '\t_load_barks(S)\n')
    positions = [load.index(part) for part in sequence]
    if positions != sorted(positions) or load.count('\t_load_barks(S)\n') != 1:
        raise AssertionError("Character load must read barks from the selected slot after version checking")
    if '\tif(needs_update == -2)\t\t//fatal, can\'t load any data\n\t\treturn FALSE\n' not in load:
        raise AssertionError("Unreviewed character loader rejection behavior")
    save = definition(source, "/datum/preferences/proc/save_character()")
    writes = re.findall(r'^\tWRITE_FILE\(S\["(hear_barks)"\]\s*, hear_barks\)$', save, re.M)
    if writes != [FIELD] or save.index('\tS.cd = "/character[slot]"') > save.index('S["hear_barks"]'):
        raise AssertionError("Full character save and narrow save must use the same slot-local key")
    for proc in ("load_preferences", "save_preferences"):
        if FIELD in definition(source, f"/datum/preferences/proc/{proc}()"):
            raise AssertionError("Bark preference must not become a root/account setting")
    return FIELD


def write_macro_contract(source):
    for macro, expected in (
        ("WRITE_FILE", "#define WRITE_FILE(file, text) DIRECT_OUTPUT(file, text)"),
        ("DIRECT_OUTPUT", "#define DIRECT_OUTPUT(A, B) A << B"),
    ):
        definitions = re.findall(r"^#define " + macro + r"\(.*$", source, re.M)
        if definitions != [expected]:
            raise AssertionError("Save output must not filter FALSE or rewrite values")


@dataclass
class ModelPreferences:
    path: object = "fixture-only.sav"
    default_slot: object = 2
    max_save_slots: int = 60
    hear_barks: object = 1
    other_fields: dict = field(default_factory=lambda: {
        "real_name": "Unsaved random identity", "species": "Unsaved species",
        "bark_id": "Unsaved voice", "bark_pitch": 1.7,
        "slot_randomized": True, "randomise": {"body": True},
    })


@dataclass
class ModelStorage:
    children: dict
    exists: bool = True
    open_ok: bool = True
    trace: list = field(default_factory=list)


def modeled_save(prefs, storage, minimum):
    """Model of save_hear_barks only, with finite slots; never opens a file."""
    if not prefs.path or not storage.exists:
        return False
    slot = prefs.default_slot
    if not isinstance(slot, (int, float)) or slot < 1 or slot > prefs.max_save_slots or slot != math.floor(slot):
        return False
    storage.trace.append("open")
    if not storage.open_ok:
        return False
    storage.trace.append("cd:/")
    slot_directory = f"character{int(slot)}"
    storage.trace.append(f"exists:{slot_directory}")
    if slot_directory not in storage.children:
        return False
    storage.trace.append(f"cd:/{slot_directory}")
    node = storage.children[slot_directory]
    # A scalar fixture represents an existing node with data but no children.
    version = node.get("version") if isinstance(node, dict) else None
    storage.trace.append("read:version")
    if not isinstance(version, (int, float)) or math.isnan(version) or math.isinf(version) or version < minimum:
        return False
    node[FIELD] = prefs.hear_barks
    storage.trace.append(f"write:{FIELD}")
    return True


def modeled_toggle(prefs, storage, minimum):
    prefs.hear_barks = int(not prefs.hear_barks)
    storage.trace.append("call:save_preferences")
    # Intentionally do not emulate save_preferences, which can create a root
    # savefile and changes root fields and parallax. It never creates a slot.
    return modeled_save(prefs, storage, minimum)


def modeled_bark_read(storage, slot, read_key):
    """Only the direct _load_barks field read, not load_character/migrations."""
    return storage.children[f"character{slot}"].get(read_key)


class BarkSlotSourceTests(unittest.TestCase):
    def test_narrow_saver_guards_order_and_only_write(self):
        saver_contract(SAVEFILE.read_text())

    def test_exact_toggle_preserves_root_save_message_and_null_behavior(self):
        toggle_contract(TOGGLES.read_text())

    def test_existing_reader_full_saver_and_root_scope(self):
        self.assertEqual(reader_contract(SAVEFILE.read_text()), FIELD)

    def test_existing_loader_version_semantics_accept_future_versions(self):
        minimum, current = version_contract(SAVEFILE.read_text())
        self.assertLess(minimum, current)

    def test_write_macro_preserves_false(self):
        write_macro_contract(LOGGING.read_text())

    def test_existing_default_ui_entry_and_dispatch(self):
        self.assertIn('\tvar/hear_barks = TRUE\n', PREFERENCES.read_text())
        source = TOGGLES.read_text()
        self.assertIn('list("id" = "vocal_barks", "label" = "Hear Vocal Barks", "enabled" = !!owner.prefs.hear_barks, "desc" = "Enable hearing vocal bark sounds."),', source)
        self.assertIn('\t\t\tif("vocal_barks")\n\t\t\t\towner.vocal_barks()\n', source)

    def test_both_real_speech_consumers_filter_on_live_preference(self):
        movable = (ROOT / "code/game/say.dm").read_text()
        living = (ROOT / "code/modules/mob/living/say.dm").read_text()
        self.assertEqual(movable.count("prefs.hear_barks"), 1)
        self.assertIn('\t\t\tif(!(M.client.prefs.hear_barks))\n\t\t\t\thearers -= M\n', movable)
        self.assertIn('CALLBACK(src, PROC_REF(bark), hearers, range,', movable)
        self.assertEqual(living.count("prefs?.hear_barks"), 1)
        self.assertIn('\t\t\tif(M.client?.prefs?.hear_barks)\n\t\t\t\thears_barks += M\n', living)
        self.assertIn('CALLBACK(src, TYPE_PROC_REF(/atom/movable, bark), hears_barks, message_range,', living)

    def test_fresh_construction_loads_character_but_reconnect_can_reuse_cache(self):
        construction = definition(PREFERENCES.read_text(), "/datum/preferences/New(client/C)")
        self.assertIn('\tvar/loaded_preferences_successfully = load_preferences()\n\tif(loaded_preferences_successfully)\n\t\tif(load_character())\n', construction)
        clients = (ROOT / "code/modules/client/client_procs.dm").read_text()
        self.assertIn('\tprefs = GLOB.preferences_datums[ckey]\n\tif(prefs)\n\t\tprefs.parent = src\n\telse\n\t\tprefs = new /datum/preferences(src)\n', clients)


class BarkSlotModelTests(unittest.TestCase):
    def setUp(self):
        source = SAVEFILE.read_text()
        saver_contract(source)
        toggle_contract(TOGGLES.read_text())
        write_macro_contract(LOGGING.read_text())
        self.minimum, self.current = version_contract(source)
        self.read_key = reader_contract(source)
        self.prefs = ModelPreferences()
        self.storage = ModelStorage({
            "version": self.current, "default_slot": 2, "root_marker": "unchanged by narrow saver",
            "character1": {"version": self.current, FIELD: 0, "real_name": "First saved character"},
            "character2": {"version": self.current, FIELD: 1, "real_name": "Second saved character",
                           "species": "Saved species", "bark_id": "Saved voice", "bark_pitch": 0.8,
                           "randomise": {"body": False}, "customizer_entries": ["saved accessory"]},
        })

    def save(self):
        return modeled_save(self.prefs, self.storage, self.minimum)

    def assert_rejected_unchanged(self, before_open=False):
        saved = deepcopy(self.storage.children)
        prefs = deepcopy(self.prefs)
        self.assertFalse(self.save())
        self.assertEqual(self.storage.children, saved)
        self.assertEqual(self.prefs, prefs)
        self.assertNotIn(f"write:{FIELD}", self.storage.trace)
        if before_open:
            self.assertEqual(self.storage.trace, [])

    def test_false_true_and_repeated_toggles_survive_modeled_fresh_field_reads(self):
        for expected in (0, 1, 0, 1, 0, 1):
            with self.subTest(expected=expected, toggle=len(self.storage.trace)):
                self.assertTrue(modeled_toggle(self.prefs, self.storage, self.minimum))
                self.assertEqual(self.prefs.hear_barks, expected)
                self.assertEqual(modeled_bark_read(self.storage, 2, self.read_key), expected)
        self.assertEqual(self.storage.trace.count("call:save_preferences"), 6)
        self.assertEqual(self.storage.trace.count(f"write:{FIELD}"), 6)

    def test_selected_slots_remain_independent(self):
        self.prefs.hear_barks = 0
        self.assertTrue(self.save())
        self.prefs.default_slot = 1
        self.prefs.hear_barks = 1
        self.assertTrue(self.save())
        self.assertEqual(modeled_bark_read(self.storage, 1, self.read_key), 1)
        self.assertEqual(modeled_bark_read(self.storage, 2, self.read_key), 0)
        self.assertEqual(self.prefs.default_slot, 1)

    def test_only_selected_bark_field_changes_not_unsaved_or_randomized_identity(self):
        for randomized in (False, True):
            with self.subTest(randomized=randomized):
                self.prefs.other_fields["slot_randomized"] = randomized
                before_prefs = deepcopy(self.prefs)
                expected = deepcopy(self.storage.children)
                expected["character2"][FIELD] = 0
                self.assertTrue(modeled_toggle(self.prefs, self.storage, self.minimum))
                self.assertEqual(self.storage.children, expected)
                before_prefs.hear_barks = 0
                self.assertEqual(self.prefs, before_prefs)
                self.prefs.hear_barks = 1

    def test_minimum_older_current_and_future_versions_are_not_rewritten(self):
        for version in (self.minimum, self.minimum + 0.5, self.current - 1, self.current, self.current + 1, self.current + 100):
            with self.subTest(version=version):
                self.storage.children["character2"]["version"] = version
                self.prefs.hear_barks = 0
                expected = deepcopy(self.storage.children)
                expected["character2"][FIELD] = 0
                self.assertTrue(self.save())
                self.assertEqual(self.storage.children, expected)

    def test_missing_or_empty_path_rejected_before_open(self):
        for path in (None, ""):
            with self.subTest(path=path):
                self.prefs.path = path
                self.assert_rejected_unchanged(before_open=True)

    def test_missing_file_rejected_before_open(self):
        self.storage.exists = False
        self.assert_rejected_unchanged(before_open=True)

    def test_unavailable_savefile_handle_rejected(self):
        self.storage.open_ok = False
        self.assert_rejected_unchanged()
        self.assertEqual(self.storage.trace, ["open"])

    def test_root_only_and_absent_selected_slot_not_created_or_replaced(self):
        for children in ({"version": self.current}, {"version": self.current, "character1": {"version": self.current, FIELD: 1}}):
            with self.subTest(children=children):
                self.storage = ModelStorage(deepcopy(children))
                self.assert_rejected_unchanged()
                self.assertNotIn("cd:/character2", self.storage.trace)

    def test_invalid_selected_nodes_and_missing_versions_rejected(self):
        for node in (None, 0, "invalid buffer", {}, {FIELD: 1}, {"version": None}):
            with self.subTest(node=node):
                self.storage.children["character2"] = deepcopy(node)
                self.assert_rejected_unchanged()

    def test_nonnumeric_and_obsolete_versions_rejected_without_wiping(self):
        for version in (None, "38", "invalid", [], {}, 0, -1, self.minimum - 1, self.minimum - 0.5):
            with self.subTest(version=version):
                self.storage.children["character2"]["version"] = version
                self.assert_rejected_unchanged()

    def test_nonfinite_versions_rejected_without_writing(self):
        for version in (float("nan"), float("inf"), float("-inf")):
            with self.subTest(version=version):
                self.storage.children["character2"]["version"] = version
                self.storage.trace.clear()
                self.assert_rejected_unchanged()

    def test_large_finite_versions_are_not_capped_by_project_infinity_macro(self):
        for version in (1e31, 1e32, 3e38):
            with self.subTest(version=version):
                self.storage.children["character2"]["version"] = version
                self.assertTrue(self.save())
                self.assertEqual(self.storage.children["character2"]["version"], version)

    def test_invalid_slots_never_fall_back_or_mutate_default_slot(self):
        for slot in (None, "2", "", [], {}, -10, -1, 0, 0.5, 1.5, 2.5, 60.5, 61, 1000):
            with self.subTest(slot=slot):
                self.prefs.default_slot = slot
                self.assert_rejected_unchanged(before_open=True)

    def test_valid_integer_slot_boundaries_and_member_capacity(self):
        for slot, maximum in ((1, 60), (60, 60), (60.0, 60), (100, 100)):
            with self.subTest(slot=slot, maximum=maximum):
                self.prefs.default_slot = slot
                self.prefs.max_save_slots = maximum
                self.storage.children[f"character{int(slot)}"] = {"version": self.current, FIELD: 1}
                self.assertTrue(self.save())
                self.assertEqual(self.prefs.default_slot, slot)

    def test_invalid_target_still_leaves_live_toggle_and_existing_root_call(self):
        self.storage.children.pop("character2")
        for expected in (0, 1):
            self.assertFalse(modeled_toggle(self.prefs, self.storage, self.minimum))
            self.assertEqual(self.prefs.hear_barks, expected)
            self.assertNotIn("character2", self.storage.children)
        self.assertEqual(self.storage.trace.count("call:save_preferences"), 2)

    def test_missing_bark_key_keeps_existing_null_read_until_explicit_toggle(self):
        self.storage.children["character2"].pop(FIELD)
        self.assertIsNone(modeled_bark_read(self.storage, 2, self.read_key))
        self.prefs.hear_barks = None
        self.assertTrue(modeled_toggle(self.prefs, self.storage, self.minimum))
        self.assertEqual(modeled_bark_read(self.storage, 2, self.read_key), 1)


class BarkSlotMutationTests(unittest.TestCase):
    def test_removed_guards_extra_writes_and_unsafe_helpers_are_rejected(self):
        source = SAVEFILE.read_text()
        saver_contract(source)
        original = definition(source, SAVER_PATH)
        guards = re.findall(r"^\tif\([^\n]+\)\n\t\treturn FALSE\n", original, re.M)
        self.assertEqual(len(guards), 6)
        variants = [original.replace(guard, "", 1) for guard in guards]
        write = '\tWRITE_FILE(S["hear_barks"], hear_barks)\n'
        variants += [original.replace(write, replacement, 1) for replacement in (
            "", write + write, write.replace('"hear_barks"', '"wrong_key"'),
            write.replace(', hear_barks)', ', TRUE)'), '\tif(hear_barks)\n\t' + write,
            '\tWRITE_FILE(S["version"], SAVEFILE_VERSION_MAX)\n' + write,
            '\tWRITE_FILE(S["real_name"], real_name)\n' + write,
        )]
        for extra in ('save_character()', 'load_character()', 'savefile_needs_update(S)', 'S.Flush()', 'S.Lock()', 'S.dir.Cut()', 'default_slot = slot'):
            variants.append(original.replace(write, '\t' + extra + '\n' + write, 1))
        for variant in variants:
            with self.subTest(variant=variant):
                with self.assertRaises(AssertionError):
                    saver_contract(source.replace(original, variant, 1))

    def test_guard_order_directory_names_and_fallback_mutations_are_rejected(self):
        source = SAVEFILE.read_text()
        saver_contract(source)
        original = definition(source, SAVER_PATH)
        variants = []
        for block, anchor in (
            ('\tif(!fexists(path))\n\t\treturn FALSE\n', '\tvar/savefile/S = new /savefile(path)\n'),
            ('\tvar/slot = default_slot\n\tif(!isnum(slot) || slot < 1 || slot > max_save_slots || slot != round(slot))\n\t\treturn FALSE\n', '\tvar/savefile/S = new /savefile(path)\n'),
            ('\tif(!(slot_directory in S.dir))\n\t\treturn FALSE\n', '\tS.cd = "/[slot_directory]"\n'),
            ('\tif(!isnum(savefile_version) || isnan(savefile_version) || isinf(savefile_version) || savefile_version < SAVEFILE_VERSION_MIN)\n\t\treturn FALSE\n', '\tWRITE_FILE(S["hear_barks"], hear_barks)\n'),
        ):
            variants.append(original.replace(block, "", 1).replace(anchor, anchor + block, 1))
        for old, new in (
            ('"character[slot]"', '"/character[slot]"'),
            ('slot_directory in S.dir', '"/[slot_directory]" in S.dir'),
            ('var/slot = default_slot', 'var/slot = sanitize_integer(default_slot, 1, max_save_slots, initial(default_slot))'),
            ('!isnum(slot) || slot < 1', 'slot < 1 || !isnum(slot)'),
            (' || slot != round(slot)', ''),
            ('!isnum(savefile_version) || ', ''),
            ('isnan(savefile_version) || ', ''),
            ('isinf(savefile_version) || ', ''),
            ('isinf(savefile_version)', 'savefile_version >= INFINITY'),
            ('savefile_version < SAVEFILE_VERSION_MIN', 'savefile_version < SAVEFILE_VERSION_MIN || savefile_version > SAVEFILE_VERSION_MAX'),
        ):
            variants.append(original.replace(old, new, 1))
        for variant in variants:
            with self.subTest(variant=variant):
                with self.assertRaises(AssertionError):
                    saver_contract(source.replace(original, variant, 1))

    def test_toggle_lost_root_save_broad_save_and_changed_behavior_rejected(self):
        source = TOGGLES.read_text()
        toggle_contract(source)
        original = definition(source, TOGGLE_PATH)
        variants = [
            original.replace('\t\tprefs.save_preferences()\n', ''),
            original.replace('prefs.save_hear_barks()', 'prefs.save_character()'),
            original.replace('prefs.save_hear_barks()', 'prefs.load_character()'),
            original.replace('\t\tprefs.save_hear_barks()\n', ''),
            original.replace('\t\tprefs.save_preferences()\n\t\tprefs.save_hear_barks()', '\t\tprefs.save_hear_barks()\n\t\tprefs.save_preferences()'),
            original.replace('\t\tprefs.save_hear_barks()', '\tprefs.save_hear_barks()'),
            original.replace('\tif(prefs)\n', '\tif(!prefs)\n\t\treturn\n\tif(prefs)\n'),
            original.replace('hear vocal barks.', 'hear voice sounds.'),
        ]
        for variant in variants:
            with self.subTest(variant=variant):
                with self.assertRaises(AssertionError):
                    toggle_contract(source.replace(original, variant, 1))

    def test_false_filtered_output_and_changed_reader_are_rejected(self):
        logging = LOGGING.read_text()
        write_macro_contract(logging)
        for old, new in (
            ('DIRECT_OUTPUT(file, text)', 'if(text) DIRECT_OUTPUT(file, text)'),
            ('A << B', 'if(B) A << B'),
        ):
            with self.subTest(replacement=new):
                with self.assertRaises(AssertionError):
                    write_macro_contract(logging.replace(old, new, 1))
        source = SAVEFILE.read_text()
        reader_contract(source)
        for new in ('\tS["wrong_key"] >> hear_barks', '\tS["hear_barks"] >> bark_pitch', '\tif(S["hear_barks"])\n\t\tS["hear_barks"] >> hear_barks'):
            with self.subTest(replacement=new):
                with self.assertRaises(AssertionError):
                    reader_contract(source.replace('\tS["hear_barks"] >> hear_barks', new, 1))


if __name__ == "__main__":
    unittest.main()
