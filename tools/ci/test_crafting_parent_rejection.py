"""Source-bound personal-crafting parent-result regression; never executes DM.

Run: python3 tools/ci/test_crafting_parent_rejection.py
Only the exact reviewed handler or its historical unguarded predecessor is
accepted. The Python model checks parent-call ordering, return preservation and
whether the existing action branches are reached. Crafting, path resolution,
recipe creation, UI transport and gameplay are spies, not runtime verification.
The parent status model is separately bound to its exact active source body.
"""
from dataclasses import dataclass, field
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
CRAFTING = ROOT / 'code/datums/components/crafting/crafting.dm'
PARENT = ROOT / 'code/modules/tgui/external.dm'
HANDLER = '/datum/component/personal_crafting/ui_act(action, params)'
PARENT_HANDLER = '/datum/proc/ui_act(action, list/params, datum/tgui/ui, datum/ui_state/state)'
PARENT_CALL = '\t. = ..()\n'
GUARD = '\tif(.)\n\t\treturn\n'
LEGACY_ACTION_TAIL = '''\tswitch(action)
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
# Explicitly adopt the separate, reviewed payload/type guards while retaining
# the historical unguarded handler used by the parent-result regression.
PAYLOAD_GUARD = '\t\t\tif(!islist(params) || !istext(params["item"]))\n\t\t\t\treturn\n'
PATH_GUARD = '\t\t\tif(!ispath(path, /datum/crafting_recipe))\n\t\t\t\treturn\n'
PATH_LINE = '\t\t\tvar/path = text2path(params["item"])\n'
ACTION_TAIL = LEGACY_ACTION_TAIL.replace(PATH_LINE, PAYLOAD_GUARD + PATH_LINE + PATH_GUARD)
LEGACY_BODY = PARENT_CALL + LEGACY_ACTION_TAIL
GUARDED_BODY = PARENT_CALL + GUARD + ACTION_TAIL
PARENT_BODY = '''\tSHOULD_CALL_PARENT(TRUE)
\tSEND_SIGNAL(src, COMSIG_UI_ACT, usr, action, params)
\t// If UI is not interactive or usr calling Topic is not the UI user, bail.
\tif(!ui || ui.status != UI_INTERACTIVE)
\t\treturn TRUE
'''
UI_INTERACTIVE = 2
RECIPE_PATH = '/datum/crafting_recipe/roguetown/engineering/pyrobolt'


def active_source(source):
    # Definition locator only, not a DM parser. Keep quoted content intact.
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda match: '\n' * match[0].count('\n')
                  if match[0].startswith(('//', '/*')) else match[0], source, flags=re.S)


def definition(source, header):
    signature = r'^' + re.escape(header) + r'\n'
    if len(re.findall(signature, active_source(source), re.M)) != 1:
        raise AssertionError('Missing or duplicate active definition: ' + header)
    # Top-level proc declarations and documentation delimit these bodies.
    # Keep all indentation and executable suffixes, so changed flow fails closed.
    matches = re.findall(signature + r'(.*?)(?=^/|\Z)', source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing or duplicate raw definition: ' + header)
    return matches[0].rstrip('\n') + '\n'


def handler_mode(body):
    if body == LEGACY_BODY:
        return 'legacy'
    if body == GUARDED_BODY:
        return 'guarded'
    raise AssertionError('Unreviewed personal-crafting handler control flow')


class ParentSpy:
    def __init__(self, result, trace):
        self.result = result
        self.trace = trace
        self.calls = 0

    def __call__(self):
        self.calls += 1
        self.trace.append('parent')
        return self.result


class StatusParent(ParentSpy):
    def __init__(self, body, status, trace, has_ui=True):
        if body != PARENT_BODY:
            raise AssertionError('Unreviewed tgui parent control flow')
        # SEND_SIGNAL remains before the status check. Its effects and the
        # SHOULD_CALL_PARENT annotation are not interpreted by this model.
        super().__init__(1 if not has_ui or status != UI_INTERACTIVE else None, trace)
        self.signals = 0

    def __call__(self):
        result = super().__call__()
        self.signals += 1
        self.trace.append('signal')
        return result


class Params:
    def __init__(self, trace, values=None, forbidden=False):
        self.trace = trace
        self.values = values or {}
        self.forbidden = forbidden
        self.reads = []

    def __getitem__(self, key):
        if self.forbidden:
            raise AssertionError('Rejected action read params')
        self.reads.append(key)
        self.trace.append(('param', key))
        return self.values.get(key)


@dataclass
class Effects:
    trace: list
    creations: list = field(default_factory=list)
    constructions: list = field(default_factory=list)
    lastrecipe: object = None
    showonlycraftable: object = True
    lastrecipe_writes: int = 0
    checkbox_writes: int = 0


def dispatch(body, action, params, parent, effects):
    mode = handler_mode(body)
    result = parent()
    if mode == 'guarded' and result:
        # DM's bare return preserves '.', rather than replacing it with TRUE.
        return result
    if action == 'craft':
        if mode == 'guarded':
            if not isinstance(params, Params) or not isinstance(params['item'], str):
                return result
        path = params['item']  # text2path is a spy, not a DM implementation.
        # This parent-ordering model accepts only its known recipe fixture.
        # The separate ingress suite models rejected resolutions and path types.
        if mode == 'guarded' and path != RECIPE_PATH:
            raise AssertionError('Parent model needs its known recipe-type fixture')
        amount = params['amount'] or 1
        auto = params['auto']
        recipe = object()  # no arbitrary path is instantiated or executed.
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


class CraftingParentRejectionTests(unittest.TestCase):
    def setUp(self):
        self.body = definition(CRAFTING.read_text(), HANDLER)
        self.parent_body = definition(PARENT.read_text(), PARENT_HANDLER)

    def test_actual_handler_uses_guard_and_preserves_entire_action_tail(self):
        self.assertEqual(handler_mode(self.body), 'guarded')
        self.assertEqual(self.body, GUARDED_BODY)
        self.assertEqual(self.body.count('..()'), 1)
        self.assertEqual(self.body.replace(GUARD, '', 1), PARENT_CALL + ACTION_TAIL)
        self.assertEqual(self.body.replace(GUARD, '', 1).replace(PAYLOAD_GUARD, '', 1)
                         .replace(PATH_GUARD, '', 1), LEGACY_BODY)

    def test_missing_and_noninteractive_ui_never_reach_action_effects(self):
        for has_ui, status in [(False, None), (True, -1), (True, 0), (True, 1)]:
            for action in ('craft', 'checkboxonlycraftable', 'unknown'):
                with self.subTest(has_ui=has_ui, status=status, action=action):
                    trace = []
                    marker = object()
                    effects = Effects(trace, lastrecipe=marker)
                    parent = StatusParent(self.parent_body, status, trace, has_ui)
                    params = Params(trace, forbidden=True)
                    self.assertEqual(dispatch(self.body, action, params, parent, effects), 1)
                    self.assertEqual((parent.calls, parent.signals), (1, 1))
                    self.assertEqual(trace, ['parent', 'signal'])
                    self.assertEqual(effects.creations, [])
                    self.assertEqual(effects.constructions, [])
                    self.assertIs(effects.lastrecipe, marker)
                    self.assertEqual(effects.lastrecipe_writes, 0)
                    self.assertEqual(effects.checkbox_writes, 0)
                    self.assertIs(effects.showonlycraftable, True)

    def test_truthy_parent_results_are_preserved_without_parameter_access(self):
        for value in (True, 1, 7, 'handled'):
            for action in ('craft', 'checkboxonlycraftable', 'unknown'):
                with self.subTest(value=value, action=action):
                    trace = []
                    parent = ParentSpy(value, trace)
                    self.assertIs(dispatch(self.body, action, Params(trace, forbidden=True),
                                           parent, Effects(trace)), value)
                    self.assertEqual(parent.calls, 1)
                    self.assertEqual(trace, ['parent'])

    def test_interactive_craft_preserves_existing_parameter_and_effect_order(self):
        for amount, expected in [(None, 1), (0, 1), (1, 1), (5, 5)]:
            for auto in (None, False, True):
                with self.subTest(amount=amount, auto=auto):
                    trace = []
                    parent = StatusParent(self.parent_body, UI_INTERACTIVE, trace)
                    params = Params(trace, {'item': RECIPE_PATH, 'amount': amount, 'auto': auto})
                    effects = Effects(trace)
                    self.assertIsNone(dispatch(self.body, 'craft', params, parent, effects))
                    self.assertEqual((parent.calls, parent.signals), (1, 1))
                    self.assertEqual(params.reads, ['item', 'item', 'amount', 'auto'])
                    self.assertEqual(len(effects.creations), 1)
                    path, recipe = effects.creations[0]
                    self.assertEqual(path, RECIPE_PATH)
                    self.assertEqual(effects.constructions, [(recipe, expected, auto)])
                    self.assertIs(effects.lastrecipe, recipe)
                    self.assertEqual(effects.lastrecipe_writes, 1)
                    self.assertEqual(effects.checkbox_writes, 0)
                    self.assertEqual(trace, ['parent', 'signal', ('param', 'item'), ('param', 'item'),
                                            ('param', 'amount'), ('param', 'auto'),
                                            'new recipe', 'construct', 'lastrecipe'])

    def test_interactive_checkbox_preserves_state_and_does_not_craft(self):
        for state in (False, True, 0, 1, None):
            with self.subTest(state=state):
                trace = []
                marker = object()
                effects = Effects(trace, lastrecipe=marker)
                params = Params(trace, {'state': state})
                parent = StatusParent(self.parent_body, UI_INTERACTIVE, trace)
                self.assertIsNone(dispatch(self.body, 'checkboxonlycraftable', params, parent, effects))
                self.assertIs(effects.showonlycraftable, state)
                self.assertEqual((parent.calls, parent.signals), (1, 1))
                self.assertEqual((effects.checkbox_writes, effects.lastrecipe_writes), (1, 0))
                self.assertIs(effects.lastrecipe, marker)
                self.assertEqual(effects.creations, [])
                self.assertEqual(effects.constructions, [])
                self.assertEqual(trace, ['parent', 'signal', ('param', 'state'), 'checkbox'])

    def test_falsey_parent_return_value_is_preserved_for_every_action(self):
        for value in (None, False, 0):
            for action in ('craft', 'checkboxonlycraftable', 'unknown'):
                with self.subTest(value=value, action=action):
                    trace = []
                    parent = ParentSpy(value, trace)
                    effects = Effects(trace)
                    params = Params(trace, {'item': RECIPE_PATH, 'state': False})
                    self.assertIs(dispatch(self.body, action, params, parent, effects), value)
                    self.assertEqual(parent.calls, 1)
                    self.assertEqual(len(effects.creations), int(action == 'craft'))
                    self.assertEqual(effects.checkbox_writes, int(action == 'checkboxonlycraftable'))

    def test_unknown_interactive_action_has_no_parameter_access_or_effects(self):
        trace = []
        marker = object()
        effects = Effects(trace, lastrecipe=marker)
        parent = StatusParent(self.parent_body, UI_INTERACTIVE, trace)
        self.assertIsNone(dispatch(self.body, 'unknown', Params(trace, forbidden=True), parent, effects))
        self.assertEqual(trace, ['parent', 'signal'])
        self.assertEqual((parent.calls, parent.signals), (1, 1))
        self.assertEqual((effects.creations, effects.constructions), ([], []))
        self.assertEqual((effects.lastrecipe_writes, effects.checkbox_writes), (0, 0))
        self.assertIs(effects.lastrecipe, marker)
        self.assertIs(effects.showonlycraftable, True)

    def test_rejected_requests_after_valid_craft_leave_existing_state_unchanged(self):
        trace = []
        effects = Effects(trace)
        dispatch(self.body, 'craft', Params(trace, {'item': RECIPE_PATH}),
                 StatusParent(self.parent_body, UI_INTERACTIVE, trace), effects)
        recipe = effects.lastrecipe
        for action in ('craft', 'checkboxonlycraftable'):
            parent = StatusParent(self.parent_body, 0, trace)
            self.assertEqual(dispatch(self.body, action, Params(trace, forbidden=True), parent, effects), 1)
            self.assertEqual(parent.calls, 1)
        self.assertEqual(len(effects.creations), 1)
        self.assertEqual(len(effects.constructions), 1)
        self.assertIs(effects.lastrecipe, recipe)
        self.assertEqual((effects.lastrecipe_writes, effects.checkbox_writes), (1, 0))
        self.assertIs(effects.showonlycraftable, True)

    def test_historical_handler_reproduces_rejected_action_side_effects(self):
        for action in ('craft', 'checkboxonlycraftable'):
            trace = []
            effects = Effects(trace)
            parent = StatusParent(self.parent_body, 0, trace)
            params = Params(trace, {'item': RECIPE_PATH, 'state': False})
            self.assertEqual(dispatch(LEGACY_BODY, action, params, parent, effects), 1)
            self.assertEqual(parent.calls, 1)
            self.assertTrue(params.reads)
            if action == 'craft':
                self.assertEqual(len(effects.creations), 1)
                self.assertEqual(effects.lastrecipe_writes, 1)
            else:
                self.assertIs(effects.showonlycraftable, False)
                self.assertEqual(effects.checkbox_writes, 1)

    def test_unreviewed_guard_return_parent_call_and_action_changes_fail_closed(self):
        mutations = [
            GUARDED_BODY.replace('if(.)', 'if(!.)'),
            GUARDED_BODY.replace('\t\treturn\n', '\t\treturn TRUE\n'),
            GUARDED_BODY.replace(PARENT_CALL, PARENT_CALL + PARENT_CALL),
            GUARDED_BODY.replace(PARENT_CALL, '\t..()\n'),
            PARENT_CALL + ACTION_TAIL + GUARD,
            GUARDED_BODY.replace('params["state"]', '!params["state"]'),
            GUARDED_BODY.replace('amount, auto)', '1, auto)'),
            GUARDED_BODY.replace('usr.mind.lastrecipe = recipe', 'usr.mind.lastrecipe = null'),
            GUARDED_BODY.replace('var/recipe = new path', 'var/recipe = null'),
        ]
        for body in mutations:
            with self.subTest(body=body), self.assertRaisesRegex(AssertionError, 'Unreviewed personal-crafting'):
                handler_mode(body)

    def test_parent_body_is_exact_and_rejects_status_or_return_changes(self):
        self.assertEqual(self.parent_body, PARENT_BODY)
        for old, new in [('!= UI_INTERACTIVE', '== UI_INTERACTIVE'),
                         ('return TRUE', 'return FALSE'),
                         ('!ui || ', ''),
                         ('\tSEND_SIGNAL', '\t// SEND_SIGNAL')]:
            with self.subTest(change=(old, new)), self.assertRaisesRegex(AssertionError, 'Unreviewed tgui parent'):
                StatusParent(PARENT_BODY.replace(old, new), UI_INTERACTIVE, [])

    def test_definition_locator_rejects_commented_or_duplicate_handlers(self):
        source = HANDLER + '\n' + GUARDED_BODY
        for changed in ['/*\n' + source + '*/\n', source + '\n' + source]:
            with self.subTest(source=changed), self.assertRaisesRegex(AssertionError, 'active definition'):
                definition(changed, HANDLER)

    def test_model_status_constants_and_sources_are_included(self):
        constants = (ROOT / 'code/__DEFINES/tgui.dm').read_text()
        for name, value in [('INTERACTIVE', 2), ('UPDATE', 1), ('DISABLED', 0), ('CLOSE', -1)]:
            self.assertEqual(re.findall(r'^#define UI_' + name + r'\s+(-?\d+)$', constants, re.M), [str(value)])
        dme = (ROOT / 'roguetown.dme').read_text().replace('\\', '/')
        for path in (CRAFTING, PARENT, ROOT / 'code/__DEFINES/tgui.dm'):
            self.assertIn('#include "' + path.relative_to(ROOT).as_posix() + '"', dme)


if __name__ == '__main__':
    unittest.main()
