"""Source-bound bulk authorization regression model; never executes DM.

Run: python3 tools/ci/test_steward_bulk_prompt_revalidation.py
Use --source PATH for an unchanged baseline. Baseline: 849f6058260f5acbdc9a525158574f2b2f98996f.
Exact action bodies, actual omitted-number MarketView callers, entry gate,
authority helpers and independent key-lock producer are pinned. Only the exact
post-cancellation guard insertion is accepted. This is a bounded Python model,
not a DM interpreter, native prompt/UI suspension test, scheduler simulation or
proof of object lifetime. Numeric fixtures are already parsed; text2num is only
source-bound. Auto-price calculations are supplied fixture values, not a model
of the economy. Refresh call order, selection, both price writes and manual flags
are checked. The existing setter regression module supplies shared source readers
and independently pinned authority contracts; its tests are unchanged.
"""

import argparse
from copy import deepcopy
from dataclasses import dataclass, field
import math
from pathlib import Path
import re
import unittest

import test_steward_prompt_revalidation as reference

ROOT = reference.ROOT
SOURCE = None
ACTIONS = ('multiply_all_buy', 'multiply_all_sell', 'multiply_category_buy',
           'multiply_category_sell', 'set_autoexport_percentage')
GUARD = ''.join(line[1:] for line in reference.GUARD.splitlines(keepends=True))
BASE_HASHES = {'multiply_all_buy': '1921140ed060cc4b270d0e0052f7d7244ddc0c38b4420ea1b6bd3c269b99616a', 'multiply_all_sell': '9f8a1ce679bbfed96ad0cda9721a993ed335abccc6db2bb2a1e45fcbf6aa7259', 'multiply_category_buy': '21fc1c55292eb1e53d90a229aab3fc293569c827a8a711bb80e32cd8381f7eb9', 'multiply_category_sell': '20475503177f1d6842315a370962269aa713af329b50ded27e37cf72b3d2345c', 'set_autoexport_percentage': 'b21675ce2be4204cfa193094cef2fc5ddbe284770ac4ddaa4cbbfe7a7b88dbb8'}
CALLER_HASHES = {'multiply_all_buy': 'eca6dfe0897ed7000fa6844abc86fff82ccd46cf25b25a9af794e0b3b9f72bc0', 'multiply_all_sell': 'c8d170587b486899deb3563565532513501fa1be775819021ac5bb465ad3ed64', 'multiply_category_buy': 'd295b976312c687b8a354c22c78ebe15b8a43258db12f5e61567ce29a0fceb0b', 'multiply_category_sell': '3623d416ff5571c6fa3be53f288f6b6af538e20c33e4648c5546bd8e54523af4', 'set_autoexport_percentage': '53bf9ba0a0b0b0279ed4f1289a18ad021079988c5d81e7a64dcdd4db232ecc85'}
REFRESH_HASH = '87e3b884a977e4688068117dfa3832997c55f189d7d7105eaabfb9c25fd71732'


def anchor(action):
    condition = 'isnull(pct)' if action == 'set_autoexport_percentage' else 'isnull(mult) || mult <= 0'
    return f'\t\t\tif({condition})\n\t\t\t\treturn TRUE\n'


def bind(body, action):
    guarded = GUARD in body
    baseline = body.replace(GUARD, '', 1) if guarded else body
    if reference.digest(baseline) != BASE_HASHES[action]:
        raise AssertionError('Unreviewed action control flow: ' + action)
    if guarded and body != baseline.replace(anchor(action), anchor(action) + GUARD, 1):
        raise AssertionError('Guard must follow cancellation and precede refresh/write: ' + action)
    return guarded


def callers():
    market = (ROOT / reference.MARKET).read_text()
    result = {}
    for action in ACTIONS:
        matches = re.findall(r"act\('" + action + r"'(?:, \{.*?\})?\)", market, re.S)
        if len(matches) != 1:
            raise AssertionError('Missing/duplicate MarketView caller: ' + action)
        result[action] = matches[0]
    return result


def actual_params(action):
    # Exact caller hashes bind this mapping, including category_label but no
    # multiplier/pct. These are representative activeGroup values, not UI execution.
    return {'category': 'food', 'category_label': 'Food'} if 'category' in action else {}


@dataclass
class Stock:
    name: str
    good_id: str | None = 'grain'
    category: str | None = 'food'
    stockpile: bool = True
    buy: float = 15
    sell: float = 25
    automatic: bool = True
    refreshed_buy: float = 20
    refreshed_sell: float = 40


def stocks():
    return [Stock('selected-auto'), Stock('selected-manual', automatic=False),
            Stock('other-category', category='ore'),
            Stock('missing-id', good_id=None), Stock('missing-good', category=None),
            Stock('non-stockpile', stockpile=False)]


