"""Source-bound direct-import quote equivalence and operation-count regression.

Run: python3 tools/ci/test_direct_import_quote_reuse.py
Baseline: 32cfd26. This is a bounded Python model, NOT native DM execution,
gameplay, payment verification, or a timing benchmark. Exact source hashes bind
the selector, pricing helper, both quote callers, and both stock UI callers.
The only accepted production change reuses the selector's integral unit_price.
All other withdraw_tab.dm bytes, including action guards and settlement, remain
identical. Fixtures use ordinary finite numbers, not exotic numeric semantics
or an emulation of BYOND single-precision arithmetic. One-argument DM round()
floors, not Python's banker rounding: https://www.byond.com/docs/ref/#/proc/round
The mathematical equivalence needs only deterministic evaluation and the
idempotence of rounding the helper's already-integral result.
"""

from collections import Counter
from dataclasses import asdict, dataclass, field
import hashlib
from itertools import product
import math
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
WITHDRAW = 'code/modules/roguetown/roguemachine/stockpile/withdraw_tab.dm'
ECONOMY = 'code/controllers/subsystem/rogue/economy/economy.dm'
STOCK_UI = 'code/modules/roguetown/roguemachine/stockpile/stockpile.dm'
WITHDRAW_UI = 'code/modules/roguetown/roguemachine/withdraw.dm'
BASE_FILE_SHA = '0ee66e214eb725a13248f317f2c2853d767ba4c3a2b82d7d2fc8b66c7bc89d7b'
OLD = ('\tvar/starting_index = max(0, daily_pace - produces_today)\n'
       '\tvar/unit_cost = SSeconomy.compute_import_unit_price(D.trade_good_id, region, starting_index + 1)\n')
NEW = '\tvar/unit_cost = best["unit_price"]\n'
QUOTE = '/datum/withdraw_tab/proc/get_direct_import_quote(datum/roguestock/D)'
SELECTOR = '/datum/controller/subsystem/economy/proc/get_best_import_region(good_id, exclude_blockaded = TRUE)'
PRICER = '/datum/controller/subsystem/economy/proc/compute_import_unit_price(good_id, datum/economic_region/region, unit_index)'
BOUND = {
    (ECONOMY, SELECTOR): '3fb087fee5dea9f9f0539a897379136792a446562ebafd16cfbd524a1120a0d0',
    (ECONOMY, PRICER): 'c118974e1a3c74c4e755b35143fb2f4e342a135a87d02551829f1dfcc31ebae2',
    (WITHDRAW, '/datum/withdraw_tab/proc/direct_import_price(datum/roguestock/D)'): 'dcdbd6606c9687521dd81a65eaf9085b000d512ceb5dc5c79e3cf8ab901b6e8c',
    (WITHDRAW, '/datum/withdraw_tab/proc/get_stock_rows(include_export_prices = FALSE)'): '0afde67d688935bac4b233a050edd91b0d0f8a6dbdb1b1bbbee0dc19a51d1f6b',
    (WITHDRAW, '/datum/withdraw_tab/proc/do_direct_import(datum/roguestock/D, mob/user)'): '0afd0cc393d27b417c536cac945277029cf56aeb09e58f998e0503c861cf9a0e',
    (STOCK_UI, '/obj/structure/roguemachine/stockpile/ui_data(mob/user)'): '3d16aabb1db6462e1a6198e9c1ca4249e8ad23adaf72dedf49c459a00ddebc20',
    (WITHDRAW_UI, '/obj/structure/roguemachine/withdraw/ui_data(mob/user)'): 'e83ad9c48537715a85c83370fcdf313006f833b9a092a8f887f3d7458ee6120b',
}


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def active(text):
    # A source locator, not a DM parser; preserve quoted strings and line breaks.
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda m: '\n' * m[0].count('\n')
                  if m[0].startswith(('//', '/*')) else m[0], text, flags=re.S)


