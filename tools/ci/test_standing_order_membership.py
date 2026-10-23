"""Source-bound standing-order lifecycle regression, not native DM execution.

Run: python3 tools/ci/test_standing_order_membership.py
Baseline: 225e99f8. A partial-settlement alert retains an order while daily or
event expiry can remove it from the active pool. The resumed call must reject
that stale order before scans, inventory consumption, payouts, or statistics.

The source binding accepts only the reviewed one-line entry-guard addition;
every other byte of fulfill_order and the relevant producers/callers is pinned.
The small positive-integer stock-only model illustrates that lifecycle contract.
It is not BYOND execution, suspended-UI testing, treasury integration, warehouse
coverage, or a full economy simulation. Payouts below are model results only.
"""

from dataclasses import dataclass, field
import hashlib
import math
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
ECONOMY = ROOT / 'code/controllers/subsystem/rogue/economy/economy.dm'
UI = ROOT / 'code/modules/roguetown/roguemachine/steward/steward_trade_tgui.dm'
ORDERS = ROOT / 'tgui/packages/tgui/interfaces/StewardTrade/OrdersView.tsx'
DEFINES = ROOT / 'code/__DEFINES/economy/internal_trade_and_quests.dm'
PREFIX = '/datum/controller/subsystem/economy/proc/'
FULFILL = 'fulfill_order(mob/user, datum/standing_order/order, partial = FALSE)'
OLD = '\tif(!order || order.is_fulfilled)\n\t\treturn FALSE\n'
NEW = ('\tif(!order || order.is_fulfilled || !(order in GLOB.standing_order_pool))\n'
       '\t\treturn FALSE\n')