@dataclass
class Model:
    topic: bool = True
    locked: bool = False
    alderman: bool = False
    warrant: bool = False
    receivership: bool = False
    rows: list = field(default_factory=stocks)
    percentage: float = 0.75
    events: list = field(default_factory=list)
    prompts: int = 0
    updates: int = 0
    dirty: int = 0

    def allowed(self):
        return ((self.alderman or self.topic)
                and (not self.locked or (self.alderman and self.warrant))
                and not self.receivership)

    def act(self, action, guarded, params, answer=None, during_prompt=None):
        if not self.allowed():
            return True
        self.dirty += 1  # Existing entry invalidation, not a new post-prompt write.
        if self.alderman:
            return True
        category = params.get('category')
        if 'category' in action and not category:
            return True
        percentage = action == 'set_autoexport_percentage'
        value = params.get('pct' if percentage else 'multiplier')
        if value is None:
            self.prompts += 1
            if during_prompt:
                during_prompt(self)
            value = answer
        if value is None or (not percentage and value <= 0):
            return True
        if guarded and (not self.allowed() or self.alderman):
            return True
        if percentage:
            self.percentage = max(0, min(100, math.floor(value))) * 0.01
            self.events.append(('percentage', self.percentage))
        else:
            for row in self.rows:
                if not row.stockpile:
                    continue
                if 'category' in action and (not row.good_id or row.category != category):
                    continue
                self.events.append(('refresh', row.name))
                if row.automatic and row.good_id and row.category is not None:
                    row.buy, row.sell = row.refreshed_buy, row.refreshed_sell
                side = 'buy' if action.endswith('_buy') else 'sell'
                setattr(row, side, max(1, math.floor(getattr(row, side) * value)))
                self.events.append(('price', row.name, side))
                row.automatic = False
                self.events.append(('manual', row.name))
        self.updates += 1
        return True


TRANSITIONS = ({'locked': True}, {'topic': False}, {'receivership': True},
               {'alderman': True}, {'alderman': True, 'warrant': True},
               {'alderman': True, 'warrant': True, 'locked': True, 'topic': False})


