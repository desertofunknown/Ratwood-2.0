"""Source-bound loose-nail bundle refresh regression; never executes DM.

Run: python3 tools/ci/test_construction_bundle_refresh.py
Baseline: 34cb33f7 (construction.dm SHA-256 below).
Optional --source PATH reads a baseline/candidate construction.dm without editing
the checkout. Only the exact baseline or single-call correction is accepted.

This small hand translation checks integer nail amounts and the existing
update_bundle icon/grid contract, not native clicks, deletion, storage rendering,
fire behavior or gameplay. Messages, deletion, delegation and storage callbacks
are inert effect spies. Fuel uses an arbitrary positive firemod unit rather than
claiming to execute DM time macros. Whole-file normalization binds all unchanged
construction code; hashes bind the actual nail fixture and caller/consumer procs.
Bundle-to-bundle merging and initial two-nail creation are deliberately not
modeled or changed. The reproduced route starts from a refreshed pile, as created
by nail.attack_right, and adds one loose matching nail at a time.
"""

import argparse
from dataclasses import dataclass, field
import hashlib
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
SOURCE = None
CONSTRUCTION = 'code/game/objects/items/rogueitems/construction.dm'
NAILS = 'code/game/objects/items/rogueitems/nails.dm'
TETRIS = 'code/game/objects/items/storage/new_storage/tetris.dm'
BASE_SHA = '7b487d01732b830e78c33468f757e5c74f56a262980ebf200f3e8f26c184e7b3'
NAILS_SHA = '6ebbb947fac4f7830f26dff03bf4531d8b23ae02bc0adc9068c8281548dda1ef'
UPDATE = '/obj/item/construction/bundle/proc/update_bundle()'
ATTACK = '/obj/item/construction/bundle/attackby(obj/item/W, mob/living/user)'
REVERSE = '/obj/item/construction/attackby(obj/item/W, mob/living/user)'
BASE = '/obj/item/construction/bundle'
NAIL = BASE + '/nail'
OLD = '\t\t\tsrc.amount++\n\t\t\tqdel(W)\n'
NEW = '\t\t\tsrc.amount++\n\t\t\tupdate_bundle()\n\t\t\tqdel(W)\n'
BOUND = {
    (CONSTRUCTION, UPDATE): 'f7b2a4d86104ced95a0c0b4a6edbe980324b4af81968e272562ee330b36acf1d',
    (CONSTRUCTION, REVERSE): '8b94d8a4f1f5c3f9a88b5df73d8bdda07c179bd9c820c5eea8f4a8440305d0de',
    ('code/_onclick/item_attack.dm', '/obj/item/proc/melee_attack_chain(mob/user, atom/target, params)'): '2eb861c3385607bdef34a5fa301896e6ecc691d180dace832ffdce7201a51c1b',
    ('code/_onclick/click.dm', '/mob/proc/resolveAdjacentClick(atom/A,obj/item/W,params,used_hand)'): 'c79bb03dd3e76d53144c84a893e33b8ec5452e727e79b6b12d50cd4da3ca0c84',
    (TETRIS, '/datum/component/storage/concrete/slave_can_insert_object(datum/component/storage/slave, obj/item/storing, stop_messages = FALSE, mob/user, params, storage_click = FALSE)'): '19dd963c7f3321536c0dabccf27d0f0d82cdb33012f46c126a345f3dedca0bc9',
    (TETRIS, '/datum/component/storage/proc/grid_add_item(obj/item/storing, coordinates)'): '7a86b234add87bcb7506fabfd4435559d9fe1217942bcf2b679a0971bd81acc5',
}


def sha(value):
    return hashlib.sha256(value).hexdigest()


