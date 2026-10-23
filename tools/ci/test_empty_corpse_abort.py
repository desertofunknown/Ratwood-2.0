"""Source-bound Locate Corpse eligible-empty abort regression.

Run: python3 tools/ci/test_empty_corpse_abort.py
Local correction; no upstream attribution. Baseline f8438d1861643c76dad99373ce46e9c866cf3499.
This bounded Python control-flow model is NOT DM execution or a gameplay test.
Exact source hashes bind eligibility/return and lifecycle contracts. Lifecycle,
cleanup, parent signal/stat, selection and direction output are call spies only.
No cooldown timing, recharge outcome, fatigue formula, or real devotion subsystem
is simulated. The devotion delta spy assumes an eligible human with devotion.
Existing revert_cast() implicit usr behavior is intentionally unchanged. Aborts
still have before-cast/parent effects and cleanup; they are not effect-free.
Canceled selections/deleted objects and missing locations are deferred unchanged.
"""
from dataclasses import dataclass
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
NECRA = 'code/modules/spells/roguetown/acolyte/necra.dm'
SPELL = 'code/modules/spells/spell.dm'
PATRON = 'code/datums/gods/patrons/divine/necra.dm'
HEADER = '/obj/effect/proc_holder/spell/targeted/locate_dead/cast(list/targets, mob/living/user = usr)'
BASELINE_FILE_SHA256 = '933904c8f015d6221a9b9d59e516a3d2211641bff468a0674d71e032acd58af8'
LEGACY_BODY_SHA256 = 'c3e6cac05c5f07f307d55fbaa70e1eae58111542829d1e614f98f084878e0503'
FLOW_SHA256 = {'/obj/effect/proc_holder/spell/proc/perform(list/targets, recharge = TRUE, mob/user = usr)': 'c7716caead01bba43a01e029b0c5259e88825a3838da67eb2b44f645b080ef0c', '/obj/effect/proc_holder/spell/proc/cast(list/targets, mob/user = usr)': '47bf501a76d850242dab38f0973aecdf44fab3e51ef61230435eaa0631665396', '/obj/effect/proc_holder/spell/proc/after_cast(list/targets, mob/user = usr)': '8a89d111bfa1b206a17cd434c84b9a17095cc7d6129844f624af275781356897', '/obj/effect/proc_holder/spell/proc/revert_cast(mob/user = usr)': 'fd91b17e6b373a23a93a5f7f10aeeeb06e6ccf7f9bc7a2ff34260b86d3d77892', '/obj/effect/proc_holder/spell/targeted/choose_targets(mob/user = usr)': '83b2caab0e03df0ec36a413f4d74397b75b4ae3d1eae9334c98f812f70715ed2'}
EMPTY_OLD = "\tif(!length(corpses))\n\t\tto_chat(user, span_warning(\"The Undermaiden's grasp lets slip.\"))\n\t\trevert_cast()\n\t\treturn .\n"
EMPTY_NEW = EMPTY_OLD.replace('return .', 'return FALSE')


def digest(text):
    return hashlib.sha256(text.encode()).hexdigest()


def active_source(source):
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda m: '\n' * m[0].count('\n')
                  if m[0].startswith(('//', '/*')) else m[0], source, flags=re.S)


