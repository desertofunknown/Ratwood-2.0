"""Source-bound nutriment flavor-data model; never executes DM.

Run: python3 tools/ci/test_nutriment_merge_data.py
Optional --repo and --food-source let the same assertions reproduce failures on
an unmodified checkout or test a scratch candidate without editing that checkout.
Only the two reviewed callback bodies are modeled; any other source fails closed.
Fractions prove the intended arithmetic, NOT BYOND floating-point precision,
chemistry, health/nutrition effects or native taste/scent message behavior.
Supported data is ordered, associative string -> nonnegative numeric weights.
A positive total is normalized; all-zero totals retain the helpers' zero guard.
Malformed/non-associative lists and negative weights are outside this contract.
Raw-weight merge probes exercise the on_new/CheckParts API contract; they do not
establish a live cooked-spider-to-CheckParts route.
"""
from fractions import Fraction as F
from pathlib import Path
import argparse
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
FOOD_SOURCE = None
FOOD = 'code/modules/reagents/chemistry/reagents/food_reagents.dm'
HOLDER = 'code/modules/reagents/chemistry/holder.dm'
SNACKS = 'code/modules/food_and_drinks/food/snacks.dm'
MERGE = '/datum/reagent/consumable/nutriment/on_merge(list/newdata, newvolume)'
NEW = '/datum/reagent/consumable/nutriment/on_new(list/supplied_data)'

BASELINE_MERGE = '''	if(!islist(newdata) || !newdata.len)
		return
	var/list/taste_amounts = list()
	if(data)
		taste_amounts = data.Copy()
	counterlist_scale(taste_amounts, volume)
	var/list/other_taste_amounts = newdata.Copy()
	counterlist_scale(other_taste_amounts, newvolume)
	counterlist_combine(taste_amounts, other_taste_amounts)
	counterlist_normalise(taste_amounts)
	data = taste_amounts'''
FIXED_MERGE = '''	if(!islist(newdata) || !newdata.len)
		return
	var/list/taste_amounts = list()
	if(data)
		taste_amounts = data.Copy()
	taste_amounts = counterlist_scale(taste_amounts, volume - newvolume)
	var/list/other_taste_amounts = newdata.Copy()
	other_taste_amounts = counterlist_normalise(other_taste_amounts)
	other_taste_amounts = counterlist_scale(other_taste_amounts, newvolume)
	counterlist_combine(taste_amounts, other_taste_amounts)
	taste_amounts = counterlist_normalise(taste_amounts)
	data = taste_amounts'''

HELPER_BODIES = {
    '/proc/counterlist_scale(list/L, scalar)': '''	var/list/out = list()
	for(var/key in L)
		out[key] = L[key] * scalar
	. = out''',
    '/proc/counterlist_sum(list/L)': '''	. = 0
	for(var/key in L)
		. += L[key]''',
    '/proc/counterlist_normalise(list/L)': '''	var/avg = counterlist_sum(L)
	if(avg != 0)
		. = counterlist_scale(L, 1 / avg)
	else
		. = L''',
    '/proc/counterlist_combine(list/L1, list/L2)': '''	for(var/key in L2)
		var/other_value = L2[key]
		if(key in L1)
			L1[key] += other_value
		else
			L1[key] = other_value''',
}


def active(source):
    """Remove comments, preserving strings. A locator, not a general DM parser."""
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda m: '\n' * m[0].count('\n')
                  if m[0].startswith(('//', '/*')) else m[0], source, flags=re.S)


def body(source, header):
    source = active(source)
    match = re.search(r'^' + re.escape(header) + r'[ \t]*\n(.*?)(?=^/|\Z)', source, re.M | re.S)
    if not match:
        raise AssertionError(f'Missing active definition: {header}')
    return '\n'.join(line.rstrip() for line in match[1].splitlines() if line.strip())


def read(path):
    return (ROOT / path).read_text()


def scale(values, scalar):
    return {key: value * scalar for key, value in values.items()}


def normalise(values):
    total = sum(values.values())
    return scale(values, F(1, total)) if total else values


def combine(left, right):
    for key, value in right.items():
        left[key] = left.get(key, 0) + value