class StewardBulkPromptRevalidation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (SOURCE or ROOT / reference.UI).read_text()
        cls.bodies = {a: reference.setter(cls.source, a) for a in ACTIONS}
        cls.guarded = {a: bind(body, a) for a, body in cls.bodies.items()}
        for name, body in reference.contracts(cls.source).items():
            if reference.digest(body) != reference.CONTRACT_HASHES[name]:
                raise AssertionError('Unreviewed caller/authority contract: ' + name)
        locked = cls.source.split('GLOBAL_LIST_INIT(steward_trade_sequestration_locked_actions, list(')[1].split('))')[0]
        for action, caller in callers().items():
            if reference.digest(caller) != CALLER_HASHES[action]:
                raise AssertionError('Unreviewed omitted-number caller: ' + action)
            if f'"{action}"' not in locked:
                raise AssertionError('Action must remain sequestration-locked: ' + action)
        refresh = reference.definition((ROOT / 'code/modules/roguetown/roguestock/_roguestock.dm').read_text(),
                                       '/datum/roguestock/proc/refresh_auto_price()')
        if reference.digest(refresh) != REFRESH_HASH:
            raise AssertionError('Unreviewed refresh policy')

    def test_real_omitted_numeric_callers_revalidate_before_any_refresh_or_write(self):
        for action in ACTIONS:
            for changes in TRANSITIONS:
                with self.subTest(action=action, changes=changes):
                    model = Model()
                    before = deepcopy(model.rows)
                    self.assertTrue(model.act(action, self.guarded[action], actual_params(action), answer=2,
                                              during_prompt=lambda m: m.__dict__.update(changes)))
                    self.assertEqual(model.rows, before)
                    self.assertEqual(model.percentage, 0.75)
                    self.assertEqual(model.events, [])
                    self.assertEqual((model.prompts, model.updates, model.dirty), (1, 0, 1))

    def test_pinned_baseline_exposes_each_stale_authority_transition(self):
        for action, body in self.bodies.items():
            guarded = bind(body.replace(GUARD, '', 1), action)
            self.assertFalse(guarded)
            for changes in TRANSITIONS:
                with self.subTest(action=action, changes=changes):
                    model = Model()
                    model.act(action, guarded, actual_params(action), answer=2,
                              during_prompt=lambda m: m.__dict__.update(changes))
                    self.assertTrue(model.events)
                    self.assertEqual((model.prompts, model.updates), (1, 1))
                    if action == 'set_autoexport_percentage':
                        self.assertEqual(model.percentage, 0.02)
                    else:
                        self.assertFalse(model.rows[0].automatic)

    def test_prompt_and_direct_numeric_path_preserve_results_and_baseline_parity(self):
        for action in ACTIONS:
            percentage = action == 'set_autoexport_percentage'
            values = (-5, 0, 12.9, 100, 150) if percentage else (0.01, 0.8, 1, 1.5, 20000)
            for value in values:
                for prompted in (False, True):
                    with self.subTest(action=action, value=value, prompted=prompted):
                        params = actual_params(action)
                        if not prompted:
                            params['pct' if percentage else 'multiplier'] = value
                        fixed, old = Model(), Model()
                        fixed.act(action, self.guarded[action], params, answer=value)
                        old.act(action, False, params, answer=value)
                        self.assertEqual(fixed, old)
                        self.assertEqual((fixed.prompts, fixed.updates, fixed.dirty), (int(prompted), 1, 1))
                        if percentage:
                            self.assertEqual(fixed.percentage, max(0, min(100, math.floor(value))) * 0.01)
                            self.assertEqual(fixed.rows, stocks())
                        else:
                            selected = range(2) if 'category' in action else range(5)
                            side = 'buy' if action.endswith('_buy') else 'sell'
                            expected_events = []
                            for i, row in enumerate(stocks()):
                                if i in selected:
                                    expected_events += [('refresh', row.name), ('price', row.name, side), ('manual', row.name)]
                                    if row.automatic and row.good_id and row.category is not None:
                                        row.buy, row.sell = row.refreshed_buy, row.refreshed_sell
                                    setattr(row, side, max(1, math.floor(getattr(row, side) * value)))
                                    row.automatic = False
                                self.assertEqual(fixed.rows[i], row)
                            self.assertEqual(fixed.events, expected_events)

    def test_cancel_and_nonpositive_multipliers_preserve_early_return(self):
        for action in ACTIONS:
            values = (None,) if action == 'set_autoexport_percentage' else (None, 0, -3)
            for value in values:
                for changes in ({}, *TRANSITIONS):
                    with self.subTest(action=action, value=value, changes=changes):
                        model = Model()
                        model.act(action, self.guarded[action], actual_params(action), answer=value,
                                  during_prompt=lambda m: m.__dict__.update(changes))
                        self.assertEqual((model.rows, model.percentage, model.events), (stocks(), 0.75, []))
                        self.assertEqual((model.prompts, model.updates, model.dirty), (1, 0, 1))
            if action != 'set_autoexport_percentage':
                for value in (0, -3):
                    model = Model()
                    model.act(action, self.guarded[action], {**actual_params(action), 'multiplier': value})
                    self.assertEqual((model.rows, model.events, model.prompts, model.updates), (stocks(), [], 0, 0))

    def test_initial_authority_rejections_and_missing_category(self):
        for action in ACTIONS:
            for kwargs in TRANSITIONS:
                model = Model(**kwargs)
                model.act(action, self.guarded[action], actual_params(action), answer=2)
                self.assertEqual((model.rows, model.percentage, model.events), (stocks(), 0.75, []))
                self.assertEqual((model.prompts, model.updates), (0, 0))
            if 'category' in action:
                model = Model()
                model.act(action, self.guarded[action], {}, answer=2)
                self.assertEqual((model.rows, model.events, model.prompts, model.updates), (stocks(), [], 0, 0))

    def test_binding_rejects_partial_misplaced_duplicate_guards_and_semantic_edits(self):
        for action, body in self.bodies.items():
            baseline = body.replace(GUARD, '', 1)
            fixed = baseline.replace(anchor(action), anchor(action) + GUARD, 1)
            mutations = [fixed.replace(predicate, '') for predicate in (
                '!user_can_act(usr) || ', ' || (locked && !alderman_has_access(usr))',
                ' || SStreasury.is_in_receivership()', ' || SScity_assembly?.is_alderman(usr)')]
            mutations += [fixed.replace(GUARD, GUARD.replace('return TRUE', 'return FALSE')),
                          fixed.replace(anchor(action) + GUARD, GUARD + anchor(action)), fixed + GUARD]
            if action == 'set_autoexport_percentage':
                mutations += [fixed.replace('pct * 0.01', 'pct * 0.1')]
            else:
                mutations += [fixed.replace('max(1,', 'max(0,'),
                              fixed.replace('A.refresh_auto_price()\n', ''),
                              fixed.replace('A.automatic_price = FALSE', 'A.automatic_price = TRUE')]
                if 'category' in action:
                    mutations += [fixed.replace('tg.category != category', 'tg.category == category')]
            for mutant in mutations:
                with self.subTest(action=action):
                    with self.assertRaises(AssertionError):
                        bind(mutant, action)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--source', type=Path)
    args, remaining = parser.parse_known_args()
    SOURCE = args.source
    unittest.main(argv=[__file__, *remaining])
