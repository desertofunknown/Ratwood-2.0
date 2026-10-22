"""Source-bound crafting payload/type guard regressions; never executes DM.

Run: python3 tools/ci/test_crafting_recipe_ingress.py
Only the exact reviewed handler and its parent-guard-only predecessor are
accepted. DM lists, text2path, ispath, construction and parent calls are inert
spies over a small source-verified type fixture, not a DM interpreter. These
checks establish source/control-flow contracts, not engine, JSON transport,
TGUI ownership, eligibility, ingredient consumption or native gameplay behavior.
Base/abstract recipe paths intentionally pass the type gate: this is not a
recipe-catalog whitelist or a new eligibility policy.
"""
from dataclasses import dataclass, field
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
CRAFTING = ROOT / 'code/datums/components/crafting/crafting.dm'
HANDLER = '/datum/component/personal_crafting/ui_act(action, params)'
PARENT_PREFIX = '\t. = ..()\n\tif(.)\n\t\treturn\n'
PAYLOAD_GUARD = '\t\t\tif(!islist(params) || !istext(params["item"]))\n\t\t\t\treturn\n'
PATH_LINE = '\t\t\tvar/path = text2path(params["item"])\n'
PATH_GUARD = '\t\t\tif(!ispath(path, /datum/crafting_recipe))\n\t\t\t\treturn\n'
LEGACY_TAIL = '''\tswitch(action)
\t\tif("craft")
\t\t\tvar/path = text2path(params["item"])
\t\t\tvar/amount = params["amount"] || 1
\t\t\tvar/auto = params["auto"]
\t\t\tvar/recipe = new path
\t\t\tconstruct_item_repeatable(usr, recipe, amount, auto)
\t\t\tusr.mind.lastrecipe = recipe
\t\tif("checkboxonlycraftable")
\t\t\tshowonlycraftable = params["state"]
'''
LEGACY_BODY = PARENT_PREFIX + LEGACY_TAIL
GUARDED_BODY = LEGACY_BODY.replace(PATH_LINE, PAYLOAD_GUARD + PATH_LINE + PATH_GUARD)
RECIPE_BASE = '/datum/crafting_recipe'
RECIPE_PARENT = '/datum/crafting_recipe/roguetown/engineering'
RECIPE = RECIPE_PARENT + '/pyrobolt'
BATCH_RECIPE = RECIPE_PARENT + '/pyrobolt_five'
NON_RECIPE = '/datum/component/personal_crafting'
# These are injected resolutions, not a replacement implementation of text2path.
# Definition presence and explicit parent_type absence are verified below.
TYPE_SOURCES = {
    RECIPE_BASE: 'code/datums/components/crafting/recipes.dm',
    RECIPE_PARENT: 'code/modules/roguetown/roguecrafting/engineering.dm',
    RECIPE: 'code/modules/roguetown/roguecrafting/engineering.dm',
    BATCH_RECIPE: 'code/modules/roguetown/roguecrafting/engineering.dm',
    NON_RECIPE: 'code/datums/components/crafting/crafting.dm',
}


def active_source(source):
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda match: '\n' * match[0].count('\n')
                  if match[0].startswith(('//', '/*')) else match[0], source, flags=re.S)


