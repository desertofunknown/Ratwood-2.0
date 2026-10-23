"""Source-bound crankbox examine description regression.

Run: python3 tools/ci/test_crankbox_examine_order.py
Baseline: 8e6cd59289708d46f9631aff917e8a1d04b8bd57.
Production hunk from The-Sun-In-Splendour's upstream PR #3092:
https://github.com/Rotwood-Vale/Ratwood-2.0/pull/3092
Original commit: 1f2465892b7bffb0c9e9265ac491bad65b7cb61f.
Merged as: 41f3bf8d9db6472607712a6714b85f2c2fe53391.

This bounded Python model is NOT native DM or gameplay execution. It reads the
reviewed source's trait receiver and parent-call order, models the two literal
description assignments, and spies on the parent's copy of desc into its list.
Other parent output/effects are placeholders, not a rendering or signal test.
Exact hashes bind all three included /obj/item/examine definitions, /obj/examine,
/atom/proc/examine, the examinate caller, and include order. The normalized
whole-file hash permits only the upstream examine hunk; descriptions, attack_self
and every other mechanic remain byte-identical. The shared desc field remains.

Parent dispatch: crankbox -> blacksmith/items.dm /obj/item/examine ->
objects/items.dm /obj/item/examine -> objects/examine.dm /obj/item/examine ->
/obj/examine -> /atom/proc/examine. All four intermediary bodies begin . = ..().
Same-type overrides call the previous definition; argumentless ..() forwards
current arguments: https://www.byond.com/docs/ref/#/proc/..
"""

from dataclasses import dataclass
import hashlib
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
RELIC = 'code/game/objects/items/rogueitems/inquisitionrelics.dm'
HEADER = '/obj/item/psydonmusicbox/examine(mob/user)'
BASE_SHA = 'fec59e179c8eef4d5b9b0a9ea5d4ccc61725d60bdc17058827cf27b3a059801a'
DME_SHA = '87bf0338056bc4127a6d6d3691fb054e6d19291648001818657cee901c21e7d8'
PARENT = '\t. = ..()\n'
BOUND = {
    ('code/game/objects/examine.dm', '/obj/item/examine(mob/user)'): 'e4a419da1c73d5bb9bd46fbdc78a943662db30c397229f9ae218ba46c6fc5a27',
    ('code/game/objects/items.dm', '/obj/item/examine(mob/user)'): 'd5ccebb7786d959bc0cc00c6ba7004da434635971c7fcbe9c24541753b486dff',
    ('code/modules/roguetown/roguejobs/blacksmith/items.dm', '/obj/item/examine(mob/user)'): 'f7d56238488ac8fa2b36773f1a42adfcacf906878cfafb23cdd33c16f4ec0c24',
    ('code/game/objects/objs.dm', '/obj/examine(mob/user)'): 'c949e7decb549484e6b21a6170e6d5ac04f40defd22edbe4a9ec5f48b3ee3f2b',
    ('code/game/atoms.dm', '/atom/proc/examine(mob/user)'): '92eb4e8f3fcaf79194e37f0949d25cc8897907f31a1b9db36883efd5ce3979e2',
    ('code/modules/mob/mob.dm', '/mob/verb/examinate(atom/A as mob|obj|turf in view())'): '7e1c769b0f1427263c3c3e3d04c15d493443373cf9138e79ead7c2978d1aa6d0',
}


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def definition(text, header):
    # Source locator, not a general DM parser. Exact hashes reject other bodies.
    pattern = '^' + re.escape(header) + r'[ \t]*(?://[^\n]*)?\n(.*?)(?=^/|\Z)'
    matches = list(re.finditer(pattern, text, re.M | re.S))
    if len(matches) != 1:
        raise AssertionError('Missing/duplicate reviewed definition: ' + header)
    return matches[0]


def body_text(inquisition, ordinary, receiver, parent_after):
    branch = (f'\tif(HAS_TRAIT({receiver}, TRAIT_INQUISITION))\n'
              f'\t\tdesc = "{inquisition}"\n'
              '\telse\n'
              f'\t\tdesc = "{ordinary}"\n')
    return (branch + PARENT if parent_after else PARENT + branch) + '\n'


def bind_source(source):
    match = definition(source, HEADER)
    body = match[1]
    receiver = re.findall(r'\tif\(HAS_TRAIT\((user|usr), TRAIT_INQUISITION\)\)', body)
    descriptions = re.findall(r'^\t\tdesc = "([^"\n]*)"$', body, re.M)
    if len(receiver) != 1 or len(descriptions) != 2 or body.count(PARENT) != 1:
        raise AssertionError('Unreviewed crankbox examine statements')
    parent_after = body.index(PARENT) > body.index('\tif(')
    if body != body_text(*descriptions, receiver[0], parent_after):
        raise AssertionError('Unreviewed crankbox examine ordering')
    old_body = body_text(*descriptions, 'usr', False)
    old_source = source[:match.start(1)] + old_body + source[match.end(1):]
    if sha(old_source) != BASE_SHA:
        raise AssertionError('Unreviewed descriptions, attack_self, or other relic bytes')
    return receiver[0], parent_after, descriptions, old_source


def variant(source, receiver, parent_after):
    _, _, descriptions, _ = bind_source(source)
    match = definition(source, HEADER)
    return (source[:match.start(1)] + body_text(*descriptions, receiver, parent_after)
            + source[match.end(1):])


def bind_parent(bodies):
    if {key: sha(body) for key, body in bodies.items()} != BOUND:
        raise AssertionError('Unreviewed examine parent or caller')


@dataclass(frozen=True)
class Examiner:
    name: str
    inquisition: bool


