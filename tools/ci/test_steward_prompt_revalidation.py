"""Source-bound setter authorization regression; never executes DM.

Run: python3 tools/ci/test_steward_prompt_revalidation.py
Use --source PATH to test an unchanged baseline without editing the checkout.
Baseline: 976aaf6f. The three exact setter bodies, entry gate, authority helpers,
key-lock producer and MarketView buttons are pinned below. Only the reviewed
post-prompt guard is accepted. This bounded Python model supplies topic/access
and lifecycle changes as fixtures. It is not a DM interpreter, native input/UI
suspension test, scheduler simulation, or proof of object-lifetime behavior.
Numeric fixtures are already parsed; text2num parsing is source-bound only.
"""

import argparse
from dataclasses import dataclass
from hashlib import sha256
import math
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
SOURCE = None
UI = 'code/modules/roguetown/roguemachine/steward/steward_trade_tgui.dm'
MARKET = 'tgui/packages/tgui/interfaces/StewardTrade/MarketView.tsx'
PREFIX = '/obj/structure/roguemachine/steward/'
SETTERS = {
    'set_buy_price': ('price', 'payout_price', 'automatic_price'),
    'set_sell_price': ('price', 'withdraw_price', 'automatic_price'),
    'set_stockpile_limit': ('lim', 'stockpile_limit', 'automatic_limit'),
}
GUARD = ('\t\t\t\t// input() yields: authority may have changed while the prompt was open.\n'
         '\t\t\t\tif(!user_can_act(usr) || (locked && !alderman_has_access(usr)) || SStreasury.is_in_receivership() || SScity_assembly?.is_alderman(usr))\n'
         '\t\t\t\t\treturn TRUE\n')
BASE_HASHES = {'set_buy_price': 'eaabec3e52d127beb2066dc0e0aafd7077b64db6f8eb1f9c8820a308baae5114',
 'set_sell_price': '70f0d11b81238f84dc5c1b584b13331b61376362ca47eff9522bde8fcb6cca7d',
 'set_stockpile_limit': 'c579e1729a4a858a83e382cb07c1cb16b59ea9a02d6a07e217495ce7299d5599'}  # Filled from reviewed baseline, never recalculated at test time.
CONTRACT_HASHES = {'entry_gate': '4147e4f7c542260d66e9d29ac30f4b08a3e8c672f68bf1f8ad30135d4f33721e',
 'topic_helper': '1d893fae11abe5ddc92d647a01a0cd43e388f4762380c4c1c791d59bd4d6f5ec',
 'warrant_helper': 'a12b4832cc47ec13a098128de36087e58e0d74ac6c1e8b55da332a9292d76d3a',
 'key_lock': 'f78fa30ce9dda2c09b742a1d7f5d22b6780d4c4c9204cd6aed094f8d5ab79333',
 'receivership': 'ff6dc6e98c4817c15edb39da6be75802d483d19fc994f323c9569f556043439d',
 'alderman': '2e7f56ffe88b0b3520c2c2f2a9c065aeb6279916e0883abe057ac2ae73a65de9',
 'set_buy_price_button': '9ddf432f4680f4daf161ad7aa430886a26e791d3b6019243c1641c5aae0189d4',
 'set_sell_price_button': '6a369b5726f9ee029c33b9a2f173d92fd8bf5dcc1ac5b874f00c069f845ee9bb',
 'set_stockpile_limit_button': 'f04a024f79f569b8a0071facd57958fa474e9b5e6262a71a63bd488f47ce47dc'}


def digest(text):
    return sha256(text.encode()).hexdigest()


