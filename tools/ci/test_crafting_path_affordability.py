"""Source-bound crafting identity/cache model; never runs DM or the game.

Run: python3 tools/ci/test_crafting_path_affordability.py
Only the exact reviewed producer or its historical name-only predecessor is
accepted. The Python model mirrors that bounded control flow, not DM execution
or serialization. Real fixtures use disjoint exact item counts, not the complete
ingredient selector, crafting validation, consumption, or native UI behavior.
See fixtures/crafting_path_affordability.json for provenance and source locks.
"""
from dataclasses import dataclass, field, replace
from hashlib import sha256
from itertools import product
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
CRAFTING = ROOT / 'code/datums/components/crafting/crafting.dm'
FIXTURE = json.loads((Path(__file__).parent / 'fixtures/crafting_path_affordability.json').read_text())
UI_DATA = '/datum/component/personal_crafting/ui_data(mob/user)'
CACHE_DECLARATION = '\tvar/list/cached_craftability_by_path = list()\n'
LEGACY_BODY = '''\tvar/list/data = list()
\tdata["busy"] = busy
\tif(world.time >= craftability_next_update)
\t\tcraftability_next_update = world.time + 10
\t\tvar/list/surroundings = get_surroundings(user)
\t\tcached_craftability = list()
\t\tfor(var/rec in GLOB.crafting_recipes)
\t\t\tvar/datum/crafting_recipe/R = rec
\t\t\tif(R.hides_from_crafting_menu)
\t\t\t\tcontinue
\t\t\tif(!R.always_availible && !(R.type in user?.mind?.learned_recipes))
\t\t\t\tcontinue
\t\t\tif(R.required_tech_node && !R.tech_unlocked)
\t\t\t\tcontinue
\t\t\tvar/can_craft_recipe = check_contents(R, surroundings)
\t\t\tcached_craftability[R.name] = cached_craftability[R.name] || can_craft_recipe
\tdata["craftability"] = cached_craftability
\tdata["showonlycraftable"] = showonlycraftable
\treturn data
'''
COLLISION_BOOKKEEPING = '''\t\t\tif(R.name)
\t\t\t\tvar/datum/crafting_recipe/first_recipe = first_recipe_by_name[R.name]
\t\t\t\tif(first_recipe)
\t\t\t\t\tvar/first_path = "[first_recipe.type]"
\t\t\t\t\tif(isnull(cached_craftability_by_path[first_path]))
\t\t\t\t\t\tcached_craftability_by_path[first_path] = cached_craftability[R.name] ? 1 : 0
\t\t\t\t\tcached_craftability_by_path["[R.type]"] = can_craft_recipe ? 1 : 0
\t\t\t\telse
\t\t\t\t\tfirst_recipe_by_name[R.name] = R
'''
PATH_BODY = LEGACY_BODY.replace(
    '\t\tcached_craftability = list()\n',
    '\t\tcached_craftability = list()\n'
    '\t\tcached_craftability_by_path = list()\n'
    '\t\tvar/list/first_recipe_by_name = list()\n',
).replace(
    '\t\t\tvar/can_craft_recipe = check_contents(R, surroundings)\n',
    '\t\t\tvar/can_craft_recipe = check_contents(R, surroundings)\n' + COLLISION_BOOKKEEPING,
).replace(
    '\tdata["craftability"] = cached_craftability\n',
    '\tdata["craftability"] = cached_craftability\n'
    '\tdata["craftability_by_path"] = cached_craftability_by_path\n',
)


def definition(source, header):
    match = re.search(r'^' + re.escape(header) + r'\n(.*?)(?=^/(?![/*])|\Z)', source, re.M | re.S)
    if match is None:
        raise AssertionError('Missing definition: ' + header)
    return match[1].rstrip() + '\n'


def statements(body):
    # These producer bodies have no // inside string literals.
    lines = [line.split('//', 1)[0].rstrip() for line in body.splitlines()]
    return '\n'.join(line for line in lines if line.strip()) + '\n'