def definition(source, header):
    signature = r'^' + re.escape(header) + r'\n'
    if len(re.findall(signature, active_source(source), re.M)) != 1:
        raise AssertionError('Missing or duplicate active definition: ' + header)
    matches = re.findall(signature + r'(.*?)(?=^/|\Z)', source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing or duplicate raw definition: ' + header)
    return matches[0].rstrip('\n') + '\n'


def handler_mode(body):
    if body == LEGACY_BODY:
        return 'legacy'
    if body == GUARDED_BODY:
        return 'guarded'
    raise AssertionError('Unreviewed crafting recipe ingress control flow')


@dataclass(frozen=True)
class PathToken:
    name: str
    recipe: bool


TOKENS = {name: PathToken(name, name != NON_RECIPE) for name in TYPE_SOURCES}


class Params:
    """Associative DM-list spy; an empty list has no item/state keys."""
    def __init__(self, values=None, forbidden=()):
        self.values = {} if values is None else values
        self.forbidden = forbidden
        self.reads = []

    def __getitem__(self, key):
        if key in self.forbidden:
            raise AssertionError('Forbidden parameter read: ' + key)
        self.reads.append(key)
        return self.values.get(key)


class NonList:
    def __getitem__(self, key):
        raise AssertionError('Non-list payload was indexed')


@dataclass
class Effects:
    trace: list = field(default_factory=list)
    resolutions: list = field(default_factory=list)
    path_checks: list = field(default_factory=list)
    creations: list = field(default_factory=list)
    constructions: list = field(default_factory=list)
    lastrecipe: object = None
    lastrecipe_writes: int = 0
    showonlycraftable: object = True
    checkbox_writes: int = 0

    def resolve(self, value):
        self.trace.append('text2path')
        self.resolutions.append(value)
        if not isinstance(value, str):
            raise AssertionError('Non-text item reached resolver spy')
        return TOKENS.get(value)

    def is_recipe(self, path):
        self.trace.append('ispath')
        self.path_checks.append(path)
        return isinstance(path, PathToken) and path.recipe


def dispatch(body, action, params, effects, parent_result=None):
    mode = handler_mode(body)
    effects.trace.append('parent')
    result = parent_result
    if result:
        return result  # Bare return preserves the existing parent result.
    if action == 'craft':
        if mode == 'guarded':
            effects.trace.append('islist')
            if not isinstance(params, Params):
                return result
            effects.trace.append('istext')
            if not isinstance(params['item'], str):
                return result
        path = effects.resolve(params['item'])
        if mode == 'guarded' and not effects.is_recipe(path):
            return result
        amount = params['amount'] or 1
        auto = params['auto']
        recipe = object()  # Never instantiate any game path, even in repros.
        effects.creations.append((path, recipe))
        effects.trace.append('new recipe')
        effects.constructions.append((recipe, amount, auto))
        effects.trace.append('construct')
        effects.lastrecipe = recipe
        effects.lastrecipe_writes += 1
        effects.trace.append('lastrecipe')
    elif action == 'checkboxonlycraftable':
        effects.showonlycraftable = params['state']
        effects.checkbox_writes += 1
        effects.trace.append('checkbox')
    return result


class CraftingRecipeIngressTests(unittest.TestCase):
    def setUp(self):
        self.body = definition(CRAFTING.read_text(), HANDLER)

    def assert_no_action_effects(self, effects, previous):
        self.assertEqual(effects.creations, [])
        self.assertEqual(effects.constructions, [])
        self.assertIs(effects.lastrecipe, previous)
        self.assertEqual((effects.lastrecipe_writes, effects.checkbox_writes), (0, 0))
        self.assertIs(effects.showonlycraftable, True)

    def rejected(self, params, expected_trace, parent_result=None):
        marker = object()
        effects = Effects(lastrecipe=marker)
        self.assertIs(dispatch(self.body, 'craft', params, effects, parent_result), parent_result)
        self.assertEqual(effects.trace, expected_trace)
        self.assert_no_action_effects(effects, marker)
        return effects

    def test_actual_handler_adds_only_two_early_return_guards(self):
        self.assertEqual(handler_mode(self.body), 'guarded')
        self.assertEqual(self.body, GUARDED_BODY)
        self.assertEqual(self.body.replace(PAYLOAD_GUARD, '', 1).replace(PATH_GUARD, '', 1), LEGACY_BODY)
        self.assertEqual(self.body.count('..()'), 1)
        self.assertEqual(self.body.count('new path'), 1)

    def test_non_list_payloads_stop_before_indexing_and_resolution(self):
        for payload in (None, False, 0, 1, 1.5, '', 'payload', NonList(), TOKENS[RECIPE]):
            with self.subTest(payload=payload):
                effects = self.rejected(payload, ['parent', 'islist'])
                self.assertEqual((effects.resolutions, effects.path_checks), ([], []))

    def test_missing_and_non_text_items_stop_before_resolution(self):
        payloads = [{}, {'amount': 5}, {'item': None}, {'item': False}, {'item': 0},
                    {'item': 1}, {'item': 1.5}, {'item': Params()}, {'item': object()},
                    {'item': TOKENS[RECIPE]}]
        for payload in payloads:
            with self.subTest(payload=payload):
                params = Params(payload, forbidden=('amount', 'auto'))
                effects = self.rejected(params, ['parent', 'islist', 'istext'])
                self.assertEqual(params.reads, ['item'])
                self.assertEqual((effects.resolutions, effects.path_checks), ([], []))

    def test_empty_unknown_and_non_recipe_paths_stop_before_constructor(self):
        values = ('', ' ', '/definitely_missing', RECIPE_BASE + '/definitely_missing',
                  NON_RECIPE, RECIPE + '/proc/not_a_recipe')
        for value in values:
            with self.subTest(value=value):
                params = Params({'item': value}, forbidden=('amount', 'auto'))
                effects = self.rejected(params, ['parent', 'islist', 'istext', 'text2path', 'ispath'])
                self.assertEqual(params.reads, ['item', 'item'])
                self.assertEqual(effects.resolutions, [value])
                self.assertEqual(effects.path_checks, [TOKENS.get(value)])

    def test_known_recipe_paths_preserve_amount_auto_and_effect_order(self):
        # The base and unnamed parent paths remain accepted by this narrow gate.
        # This does not assert they are safe or meaningful to craft at runtime.
        for path in (RECIPE_BASE, RECIPE_PARENT, RECIPE, BATCH_RECIPE):
            for amount, expected in [(None, 1), (0, 1), (1, 1), (5, 5), (-2, -2), (0.5, 0.5), ('5', '5')]:
                for auto in (None, False, True, 3):
                    with self.subTest(path=path, amount=amount, auto=auto):
                        params = Params({'item': path, 'amount': amount, 'auto': auto})
                        effects = Effects()
                        self.assertIsNone(dispatch(self.body, 'craft', params, effects))
                        self.assertEqual(params.reads, ['item', 'item', 'amount', 'auto'])
                        self.assertEqual(effects.resolutions, [path])
                        self.assertEqual(effects.path_checks, [TOKENS[path]])
                        self.assertEqual(len(effects.creations), 1)
                        token, recipe = effects.creations[0]
                        self.assertIs(token, TOKENS[path])
                        self.assertEqual(effects.constructions, [(recipe, expected, auto)])
                        self.assertIs(effects.lastrecipe, recipe)
                        self.assertEqual((effects.lastrecipe_writes, effects.checkbox_writes), (1, 0))
                        self.assertEqual(effects.trace, ['parent', 'islist', 'istext', 'text2path',
                                                       'ispath', 'new recipe', 'construct', 'lastrecipe'])

    def test_parent_rejection_precedes_validation_and_preserves_result(self):
        for result in (True, 1, 7, 'handled'):
            for action in ('craft', 'checkboxonlycraftable', 'unknown'):
                with self.subTest(result=result, action=action):
                    marker = object()
                    effects = Effects(lastrecipe=marker)
                    self.assertIs(dispatch(self.body, action, NonList(), effects, result), result)
                    self.assertEqual(effects.trace, ['parent'])
                    self.assert_no_action_effects(effects, marker)

    def test_invalid_craft_returns_preserve_falsey_parent_result(self):
        for result in (None, False, 0):
            for params in (None, Params(), Params({'item': NON_RECIPE})):
                with self.subTest(result=result, params=params):
                    effects = Effects()
                    self.assertIs(dispatch(self.body, 'craft', params, effects, result), result)
                    self.assertEqual(effects.creations, [])

    def test_checkbox_state_and_unknown_actions_are_unchanged(self):
        for state in (False, True, 0, 1, None):
            params = Params({'state': state}, forbidden=('item', 'amount', 'auto'))
            effects = Effects()
            self.assertIsNone(dispatch(self.body, 'checkboxonlycraftable', params, effects))
            self.assertIs(effects.showonlycraftable, state)
            self.assertEqual(params.reads, ['state'])
            self.assertEqual(effects.trace, ['parent', 'checkbox'])
            self.assertEqual((effects.resolutions, effects.creations, effects.constructions), ([], [], []))
        marker = object()
        effects = Effects(lastrecipe=marker)
        self.assertIsNone(dispatch(self.body, 'unknown', NonList(), effects))
        self.assertEqual(effects.trace, ['parent'])
        self.assert_no_action_effects(effects, marker)

    def test_rejected_inputs_after_valid_craft_leave_existing_state_unchanged(self):
        effects = Effects()
        dispatch(self.body, 'craft', Params({'item': RECIPE}), effects)
        old_recipe = effects.lastrecipe
        for params in (None, Params(), Params({'item': NON_RECIPE}), Params({'item': '/missing'})):
            dispatch(self.body, 'craft', params, effects)
        self.assertEqual(len(effects.creations), 1)
        self.assertEqual(len(effects.constructions), 1)
        self.assertIs(effects.lastrecipe, old_recipe)
        self.assertEqual((effects.lastrecipe_writes, effects.checkbox_writes), (1, 0))

    def test_historical_handler_reproduces_non_recipe_and_unknown_constructor_reach(self):
        for value in (NON_RECIPE, '/missing', ''):
            with self.subTest(item=value):
                effects = Effects()
                dispatch(LEGACY_BODY, 'craft', Params({'item': value}), effects)
                self.assertEqual(effects.resolutions, [value])
                self.assertEqual(effects.path_checks, [])
                self.assertEqual(len(effects.creations), 1)
                self.assertIs(effects.creations[0][0], TOKENS.get(value))
                self.assertEqual(effects.trace, ['parent', 'text2path', 'new recipe', 'construct', 'lastrecipe'])
        with self.assertRaisesRegex(AssertionError, 'Non-text item reached resolver'):
            dispatch(LEGACY_BODY, 'craft', Params(), Effects())

    def test_unreviewed_reordered_or_broadened_validation_fails_closed(self):
        mutations = [
            GUARDED_BODY.replace(PAYLOAD_GUARD, ''),
            GUARDED_BODY.replace(PATH_GUARD, ''),
            GUARDED_BODY.replace(' || !istext', ' && !istext'),
            GUARDED_BODY.replace('!islist(params)', 'islist(params)'),
            GUARDED_BODY.replace('!istext(params["item"])', 'istext(params["item"])'),
            GUARDED_BODY.replace('!ispath(path, /datum/crafting_recipe)', '!path'),
            GUARDED_BODY.replace('!ispath(path, /datum/crafting_recipe)', '!ispath(path, /datum)'),
            GUARDED_BODY.replace('!ispath(path, /datum/crafting_recipe)', 'ispath(path, /datum/crafting_recipe)'),
            GUARDED_BODY.replace(PAYLOAD_GUARD + PATH_LINE, PATH_LINE + PAYLOAD_GUARD),
            GUARDED_BODY.replace(PATH_GUARD, '').replace('var/recipe = new path\n', 'var/recipe = new path\n' + PATH_GUARD),
            GUARDED_BODY.replace('\t\t\t\treturn\n', '\t\t\t\treturn TRUE\n'),
            GUARDED_BODY.replace(PARENT_PREFIX, '\t. = ..()\n'),
            GUARDED_BODY.replace('amount, auto)', '1, auto)'),
            GUARDED_BODY.replace('usr.mind.lastrecipe = recipe', 'usr.mind.lastrecipe = null'),
        ]
        for body in mutations:
            with self.subTest(body=body), self.assertRaisesRegex(AssertionError, 'Unreviewed crafting recipe ingress'):
                handler_mode(body)

    def test_definition_locator_rejects_commented_or_duplicate_handlers(self):
        source = HANDLER + '\n' + GUARDED_BODY
        for changed in ['/*\n' + source + '*/\n', source + '\n' + source]:
            with self.subTest(source=changed), self.assertRaisesRegex(AssertionError, 'active definition'):
                definition(changed, HANDLER)

    def test_inert_type_fixtures_come_from_included_source_not_prefix_guessing(self):
        dme = (ROOT / 'roguetown.dme').read_text().replace('\\', '/')
        for path, source_path in TYPE_SOURCES.items():
            with self.subTest(path=path):
                self.assertIn('#include "' + source_path + '"', dme)
                body = definition((ROOT / source_path).read_text(), path)
                self.assertNotRegex(active_source(body), re.compile(r'^\s*parent_type\s*=', re.M))
                self.assertEqual(TOKENS[path].recipe, path == RECIPE_BASE or path.startswith(RECIPE_BASE + '/'))
        self.assertNotIn(RECIPE_BASE + '/definitely_missing', TOKENS)


if __name__ == '__main__':
    unittest.main()