def definition(source, header):
    matches = re.findall(r'^' + re.escape(header) + r'\n(.*?)(?=^/|\Z)', source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing/duplicate definition: ' + header)
    return matches[0].rstrip('\n') + '\n'


def setter(source, action):
    matches = re.findall(r'^\t\tif\("' + action + r'"\)\n(.*?)(?=^\t\tif\(|^/|\Z)', source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing/duplicate setter: ' + action)
    return matches[0]


def bind_setter(body, action):
    value, _, _ = SETTERS[action]
    guarded = GUARD in body
    baseline = body.replace(GUARD, '', 1) if guarded else body
    if digest(baseline) != BASE_HASHES[action]:
        raise AssertionError('Unreviewed setter control flow: ' + action)
    anchor = f'\t\t\tif(!isnull({value}))\n'
    if guarded and body != baseline.replace(anchor, anchor + GUARD, 1):
        raise AssertionError('Guard must precede both value and automatic-flag writes')
    return guarded


def contracts(source):
    market = (ROOT / MARKET).read_text()
    machine = (ROOT / 'code/modules/roguetown/roguemachine/steward/steward.dm').read_text()
    result = {
        'entry_gate': definition(source, PREFIX + 'ui_act(action, list/params)').split('\tswitch(action)\n')[0],
        'topic_helper': definition(source, PREFIX + 'proc/user_can_act(mob/user)'),
        'warrant_helper': definition(source, PREFIX + 'proc/alderman_has_access(mob/user)'),
        'key_lock': machine.split(PREFIX + 'attackby(obj/item/P, mob/user, params)\n')[1].split('\tif(istype(P, /obj/item/roguecoin/gilbranze))')[0],
        'receivership': definition((ROOT / 'code/modules/banking/bankruptcy.dm').read_text(), '/datum/controller/subsystem/treasury/proc/is_in_receivership()'),
        'alderman': definition((ROOT / 'code/controllers/subsystem/rogue/city_assembly/_subsystem.dm').read_text(), '/datum/controller/subsystem/city_assembly/proc/is_alderman(mob/user)'),
    }
    for action in SETTERS:
        buttons = re.findall(r'<button\b[^>]*?onClick=\{\(\) => act\(\'' + action + r"', \{ good_id: goodId \}\)\}", market, re.S)
        if len(buttons) != 1:
            raise AssertionError('Caller must send only good_id: ' + action)
        result[action + '_button'] = buttons[0]
        locked_list = source.split('GLOBAL_LIST_INIT(steward_trade_sequestration_locked_actions, list(')[1].split('))')[0]
        if f'"{action}"' not in locked_list:
            raise AssertionError('Setter must remain sequestration-locked')
    return result


@dataclass
class Model:
    topic: bool = True
    locked: bool = False
    alderman: bool = False
    warrant: bool = False
    receivership: bool = False
    exists: bool = True
    value: int = 15
    automatic: bool = True
    prompts: int = 0
    updates: int = 0
    dirty: int = 0

    def allowed(self):
        # Exact relevant helper policy: Alderman topic bypass and warrant lock
        # bypass exist, but these setters separately exclude all Aldermen.
        return ((self.alderman or self.topic)
                and (not self.locked or (self.alderman and self.warrant))
                and not self.receivership)

    def set_value(self, guarded, numeric=None, answer=None, during_prompt=None):
        if not self.allowed():
            return True
        self.dirty += 1  # Existing entry invalidation happens before setter.
        if self.alderman or not self.exists:
            return True
        value = numeric
        if value is None:
            self.prompts += 1
            if during_prompt:
                during_prompt(self)
            value = answer
        if value is not None:
            if guarded and (not self.allowed() or self.alderman):
                return True
            self.value = max(0, min(9999, math.floor(value)))
            self.automatic = False
        self.updates += 1
        return True


class StewardPromptRevalidation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (SOURCE or ROOT / UI).read_text()
        cls.bodies = {action: setter(cls.source, action) for action in SETTERS}
        cls.guarded = {action: bind_setter(body, action) for action, body in cls.bodies.items()}
        for name, body in contracts(cls.source).items():
            if digest(body) != CONTRACT_HASHES[name]:
                raise AssertionError('Unreviewed caller/authority contract: ' + name)

    def test_changed_authority_blocks_both_writes(self):
        for action in SETTERS:
            for changes in ({'locked': True}, {'topic': False}, {'receivership': True},
                            {'alderman': True, 'warrant': True},
                            {'alderman': True, 'warrant': True, 'locked': True}):
                with self.subTest(action=action, changes=changes):
                    model = Model()
                    model.set_value(self.guarded[action], answer=47,
                                    during_prompt=lambda m: m.__dict__.update(changes))
                    self.assertEqual((model.value, model.automatic), (15, True))
                    self.assertEqual((model.prompts, model.updates, model.dirty), (1, 0, 1))

    def test_baseline_demonstrates_stale_permission_write(self):
        for action, body in self.bodies.items():
            baseline = body.replace(GUARD, '', 1)
            model = Model()
            model.set_value(bind_setter(baseline, action), answer=47,
                            during_prompt=lambda m: setattr(m, 'locked', True))
            self.assertEqual((model.value, model.automatic), (47, False))

    def test_valid_prompt_and_numeric_fast_path_preserve_bounds(self):
        for action in SETTERS:
            for value, expected in [(-3, 0), (0, 0), (12.9, 12), (9999, 9999), (20000, 9999)]:
                for prompt in (True, False):
                    with self.subTest(action=action, value=value, prompt=prompt):
                        model = Model()
                        model.set_value(self.guarded[action], numeric=None if prompt else value, answer=value)
                        self.assertEqual((model.value, model.automatic), (expected, False))
                        self.assertEqual((model.prompts, model.updates), (int(prompt), 1))

    def test_cancel_preserves_value_flag_and_ui_update_even_if_relocked(self):
        for guarded in self.guarded.values():
            model = Model()
            model.set_value(guarded, answer=None, during_prompt=lambda m: setattr(m, 'locked', True))
            self.assertEqual((model.value, model.automatic, model.prompts, model.updates), (15, True, 1, 1))

    def test_initial_rejections_and_unknown_good_never_prompt_or_mutate(self):
        for guarded in self.guarded.values():
            for kwargs in ({'locked': True}, {'topic': False}, {'receivership': True},
                           {'alderman': True, 'warrant': True},
                           {'locked': True, 'warrant': True}, {'exists': False}):
                model = Model(**kwargs)
                model.set_value(guarded, answer=47)
                self.assertEqual((model.value, model.automatic, model.prompts, model.updates), (15, True, 0, 0))

    def test_binding_rejects_missing_predicate_misplaced_guard_and_changed_setter(self):
        for action, body in self.bodies.items():
            baseline = body.replace(GUARD, '', 1)
            value, field, _ = SETTERS[action]
            anchor = f'\t\t\tif(!isnull({value}))\n'
            fixed = baseline.replace(anchor, anchor + GUARD, 1)
            for mutant in (fixed.replace(' || SScity_assembly?.is_alderman(usr)', ''),
                           fixed.replace(' || SStreasury.is_in_receivership()', ''),
                           fixed.replace('!user_can_act(usr) || ', ''),
                           fixed.replace(' || (locked && !alderman_has_access(usr))', ''),
                           fixed.replace(GUARD, GUARD.replace('return TRUE', 'return FALSE')),
                           fixed.replace(anchor + GUARD, GUARD + anchor),
                           fixed.replace('9999', '999'),
                           fixed.replace('= FALSE', '= TRUE'), fixed + GUARD):
                with self.subTest(action=action):
                    with self.assertRaises(AssertionError):
                        bind_setter(mutant, action)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--source', type=Path)
    args, remaining = parser.parse_known_args()
    SOURCE = args.source
    unittest.main(argv=[__file__, *remaining])