def producer_mode(body):
    actual = statements(body)
    if actual == LEGACY_BODY:
        return 'legacy'
    if actual == PATH_BODY:
        return 'path'
    raise AssertionError('Unreviewed crafting producer control flow; update the model explicitly')


@dataclass
class Recipe:
    path: str
    name: str = 'duplicate'
    reqs: dict = field(default_factory=dict)
    hidden: bool = False
    always_available: bool = True
    learned: bool = False
    required_tech: bool = False
    tech_unlocked: bool = True


def real_recipes():
    return [Recipe(row['path'], row['name'], row['reqs']) for row in FIXTURE['recipes']]


class ProducerModel:
    """Exact reviewed refresh/identity logic with an ingredient-check spy."""
    def __init__(self, body=None):
        self.mode = producer_mode(body if body is not None else definition(CRAFTING.read_text(), UI_DATA))
        self.next_update = 0
        self.names = {}
        self.paths = {}
        self.checks = []
        self.path_conversions = []
        self.surrounding_reads = 0

    def ui_data(self, now, recipes, outcomes, busy=False, showonlycraftable=True):
        if now >= self.next_update:
            self.next_update = now + 10
            self.surrounding_reads += 1
            self.names = {}
            self.paths = {}
            first_recipe_by_name = {}
            for recipe in recipes:
                if recipe.hidden:
                    continue
                if not recipe.always_available and not recipe.learned:
                    continue
                if recipe.required_tech and not recipe.tech_unlocked:
                    continue
                self.checks.append(recipe.path)
                can_craft_recipe = outcomes[recipe.path]
                if self.mode == 'path' and recipe.name:
                    first = first_recipe_by_name.get(recipe.name)
                    if first is not None:
                        first_path = first.path
                        self.path_conversions.append(first_path)
                        if self.paths.get(first_path) is None:
                            self.paths[first_path] = int(bool(self.names.get(recipe.name)))
                        self.path_conversions.append(recipe.path)
                        self.paths[recipe.path] = int(bool(can_craft_recipe))
                    else:
                        first_recipe_by_name[recipe.name] = recipe
                self.names[recipe.name] = int(bool(self.names.get(recipe.name) or can_craft_recipe))
        data = {'busy': busy, 'craftability': self.names, 'showonlycraftable': showonlycraftable}
        if self.mode == 'path':
            data['craftability_by_path'] = self.paths
        return data


def exact_item_counts(recipes, inventory):
    # Fixture requirements are disjoint exact item types. This is deliberately
    # not a replacement implementation of select_requirements/check_contents.
    return {recipe.path: int(all(inventory.get(kind, 0) >= count
                                for kind, count in recipe.reqs.items()))
            for recipe in recipes}