def definition(source, header):
    signature = '^' + re.escape(header) + r'[ \t]*(?://[^\n]*)?\n'
    if len(re.findall(signature, active_source(source), re.M)) != 1:
        raise AssertionError('Missing or duplicate active definition: ' + header)
    matches = re.findall(signature + r'(.*?)(?=^/|\Z)', source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing or duplicate raw definition: ' + header)
    return matches[0].rstrip('\n') + '\n'


def mode(body):
    if digest(body) == LEGACY_BODY_SHA256:
        return 'legacy'
    if body.count(EMPTY_NEW) == 1 and digest(body.replace(EMPTY_NEW, EMPTY_OLD, 1)) == LEGACY_BODY_SHA256:
        return 'fixed'
    raise AssertionError('Unreviewed Locate Corpse body')


def require_flow(flow):
    if {header: digest(body) for header, body in flow.items()} != FLOW_SHA256:
        raise AssertionError('Unreviewed spell lifecycle')


@dataclass(frozen=True)
class DeadMob:
    living: bool = True
    mind: bool = True
    contract_spawned: bool = False
    human: bool = True
    buried: bool = False


def perform(body, dead_list, flow, selected=True, deleted=False, locations=True):
    """Interpret only reviewed eligibility and return gates; other calls are spies."""
    kind = mode(body)
    require_flow(flow)
    trace = ['before_cast', 'attack_log_if_ckey', 'break_invisibility_if_enabled',
             'parent_signal', 'parent_stat']
    corpses = [c for c in dead_list if c.living and c.mind and not c.contract_spawned
               and not (c.human and c.buried)]
    result = True  # Parent TRUE is stored in dot; normal end returns dot.
    if not corpses:
        trace.extend(['warning', 'revert_cast_implicit_usr'])
        result = kind == 'legacy'
    else:
        trace.append('selection')
        if not selected or deleted or not locations:
            trace.append('warning')  # Existing return dot, without cleanup.
        else:
            trace.append('direction_output')
    delta = 0
    if result:
        trace.extend(['invocation', 'start_recharge_success', 'sound_if_present', 'after_cast',
                      'stamina_if_applicable', 'clash_if_applicable', 'button_if_present'])
        delta = -35  # after_cast devotion update call argument, not a runtime balance.
    return result, trace, delta, corpses


class EmptyCorpseAbortTests(unittest.TestCase):
    def setUp(self):
        self.source = (ROOT / NECRA).read_text()
        self.body = definition(self.source, HEADER)
        self.spell = (ROOT / SPELL).read_text()
        self.flow = {h: definition(self.spell, h) for h in FLOW_SHA256}
        require_flow(self.flow)
        self.legacy = self.body.replace(EMPTY_NEW, EMPTY_OLD, 1)
        self.assertEqual(mode(self.legacy), 'legacy')

    def test_only_empty_return_changes_all_other_file_bytes_preserved(self):
        self.assertEqual(mode(self.body), 'fixed')
        restored = (ROOT / NECRA).read_bytes().replace(EMPTY_NEW.encode(), EMPTY_OLD.encode(), 1)
        self.assertEqual(hashlib.sha256(restored).hexdigest(), BASELINE_FILE_SHA256)
        self.assertEqual(self.body.count('revert_cast()'), 1)
        self.assertEqual(self.body.count('return .'), 2)

    def test_actual_empty_and_all_ineligible_lists_abort(self):
        excluded = [DeadMob(living=False), DeadMob(mind=False),
                    DeadMob(contract_spawned=True), DeadMob(buried=True)]
        for dead in ([], *([c] for c in excluded), excluded):
            with self.subTest(dead=dead):
                result, trace, delta, eligible = perform(self.body, dead, self.flow)
                self.assertFalse(result)
                self.assertEqual(eligible, [])
                self.assertEqual(delta, 0)
                self.assertEqual(trace, ['before_cast', 'attack_log_if_ckey',
                    'break_invisibility_if_enabled', 'parent_signal', 'parent_stat',
                    'warning', 'revert_cast_implicit_usr'])

    def test_legacy_empty_reproduces_false_success_and_devotion_call(self):
        for dead in ([], [DeadMob(mind=False), DeadMob(buried=True)]):
            result, trace, delta, eligible = perform(self.legacy, dead, self.flow)
            self.assertTrue(result)
            self.assertEqual(eligible, [])
            self.assertEqual(delta, -35)
            self.assertEqual(trace.count('revert_cast_implicit_usr'), 1)
            self.assertEqual(trace.count('after_cast'), 1)
            self.assertEqual(trace.count('start_recharge_success'), 1)

    def test_nonempty_success_is_unchanged(self):
        for corpse in (DeadMob(), DeadMob(human=False), DeadMob(human=False, buried=True)):
            dead = [DeadMob(mind=False), corpse, DeadMob(contract_spawned=True)]
            actual = perform(self.body, dead, self.flow)
            self.assertEqual(actual, perform(self.legacy, dead, self.flow))
            result, trace, delta, eligible = actual
            self.assertTrue(result)
            self.assertEqual(eligible, [corpse])
            self.assertEqual(delta, -35)
            self.assertIn('direction_output', trace)
            self.assertNotIn('revert_cast_implicit_usr', trace)
            self.assertEqual(trace.count('after_cast'), 1)

    def test_deferred_selection_and_location_returns_unchanged(self):
        for options in ({'selected': False}, {'deleted': True}, {'locations': False}):
            actual = perform(self.body, [DeadMob()], self.flow, **options)
            self.assertEqual(actual, perform(self.legacy, [DeadMob()], self.flow, **options))
            self.assertTrue(actual[0])
            self.assertNotIn('revert_cast_implicit_usr', actual[1])
            self.assertNotIn('direction_output', actual[1])

    def test_unreviewed_source_and_lifecycle_changes_rejected(self):
        fixed = self.legacy.replace(EMPTY_OLD, EMPTY_NEW, 1)
        for changed in (fixed.replace('return FALSE', 'return TRUE'),
                        fixed.replace('revert_cast()', 'revert_cast(user)'),
                        fixed.replace('!C.mind', 'C.mind'),
                        fixed.replace('if(B.buried)', 'if(!B.buried)'),
                        fixed.replace('return .', 'return FALSE', 1),
                        fixed.replace('. = ..()', '..()')):
            with self.assertRaisesRegex(AssertionError, 'Unreviewed'):
                perform(changed, [], self.flow)
        for header in self.flow:
            changed = dict(self.flow)
            changed[header] += '\treturn FALSE\n'
            with self.assertRaisesRegex(AssertionError, 'Unreviewed'):
                perform(fixed, [], changed)

    def test_configuration_grant_include_and_parent_contracts(self):
        config = definition(self.source, HEADER.split('/cast(')[0])
        for line in ('max_targets = 0', 'cast_without_targets = TRUE', 'miracle = TRUE',
                     'devotion_cost = 35', 'recharge_time = 15 SECONDS',
                     'releasedrain = 30', 'chargedrain = 0.5'):
            self.assertIn('\t' + line + '\n', config)
        patron = active_source((ROOT / PATRON).read_text())
        self.assertRegex(patron, r'/obj/effect/proc_holder/spell/targeted/locate_dead\s*= CLERIC_T0,')
        dme = active_source((ROOT / 'roguetown.dme').read_text()).replace('\\', '/')
        for path in (NECRA, SPELL, PATRON):
            self.assertIn('#include "' + path + '"', dme)
        self.assertNotRegex(active_source(self.spell),
            r'(?m)^/obj/effect/proc_holder/spell/targeted/(?:proc/)?cast\(')
        self.assertIn('\t. = ..()\n', self.body)
        self.assertIn('\tif(cast(targets, user = user))\n\t\tinvocation(user)\n', self.spell)
        self.assertIn('\t\tdevotee.devotion?.update_devotion(-devotion_cost)\n', self.spell)

    def test_locator_rejects_commented_and_duplicate_definitions(self):
        source = HEADER + '\n' + self.legacy
        for invalid in ('/*\n' + source + '*/\n', source + '\n' + source):
            with self.assertRaisesRegex(AssertionError, 'active definition'):
                definition(invalid, HEADER)


if __name__ == '__main__':
    unittest.main()