def definition(source, header):
    """Exact raw locator, not a general DM parser; hashes reject other bodies."""
    matches = re.findall('^' + re.escape(header) + r'\n(.*?)(?=^/|\Z)',
                         source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing/duplicate reviewed definition: ' + header)
    return matches[0].rstrip('\n') + '\n'


def bind_source(source):
    if source.count(NEW) == 1 and OLD not in source:
        baseline = source.replace(NEW, OLD, 1)
        fixed = True
    elif source.count(OLD) == 1 and NEW not in source:
        baseline = source
        fixed = False
    else:
        raise AssertionError('Unreviewed loose-material refresh placement')
    if sha(baseline.encode()) != BASE_SHA:
        raise AssertionError('Unreviewed construction bytes outside the one-call fix')
    return fixed, baseline


def value(source, header, key):
    body = definition(source, header)
    matches = re.findall(r'^\t(?:var/)?' + re.escape(key) + r' = (.+)$', body, re.M)
    if len(matches) != 1:
        raise AssertionError('Missing/duplicate fixture value: ' + key)
    raw = matches[0]
    return raw[1:-1] if raw.startswith('"') else int(raw)


@dataclass
class Pile:
    amount: int
    icon: str = ''
    width: int = 0
    height: int = 0
    firemod: int = 7  # Arbitrary units: only the existing multiplication is modeled.
    firefuel: int = 1
    in_storage: bool = False
    trace: list = field(default_factory=list)


class Model:
    def __init__(self, construction, nails):
        self.fixed, _ = bind_source(construction)
        if sha(nails.encode()) != NAILS_SHA:
            raise AssertionError('Unreviewed concrete nail fixture')
        self.limit = value(nails, NAIL, 'maxamount')
        self.icon1 = value(nails, NAIL, 'icon1')
        self.icon2 = value(nails, NAIL, 'icon2')
        self.icon1step = value(nails, NAIL, 'icon1step')
        self.icon2step = value(nails, NAIL, 'icon2step')
        self.base_width = value(construction, BASE, 'base_width')
        self.base_height = value(construction, BASE, 'base_height')
        self.per_increase = value(construction, BASE, 'items_per_increase')
        if sha(definition(construction, UPDATE).encode()) != BOUND[(CONSTRUCTION, UPDATE)]:
            raise AssertionError('Unreviewed updater')

    def refresh(self, pile):
        pile.trace.append('refresh')
        if pile.firefuel != 0:
            pile.firefuel = pile.firemod * pile.amount
        if pile.amount <= self.icon1step:
            pile.icon = self.icon1
        elif self.icon1step < pile.amount <= self.icon2step:
            pile.icon = self.icon2
        # Actual nail icon3 is null; tested amounts are 2 through maxamount=5.
        pile.width, pile.height = self.base_width, self.base_height
        for index in range(pile.amount // self.per_increase):
            if index % 2:
                pile.height += 32
            else:
                pile.width += 32
        if pile.in_storage:
            pile.trace.extend(('storage.update_item', 'storage.orient2hud'))

    def pile(self, amount):
        pile = Pile(amount)
        self.refresh(pile)
        pile.trace.clear()
        return pile

    def add_loose(self, pile, item='nail'):
        # Bundle merge is outside the hand translation. Reject rather than
        # accidentally treating a matching bundle as a loose item.
        if item == 'bundle':
            raise AssertionError('Bundle merge is outside this model')
        if pile.in_storage:
            return
        if item != 'nail':
            pile.trace.append('parent')
            return
        if pile.amount < self.limit:
            pile.trace.extend(('message:add', 'increment'))
            pile.amount += 1
            if self.fixed:
                self.refresh(pile)
            pile.trace.append('qdel:loose_nail')
        else:
            pile.trace.append('message:full')

    def reverse(self, pile):
        # Held pile used on an un-stored loose nail: existing reverse branch.
        if pile.amount < self.limit:
            pile.trace.append('increment')
            pile.amount += 1
            self.refresh(pile)
            pile.trace.extend(('message:add', 'qdel:loose_nail'))
        else:
            pile.trace.append('message:full')


def state(pile):
    return pile.amount, pile.icon, pile.width, pile.height, pile.firefuel


class ConstructionBundleRefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = SOURCE or ROOT / CONSTRUCTION
        cls.source = path.read_text()
        if cls.source.encode() != path.read_bytes():
            raise AssertionError('Unexpected source newline/encoding normalization')
        cls.fixed, cls.baseline = bind_source(cls.source)
        cls.nails = (ROOT / NAILS).read_text()
        cls.model = Model(cls.source, cls.nails)
        cls.legacy = Model(cls.baseline, cls.nails)

    def test_only_one_refresh_call_changes_production_source(self):
        self.assertTrue(self.fixed)
        self.assertEqual(self.source, self.baseline.replace(OLD, NEW, 1))
        self.assertEqual(sha(self.baseline.encode()), BASE_SHA)

    def test_current_icon_threshold_three_to_four(self):
        pile = self.model.pile(3)
        self.model.add_loose(pile)
        self.assertEqual((pile.amount, pile.icon), (4, 'nails'))

    def test_current_storage_threshold_four_to_five(self):
        pile = self.model.pile(4)
        self.model.add_loose(pile)
        self.assertEqual((pile.amount, pile.width, pile.height), (5, 64, 32))

    def test_existing_legacy_branch_reproduces_both_failures(self):
        pile = self.legacy.pile(3)
        self.legacy.add_loose(pile)
        self.assertEqual((pile.amount, pile.icon), (4, 'nails3'))
        pile = self.legacy.pile(4)
        self.legacy.add_loose(pile)
        self.assertEqual((pile.amount, pile.width, pile.height), (5, 32, 32))

    def test_non_threshold_addition_and_zero_fuel_guard(self):
        pile = self.model.pile(2)
        pile.firefuel = 0
        self.model.add_loose(pile)
        self.assertEqual(state(pile), (3, 'nails3', 32, 32, 0))

    def test_each_success_refreshes_once_between_increment_and_deletion(self):
        for amount in (2, 3, 4):
            with self.subTest(amount=amount):
                pile = self.model.pile(amount)
                self.model.add_loose(pile)
                self.assertEqual(pile.trace, ['message:add', 'increment', 'refresh', 'qdel:loose_nail'])
                self.assertEqual(state(pile), state(self.model.pile(amount + 1)))

    def test_full_pile_rejects_without_mutation_refresh_or_consumption(self):
        pile = self.model.pile(5)
        before = state(pile)
        self.model.add_loose(pile)
        self.assertEqual(state(pile), before)
        self.assertEqual(pile.trace, ['message:full'])

    def test_unrelated_types_delegate_without_local_changes(self):
        for item in ('stone', 'repairkit', 'null'):
            with self.subTest(item=item):
                pile = self.model.pile(3)
                before = state(pile)
                self.model.add_loose(pile, item)
                self.assertEqual(state(pile), before)
                self.assertEqual(pile.trace, ['parent'])

    def test_storage_guard_prevents_refresh_and_storage_callbacks(self):
        for amount in (2, 3, 4, 5):
            for item in ('nail', 'stone'):
                pile = self.model.pile(amount)
                pile.in_storage = True
                before = state(pile)
                self.model.add_loose(pile, item)
                self.assertEqual(state(pile), before)
                self.assertEqual(pile.trace, [])
        # Prove the callback spy is live, not absent from the model.
        self.model.refresh(pile)
        self.assertEqual(pile.trace, ['refresh', 'storage.update_item', 'storage.orient2hud'])

    def test_reverse_interaction_matches_state_and_existing_action_counts(self):
        for amount in (2, 3, 4, 5):
            with self.subTest(amount=amount):
                forward, reverse = self.model.pile(amount), self.model.pile(amount)
                self.model.add_loose(forward)
                self.model.reverse(reverse)
                self.assertEqual(state(forward), state(reverse))
                self.assertCountEqual(forward.trace, reverse.trace)

    def test_unchanged_effects_and_bundle_merge_are_not_reinterpreted(self):
        for amount in (2, 3, 4, 5):
            current, old = self.model.pile(amount), self.legacy.pile(amount)
            self.model.add_loose(current)
            self.legacy.add_loose(old)
            self.assertEqual(current.amount, old.amount)
            self.assertEqual([effect for effect in current.trace if effect != 'refresh'], old.trace)
        with self.assertRaises(AssertionError):
            self.model.add_loose(self.model.pile(2), 'bundle')

    def test_source_callers_consumers_reverse_path_and_collection_are_bound(self):
        for (path, header), expected in BOUND.items():
            source = self.source if path == CONSTRUCTION else (ROOT / path).read_text()
            self.assertEqual(sha(definition(source, header).encode()), expected, header)
        self.assertEqual(sha(self.nails.encode()), NAILS_SHA)
        reverse = definition(self.source, REVERSE)
        self.assertIn('\t\t\t\tB.amount++\n\t\t\t\tB.update_bundle()\n', reverse)
        self.assertIn('B.amount = clamp(stackcount, 2, 5)\n\t\t\t\tB.update_bundle()', self.nails)
        attack = definition(self.source, ATTACK)
        self.assertTrue(attack.startswith('\tif(item_flags & IN_STORAGE)\n\t\treturn\n'))
        self.assertNotRegex(attack, r'\b(?:sleep|do_after|move_after)\(')

    def test_concrete_type_and_no_unreviewed_subtype_overrides(self):
        # Scan only actual DME inputs, not excluded source trees. This deliberately
        # fails on new bundle subtypes/aliases so their semantics receive review.
        includes = re.findall(r'^#include "([^"\n]+\.dm)"',
                              (ROOT / 'roguetown.dme').read_text(), re.M)
        declarations = []
        for name in includes:
            path = ROOT / name.replace('\\', '/')
            # Only ASCII type declarations are inspected here. Latin-1 preserves
            # all bytes in unrelated included files with legacy text encodings.
            text = self.source if path == ROOT / CONSTRUCTION else path.read_bytes().decode('latin-1')
            self.assertNotRegex(text, r'(?m)^\s*parent_type\s*=\s*/obj/item/construction(?:/|\s|$)')
            declarations.extend(re.findall(r'^(/obj/item/construction/bundle[^\n]*)$', text, re.M))
        self.assertCountEqual(declarations, [
            BASE, NAIL, ATTACK, UPDATE,
            BASE + '/use(used)', BASE + '/attack_right(mob/user)',
            BASE + '/attack_turf(turf/T, mob/living/user)', BASE + '/examine(mob/user)',
        ])
        for path in (CONSTRUCTION, NAILS, TETRIS, 'code/_onclick/item_attack.dm', 'code/_onclick/click.dm'):
            self.assertIn(path.replace('/', '\\'), includes)

    def test_moved_duplicate_or_unrelated_changes_fail_closed(self):
        corrected = self.baseline.replace(OLD, NEW, 1)
        mutants = [
            corrected.replace(NEW, NEW.replace('src.amount++', 'src.amount += 2'), 1),
            corrected.replace(NEW, '\t\t\tupdate_bundle()\n' + OLD, 1),
            corrected.replace(NEW, OLD + '\t\t\tupdate_bundle()\n', 1),
            corrected.replace(NEW, NEW.replace('update_bundle()\n', 'update_bundle()\n\t\t\tupdate_bundle()\n'), 1),
            corrected.replace('var/maxamount = 10', 'var/maxamount = 11', 1),
        ]
        for mutant in mutants:
            self.assertNotEqual(mutant, corrected)
            with self.assertRaises(AssertionError):
                bind_source(mutant)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path)
    args, remaining = parser.parse_known_args()
    SOURCE = args.source
    unittest.main(argv=[__file__] + remaining, verbosity=2)