class CraftingPathAffordabilityTests(unittest.TestCase):
    def test_real_one_and_five_bolt_requirements_in_both_orders(self):
        single, batch = real_recipes()[:2]
        for order in ([single, batch], [batch, single]):
            for inventory, expected in [(single.reqs, [1, 0]), (batch.reqs, [1, 1]), ({}, [0, 0])]:
                with self.subTest(order=[row.path for row in order], inventory=inventory):
                    outcomes = exact_item_counts([single, batch], inventory)
                    self.assertEqual(list(outcomes.values()), expected)
                    model = ProducerModel()
                    data = model.ui_data(0, order, outcomes)
                    self.assertEqual(data.get('craftability_by_path'), outcomes)
                    self.assertEqual(data['craftability'], {single.name: int(any(expected))})
                    self.assertEqual(model.checks, [row.path for row in order])

    def test_real_log_and_plank_wall_requirements_in_both_orders(self):
        logs, planks = real_recipes()[2:]
        for order in ([logs, planks], [planks, logs]):
            for inventory, expected in [(logs.reqs, [1, 0]), (planks.reqs, [0, 1]), ({}, [0, 0]),
                                        ({**logs.reqs, **planks.reqs}, [1, 1])]:
                with self.subTest(order=[row.path for row in order], inventory=inventory):
                    outcomes = exact_item_counts([logs, planks], inventory)
                    self.assertEqual(list(outcomes.values()), expected)
                    data = ProducerModel().ui_data(0, order, outcomes)
                    self.assertEqual(data.get('craftability_by_path'), outcomes)
                    self.assertEqual(data['craftability'], {logs.name: int(any(expected))})

    def test_all_duplicate_boolean_sequences_include_first_and_explicit_zero(self):
        for length in range(2, 6):
            recipes = [Recipe(f'/recipe/{i}') for i in range(length)]
            for values in product([0, 1], repeat=length):
                with self.subTest(values=values):
                    outcomes = dict(zip([row.path for row in recipes], values))
                    data = ProducerModel().ui_data(0, recipes, outcomes)
                    self.assertEqual(data.get('craftability_by_path'), outcomes)
                    self.assertEqual(data['craftability'], {'duplicate': int(any(values))})
                    self.assertTrue(all(type(value) is int for value in data['craftability_by_path'].values()))

    def test_triples_do_not_replace_first_result_with_legacy_or(self):
        recipes = [Recipe(f'/recipe/{i}') for i in range(3)]
        for values in [(0, 1, 0), (1, 0, 1)]:
            outcomes = dict(zip([row.path for row in recipes], values))
            data = ProducerModel().ui_data(0, recipes, outcomes)
            self.assertEqual(data.get('craftability_by_path'), outcomes)

    def test_unique_names_have_no_overrides_or_path_conversions(self):
        recipes = [Recipe('/recipe/a', 'a'), Recipe('/recipe/b', 'b')]
        model = ProducerModel()
        data = model.ui_data(0, recipes, {'/recipe/a': 0, '/recipe/b': 1})
        self.assertEqual(data.get('craftability_by_path'), {})
        self.assertEqual(data['craftability'], {'a': 0, 'b': 1})
        self.assertEqual(model.path_conversions, [])

    def test_unnamed_recipes_preserve_legacy_or_without_overrides(self):
        recipes = [Recipe('/recipe/unnamed_a', ''), Recipe('/recipe/unnamed_b', '')]
        for values in product([0, 1], repeat=2):
            model = ProducerModel()
            data = model.ui_data(0, recipes, dict(zip([row.path for row in recipes], values)))
            self.assertEqual(data['craftability'], {'': int(any(values))})
            self.assertEqual(data.get('craftability_by_path'), {})
            self.assertEqual(model.checks, [row.path for row in recipes])
            self.assertEqual(model.path_conversions, [])

    def test_each_eligibility_gate_and_both_orderings(self):
        known = Recipe('/recipe/known')
        for hidden, always, learned, required, unlocked in product([False, True], repeat=5):
            candidate = Recipe('/recipe/candidate', hidden=hidden, always_available=always,
                               learned=learned, required_tech=required, tech_unlocked=unlocked)
            eligible = not hidden and (always or learned) and (not required or unlocked)
            for order in ([known, candidate], [candidate, known]):
                with self.subTest(flags=(hidden, always, learned, required, unlocked), order=order):
                    model = ProducerModel()
                    data = model.ui_data(0, order, {known.path: 0, candidate.path: 1})
                    self.assertEqual(data['craftability'], {'duplicate': int(eligible)})
                    self.assertEqual(data.get('craftability_by_path'),
                                     {known.path: 0, candidate.path: 1} if eligible else {})
                    self.assertEqual(model.checks, [row.path for row in order if row is known or eligible])
                    if not eligible:
                        self.assertEqual(model.path_conversions, [])

    def test_interleaved_groups_and_unique_names_keep_individual_results(self):
        recipes = [Recipe('/a/0', 'a'), Recipe('/unique', 'unique'), Recipe('/b/0', 'b'),
                   Recipe('/a/1', 'a'), Recipe('/b/1', 'b'), Recipe('/a/2', 'a')]
        outcomes = dict(zip([row.path for row in recipes], [0, 1, 1, 1, 0, 0]))
        model = ProducerModel()
        data = model.ui_data(0, recipes, outcomes)
        self.assertEqual(data.get('craftability_by_path'), {key: value for key, value in outcomes.items() if key != '/unique'})
        self.assertEqual(data['craftability'], {'a': 1, 'unique': 1, 'b': 1})
        self.assertNotIn('/unique', model.path_conversions)
        self.assertEqual(model.checks, list(outcomes))

    def test_refresh_reuses_then_replaces_both_caches_at_exact_boundary(self):
        recipes = real_recipes()[:2]
        model = ProducerModel()
        first = model.ui_data(0, recipes, exact_item_counts(recipes, recipes[0].reqs))
        checks = model.checks[:]
        for now in (0, 1, 9):
            cached = model.ui_data(now, [], {}, busy=True, showonlycraftable=False)
            self.assertIs(cached['craftability'], first['craftability'])
            self.assertIs(cached.get('craftability_by_path'), first.get('craftability_by_path'))
            self.assertTrue(cached['busy'])
            self.assertFalse(cached['showonlycraftable'])
            self.assertEqual(model.checks, checks)
            self.assertEqual(model.surrounding_reads, 1)
        fresh_outcomes = exact_item_counts(recipes, recipes[1].reqs)
        fresh = model.ui_data(10, recipes, fresh_outcomes)
        self.assertIsNot(fresh['craftability'], first['craftability'])
        self.assertIsNot(fresh.get('craftability_by_path'), first.get('craftability_by_path'))
        self.assertEqual(fresh.get('craftability_by_path'), fresh_outcomes)
        self.assertEqual(first.get('craftability_by_path'), exact_item_counts(recipes, recipes[0].reqs))
        self.assertEqual(model.surrounding_reads, 2)
        self.assertEqual(model.checks, checks + checks)
        self.assertEqual(model.next_update, 20)

    def test_next_refresh_removes_disappeared_duplicates_and_empty_catalog(self):
        first, second = real_recipes()[:2]
        model = ProducerModel()
        initial = model.ui_data(0, [first, second], {first.path: 0, second.path: 1})
        self.assertEqual(initial.get('craftability_by_path'), {first.path: 0, second.path: 1})
        for recipes in ([first, replace(second, hidden=True)], []):
            data = model.ui_data(model.next_update, recipes, {first.path: 1})
            self.assertEqual(data.get('craftability_by_path'), {})
            self.assertEqual(data['craftability'], {first.name: 1} if recipes else {})
        restored = model.ui_data(model.next_update, [second, first], {first.path: 1, second.path: 0})
        self.assertEqual(restored.get('craftability_by_path'), {first.path: 1, second.path: 0})

    def test_each_component_starts_with_independent_empty_caches(self):
        recipes = real_recipes()[:2]
        one = ProducerModel()
        two = ProducerModel()
        one.ui_data(0, recipes, exact_item_counts(recipes, recipes[0].reqs))
        self.assertEqual(two.names, {})
        self.assertEqual(two.paths, {})
        self.assertEqual(two.next_update, 0)
        self.assertEqual(two.checks, [])

    def test_historical_producer_reproduces_ambiguous_name(self):
        single, batch = real_recipes()[:2]
        for recipes in ([single, batch], [batch, single]):
            data = ProducerModel(LEGACY_BODY).ui_data(0, recipes, exact_item_counts(recipes, single.reqs))
            self.assertEqual(data['craftability'], {single.name: 1})
            self.assertNotIn('craftability_by_path', data)
            self.assertEqual([row.path for row in recipes if data['craftability'][row.name] == 1],
                             [row.path for row in recipes])
            self.assertEqual(exact_item_counts([batch], single.reqs)[batch.path], 0)