def merge_model(data, newdata, volume, newvolume, *, fixed):
    """Hand translation of the exact source bodies above, not DM execution.

    volume is the POST-addition reagent volume. dict models only associative
    string keys; its insertion order represents the ordinary DM key order.
    """
    if not isinstance(newdata, dict) or not newdata:
        return data
    taste_amounts = data.copy() if data is not None else {}
    if fixed:
        taste_amounts = scale(taste_amounts, volume - newvolume)
    else:
        scale(taste_amounts, volume)  # Baseline discards the allocated list.
    other_taste_amounts = newdata.copy()
    if fixed:
        other_taste_amounts = normalise(other_taste_amounts)
        other_taste_amounts = scale(other_taste_amounts, newvolume)
    else:
        scale(other_taste_amounts, newvolume)
    combine(taste_amounts, other_taste_amounts)
    if fixed:
        taste_amounts = normalise(taste_amounts)
    else:
        normalise(taste_amounts)
    return taste_amounts


class NutrimentMergeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.food = FOOD_SOURCE.read_text() if FOOD_SOURCE else read(FOOD)
        cls.callback = body(cls.food, MERGE)
        if cls.callback not in (BASELINE_MERGE, FIXED_MERGE):
            raise AssertionError('Unreviewed nutriment on_merge source; update the model after review')
        cls.fixed = cls.callback == FIXED_MERGE

    def merge(self, data, incoming, old_volume, new_volume):
        return merge_model(data, incoming, old_volume + new_volume,
                           new_volume, fixed=self.fixed)

    def test_source_has_reviewed_corrected_callback(self):
        self.assertEqual(self.callback, FIXED_MERGE)

    def test_allocating_helpers_and_zero_guard_match_model(self):
        source = read('code/__HELPERS/_lists.dm')
        for header, expected in HELPER_BODIES.items():
            with self.subTest(helper=header):
                self.assertEqual(body(source, header), expected)
        original = {'salt': 3, 'chips': 1}
        self.assertEqual(scale(original, 2), {'salt': 6, 'chips': 2})
        self.assertEqual(normalise(original), {'salt': F(3, 4), 'chips': F(1, 4)})
        self.assertEqual(original, {'salt': 3, 'chips': 1})
        zeros = {'salt': 0}
        self.assertIs(normalise(zeros), zeros)

    def test_on_new_normalizes_the_same_supported_raw_weights(self):
        self.assertEqual(body(self.food, NEW), '''	if(!supplied_data)
		supplied_data = data
	data = counterlist_normalise(supplied_data)''')
        self.assertEqual(normalise({'salt': 3, 'chips': 1}),
                         {'salt': F(3, 4), 'chips': F(1, 4)})

    def test_add_reagent_updates_volume_before_callback_and_rejects_zero(self):
        source = active(read(HOLDER))
        start = source.index('/datum/reagents/proc/add_reagent(')
        source = source[start:source.index('\n/datum/reagents/proc/add_reagent_list(', start)]
        self.assertIn('''	if(amount <= 0)
		return FALSE''', source)
        self.assertIn('''		if (R.type == reagent)
			R.volume += amount
			update_total()
			if(my_atom)
				my_atom.on_reagent_change(ADD_REAGENT)
			R.on_merge(data, amount)''', source)
        self.assertIn('''	R.volume = amount
	if(data)
		R.data = data
		R.on_new(data)''', source)

    def test_real_produce_initialization_bonus_and_ingestion_routes(self):
        produce = read('code/modules/farming/produce.dm')
        apple = body(produce, '/obj/item/reagent_containers/food/snacks/grown/apple')
        self.assertIn('\ttastes = list("apple" = 1)', apple)
        self.assertIn('\tlist_reagents = list(/datum/reagent/consumable/nutriment = 3)', apple)
        snacks = read(SNACKS)
        initial = body(snacks, '/obj/item/reagent_containers/food/snacks/add_initial_reagents()')
        self.assertIn('''				if(rid == /datum/reagent/consumable/nutriment || rid == /datum/reagent/consumable/nutriment/vitamin)
					reagents.add_reagent(rid, amount, tastes.Copy())''', initial)
        parts = body(snacks, '/obj/item/reagent_containers/food/snacks/CheckParts(list/parts_list, datum/crafting_recipe/food/R)')
        self.assertIn('RC.reagents.trans_to(reagents, RC.reagents.maximum_volume)', parts)
        self.assertIn('''			if(r_id == /datum/reagent/consumable/nutriment || r_id == /datum/reagent/consumable/nutriment/vitamin)
				reagents.add_reagent(r_id, amount, tastes)''', parts)
        # This is an active inheritance path; the adjacent documentation alone
        # would not prove these weights reach reagent construction/merging.
        self.assertIn('reagents.trans_to(M, amt2take, transfered_by = user, method = INGEST)', active(snacks))
        holder = active(read(HOLDER))
        self.assertIn('''			if(preserve_data)
				trans_data = copy_data(T)
			R.add_reagent(T.type, transfer_amount * multiplier, trans_data, chem_temp, no_react = 1, prepend = prepend)''', holder)
        self.assertIn('''	var/list/trans_data = current_reagent.data.Copy()
	return trans_data''', holder)

    def test_inherited_spider_metadata_and_synthetic_raw_weight_api_case(self):
        path = '/obj/item/reagent_containers/food/snacks/rogue/meat/spider'
        raw = body(read('modular/Neu_Food/code/raw/raw_meat.dm'), path)
        fried = body(read('modular/Neu_Food/code/cooked/cooked_meat.dm'), path + '/fried')
        self.assertIn('\ttastes = list("chitin" = 1, "mild venom" = 1)', raw)
        self.assertIn('\tbonus_reagents = list(/datum/reagent/consumable/nutriment = NUTRITION_QUARTER_MEAL)', fried)
        self.assertNotIn('tastes =', fried)
        self.assertNotIn('parent_type =', fried)
        # These declarations prove inherited multiweight metadata only. Normal
        # cooking uses initialize_cooked_food, whose bonus add omits tastes; no
        # active spider -> CheckParts route is established here. The following
        # merge is a synthetic raw-weight API-contract probe, not that route.
        self.assertEqual(self.merge({'bread': 1}, {'chitin': 1, 'mild venom': 1}, 1, 1),
                         {'bread': F(1, 2), 'chitin': F(1, 4), 'mild venom': F(1, 4)})

    def test_fractional_portion_volumes_obey_the_same_formula(self):
        self.assertEqual(self.merge({'apple': 1}, {'pear': 1}, F(1, 2), F(3, 2)),
                         {'apple': F(1, 4), 'pear': F(3, 4)})

    def test_taste_and_scent_readers_use_stored_ratios_times_volume(self):
        source = read(HOLDER)
        for sense in ('taste', 'scent'):
            reader = body(source, f'/datum/reagents/proc/generate_{sense}_message(minimum_percent=15)')
            self.assertIn(f'''\t\t\tif(istype(R, /datum/reagent/consumable/nutriment))
\t\t\t\tvar/list/{sense}_data = R.data
\t\t\t\tfor(var/{sense} in {sense}_data)
\t\t\t\t\tvar/ratio = {sense}_data[{sense}]
\t\t\t\t\tvar/amount = ratio * R.taste_mult * R.volume''', reader)
        result = self.merge({'apple': 1}, {'pear': 1}, 9, 1)
        # Reader's amount expression only, not rendered messages or thresholds.
        self.assertEqual(scale(result, 4 * 10), {'apple': 36, 'pear': 4})

    def test_same_flavor_remains_one_not_two(self):
        self.assertEqual(self.merge({'apple': 1}, {'apple': 1}, 3, 1), {'apple': 1})

    def test_equal_disjoint_flavors_normalize(self):
        self.assertEqual(self.merge({'apple': 1}, {'pear': 1}, 1, 1),
                         {'apple': F(1, 2), 'pear': F(1, 2)})

    def test_unequal_volumes_use_premerge_existing_amount(self):
        self.assertEqual(self.merge({'apple': 1}, {'pear': 1}, 9, 1),
                         {'apple': F(9, 10), 'pear': F(1, 10)})

    def test_overlapping_flavors_combine_by_amount(self):
        result = self.merge({'salt': F(3, 4), 'chips': F(1, 4)},
                            {'chips': F(1, 2), 'oil': F(1, 2)}, 3, 1)
        self.assertEqual(result, {'salt': F(9, 16), 'chips': F(5, 16), 'oil': F(1, 8)})
        self.assertEqual(list(result), ['salt', 'chips', 'oil'])

    def test_raw_incoming_weights_normalize_before_volume_weighting(self):
        self.assertEqual(self.merge({'apple': 1}, {'salt': 3, 'chips': 1}, 2, 2),
                         {'apple': F(1, 2), 'salt': F(3, 8), 'chips': F(1, 8)})

    def test_magnitude_of_incoming_weights_is_not_extra_volume(self):
        small = self.merge({'apple': 1}, {'salt': 3, 'chips': 1}, 2, 2)
        large = self.merge({'apple': 1}, {'salt': 30, 'chips': 10}, 2, 2)
        self.assertEqual(small, large)

    def test_sequential_different_volumes_keep_all_portions(self):
        data = self.merge({'apple': 1}, {'pear': 1}, 3, 1)
        data = self.merge(data, {'peach': 1}, 4, 6)
        self.assertEqual(data, {'apple': F(3, 10), 'pear': F(1, 10), 'peach': F(3, 5)})
        self.assertEqual(sum(data.values()), 1)

    def test_splitting_a_portion_does_not_change_final_ratios(self):
        data = self.merge({'apple': 1}, {'pear': 1}, 9, 1)
        data = self.merge(data, {'pear': 1}, 10, 1)
        self.assertEqual(data, self.merge({'apple': 1}, {'pear': 1}, 9, 2))
        self.assertEqual(data, {'apple': F(9, 11), 'pear': F(2, 11)})

    def test_new_flavor_order_follows_existing_then_incoming_keys(self):
        result = self.merge({'b': F(1, 2), 'a': F(1, 2)},
                            {'z': F(1, 3), 'a': F(1, 3), 'c': F(1, 3)}, 2, 3)
        self.assertEqual(list(result), ['b', 'a', 'z', 'c'])
        self.assertEqual(result, {'b': F(1, 5), 'a': F(2, 5), 'z': F(1, 5), 'c': F(1, 5)})

    def test_inputs_and_old_data_aliases_are_not_mutated(self):
        old = {'apple': 1}
        incoming = {'salt': 3, 'chips': 1}
        result = self.merge(old, incoming, 1, 1)
        self.assertEqual(old, {'apple': 1})
        self.assertEqual(incoming, {'salt': 3, 'chips': 1})
        self.assertIsNot(result, old)
        self.assertIsNot(result, incoming)
        result['apple'] = 99
        self.assertEqual(old, {'apple': 1})
        self.assertEqual(incoming, {'salt': 3, 'chips': 1})

    def test_same_list_as_both_arguments_is_not_mutated(self):
        original = {'salt': F(3, 4), 'chips': F(1, 4)}
        result = self.merge(original, original, 3, 1)
        self.assertEqual(result, original)
        self.assertEqual(original, {'salt': F(3, 4), 'chips': F(1, 4)})
        self.assertIsNot(result, original)

    def test_empty_or_nonlist_incoming_keeps_original_data_and_alias(self):
        for incoming in ({}, None, 'apple', 0):
            for old in ({'apple': 1}, {}, None):
                with self.subTest(incoming=incoming, old=old):
                    self.assertIs(self.merge(old, incoming, 1, 1), old)

    def test_absent_existing_data_adopts_normalized_new_weights(self):
        for old in (None, {}):
            self.assertEqual(self.merge(old, {'salt': 3, 'chips': 1}, 4, 2),
                             {'salt': F(3, 4), 'chips': F(1, 4)})

    def test_all_zero_weights_keep_zero_sum_without_division(self):
        self.assertEqual(self.merge({'apple': 0}, {'pear': 0}, 3, 2),
                         {'apple': 0, 'pear': 0})
        self.assertEqual(self.merge(None, {'pear': 0}, 3, 2), {'pear': 0})

    def test_zero_incoming_weights_do_not_amplify_existing_flavor(self):
        self.assertEqual(self.merge({'apple': 1}, {'pear': 0}, 3, 2),
                         {'apple': 1, 'pear': 0})

    def test_zero_existing_volume_contributes_zero(self):
        self.assertEqual(self.merge({'apple': 1}, {'pear': 1}, 0, 2),
                         {'apple': 0, 'pear': 1})

    def test_direct_zero_volume_callback_preserves_zero_helper_behavior(self):
        # The real add_reagent rejects amount <= 0 before on_merge. These direct
        # boundary probes establish arithmetic behavior, not a reachable route.
        self.assertEqual(self.merge({'apple': 1}, {'pear': 1}, 3, 0),
                         {'apple': 1, 'pear': 0})
        self.assertEqual(self.merge({'apple': 1}, {'pear': 1}, 0, 0),
                         {'apple': 0, 'pear': 0})


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=ROOT)
    parser.add_argument('--food-source', type=Path)
    options, remaining = parser.parse_known_args()
    ROOT = options.repo
    FOOD_SOURCE = options.food_source
    unittest.main(argv=[__file__, *remaining])
