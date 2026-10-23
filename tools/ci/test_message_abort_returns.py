"""Local Message abort-return regression, not an upstream-attributed fix.

Run: python3 tools/ci/test_message_abort_returns.py
Bounded source/control-flow model, NOT native BYOND/game, alert, signal or cost
runtime execution. Exact reviewed source hashes bind the model and fail closed.
Inputs represent already-sanitized text and eligible, living human casters with
minds and a fresh identify_difficulty of 15. Existing persistence of that field
after choosing non-anonymous delivery is outside this model and unchanged. Parent signal/stat and pre-cast effects still occur on abort. revert_cast()
remains argumentless (native ambient usr fallback unchanged). Cleanup/recharge,
stamina, invocation and delivery are call spies, not runtime emulation; no charge
state, cooldown timing, actual stamina amount or successful network delivery is
claimed. Successful-path parity is source-byte and bounded call-trace parity.
"""
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
MESSAGE = 'code/modules/spells/spell_types/wizard/utility/message.dm'
SPELL = 'code/modules/spells/spell.dm'
GRANT = 'code/modules/jobs/job_types/roguetown/nobility/hand.dm'
LEARNABLE = 'code/modules/spells/spell_types/wizard/spell_list.dm'
TYPE = '/obj/effect/proc_holder/spell/self/message'
BASE_SHA = 'f49d0acf2fda97d84f04bd6283bb5d59e83f4ed20e647419e54fbfdacd021fce'
ABORT = re.compile(r'(?m)^(\t+)revert_cast\(\)\n\1return( FALSE)?$')
FLOW_HASHES = {
    'perform(list/targets, recharge = TRUE, mob/user = usr)': 'c7716caead01bba43a01e029b0c5259e88825a3838da67eb2b44f645b080ef0c',
    'cast(list/targets, mob/user = usr)': '47bf501a76d850242dab38f0973aecdf44fab3e51ef61230435eaa0631665396',
    'after_cast(list/targets, mob/user = usr)': '8a89d111bfa1b206a17cd434c84b9a17095cc7d6129844f624af275781356897',
    'revert_cast(mob/user = usr)': 'fd91b17e6b373a23a93a5f7f10aeeeb06e6ccf7f9bc7a2ff34260b86d3d77892',
}
PREFIX = ['before_cast', 'attack_log', 'break_invisibility', 'parent_signal', 'parent_stat']
TAIL = ['invocation', 'start_recharge', 'sound_if_present', 'after_cast',
        'calculate_fatigue_drain', 'stamina_add_if_positive', 'clash_if_present', 'button_if_present']


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
    return re.search(signature + r'(.*?)(?=^/|\Z)', text, re.M | re.S)[1].rstrip('\n') + '\n'


def bind_message(source):
    matches = list(ABORT.finditer(source))
    restored = ABORT.sub(lambda m: m[1] + 'revert_cast()\n' + m[1] + 'return', source)
    if len(matches) != 4 or sha(restored) != BASE_SHA:
        raise AssertionError('Unreviewed Message source')
    # Four return expressions in source order, not a fixed success/failure flag.
    return [False if m[2] else True for m in matches]


def bind_flow(flow):
    for key, expected in FLOW_HASHES.items():
        if sha(flow[key]) != expected:
            raise AssertionError('Unreviewed lifecycle: ' + key)