def examine(source, bodies, desc, user, usr):
    """Interpret only two source operations; parent output and effects are spies."""
    receiver, parent_after, descriptions, _ = bind_source(source)
    bind_parent(bodies)
    operations = ['select', 'parent'] if parent_after else ['parent', 'select']
    trace = []
    result = None
    for operation in operations:
        if operation == 'select':
            examiner = user if receiver == 'user' else usr
            desc = descriptions[0 if examiner.inquisition else 1]
            trace.append(('select', examiner))
        else:
            trace.append(('parent', user, desc))
            # The bound atom proc copies desc at invocation, not at later display.
            result = [('name', 'melancholic crankbox')]
            if desc:
                result.append(('description', desc))
            result.append(('unmodeled_parent_details', user))
    return result, desc, trace


class CrankboxExamineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / RELIC).read_text()
        cls.receiver, cls.parent_after, cls.descriptions, cls.legacy = bind_source(cls.source)
        cls.fixed = variant(cls.source, 'user', True)
        cls.bodies = {
            key: definition((ROOT / key[0]).read_text(), key[1])[1].rstrip('\n') + '\n'
            for key in BOUND
        }
        bind_parent(cls.bodies)
        cls.examiners = (Examiner('ordinary', False), Examiner('inquisitor', True))

    def expected(self, user):
        return self.descriptions[0 if user.inquisition else 1]

    def test_only_upstream_examine_hunk_is_applied(self):
        self.assertEqual((self.receiver, self.parent_after), ('user', True))
        self.assertEqual(self.source, self.fixed)
        self.assertEqual(self.source.encode(), (ROOT / RELIC).read_bytes())
        self.assertEqual(sha(self.legacy), BASE_SHA)

    def test_current_first_examination_selects_description_before_parent(self):
        for user in self.examiners:
            with self.subTest(user=user.name):
                result, desc, trace = examine(self.source, self.bodies, '', user, user)
                self.assertIn(('description', self.expected(user)), result)
                self.assertEqual(desc, self.expected(user))
                self.assertEqual(trace, [('select', user), ('parent', user, desc)])

    def test_current_alternating_examiners_do_not_receive_previous_description(self):
        for first in (0, 1):
            desc = ''
            for index in (first, 1 - first, first, 1 - first):
                user = self.examiners[index]
                result, desc, _ = examine(self.source, self.bodies, desc, user, user)
                with self.subTest(first=first, current=user.name):
                    self.assertIn(('description', self.expected(user)), result)
                    self.assertNotIn(('description', self.expected(self.examiners[1 - index])), result)

    def test_current_explicit_user_controls_description_not_ambient_usr(self):
        for index, user in enumerate(self.examiners):
            usr = self.examiners[1 - index]
            desc = ''
            # Repeat to expose usr misuse independently of the initial empty desc.
            for _ in range(2):
                result, desc, trace = examine(self.source, self.bodies, desc, user, usr)
            with self.subTest(user=user.name, usr=usr.name):
                self.assertIn(('description', self.expected(user)), result)
                self.assertEqual(trace, [('select', user), ('parent', user, self.expected(user))])

    def test_previous_returned_list_does_not_change_on_subsequent_examination(self):
        first, second = self.examiners
        result, desc, _ = examine(self.source, self.bodies, '', first, first)
        saved = result.copy()
        examine(self.source, self.bodies, desc, second, second)
        self.assertEqual(result, saved)

    def test_each_upstream_change_is_independently_needed(self):
        user, usr = self.examiners
        receiver_only = variant(self.source, 'user', False)
        result, _, _ = examine(receiver_only, self.bodies, '', user, user)
        self.assertNotIn(('description', self.expected(user)), result)
        order_only = variant(self.source, 'usr', True)
        result, _, _ = examine(order_only, self.bodies, '', user, usr)
        self.assertIn(('description', self.expected(usr)), result)
        self.assertNotIn(('description', self.expected(user)), result)

    def test_exact_parent_chain_and_caller_contract(self):
        dme = (ROOT / 'roguetown.dme').read_text()
        self.assertEqual(sha(dme), DME_SHA)
        ordered_items = list(BOUND)[:3]
        positions = [dme.index('#include "' + path.replace('/', '\\') + '"')
                     for path, _ in ordered_items]
        self.assertEqual(positions, sorted(positions))
        for key in list(BOUND)[:4]:
            self.assertTrue(self.bodies[key].startswith(PARENT))
        atom = self.bodies[list(BOUND)[4]]
        self.assertIn('\tif(desc)\n\t\t. += span_info("[desc]")\n', atom)
        caller = self.bodies[list(BOUND)[5]]
        self.assertIn('\tvar/list/result = A.examine(src)\n', caller)
        self.assertIn('to_chat(src, usr.client.prefs.no_examine_blocks ? result.Join', caller)

    def test_unreviewed_descriptions_or_mechanics_are_rejected(self):
        mutants = (
            self.source.replace('A cranked music box', 'A modified music box'),
            self.source.replace('\tforce = 15\n', '\tforce = 16\n'),
            self.source.replace('if(!HAS_TRAIT(usr, TRAIT_INQUISITION))',
                                'if(!HAS_TRAIT(user, TRAIT_INQUISITION))'),
            self.source.replace(HEADER, HEADER + '\n\treturn'),
        )
        for source in mutants:
            with self.subTest(source_change=sha(source)):
                self.assertNotEqual(source, self.source)
                with self.assertRaises(AssertionError):
                    bind_source(source)
        changed_parent = self.bodies.copy()
        key = list(BOUND)[4]
        changed_parent[key] = changed_parent[key].replace('span_info("[desc]")', 'span_info("wrong")')
        with self.assertRaises(AssertionError):
            bind_parent(changed_parent)


if __name__ == '__main__':
    unittest.main(verbosity=2)
