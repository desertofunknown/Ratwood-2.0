"""Source-bound shared-handler regression, not a native DM/scheduler test.

Run: python3 tools/ci/test_region_trade_receivership.py
--source PATH accepts the unchanged steward.dm baseline (be34163d); the two
current-state blocking tests must fail there. Exact reviewed handler bodies and
untouched surrounding contracts are pinned; only the boundary guard is allowed.
The concurrent A checkpoint adds a fulfillment authority guard. This B suite
checks only fulfillment's receivership exemption, not its full historical body;
the partial-fulfillment suite owns that body and continuation contract.
The small model tests dispatch and accounting isolation with parsed integer
fixtures and injected downstream effects, NOT pricing, mint/debt recovery,
BYOND input suspension, the complete economy, or object lifetime semantics.
Bankruptcy/recovery are external state fixtures. Snapshots are taken AFTER those
fixtures run, never before the purse/debt mutations caused by bankruptcy itself.
"""
import argparse
from copy import deepcopy
from dataclasses import dataclass, field
from hashlib import sha256
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = None
MACHINE = 'code/modules/roguetown/roguemachine/steward/steward.dm'
UI = 'code/modules/roguetown/roguemachine/steward/steward_trade_tgui.dm'
PREFIX = '/obj/structure/roguemachine/steward/proc/'
SIDES = ('import', 'export')
GUARD = ('\t// Region prompts yield; check current receivership before committing trade.\n'
         '\tif(SStreasury.is_in_receivership())\n\t\treturn\n')
ANCHOR = '\tvar/datum/economic_region/region = GLOB.economic_regions[region_id]\n'
BASE_HASHES = {'export': '34d28019704476445edbbf4397c9990686eb2d42c97876748d76ac8a2595e9a6',
 'import': '42bb91af83680b984d95bad613895c01089b7bb3cb12d604c598f34875a1cefc'}
FILE_HASHES = {'code/__HELPERS/time.dm': '4231d931d8f097c083814cc07e516a4ce513f6bdf5a3cadb851b7947e340e5f8',
 'code/controllers/subsystem/nightshift.dm': '9a1b6ee4ac8d3bf54e4695e4150bf04d071a7b60fdc3281e60f019a40fcf4d01',
 'code/controllers/subsystem/rogue/economy/auto_import.dm': 'ea39e80789d6014f95f3988aedc2493fb1091870bb94d6f184a4d7b613f56639',
 'code/controllers/subsystem/rogue/economy/economy.dm': '9eb31d018266b67bb8df80e20b2c1784430ea6da1337a21262f296d691691acb',
 'code/controllers/subsystem/rogue/treasury.dm': '3232881e182557a49b7a21c3dcabea289832a92860b43fa063cab60c4afcbd6d',
 'code/modules/banking/bankruptcy.dm': 'c87403fba6b007639fc0f29912a1fd3fc4404a183d4212f265a80183a84eec42',
 'code/modules/banking/fund_api.dm': 'a550555a59f16c181f1334a075d000c7be00e6536f45b2cff467bb8e9629aeeb',
 'code/modules/roguetown/roguemachine/stockpile/stockpile.dm': '0b606d4adf2e6a973d274a4749d88bcc63ae5719a043bc849dcfc55c7a58c536',
 'code/modules/roguetown/roguemachine/stockpile/withdraw_tab.dm': '7fcfd5a9fc37b4f18d8f24e182efd2d84a652583557e521e8c9689f99704f60d'}
CONTRACT_HASHES = {'export_surplus_category': '3f4691f32fb600239c7abba3fa56850ac9905d524236439dec89917b0c09712c',
 'alderman_has_access': 'a12b4832cc47ec13a098128de36087e58e0d74ac6c1e8b55da332a9292d76d3a',
 'legacy_import': '7274db1362a2d26ac7c5c7d1526badd877ee47ddf104928a03970018bfb012c4',
 'region_export': 'c16f27880caf666ff3df7b5aac6b005a18bdd27bb95472ede2e2857af1a24e43',
 'region_import': 'ec9c1639642a9bb155e4b34259442348c2c3ec8950b35bb7dd8b0165c148b927',
 'user_can_act': '1d893fae11abe5ddc92d647a01a0cd43e388f4762380c4c1c791d59bd4d6f5ec'}


def digest(source):
    return sha256(source.encode()).hexdigest()