def run(source, flow, known=('Ada',), selected='Ada', present=('Ada',), text='hello',
        projection=False, anonymous=True, perception=15, knows_sender=True, human=True):
    """Bounded branch interpretation; source-bound operations are call spies."""
    returns = bind_message(source)
    bind_flow(flow)
    trace = PREFIX.copy()
    branch = None
    if not known:
        trace.append('warning_no_known_people')
        branch = 0
    else:
        trace.append('opening_emote')
        if selected is None:
            trace.append('warning_no_selection')
            branch = 1
        elif selected not in present:
            trace.append('warning_absent_recipient')
            branch = 3
        else:
            trace.extend(['connection_emote', 'projection_alert', 'message_input'])
            if not text:
                branch = 2
    if branch is not None:
        trace.append('revert_cast_ambient_usr')
        # Inside revert_cast; separate from perform's success-only recharge call.
        trace.append('revert_start_recharge')
        result = returns[branch]
    else:
        identified = perception >= (15 if anonymous else 0) and knows_sender
        color = 'voice_color' if identified and human else '7246ff'
        kind = 'projection' if projection else 'message'
        identity = 'identified' if identified else 'anonymous'
        trace.extend(['anonymity_alert', 'recipient_sound', 'sender_sound',
                      ('recipient_delivery', kind, identity, color, text),
                      ('sender_delivery', kind, identity, color, text),
                      'projection_emote' if projection else 'whisper', 'log_game', 'closing_notice'])
        result = True  # Explicit return TRUE after first matching recipient.
    if result:
        trace.extend(TAIL)
    return result, trace


class MessageAbortTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (ROOT / MESSAGE).read_text()
        cls.legacy = ABORT.sub(lambda m: m[1] + 'revert_cast()\n' + m[1] + 'return', cls.source)
        cls.fixed = ABORT.sub(lambda m: m[1] + 'revert_cast()\n' + m[1] + 'return FALSE', cls.legacy)
        cls.flow = {key: definition((ROOT / SPELL).read_text(),
                                   '/obj/effect/proc_holder/spell/proc/' + key)
                    for key in FLOW_HASHES}
        bind_flow(cls.flow)

    def test_exact_four_return_edits_only(self):
        self.assertEqual(bind_message(self.source), [False] * 4)
        self.assertEqual(sha(self.legacy), BASE_SHA)
        self.assertEqual(self.source, self.fixed)
        self.assertEqual(self.source.count('revert_cast()'), 4)
        self.assertEqual(self.source.count('return TRUE'), 1)
        self.assertIn('\treleasedrain = 30\n', self.source)
        self.assertIn('\trecharge_time = 60 SECONDS\n', self.source)

    def test_all_abort_branches_skip_delivery_and_success_tail(self):
        for case in ({'known': ()}, {'selected': None}, {'text': ''}, {'text': None},
                     {'present': ()}, {'present': ('Someone else',)}):
            with self.subTest(case=case):
                result, trace = run(self.source, self.flow, **case)
                self.assertFalse(result)
                self.assertEqual(trace[:5], PREFIX)
                self.assertEqual(trace.count('revert_cast_ambient_usr'), 1)
                self.assertEqual(trace.count('revert_start_recharge'), 1)
                self.assertFalse(any(isinstance(x, tuple) for x in trace))
                for operation in TAIL + ['whisper', 'projection_emote', 'log_game', 'recipient_sound']:
                    self.assertNotIn(operation, trace)

    def test_legacy_reproduces_four_false_successes(self):
        for case in ({'known': ()}, {'selected': None}, {'text': ''}, {'present': ()}):
            with self.subTest(case=case):
                result, trace = run(self.legacy, self.flow, **case)
                self.assertTrue(result)
                self.assertEqual(trace[-len(TAIL):], TAIL)
                self.assertIn('revert_cast_ambient_usr', trace)
                self.assertFalse(any(isinstance(x, tuple) for x in trace))

    def test_success_parity_projection_identity_and_perception_boundaries(self):
        for projection in (False, True):
            for anonymous in (False, True):
                for perception in (-1, 0, 14, 15, 20):
                    for knows_sender in (False, True):
                        for human in (False, True):
                            args = dict(projection=projection, anonymous=anonymous,
                                        perception=perception, knows_sender=knows_sender, human=human)
                            with self.subTest(**args):
                                expected = run(self.legacy, self.flow, **args)
                                self.assertEqual(run(self.source, self.flow, **args), expected)
                                result, trace = expected
                                self.assertTrue(result)
                                self.assertEqual(sum(isinstance(x, tuple) and x[0] == 'recipient_delivery'
                                                     for x in trace), 1)
                                identified = perception >= (0 if not anonymous else 15) and knows_sender
                                self.assertIn(('recipient_delivery', 'projection' if projection else 'message',
                                               'identified' if identified else 'anonymous',
                                               'voice_color' if identified and human else '7246ff', 'hello'), trace)
                                self.assertNotIn('revert_cast_ambient_usr', trace)
                                self.assertEqual(trace[-len(TAIL):], TAIL)

    def test_flow_gate_and_parent_return_are_actual_source_bound(self):
        perform = self.flow[next(iter(FLOW_HASHES))]
        self.assertIn('\tif(cast(targets, user = user))\n\t\tinvocation(user)', perform)
        self.assertIn('\t\t\t\t\tL.stamina_add(fatigue)', perform)
        self.assertIn('\treturn TRUE\n', self.flow['cast(list/targets, mob/user = usr)'])
        self.assertIn('\tstart_recharge()\n', self.flow['revert_cast(mob/user = usr)'])
        for key in self.flow:
            altered = dict(self.flow)
            altered[key] += '\treturn FALSE\n'
            with self.subTest(key=key), self.assertRaisesRegex(AssertionError, 'Unreviewed lifecycle'):
                run(self.source, altered)

    def test_unreviewed_content_cleanup_and_routing_fail_closed(self):
        for old, new in [('revert_cast()', 'revert_cast(user)'), ('return FALSE', 'return TRUE'),
                         ('releasedrain = 30', 'releasedrain = 0'), ('return TRUE', 'return FALSE'),
                         ('user.whisper(message)', 'user.say(message)'), ('. = ..()', '..()')]:
            with self.subTest(old=old), self.assertRaisesRegex(AssertionError, 'Unreviewed Message'):
                run(self.fixed.replace(old, new, 1), self.flow)

    def test_compiled_includes_grants_and_self_dispatch(self):
        dme = active((ROOT / 'roguetown.dme').read_text()).replace('\\', '/')
        for path in (MESSAGE, SPELL, GRANT, LEARNABLE):
            self.assertIn('#include "' + path + '"', dme)
        grant = (ROOT / GRANT).read_text()
        self.assertEqual(sha(grant), 'a275b809d34385c3971c5f3a85358859c165f08df5725cd5e6aa6e9223a3cfdd')
        advisor = definition(grant, '/datum/outfit/job/roguetown/hand/advisor/pre_equip(mob/living/carbon/human/H)')
        self.assertIn('\tif(H.mind)\n\t\tH.mind.AddSpell(new /obj/effect/proc_holder/spell/self/recall)\n\t\tH.mind.AddSpell(new ' + TYPE + ')', advisor)
        learnable = (ROOT / LEARNABLE).read_text()
        self.assertEqual(sha(learnable), 'c60e0d59b53c796d3fb9fa1b6f3eecf02742acc6fbe81359356b4077f894845f')
        self.assertIn(TYPE + ',', active(learnable))
        choose = definition((ROOT / SPELL).read_text(), '/obj/effect/proc_holder/spell/self/choose_targets(mob/user = usr)')
        self.assertEqual(sha(choose), 'f6690461bb38a856d396cebde928c3b0816faddaafd9527357bc928c7fc9c86b')
        self.assertIn('\tperform(null,user=user)\n', choose)
        # Inspect all compiled DM sources, not only spell.dm, for intervening overrides.
        for path in re.findall(r'^#include "([^"\n]+\.dm)"', dme, re.M):
            source = active((ROOT / path).read_bytes().decode('latin-1'))
            self.assertNotRegex(source, r'(?m)^/obj/effect/proc_holder/spell/self/(?:proc/)?(?:cast|perform)\(')
            self.assertNotRegex(source, r'(?m)^' + re.escape(TYPE) + r'/(?:proc/)?perform\(')


if __name__ == '__main__':
    unittest.main()