class CraftingAffordabilitySourceContracts(unittest.TestCase):
    def test_actual_producer_has_reviewed_identity_and_refresh_control_flow(self):
        source = CRAFTING.read_text()
        self.assertEqual(producer_mode(definition(source, UI_DATA)), 'path')
        self.assertEqual(source.count(CACHE_DECLARATION), 1)
        self.assertIn('\tvar/craftability_next_update = 0\n\tvar/list/cached_craftability = list()\n' + CACHE_DECLARATION, source)

    def test_unreviewed_flow_double_checks_and_reset_changes_fail_closed(self):
        mutations = [
            PATH_BODY.replace('if(isnull(cached_craftability_by_path[first_path]))', 'if(!cached_craftability_by_path[first_path])'),
            PATH_BODY.replace('if(R.name)', 'if(TRUE)'),
            PATH_BODY.replace('can_craft_recipe ? 1 : 0', 'check_contents(R, surroundings) ? 1 : 0'),
            PATH_BODY.replace('\t\tcached_craftability_by_path = list()\n', ''),
            PATH_BODY.replace('world.time + 10', 'world.time + 20'),
            PATH_BODY.replace('cached_craftability[R.name] ? 1 : 0', 'can_craft_recipe ? 1 : 0'),
            PATH_BODY.replace('var/list/first_recipe_by_name = list()', 'var/static/list/first_recipe_by_name = list()'),
        ]
        for body in mutations:
            with self.subTest(body=body), self.assertRaisesRegex(AssertionError, 'Unreviewed crafting producer'):
                producer_mode(body)

    def test_authoritative_actions_validation_and_all_other_component_bytes_unchanged(self):
        source = CRAFTING.read_text().replace(CACHE_DECLARATION, '')
        source = re.sub(r'^' + re.escape(UI_DATA) + r'\n.*?(?=^/|\Z)', '', source, flags=re.M | re.S)
        self.assertEqual(sha256(source.encode()).hexdigest(), FIXTURE['unchanged_crafting_sha256'])
        # Explicitly surface the authority/identity boundary as well as its byte lock.
        full = CRAFTING.read_text()
        action = definition(full, '/datum/component/personal_crafting/ui_act(action, params)')
        self.assertIn('var/path = text2path(params["item"])', action)
        self.assertIn('var/recipe = new path', action)
        self.assertIn('construct_item_repeatable(usr, recipe, amount, auto)', action)
        self.assertEqual(statements(definition(full, '/datum/component/personal_crafting/proc/check_contents(datum/crafting_recipe/R, list/contents)')),
                         '\treturn !isnull(select_requirements(R, contents))\n')
        construct = definition(full, '/datum/component/personal_crafting/proc/construct_item(mob/user, datum/crafting_recipe/R)')
        self.assertIn('check_contents(R, contents)', construct)
        self.assertNotIn('cached_craftability', construct)

    def test_real_fixture_requirements_names_and_definitions_match_included_source(self):
        dme = (ROOT / 'roguetown.dme').read_text().replace('\\', '/')
        for row in FIXTURE['recipes']:
            with self.subTest(path=row['path']):
                self.assertIn('#include "' + row['source'] + '"', dme)
                source = (ROOT / row['source']).read_text()
                body = definition(source, row['path'])
                self.assertEqual(sha256(body.encode()).hexdigest(), row['definition_sha256'])
                name_body = definition(source, row.get('name_parent', row['path']))
                self.assertEqual(re.search(r'^\tname = "([^"]*)"', name_body, re.M)[1], row['name'])
                requirements = re.search(r'^\treqs = list\((.*?)\)', body, re.M | re.S)[1]
                self.assertEqual(re.sub(r'/obj/[\w/]+ = \d+|[\s,]', '', requirements), '')
                parsed = {key: int(value) for key, value in re.findall(r'(/obj/[\w/]+) = (\d+)', requirements)}
                self.assertEqual(parsed, row['reqs'])

    def test_static_rows_keep_recipe_type_identity_and_name_eligibility(self):
        source = CRAFTING.read_text()
        static = definition(source, '/datum/component/personal_crafting/ui_static_data(mob/user)')
        self.assertIn('\t\tif(!R.name)\n\t\t\tcontinue\n', static)
        self.assertIn('crafting_recipes[R.cached_category] += list(R.cached_display_data)', static)
        recipe_source = (ROOT / 'code/datums/components/crafting/recipes.dm').read_text()
        display = definition(recipe_source, '/datum/crafting_recipe/proc/build_display_cache()')
        self.assertIn('\tdata["name"] = name\n', display)
        self.assertIn('\tdata["path"] = type\n', display)


if __name__ == '__main__':
    unittest.main()