def definition(source, header):
    matches = re.findall(r'^' + re.escape(header) + r'\n(.*?)(?=^/|\Z)', source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing/duplicate definition: ' + header)
    return matches[0].rstrip('\n') + '\n'


def handler(source, side):
    return definition(source, PREFIX + f'handle_trade_{side}(mob/user, region_id, good_id, quantity)')


def bind(body, side):
    guarded = GUARD in body
    baseline = body.replace(GUARD, '', 1) if guarded else body
    if digest(baseline) != BASE_HASHES[side]:
        raise AssertionError('Unreviewed handler: ' + side)
    if guarded and body != baseline.replace(ANCHOR, GUARD + ANCHOR, 1):
        raise AssertionError('Guard must follow authority gates and precede lookup: ' + side)
    return guarded


def contracts(machine, ui):
    result = {}
    for side in SIDES:
        result['region_' + side] = definition(machine, PREFIX + f'handle_trade_region_{side}(mob/user, region_id)')
    for name in ('user_can_act', 'alderman_has_access'):
        result[name] = definition(ui, PREFIX + name + '(mob/user)')
    # Legacy import and the separate bulk-export caller stay outside this fix.
    result['legacy_import'] = definition(machine, PREFIX + 'do_import(datum/crown_import/D, number)')
    result['export_surplus_category'] = re.findall(r'^\t\tif\("export_surplus_category"\)\n(.*?)(?=^\t\tif\(|^/|\Z)', ui, re.M | re.S)[0]
    return result


@dataclass
class Boundary:
    state: str = 'normal'
    topic: bool = True
    locked: bool = False
    alderman: bool = False
    region: bool = True
    good: bool = True
    importable: bool = True
    pace: int = 10
    stock_exists: bool = True
    ledger: dict = field(default_factory=lambda: dict(
        purse=1000, debt=0, stock=20, supply=10, demand=10, warrant=100,
        imports=0, exports=0, output=0, dirty=0, statistics=0,
        downstream_calls=0, announcements=0, sounds=0, ui_updates=0))

    def snapshot(self):
        return deepcopy(self.ledger)

    def authority(self):
        acting = self.alderman and self.ledger['warrant'] > 0
        return (self.topic or self.alderman) and (not self.locked or acting)

    def bankruptcy_fixture(self):
        # External transition fixture, not an emulation of enter_bankruptcy().
        self.state = 'bankruptcy'
        self.ledger.update(purse=500, debt=3000, dirty=4, statistics=3)

    def resume(self, side, guarded, quantity=2, selected=True):
        # Region helper cancellation/nonpositive checks occur before shared call.
        if not selected or quantity is None or quantity < 1:
            return
        if not self.authority() or (guarded and self.state == 'bankruptcy'):
            return
        if not self.region or not self.good or self.pace <= 0:
            return
        if side == 'export' and (not self.stock_exists or self.ledger['stock'] < quantity):
            return
        # Fixed quote fixture. No attempt to emulate price curves or bulk caps.
        total = 10 * quantity
        acting = self.alderman and self.ledger['warrant'] > 0
        if acting and self.ledger['warrant'] < total:
            return
        self.ledger['downstream_calls'] += 1
        success = not (side == 'import' and (not self.importable or self.ledger['purse'] < total))
        if success:
            # Inject a bounded successful downstream receipt, not a mint simulator.
            # Export receipts in this fixture credit purse, with no debt skim.
            # Debt remains a sentinel for early-return isolation, not recovery math.
            self.ledger['purse'] += -total if side == 'import' else total
            if self.stock_exists:
                self.ledger['stock'] += quantity if side == 'import' else -quantity
            self.ledger['supply' if side == 'import' else 'demand'] -= quantity
            self.ledger['imports' if side == 'import' else 'exports'] += total
            self.ledger['output'] += total
            for key in ('dirty', 'statistics', 'announcements', 'sounds'):
                self.ledger[key] += 1
            if acting:
                self.ledger['warrant'] -= total
        self.ledger['ui_updates'] += 1


class RegionTradeReceivership(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (SOURCE or ROOT / MACHINE).read_text()
        cls.ui = (ROOT / UI).read_text()
        cls.bodies = {side: handler(cls.source, side) for side in SIDES}
        cls.guarded = {side: bind(body, side) for side, body in cls.bodies.items()}
        for path, expected in FILE_HASHES.items():
            if digest((ROOT / path).read_text()) != expected:
                raise AssertionError('Unreviewed downstream/autonomous contract: ' + path)
        for name, body in contracts(cls.source, cls.ui).items():
            if digest(body) != CONTRACT_HASHES[name]:
                raise AssertionError('Unreviewed helper/caller contract: ' + name)

    def test_resumed_import_blocks_after_bankruptcy_mutations(self):
        self.check_bankruptcy('import')

    def test_resumed_export_blocks_after_bankruptcy_mutations(self):
        self.check_bankruptcy('export')

    def check_bankruptcy(self, side):
        for stage in ('good_prompt', 'quantity_prompt'):
            for alderman in (False, True):
                with self.subTest(stage=stage, alderman=alderman):
                    model = Boundary(alderman=alderman, locked=alderman)
                    self.assertTrue(model.authority())
                    # Both input yields lead to the same shared commit boundary.
                    model.bankruptcy_fixture()
                    before_resume = model.snapshot()
                    model.resume(side, self.guarded[side])
                    self.assertEqual(model.snapshot(), before_resume)

    def test_pinned_baseline_reaches_downstream_after_bankruptcy(self):
        for side, body in self.bodies.items():
            model = Boundary(alderman=True)
            model.bankruptcy_fixture()
            before_resume = model.snapshot()
            model.resume(side, bind(body.replace(GUARD, '', 1), side))
            self.assertEqual(model.ledger['downstream_calls'], 1)
            self.assertNotEqual(model.snapshot(), before_resume)

    def test_normal_arrears_and_recovered_current_state_remain_eligible(self):
        for side in SIDES:
            for state in ('normal', 'arrears', 'recovered'):
                for alderman in (False, True):
                    model = Boundary(alderman=alderman, locked=alderman)
                    if state == 'recovered':
                        model.bankruptcy_fixture()
                        # Recovery completed before resume: current state wins.
                        model.state = 'normal'
                        model.ledger.update(purse=900, debt=0)
                    else:
                        model.state = state
                    baseline = deepcopy(model)
                    model.resume(side, self.guarded[side])
                    baseline.resume(side, False)
                    self.assertEqual(model.snapshot(), baseline.snapshot())
                    self.assertEqual(model.ledger['downstream_calls'], 1)
                    self.assertEqual(model.ledger['warrant'], 80 if alderman else 100)

    def test_cancellation_and_nonpositive_region_quantity_do_nothing(self):
        for side in SIDES:
            for quantity, selected in ((None, True), (0, True), (-1, True), (2, False)):
                model = Boundary()
                before = model.snapshot()
                model.resume(side, self.guarded[side], quantity, selected)
                self.assertEqual(model.snapshot(), before)

    def test_existing_authority_region_good_stock_fund_warrant_policies(self):
        cases = [dict(topic=False), dict(locked=True), dict(region=False),
                 dict(good=False), dict(pace=0), dict(importable=False),
                 dict(stock_exists=False), dict(alderman=True)]
        for side in SIDES:
            for changes in cases:
                for ledger_change in ({}, {'purse': 0}, {'stock': 0}, {'warrant': 10}, {'warrant': 0}):
                    current = Boundary(**changes)
                    current.ledger.update(ledger_change)
                    baseline = deepcopy(current)
                    current.resume(side, self.guarded[side])
                    baseline.resume(side, False)
                    self.assertEqual(current.snapshot(), baseline.snapshot())

    def test_guard_mutations_and_reordering_are_rejected(self):
        for side, body in self.bodies.items():
            baseline = body.replace(GUARD, '', 1)
            fixed = baseline.replace(ANCHOR, GUARD + ANCHOR, 1)
            for mutant in (fixed.replace('is_in_receivership()', 'is_in_arrears_or_worse()'),
                           fixed.replace(GUARD + ANCHOR, ANCHOR + GUARD),
                           GUARD + baseline, fixed + GUARD,
                           fixed.replace('\tif(!user_can_act(user))\n\t\treturn\n', ''),
                           fixed.replace('locked && !is_alderman_acting', 'locked'),
                           fixed.replace(GUARD, GUARD.replace('\t\treturn', '\t\treturn TRUE'))):
                with self.assertRaises(AssertionError):
                    bind(mutant, side)

    def test_only_manual_ui_shared_callers_and_fulfillment_is_exempt(self):
        locked = self.ui.split('GLOBAL_LIST_INIT(steward_trade_sequestration_locked_actions, list(')[1].split('))')[0]
        self.assertNotIn('"fulfill_order"', locked)
        fulfillment = re.findall(r'^\t\tif\("fulfill_order"\)\n(.*?)(?=^\t\tif\(|^/|\Z)', self.ui, re.M | re.S)
        self.assertEqual(len(fulfillment), 1)
        self.assertNotIn('is_in_receivership', fulfillment[0])
        for side in SIDES:
            self.assertIn(f'"trade_{side}"', locked)
            self.assertIn(f'"trade_region_{side}"', locked)
            for region in (False, True):
                symbol = 'handle_trade_' + ('region_' if region else '') + side
                calls = []
                for path in (ROOT / 'code').rglob('*.dm'):
                    for line in path.read_text(errors='replace').splitlines():
                        if re.match(r'^\s*(?:var/[^=]+ = )?' + symbol + r'\(', line):
                            calls.append((path.relative_to(ROOT).as_posix(), line.strip()))
                expected = [(UI, f'{symbol}(usr, params["region_id"])')] if region else [
                    (UI, f'{symbol}(usr, params["region_id"], params["good_id"], params["quantity"])'),
                    (MACHINE, f'{symbol}(user, region_id, good_id, quantity)')]
                self.assertCountEqual(calls, expected)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--source', type=Path)
    args, remaining = parser.parse_known_args()
    SOURCE = args.source
    unittest.main(argv=[__file__, *remaining])