BOUND = {
    FULFILL: '0fa8ff26371fb0b46a4e52c98e068b06e8e421a209c9e22464b8e8ccf51c960b',
    'daily_tick()': '8ed5d0ec50a0810137e6b69d4be5157d98d9a6ef8cd2faa18725c7936d261c31',
    'expire_economic_events()': '8e2e9180c20a0905d4738f8b89bbea5494c42c16d8b613012ff730eebe377270',
    'scan_stockpile_availability(datum/standing_order/order, list/goods)': 'd619332138fedc5a359601ce67d341f961600ae25320118bf4262a84e574e1bf',
    'consume_stockpile_payload(list/avail)': '6db14f2d1876b92331a02a34e823ae3872974b35174abf463f22071c12f496b6',
    'compute_good_unit_payout(datum/standing_order/order, good_id)': '293ce58a032b891a2ea5bf3648ed015d514360e1a21862b2068e2c7c3f8f50ff',
    'compute_order_payout(datum/standing_order/order, datum/economic_region/region)': 'bd2d357d727a5f7e02d86707dd8f5dd0d69028db63676b8510167f154def207a',
    'instantiate_standing_order(template, datum/economic_region/region, order_size_mult, petitioned = FALSE)': '58db54dc9fbc4c24b2904e9ed78d02e71557a4ddbadb7b1789be18602508a53e',
    'spawn_urgent_for_event(datum/economic_event/E)': '9b039d3a7d42ff5190f0c1fd674facf391323b9bec7cf7685159b078d7e35e03',
}
CALLSITE_SHA = '8be49351dc96ece3d5c3a8b9a30358799adf0af1e2e0a066355d3c95d9700fb9'
ORDERS_SHA = 'eb83a7b1383133458cd3326bf2fe99215411be2a175cbd21c2ad806c1b6e5cb7'
PROMPT = 'needs_partial_prompt'


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def definition(source, name):
    matches = re.findall('^' + re.escape(PREFIX + name)
                         + r'\n(.*?)(?=^/|\Z)', source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing/duplicate reviewed definition: ' + name)
    return matches[0].rstrip('\n') + '\n'


def bind_source():
    source = ECONOMY.read_text()
    bodies = {name: definition(source, name) for name in BOUND}
    body = bodies[FULFILL]
    # This must be the first executable statement, before even region lookup.
    if body.startswith(NEW):
        guarded = True
        bodies[FULFILL] = OLD + body[len(NEW):]
    elif body.startswith(OLD):
        guarded = False
    else:
        raise AssertionError('Unreviewed standing-order entry guard')
    for name, expected in BOUND.items():
        if sha(bodies[name]) != expected:
            raise AssertionError('Unreviewed producer/consumer source: ' + name)
    ui = UI.read_text()
    start = ui.index('\t\t\tvar/datum/standing_order/O = locate(params["ref"]) in GLOB.standing_order_pool')
    end = ui.index('\n\t\t\t\tif(islist(result)', start)
    caller = ui[start:end]
    if sha(caller) != CALLSITE_SHA or sha(ORDERS.read_text()) != ORDERS_SHA:
        raise AssertionError('Unreviewed standing-order UI/caller source')
    defines = DEFINES.read_text()
    for literal in (
        '#define STANDING_ORDER_PARTIAL_THRESHOLD 0.50',
        '#define STANDING_ORDER_PARTIAL_PAYOUT_MULT 0.85',
        '#define STANDING_ORDER_FULFILL_NEEDS_PARTIAL_PROMPT "needs_partial_prompt"',
    ):
        if literal not in defines.splitlines():
            raise AssertionError('Unreviewed fulfillment constant: ' + literal)
    return guarded, bodies, caller


@dataclass(eq=False)
class Order:
    # Grain-only 40-unit rations is a legal generated mix; stock starts at 25.
    need: int = 40
    unit_value: int = 6
    expires: int = 2
    fulfilled: bool = False
    blockaded: bool = False


@dataclass
class World:
    stock: int = 25
    pool: list = field(default_factory=list)
    payout: int = 0
    expired: int = 0
    fulfilled: int = 0
    scans: int = 0

    def daily_expire(self, day):
        for order in self.pool[:]:
            if order.fulfilled or order.expires <= day:
                self.expired += not order.fulfilled
                self.pool.remove(order)

    def event_expire(self, order):
        # Matches the urgent-order removal tail, not event price/cooldown work.
        if order is not None and not order.fulfilled and order in self.pool:
            self.pool.remove(order)

    def settle(self, order, partial, guarded):
        if (order is None or order.fulfilled
                or (guarded and order not in self.pool)):
            return False
        if order.blockaded:
            return False
        self.scans += 1
        delivered = min(self.stock, order.need)
        if delivered >= order.need:
            status = 'full'
            payout = order.need * order.unit_value
        else:
            if delivered / order.need < .5:
                return False
            if not partial:
                return PROMPT
            status = 'partial'
            payout = math.floor(delivered * order.unit_value * .85)
        self.stock -= delivered
        self.payout += payout
        self.fulfilled += 1
        order.fulfilled = True
        if order in self.pool:
            self.pool.remove(order)
        return {'status': status, 'payout': payout}


class StandingOrderMembership(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.guarded, cls.bodies, cls.caller = bind_source()

    def setUp(self):
        self.order = Order()
        self.world = World(pool=[self.order])

    def settle(self, partial=False):
        return self.world.settle(self.order, partial, self.guarded)

    def assert_unchanged_rejection(self, order, partial=True):
        before = (self.world.stock, self.world.payout, self.world.expired,
                  self.world.fulfilled, self.world.scans, self.world.pool[:])
        self.assertIs(self.world.settle(order, partial, self.guarded), False)
        after = (self.world.stock, self.world.payout, self.world.expired,
                 self.world.fulfilled, self.world.scans, self.world.pool[:])
        self.assertEqual(after, before)

    def test_source_bound_caller_keeps_reference_across_alert(self):
        self.assertLess(self.caller.index('locate('), self.caller.index('alert('))
        self.assertLess(self.caller.index('alert('),
                        self.caller.index('fulfill_order(usr, O, TRUE)'))
        self.assertEqual(self.caller.count('GLOB.standing_order_pool'), 1)
        jsx = ORDERS.read_text()
        self.assertIn("onFulfill={() => act('fulfill_order', { ref: order.ref })}", jsx)
        self.assertIn('onClick={props.onFulfill}', jsx[jsx.index('  if (o.can_partial) {'):])
        calls = []
        for path in (ROOT / 'code').rglob('*.dm'):
            for line in path.read_text(errors='replace').splitlines():
                if 'fulfill_order(' in line and not line.startswith('/'):
                    calls.append((path, line.strip()))
        self.assertEqual(calls, [
            (UI, 'var/result = SSeconomy.fulfill_order(usr, O, wants_partial)'),
            (UI, 'var/list/partial_result = SSeconomy.fulfill_order(usr, O, TRUE)'),
        ])

    def test_daily_expiry_rejects_retained_confirmation(self):
        self.assertEqual(self.settle(), PROMPT)
        held = self.order
        self.world.daily_expire(2)
        self.assertFalse(held.fulfilled)
        self.assertEqual(self.world.expired, 1)
        self.assert_unchanged_rejection(held)

    def test_event_expiry_rejects_retained_urgent_confirmation(self):
        self.assertEqual(self.settle(), PROMPT)
        held = self.order
        self.world.event_expire(held)
        self.assertFalse(held.fulfilled)
        self.assert_unchanged_rejection(held)

    def test_removed_order_rejected_in_both_modes_before_scanning(self):
        self.world.pool.remove(self.order)
        for partial in (False, True):
            with self.subTest(partial=partial):
                self.assert_unchanged_rejection(self.order, partial)

    def test_removed_order_cannot_take_full_settlement_path(self):
        self.world.pool.remove(self.order)
        self.world.stock = 40
        self.assert_unchanged_rejection(self.order)

    def test_membership_is_datum_identity_not_equal_fields(self):
        self.assert_unchanged_rejection(Order())

    def test_null_is_rejected_without_work(self):
        self.assert_unchanged_rejection(None)

    def test_fulfilled_is_rejected_even_if_still_in_pool(self):
        self.order.fulfilled = True
        self.assert_unchanged_rejection(self.order)

    def test_active_partial_prompt_does_not_mutate_inventory(self):
        self.assertEqual(self.settle(), PROMPT)
        self.assertEqual((self.world.stock, self.world.payout, self.world.fulfilled), (25, 0, 0))
        self.assertIn(self.order, self.world.pool)

    def test_active_partial_settlement_is_preserved(self):
        self.assertEqual(self.settle(True), {'status': 'partial', 'payout': 127})
        self.assertEqual((self.world.stock, self.world.payout, self.world.fulfilled), (0, 127, 1))
        self.assertNotIn(self.order, self.world.pool)

    def test_active_full_settlement_is_preserved(self):
        self.world.stock = 43
        self.assertEqual(self.settle(), {'status': 'full', 'payout': 240})
        self.assertEqual((self.world.stock, self.world.payout, self.world.fulfilled), (3, 240, 1))

    def test_existing_blockade_and_coverage_rejections_are_preserved(self):
        self.order.blockaded = True
        self.assert_unchanged_rejection(self.order)
        self.order.blockaded = False
        self.world.stock = 19
        self.assertIs(self.settle(True), False)
        self.assertEqual((self.world.stock, self.world.payout, self.world.fulfilled), (19, 0, 0))

    def test_success_during_confirmation_cannot_be_settled_twice(self):
        self.assertEqual(self.settle(), PROMPT)
        self.assertEqual(self.settle(True)['status'], 'partial')
        self.assert_unchanged_rejection(self.order)


if __name__ == '__main__':
    unittest.main()
