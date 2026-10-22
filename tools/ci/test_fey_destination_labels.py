"""Source-bound fey destination regressions; no DM execution or live game I/O.

Run: python3 tools/ci/test_fey_destination_labels.py

The model accepts only the reviewed raw-name or unique-label picker source and
the current helper implementation. It reuses test_unique_labels.corrected;
it does not emulate BYOND input, timers, deletion, casting, or traveler movement.
Those existing controls are checked as source contracts, not runtime behavior.
"""
from dataclasses import dataclass
from pathlib import Path
import re
import unittest

from test_unique_labels import corrected

ROOT = Path(__file__).resolve().parents[2]
CIRCLES = ROOT / "code/game/objects/structures/roguetown/mushroom_circle.dm"
HELPERS = ROOT / "code/__HELPERS/_lists.dm"
PICKER = "/obj/structure/mushroom_circle/fey/proc/open_teleport_menu(mob/living/user)"
DEFAULT_NAME = "fey mushroom circle"

RAW_BUILDER = '''\
	var/list/choices = list()
	for(var/obj/structure/mushroom_circle/fey/C in GLOB.mushroom_circles)
		if(C == src || !C.active)
			continue
		choices[C.name] = C
'''
UNIQUE_BUILDER = RAW_BUILDER.replace(
    "\tvar/list/choices = list()\n",
    "\tvar/list/choices = list()\n\tvar/list/used_labels = list()\n",
).replace("choices[C.name] = C", "choices[avoid_assoc_duplicate_keys(C.name, used_labels)] = C")

EXPECTED_PICKER = '''\
	if(world.time < (user.mob_timers["feycircle_cooldown"] + 30 SECONDS))
		var/remaining = (user.mob_timers["feycircle_cooldown"] + 30 SECONDS) - world.time
		to_chat(user, span_warning("I must wait [DisplayTimeText(remaining)] before the fey energy recharges inside the ring."))
		return
	if(get_turf(user) != get_turf(src))
		to_chat(user, span_warning("I must stand within the mushroom circle to traverse the fey paths."))
		return
__BUILDER__
	if(!choices.len)
		to_chat(user, span_warning("There are no other active fey mushroom circles within the network."))
		return

	var/choice = input(user, "Which circle do you wish to travel to?", "Fey Mushroom Circle Network") as null|anything in choices
	if(isnull(choice) || QDELETED(src) || QDELETED(user))
		return

	var/obj/structure/mushroom_circle/fey/dest = choices[choice]
	if(QDELETED(dest) || !dest.active)
		to_chat(user, span_warning("That circle has faded since you made your choice."))
		return

	to_chat(user, span_notice("I focus on [dest.name]..."))
	if(!do_after(user, 3 SECONDS, target = src))
		return
	if(QDELETED(dest) || !dest.active)
		to_chat(user, span_warning("The destination circle faded mid-journey."))
		return

	var/turf/dest_turf = get_turf(dest)
	var/turf/source_turf = get_turf(src)
	var/list/travelers = list()
	for(var/mob/living/L in source_turf)
		if(!QDELETED(L))
			travelers += L

	playsound(source_turf, 'sound/misc/portalopen.ogg', 50, FALSE)
	for(var/mob/living/L in travelers)
		L.forceMove(dest_turf)
	playsound(dest_turf, 'sound/misc/portalopen.ogg', 50, FALSE)

	to_chat(user, span_notice("I step into the ring, planting my feet firmly and emerge at [dest.name]."))
	user.mob_timers["feycircle_cooldown"] = world.time
'''