def definition(text, header):
    pattern = '^' + re.escape(header) + r'\n(.*?)(?=^/|\Z)'
    matches = re.findall(pattern, text, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing/duplicate reviewed definition: ' + header)
    return matches[0].rstrip('\n') + '\n'


def bind_source(source):
    """Interpret the current production expression, not a hardcoded fixed flag."""
    if source.count(NEW) == 1 and OLD not in source:
        legacy = source.replace(NEW, OLD)
        reuse = True
    elif source.count(OLD) == 1 and NEW not in source:
        legacy = source
        reuse = False
    else:
        raise AssertionError('Unreviewed import-quote expression')
    if sha(legacy) != BASE_FILE_SHA:
        raise AssertionError('Unreviewed quote guards, formulas, callers, or action source')
    return reuse


@dataclass
class Good:
    base: float = 11
    modifier: float = 1
    importable: bool = True


@dataclass(eq=False)
class Region:
    produces: dict = field(default_factory=lambda: {'iron': 4})
    today: dict = field(default_factory=lambda: {'iron': 4})
    blockaded: bool = False


@dataclass
class World:
    goods: dict = field(default_factory=lambda: {'iron': Good()})
    regions: dict = field(default_factory=lambda: {'first': Region()})
    active: bool = False
    unlocked: bool = False
    margin: float = 75


def price(world, good_id, region, index, calls):
    calls.append((good_id, region, index))
    good = world.goods.get(good_id)
    if good is None or region is None:
        return 0
    pace = max(1, region.produces.get(good_id, 0) or 0)
    overshoot = max(0, (index - pace) / pace)
    blockade = 2.0 if region.blockaded else 1.0
    return max(1, math.floor(good.base * (1 + overshoot * 1.0) * good.modifier * blockade))


def select(world, good_id, calls, exclude_blockaded=True):
    good = world.goods.get(good_id)
    if good is None or not good.importable:
        return None
    best_id, nominal_id = None, None
    best_price = nominal_price = math.inf
    best_blockaded = False
    for region_id, region in world.regions.items():
        pace = region.produces.get(good_id, 0) or 0
        if pace <= 0:
            continue
        today = region.today.get(good_id, 0) or 0
        unit = price(world, good_id, region, max(0, pace - today) + 1, calls)
        if unit < nominal_price:
            nominal_price, nominal_id = unit, region_id
        if exclude_blockaded and region.blockaded:
            continue
        if unit < best_price:
            best_price, best_id, best_blockaded = unit, region_id, region.blockaded
    if not best_id and nominal_id:
        best_id, best_price, best_blockaded = nominal_id, nominal_price, True
    if not best_id:
        return None
    result = dict(region_id=best_id, unit_price=math.floor(best_price),
                  is_blockaded=best_blockaded, fallback_region_id=None, fallback_price=None)
    if nominal_id and nominal_id != best_id:
        result.update(fallback_region_id=nominal_id, fallback_price=math.floor(nominal_price))
    return result


def quote(source, world, stock):
    reuse = bind_source(source)
    calls = []
    if stock is None or not stock.get('trade_good_id'):
        return None, calls, None
    good_id = stock['trade_good_id']
    best = select(world, good_id, calls)
    if not best or not best['region_id']:
        return None, calls, best
    region = world.regions.get(best['region_id'])
    if region is None:
        return None, calls, best
    pace = region.produces.get(good_id, 0) or 0
    today = region.today.get(good_id, 0) or 0
    if pace <= 0 or today <= 0:
        return None, calls, best
    unit = best['unit_price'] if reuse else price(world, good_id, region, max(0, pace - today) + 1, calls)
    margin = world.margin if world.active and world.unlocked else 50
    result = dict(region=region, unit_cost=unit, price=max(1, math.floor(unit * (100 + margin) / 100)))
    return result, calls, best


class DirectImportQuoteReuseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / WITHDRAW).read_text()
        bind_source(cls.source)
        cls.legacy = cls.source.replace(NEW, OLD)
        cls.fixed = cls.legacy.replace(OLD, NEW)
        cls.stock = {'trade_good_id': 'iron'}
        cls.bodies = {key: definition((ROOT / key[0]).read_text(), key[1]) for key in BOUND}
        for key, body in cls.bodies.items():
            if sha(body) != BOUND[key]:
                raise AssertionError('Unreviewed pricing/helper/caller body: ' + key[1])

    def test_only_two_calculation_lines_are_replaced(self):
        self.assertTrue(bind_source(self.source))
        self.assertEqual(self.source, self.fixed)
        self.assertEqual(self.source.encode(), (ROOT / WITHDRAW).read_bytes())
        self.assertEqual(sha(self.legacy), BASE_FILE_SHA)

    def test_current_source_eliminates_exactly_one_call_per_successful_quote(self):
        # This assertion fails on the actual baseline source: two calls vs one.
        world = World()
        result, current_calls, best = quote(self.source, world, self.stock)
        old_result, old_calls, old_best = quote(self.legacy, world, self.stock)
        self.assertEqual((result, best), (old_result, old_best))
        self.assertIs(result['region'], world.regions['first'])
        self.assertEqual(len(current_calls), 1)
        self.assertEqual(len(old_calls), 2)
        self.assertEqual(current_calls, old_calls[:-1])
        self.assertEqual(old_calls[-1], old_calls[0])

    def test_complete_quote_differential_finite_matrix(self):
        scenarios = [
            {},
            {'one': Region({}, {})},
            {'one': Region({'iron': 0}, {'iron': 4})},
            {'one': Region({'iron': 4}, {'iron': 0})},
            {'one': Region({'iron': 4}, {'iron': -1})},
            {'one': Region({'iron': 4}, {'iron': 1})},
            {'one': Region({'iron': 4}, {'iron': 8})},
            {'one': Region(blockaded=True)},
            {'one': Region(), 'two': Region()},
            {'one': Region(blockaded=True), 'two': Region()},
            {'one': Region(blockaded=True), 'two': Region(blockaded=True)},
            {'one': Region({'iron': 1}, {'iron': 0}), 'two': Region(blockaded=True)},
        ]
        checked = 0
        for regions, base, modifier, enabled, unlocked, margin in product(
                scenarios, (0.5, 1.25, 3.5, 11, 17.75), (0.5, 1, 1.25),
                (False, True), (False, True), (0, 25, 50, 75, 150)):
            world = World({'iron': Good(base, modifier)}, regions, enabled, unlocked, margin)
            before = asdict(world)
            old, old_calls, old_best = quote(self.legacy, world, self.stock)
            new, new_calls, new_best = quote(self.fixed, world, self.stock)
            self.assertEqual(new, old)
            self.assertEqual(new_best, old_best)  # Every fallback field included.
            self.assertEqual(asdict(world), before)
            if new is not None:
                self.assertIs(new['region'], regions[new_best['region_id']])
                self.assertEqual(new_calls, old_calls[:-1])
                self.assertEqual(new['unit_cost'], math.floor(new['unit_cost']))
                self.assertEqual(new['unit_cost'], new_best['unit_price'])
            else:
                self.assertEqual(new_calls, old_calls)
            checked += 1
        self.assertEqual(checked, 3600)

    def test_missing_goods_importability_and_empty_stock_keep_guards(self):
        for stock in (None, {}, {'trade_good_id': None}, {'trade_good_id': ''},
                      {'trade_good_id': 'missing'}, self.stock):
            for goods in ({}, {'iron': Good(importable=False)}):
                world = World(goods=goods)
                old = quote(self.legacy, world, stock)
                new = quote(self.fixed, world, stock)
                self.assertEqual(new, old)
                self.assertIsNone(new[0])
                self.assertEqual(new[1], [])

    def test_tie_order_blockade_fallback_fields_and_exhaustion(self):
        first, second = Region(), Region()
        world = World(regions={'first': first, 'second': second})
        self.assertIs(quote(self.fixed, world, self.stock)[0]['region'], first)
        world.regions = {'second': second, 'first': first}
        self.assertIs(quote(self.fixed, world, self.stock)[0]['region'], second)
        first.blockaded = second.blockaded = True
        self.assertEqual(select(world, 'iron', []), dict(region_id='second', unit_price=22,
            is_blockaded=True, fallback_region_id=None, fallback_price=None))
        # A cheap blockaded nominal producer is a fallback field, not the chosen region.
        first.blockaded = False
        first.produces['iron'], first.today['iron'] = 1, -3
        self.assertEqual(select(world, 'iron', []), dict(region_id='first', unit_price=55,
            is_blockaded=False, fallback_region_id='second', fallback_price=22))
        self.assertIsNone(quote(self.fixed, world, self.stock)[0])
        self.assertEqual(quote(self.fixed, world, self.stock), quote(self.legacy, world, self.stock))
        self.assertEqual(select(world, 'iron', [], exclude_blockaded=False), dict(
            region_id='second', unit_price=22, is_blockaded=True,
            fallback_region_id=None, fallback_price=None))

    def test_floor_and_margin_order_are_unchanged(self):
        world = World(goods={'iron': Good(3.5)})
        self.assertEqual(quote(self.fixed, world, self.stock)[0],
                         dict(region=world.regions['first'], unit_cost=3, price=4))
        world.active = world.unlocked = True
        world.margin = 25
        self.assertEqual(quote(self.fixed, world, self.stock)[0]['price'], 3)
        world.goods['iron'].base = 0.5
        self.assertEqual(quote(self.fixed, world, self.stock)[0]['unit_cost'], 1)

    def test_helpers_constants_and_read_only_non_yielding_source(self):
        for (path, header), body in self.bodies.items():
            self.assertEqual(sha(body), BOUND[path, header])
        # Exact body hashes are the primary proof. This allowlist explicitly exposes
        # every call in the quote/selector/helper closure: only builtins and two bound procs.
        expected = {
            QUOTE: {'if', 'get_best_import_region', 'max', 'round', 'list'},
            SELECTOR: {'if', 'for', 'max', 'compute_import_unit_price', 'round', 'list'},
            PRICER: {'if', 'max', 'round'},
        }
        for header, names in expected.items():
            text = self.fixed if header == QUOTE else (ROOT / ECONOMY).read_text()
            body = active(definition(text, header))
            self.assertEqual(set(re.findall(r'\b(\w+)\s*\(', body)), names)
            self.assertNotRegex(body, r'\b(sleep|spawn|input|waitfor|CHECK_TICK|SEND_SIGNAL)\b')
        constants = {'TRADE_ESCALATION_SLOPE': '1.0', 'BLOCKADE_IMPORT_MULT': '2.0',
                     'ROYAL_CUSTOM_DEFAULT_MARGIN': '50'}
        definitions = '\n'.join((ROOT / name).read_text() for name in (
            'code/__DEFINES/economy/internal_trade_and_quests.dm', 'code/__DEFINES/banking.dm'))
        for name, value in constants.items():
            self.assertEqual(re.findall(r'^#define ' + name + r'\s+([^\s]+)', definitions, re.M), [value])

    def test_included_definitions_and_all_quote_callers(self):
        includes = set(re.findall(r'^#include "([^\"]+\.dm)"', (ROOT / 'roguetown.dme').read_text(), re.M))
        names = {'get_direct_import_quote', 'direct_import_price', 'get_stock_rows',
                 'get_best_import_region', 'compute_import_unit_price'}
        definitions, calls, price_calls = Counter(), Counter(), Counter()
        for path in sorted(includes):
            path = path.replace('\\', '/')
            text = active((ROOT / path).read_bytes().decode('latin-1'))
            for line in text.splitlines():
                if not any(name in line for name in names):
                    continue
                # Detect absolute and relative proc headers, including subtype overrides.
                header = re.match(r'^\s*(/?[\w/]+)\(', line)
                if header and header[1].split('/')[-1] in names:
                    definitions[(path, header[1])] += 1
                else:
                    if re.search(r'\bcompute_import_unit_price\s*\(', line):
                        price_calls[(path, line.strip())] += 1
                    if any(re.search(r'\b' + name + r'\s*\(', line) for name in names - {'compute_import_unit_price'}):
                        calls[(path, line.strip())] += 1
        self.assertEqual(definitions, Counter({
            (WITHDRAW, QUOTE.split('(')[0]): 1,
            (WITHDRAW, '/datum/withdraw_tab/proc/direct_import_price'): 1,
            (WITHDRAW, '/datum/withdraw_tab/proc/get_stock_rows'): 1,
            (ECONOMY, SELECTOR.split('(')[0]): 1,
            (ECONOMY, PRICER.split('(')[0]): 1,
        }))
        self.assertEqual(calls, Counter({
            (WITHDRAW, 'var/list/best = SSeconomy.get_best_import_region(D.trade_good_id)'): 1,
            (WITHDRAW, 'var/list/quote = get_direct_import_quote(D)'): 2,
            (WITHDRAW, '"import_price" = direct_import_price(stock),'): 1,
            (STOCK_UI, 'data["stocks"] = withdraw_tab.get_stock_rows(include_export_prices = TRUE)'): 1,
            (WITHDRAW_UI, 'data["stocks"] = withdraw_tab.get_stock_rows(include_export_prices = FALSE)'): 1,
        }))
        steward = 'code/modules/roguetown/roguemachine/steward/'
        expected_price_calls = Counter({
            (steward + 'steward_trade_tgui.dm', 'var/price = SSeconomy.compute_import_unit_price(good_id, r, starting_index + 1)'): 1,
            (steward + 'steward.dm', '? SSeconomy.compute_import_unit_price(good_id, region, 1) \\'): 1,
            (steward + 'steward.dm', 'unit = SSeconomy.compute_import_unit_price(good_id, region, idx)'): 1,
            (steward + 'steward.dm', 'total += SSeconomy.compute_import_unit_price(good_id, region, starting_index + i)'): 1,
            ('code/controllers/subsystem/rogue/economy/auto_import.dm', 'var/unit_price = SSeconomy.compute_import_unit_price(good_id, candidate, starting_index + i)'): 1,
            (ECONOMY, 'total_cost += compute_import_unit_price(good_id, region, starting_index + i)'): 1,
            (ECONOMY, 'var/unit_price = compute_import_unit_price(good_id, region, starting_index + 1)'): 1,
        })
        if not bind_source(self.source):
            expected_price_calls[(WITHDRAW, OLD.splitlines()[1].strip())] = 1
        self.assertEqual(price_calls, expected_price_calls)

    def test_source_contract_rejects_guard_price_selector_and_action_mutations(self):
        for old, new in [
            ('if(daily_pace <= 0 || produces_today <= 0)', 'if(daily_pace <= 0)'),
            ('var/unit_cost = best["unit_price"]', 'var/unit_cost = best["fallback_price"]'),
            ('round(unit_cost * (100 + margin) / 100)', 'round(unit_cost * (100 + margin) / 100, 1)'),
            ('var/datum/economic_region/region =', 'var/datum/economic_region/other ='),
            ('D.stockpile_amount = max(0, D.stockpile_amount - 1)', 'D.stockpile_amount -= 2'),
        ]:
            self.assertIn(old, self.fixed)
            with self.assertRaises(AssertionError):
                bind_source(self.fixed.replace(old, new, 1))
        selector = self.bodies[ECONOMY, SELECTOR]
        self.assertNotEqual(sha(selector.replace('unit_price < best_price', 'unit_price <= best_price')),
                            BOUND[ECONOMY, SELECTOR])


if __name__ == '__main__':
    unittest.main()
