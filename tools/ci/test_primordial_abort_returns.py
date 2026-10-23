"""Source-bound Conjure Primordial abort-return regression.

Run: python3 tools/ci/test_primordial_abort_returns.py
Local correction; no upstream attribution. Baseline 36513eba.
This bounded Python control-flow model is NOT native BYOND or gameplay execution.
Exact source hashes bind the three return expressions and lifecycle contract.
Inputs assume an eligible living caster with a mind and a completed charge;
target conversion is represented by an already-classified open/non-open turf.
Essentia inputs represent the three exact base types, not arbitrary subtypes.
Summoning, spell grants, faction changes, deletion, sounds, parent signals/stats,
cleanup and release-fatigue operations are call spies, not runtime simulation.
No cooldown outcome, timing, actual fatigue amount, creature behavior, or signal
dispatch is claimed. The fatigue calculation is represented only by its sign.
The argumentless revert_cast() and ambient usr fallback are unchanged. Aborts
still have pre-cast/parent effects and cleanup; they are not effect-free.
Successful-path parity means exact source-byte and bounded call-trace parity.
"""
from copy import deepcopy
from dataclasses import dataclass, field
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
PRIMORDIAL = 'code/modules/spells/spell_types/wizard/conjure/conjure_primordial.dm'
SPELL = 'code/modules/spells/spell.dm'
INVOKED = 'code/modules/spells/roguetown/_roguetown.dm'
LEARNABLE = 'code/modules/spells/spell_types/wizard/spell_list.dm'
TYPE = '/obj/effect/proc_holder/spell/invoked/conjure_primordial'
BASE_SHA = '8526e0107f989036aeb52091eb289d6c33c8becd64a126aa9d392fca839d35bd'
ABORT = re.compile(r'(?m)^(\t+)revert_cast\(\)\n\1return( FALSE)?$')
FLOW_HASHES = {
    'perform(list/targets, recharge = TRUE, mob/user = usr)': 'c7716caead01bba43a01e029b0c5259e88825a3838da67eb2b44f645b080ef0c',
    'cast(list/targets, mob/user = usr)': '47bf501a76d850242dab38f0973aecdf44fab3e51ef61230435eaa0631665396',
    'after_cast(list/targets, mob/user = usr)': '8a89d111bfa1b206a17cd434c84b9a17095cc7d6129844f624af275781356897',
    'revert_cast(mob/user = usr)': 'fd91b17e6b373a23a93a5f7f10aeeeb06e6ccf7f9bc7a2ff34260b86d3d77892',
}
INTERCEPT = '/obj/effect/proc_holder/spell/invoked/InterceptClickOn(mob/living/caller, params, atom/target)'
INTERCEPT_SHA = '904c2befca2b8a62310e8c05aa8fd2a6735b196b2e1be03ef3cea6bb8ac4a6e1'
ELEMENTS = ('water', 'air', 'fire')
PREFIX = ['before_cast', 'attack_log_if_ckey', 'break_invisibility_if_enabled',
          'parent_signal', 'parent_stat']
TAIL = ['invocation', 'start_recharge_success', 'playMagSound', 'after_cast',
        'calculate_fatigue_drain']


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def active(text):
    # Locator only, not a general-purpose DM parser. Preserve string literals.
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda m: '\n' * m[0].count('\n')
                  if m[0].startswith(('//', '/*')) else m[0], text, flags=re.S)