def definition(source, path):
    matches = re.findall(r"^" + re.escape(path) + r"\n(.*?)(?=^/(?![/*])|\Z)", source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError(f"Expected one definition of {path}")
    return matches[0]


def code_lines(source):
    return [line for line in source.splitlines() if line.strip() and not line.lstrip().startswith("//")]


def picker_mode(source):
    """Reject unknown control flow rather than silently model only selected lines."""
    actual = code_lines(definition(source, PICKER))
    for unique, builder in ((False, RAW_BUILDER), (True, UNIQUE_BUILDER)):
        if actual == code_lines(EXPECTED_PICKER.replace("__BUILDER__", builder)):
            return unique
    raise AssertionError("Fey picker differs from the reviewed source model")


def helper_contract(source):
    actual = definition(source, "/proc/avoid_assoc_duplicate_keys(input_key, list/used_key_list)")
    if code_lines(actual) != [
        '\tif(!input_key || !istype(used_key_list))', '\t\treturn',
        '\tvar/base_key = input_key', '\twhile(used_key_list[input_key])',
        '\t\tused_key_list[base_key]++',
        '\t\tinput_key = "[base_key] ([used_key_list[base_key]])"',
        '\tused_key_list[input_key] = 1', '\treturn input_key',
    ]:
        raise AssertionError("Label helper differs from the reused allocator model")


@dataclass(eq=False)
class Circle:
    name: str = DEFAULT_NAME
    active: bool = True


def source_bound_choices(registry, source_circle, dm_source, helper_source):
    unique = picker_mode(dm_source)
    helper_contract(helper_source)
    choices, used_labels = {}, {}
    for circle in registry:
        if circle is source_circle or not circle.active:
            continue
        label = corrected(circle.name, used_labels) if unique else circle.name
        choices[label] = circle
    return choices


class FeyDestinationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dm_source = CIRCLES.read_text()
        cls.helper_source = HELPERS.read_text()

    def choices(self, registry, source):
        return source_bound_choices(registry, source, self.dm_source, self.helper_source)

    def assert_destinations(self, names, expected_labels):
        source = Circle()
        destinations = [Circle(name) for name in names]
        choices = self.choices([source, *destinations], source)
        self.assertEqual(list(choices), expected_labels)
        self.assertEqual(len(choices), len(destinations))
        for label, original in zip(expected_labels, destinations):
            self.assertIs(choices[label], original)
        self.assertEqual([circle.name for circle in destinations], names)
        return choices

    def test_picker_uses_one_fresh_menu_local_label_list(self):
        self.assertTrue(picker_mode(self.dm_source))

    def test_reused_allocator_matches_current_helper(self):
        helper_contract(self.helper_source)

    def test_two_default_destinations_remain_individually_selectable(self):
        self.assert_destinations([DEFAULT_NAME, DEFAULT_NAME], [DEFAULT_NAME, DEFAULT_NAME + " (2)"])

    def test_unique_names_keep_registry_order_and_exact_objects(self):
        self.assert_destinations(["South", "North", "East"], ["South", "North", "East"])

    def test_interleaved_duplicates_keep_order_and_exact_objects(self):
        self.assert_destinations(["A", "B", "A", "C", "B"], ["A", "B", "A (2)", "C", "B (2)"])

    def test_same_player_rename_keeps_both_objects(self):
        name = "Grove (fey mushroom circle)"
        self.assertIn('name = "[new_name] ([initial(name)])"', self.dm_source)
        self.assert_destinations([name, name], [name, name + " (2)"])

    def test_literal_generated_suffix_collisions_in_both_orders(self):
        for names, expected in (
            (["A", "A", "A (2)"], ["A", "A (2)", "A (2) (2)"]),
            (["A", "A (2)", "A"], ["A", "A (2)", "A (3)"]),
            (["A (2)", "A (3)", "A", "A"], ["A (2)", "A (3)", "A", "A (4)"]),
        ):
            with self.subTest(names=names):
                self.assert_destinations(names, expected)

    def test_source_and_inactive_circles_do_not_consume_labels(self):
        source, inactive, target = Circle(), Circle(active=False), Circle()
        for registry in ([source, inactive, target], [target, source, inactive]):
            choices = self.choices(registry, source)
            self.assertEqual(list(choices), [DEFAULT_NAME])
            self.assertIs(choices[DEFAULT_NAME], target)

    def test_empty_eligible_network(self):
        source, inactive = Circle(), Circle(active=False)
        for registry in ([], [source], [source, inactive]):
            self.assertEqual(self.choices(registry, source), {})

    def test_reopening_menu_resets_numbering_without_renaming(self):
        source, first, second = Circle(), Circle(), Circle()
        registry = [source, first, second]
        for _ in range(3):
            choices = self.choices(registry, source)
            self.assertEqual(list(choices), [DEFAULT_NAME, DEFAULT_NAME + " (2)"])
            self.assertIs(choices[DEFAULT_NAME], first)
            self.assertIs(choices[DEFAULT_NAME + " (2)"], second)
        self.assertEqual([circle.name for circle in registry], [DEFAULT_NAME] * 3)

    def test_cancel_and_deleted_actors_guard_precedes_object_resolution(self):
        picker_mode(self.dm_source)
        proc = definition(self.dm_source, PICKER)
        self.assertIn('as null|anything in choices\n'
                      '\tif(isnull(choice) || QDELETED(src) || QDELETED(user))\n'
                      '\t\treturn\n\n'
                      '\tvar/obj/structure/mushroom_circle/fey/dest = choices[choice]', proc)

    def test_stale_destination_guards_surround_cast_before_movement(self):
        picker_mode(self.dm_source)
        proc = definition(self.dm_source, PICKER)
        guards = [match.start() for match in re.finditer(re.escape('if(QDELETED(dest) || !dest.active)'), proc)]
        self.assertEqual(len(guards), 2)
        wait = proc.index('if(!do_after(user, 3 SECONDS, target = src))')
        move = proc.index('L.forceMove(dest_turf)')
        self.assertLess(guards[0], wait)
        self.assertLess(wait, guards[1])
        self.assertLess(guards[1], move)

    def test_bloomed_circles_keep_default_names_and_identity_registration(self):
        circle_type = definition(self.dm_source, "/obj/structure/mushroom_circle/fey")
        self.assertIn('\tname = "fey mushroom circle"', circle_type)
        self.assertIn('\tvar/active = TRUE', circle_type)
        bloom = definition(self.dm_source, "/obj/structure/mushroom_sprout/proc/bloom()")
        self.assertIn('\tnew /obj/structure/mushroom_circle/fey(get_turf(src))', bloom)
        initialize = definition(self.dm_source, "/obj/structure/mushroom_circle/fey/Initialize(mapload)")
        self.assertIn('\tGLOB.mushroom_circles |= src', initialize)
        self.assertNotIn('name =', initialize)

    def test_model_rejects_unreviewed_assignment_filter_and_guard_changes(self):
        for old, new in (
            (' = C\n', ' = C.name\n'),
            ('if(C == src || !C.active)', 'if(C == src)'),
            ('if(isnull(choice) || QDELETED(src) || QDELETED(user))', 'if(isnull(choice))'),
            ('if(QDELETED(dest) || !dest.active)', 'if(QDELETED(dest))'),
        ):
            with self.subTest(change=old), self.assertRaises(AssertionError):
                picker_mode(self.dm_source.replace(old, new))

    def test_model_rejects_unreviewed_helper_changes(self):
        with self.assertRaises(AssertionError):
            helper_contract(self.helper_source.replace('while(used_key_list[input_key])', 'if(used_key_list[input_key])'))


if __name__ == "__main__":
    unittest.main()