def definition(text, header):
    signature = '^' + re.escape(header) + r'[ \t]*(?://[^\n]*)?\n'
    if len(re.findall(signature, active(text), re.M)) != 1:
        raise AssertionError('Unreviewed missing/duplicate active definition: ' + header)
    matches = re.findall(signature + r'(.*?)(?=^/|\Z)', text, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Unreviewed missing/duplicate raw definition: ' + header)
    return matches[0].rstrip('\n') + '\n'


def bind_primordial(source):
    matches = list(ABORT.finditer(source))
    restored = ABORT.sub(lambda m: m[1] + 'revert_cast()\n' + m[1] + 'return', source)
    if len(matches) != 3 or sha(restored) != BASE_SHA:
        raise AssertionError('Unreviewed Conjure Primordial source')
    # Read each return expression in source order, including mixed candidates.
    return [False if m[2] else True for m in matches]


def bind_flow(flow):
    if {key: sha(body) for key, body in flow.items()} != FLOW_HASHES:
        raise AssertionError('Unreviewed spell lifecycle')


@dataclass
class State:
    held: list = field(default_factory=list)
    conjured: list = field(default_factory=list)
    spellsgranted: bool = False
    faction_present: bool = False


def run(source, flow, state, open_turf=True, fatigue_positive=True,
        clash=False, action=True):
    """Interpret only reviewed branch/return order; effect operations are spies."""
    returns = bind_primordial(source)
    bind_flow(flow)
    state = deepcopy(state)
    trace = PREFIX.copy()
    branch = None
    sacrifice = None
    if len(state.conjured) >= 2:
        branch = 0
    elif not open_turf:
        branch = 1
    else:
        sacrifice = next((i for i, item in enumerate(state.held) if item in ELEMENTS), None)
        if sacrifice is None:
            branch = 2
    if branch is not None:
        trace.extend([('warning', branch), 'revert_cast_implicit_usr', 'revert_start_recharge'])
        result = returns[branch]
    else:
        if not state.spellsgranted:
            trace.extend(['grant_primordial_order', 'grant_primordialmark', 'set_spellsgranted'])
            state.spellsgranted = True
        if not state.faction_present:
            trace.append('add_caster_faction')
            state.faction_present = True
        element = state.held[sacrifice]
        trace.extend([('create_primordial', element), 'track_conjured', 'register_qdelete_signal',
                      ('qdel_sacrifice', sacrifice, element)])
        state.conjured.append(element)
        state.held.pop(sacrifice)
        result = True  # Successful summon ends with explicit return TRUE.
    if result:
        trace.extend(TAIL)
        if fatigue_positive:
            trace.append('stamina_add')
        if clash:
            trace.append('bad_guard')
        if action:
            trace.append('update_button')
    return result, trace, state


class PrimordialAbortTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / PRIMORDIAL).read_text()
        cls.legacy = ABORT.sub(lambda m: m[1] + 'revert_cast()\n' + m[1] + 'return', cls.source)
        cls.fixed = ABORT.sub(lambda m: m[1] + 'revert_cast()\n' + m[1] + 'return FALSE', cls.legacy)
        spell = (ROOT / SPELL).read_text()
        cls.flow = {key: definition(spell, '/obj/effect/proc_holder/spell/proc/' + key)
                    for key in FLOW_HASHES}
        bind_flow(cls.flow)

    def test_exact_three_return_edits_only(self):
        self.assertEqual(bind_primordial(self.source), [False] * 3)
        self.assertEqual(sha(self.legacy), BASE_SHA)
        self.assertEqual(self.source, self.fixed)
        # Ensure text loading did not hide newline or other byte changes.
        self.assertEqual(self.source.encode(), (ROOT / PRIMORDIAL).read_bytes())
        self.assertEqual(self.source.count('revert_cast()'), 3)
        body = definition(self.source, TYPE + '/cast(list/targets, mob/living/user)')
        self.assertEqual(body.count('return TRUE'), 1)
        self.assertIn('\t. = ..()\n', body)

    def test_each_actual_abort_skips_success_tail_and_preserves_summon_state(self):
        cases = [(State(['water'], ['fire', 'air']), True, 0),
                 (State(['fire']), False, 1),
                 (State(['unrelated_item', None]), True, 2)]
        for original, open_turf, branch in cases:
            with self.subTest(branch=branch):
                result, trace, state = run(self.source, self.flow, original, open_turf,
                                           fatigue_positive=True, clash=True, action=True)
                self.assertFalse(result)
                self.assertEqual(state, original)
                self.assertEqual(trace, PREFIX + [('warning', branch),
                    'revert_cast_implicit_usr', 'revert_start_recharge'])

    def test_legacy_reproduces_all_three_false_successes(self):
        for original, open_turf in [(State(['water'], ['fire', 'air']), True),
                                    (State(['fire']), False), (State(), True)]:
            result, trace, state = run(self.legacy, self.flow, original, open_turf)
            self.assertTrue(result)
            self.assertEqual(state, original)
            for operation in ('revert_cast_implicit_usr', 'revert_start_recharge',
                              'start_recharge_success', 'playMagSound', 'after_cast', 'stamina_add'):
                self.assertEqual(trace.count(operation), 1)

    def test_all_elements_preserve_success_effect_order_and_first_matching_sacrifice(self):
        for element in ELEMENTS:
            for already_granted in (False, True):
                for faction_present in (False, True):
                    for existing in ([], ['existing_primordial']):
                        with self.subTest(element=element, granted=already_granted,
                                          faction=faction_present, existing=existing):
                            original = State(['other', element, 'fire'], existing,
                                             already_granted, faction_present)
                            actual = run(self.source, self.flow, original)
                            self.assertEqual(actual, run(self.legacy, self.flow, original))
                            result, trace, state = actual
                            self.assertTrue(result)
                            grants = [] if already_granted else [
                                'grant_primordial_order', 'grant_primordialmark', 'set_spellsgranted']
                            faction = [] if faction_present else ['add_caster_faction']
                            self.assertEqual(trace, PREFIX + grants + faction + [
                                ('create_primordial', element), 'track_conjured', 'register_qdelete_signal',
                                ('qdel_sacrifice', 1, element)] + TAIL + ['stamina_add', 'update_button'])
                            self.assertEqual(state, State(['other', 'fire'], existing + [element], True, True))

    def test_abort_precedence_and_success_conditional_tail(self):
        for source in (self.source, self.legacy):
            _, trace, _ = run(source, self.flow, State([], ['one', 'two', 'three']), False)
            self.assertIn(('warning', 0), trace)
            _, trace, _ = run(source, self.flow, State(), False)
            self.assertIn(('warning', 1), trace)
        for fatigue_positive in (False, True):
            for clash in (False, True):
                for action in (False, True):
                    options = dict(fatigue_positive=fatigue_positive, clash=clash, action=action)
                    actual = run(self.source, self.flow, State(['air']), **options)
                    self.assertEqual(actual, run(self.legacy, self.flow, State(['air']), **options))
                    trace = actual[1]
                    self.assertEqual(trace.count('stamina_add'), int(fatigue_positive))
                    self.assertEqual(trace.count('bad_guard'), int(clash))
                    self.assertEqual(trace.count('update_button'), int(action))

    def test_partial_candidate_return_expressions_are_interpreted_independently(self):
        matches = list(ABORT.finditer(self.fixed))
        cases = [(State(['fire'], ['one', 'two']), True),
                 (State(['water']), False), (State(), True)]
        for index, match in enumerate(matches):
            partial = self.fixed[:match.start()] + match[0].replace('return FALSE', 'return') + self.fixed[match.end():]
            self.assertEqual(bind_primordial(partial), [i == index for i in range(3)])
            for branch, (state, open_turf) in enumerate(cases):
                self.assertEqual(run(partial, self.flow, state, open_turf)[0], branch == index)

    def test_unreviewed_source_and_lifecycle_changes_fail_closed(self):
        for changed in (self.fixed.replace('return FALSE', 'return TRUE', 1),
                        self.fixed.replace('revert_cast()', 'revert_cast(user)', 1),
                        self.fixed.replace('>= 2', '>= 3'),
                        self.fixed.replace('!isopenturf(T)', 'isopenturf(T)'),
                        self.fixed.replace('qdel(sacrifice)', 'qdel(user)'),
                        self.fixed.replace('releasedrain = 40', 'releasedrain = 0'),
                        self.fixed.replace('. = ..()', '..()', 1)):
            with self.assertRaisesRegex(AssertionError, 'Unreviewed'):
                run(changed, self.flow, State())
        for key, before, after in [
            ('cast(list/targets, mob/user = usr)', 'return TRUE', 'return FALSE'),
            ('perform(list/targets, recharge = TRUE, mob/user = usr)', 'if(cast(targets, user = user))', 'if(TRUE)'),
            ('after_cast(list/targets, mob/user = usr)', 'user.stop_attack()', 'usr.stop_attack()'),
            ('revert_cast(mob/user = usr)', 'start_recharge()', 'finish_recharge()'),
        ]:
            flow = dict(self.flow)
            flow[key] = flow[key].replace(before, after)
            with self.assertRaisesRegex(AssertionError, 'Unreviewed'):
                run(self.fixed, flow, State())

    def test_reachability_and_parent_contract_sources(self):
        config = definition(self.source, TYPE)
        self.assertIn('\treleasedrain = 40\n', config)
        self.assertIn("\tsound = list('sound/magic/magnet.ogg')\n", config)
        self.assertIn('\tcharge_type = "recharge"\n', definition((ROOT / INVOKED).read_text(),
                      '/obj/effect/proc_holder/spell/invoked'))
        intercept = definition((ROOT / INVOKED).read_text(), INTERCEPT)
        self.assertEqual(sha(intercept), INTERCEPT_SHA)
        self.assertIn('if(perform(list(target), TRUE, user = ranged_ability_user))', intercept)
        self.assertIn(TYPE + ',', active((ROOT / LEARNABLE).read_text()))
        dme = active((ROOT / 'roguetown.dme').read_text()).replace('\\', '/')
        for path in (PRIMORDIAL, SPELL, INVOKED, LEARNABLE):
            self.assertIn('#include "' + path + '"', dme)
        for path in (SPELL, INVOKED):
            self.assertNotRegex(active((ROOT / path).read_text()),
                                r'(?m)^/obj/effect/proc_holder/spell/invoked/(?:proc/)?cast\(')
        parent = self.flow['cast(list/targets, mob/user = usr)']
        self.assertIn('\treturn TRUE\n', parent)
        perform = self.flow['perform(list/targets, recharge = TRUE, mob/user = usr)']
        self.assertIn('\tif(cast(targets, user = user))\n\t\tinvocation(user)', perform)
        self.assertIn('\t\t\t\tif(fatigue > 0)\n\t\t\t\t\tL.stamina_add(fatigue)', perform)

    def test_locator_rejects_commented_and_duplicate_definitions(self):
        header = TYPE + '/cast(list/targets, mob/living/user)'
        source = header + '\n' + definition(self.source, header)
        for invalid in ('/*\n' + source + '*/\n', source + '\n' + source):
            with self.assertRaisesRegex(AssertionError, 'active definition'):
                definition(invalid, header)


if __name__ == '__main__':
    unittest.main()
