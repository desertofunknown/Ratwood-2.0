"""Source-bound Python model, NOT native DM or suspended-UI execution.

Run: python3 tools/ci/test_partial_order_authorization.py
For a negative control, set RATWOOD_PARTIAL_UI_SOURCE to the original UI file
from be34163d09256cbe7259fb1877fc111285986865. The normal-user relock
regression must fail against that baseline. No live server, saves or DB needed.

The complete UI source is pinned after normalizing ONLY the exact reviewed
post-confirmation guard. This binds access helpers, entry policy, prompt/cancel
flow, and fulfillment's sequestration exemption without changing their policy.
The existing membership suite binds the economy implementation and provides a
small stock-only model; this is not integration, runtime or payout proof.
"""

from dataclasses import dataclass
import os
from pathlib import Path
import unittest

import test_standing_order_membership as membership


CONFIRM = '\t\t\t\t\tif(confirm == "Yes")\n'
GUARD = ('\t\t\t\t\t\tif(!user_can_act(usr) || (locked && !alderman_has_access(usr)))\n'
         '\t\t\t\t\t\t\treturn TRUE\n')
CALL = '\t\t\t\t\t\tvar/list/partial_result = SSeconomy.fulfill_order(usr, O, TRUE)\n'
BASE_UI_SHA = '2774fdf9a190637fd87e426c12b3bbaaf5617204e17099df3e27d9bfa4e7939a'


def bind_source():
    membership_guard, _, _ = membership.bind_source()
    source = Path(os.environ.get('RATWOOD_PARTIAL_UI_SOURCE', membership.UI)).read_text()
    if source.count(CONFIRM + GUARD + CALL) == 1:
        guarded = True
        normalized = source.replace(CONFIRM + GUARD + CALL, CONFIRM + CALL, 1)
    elif source.count(CONFIRM + CALL) == 1:
        guarded = False
        normalized = source
    else:
        raise AssertionError('Unreviewed partial-confirmation guard/placement')
    if membership.sha(normalized) != BASE_UI_SHA:
        raise AssertionError('Unreviewed UI source, helpers, policy or confirmation flow')
    return guarded, membership_guard


@dataclass
class Access:
    topic: bool = True
    alderman: bool = False
    assembly: bool = True
    warrant: bool = False
    remaining: int = 0
    locked: bool = False
    receivership: bool = False

    def user_can_act(self):
        return (self.assembly and self.alderman) or self.topic

    def alderman_has_access(self):
        return self.assembly and self.alderman and self.warrant and self.remaining > 0

    def allowed(self):
        return self.user_can_act() and (not self.locked or self.alderman_has_access())


class PartialOrderAuthorization(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.guarded, cls.membership_guard = bind_source()

    def setUp(self):
        self.access = Access()
        self.order = membership.Order()
        self.world = membership.World(pool=[self.order])
        self.partial_calls = 0

    def begin_prompt(self):
        self.assertTrue(self.access.allowed(), 'Scenario must begin authorized')
        self.assertEqual(self.world.settle(self.order, False, self.membership_guard), membership.PROMPT)

    def resume(self, confirm='Yes'):
        if confirm != 'Yes':
            return False
        if self.guarded and not self.access.allowed():
            return False
        self.partial_calls += 1
        return self.world.settle(self.order, True, self.membership_guard)

    def state(self):
        return (self.world.stock, self.world.payout, self.world.fulfilled,
                self.world.scans, self.world.pool[:], self.order.fulfilled)

    def assert_rejected(self, before_call=True, confirm='Yes'):
        before = self.state()
        self.assertIs(self.resume(confirm), False)
        self.assertEqual(self.state(), before)
        self.assertEqual(self.partial_calls, 0 if before_call else 1)

    def assert_settled(self):
        self.assertEqual(self.resume(), {'status': 'partial', 'payout': 127})
        self.assertEqual(self.partial_calls, 1)
        self.assertEqual((self.world.stock, self.world.payout, self.world.fulfilled), (0, 127, 1))

    def remote_alderman(self):
        self.access = Access(topic=False, alderman=True, warrant=True, remaining=1, locked=True)

    def test_normal_user_key_lock_transition_rejects_before_second_call(self):
        self.begin_prompt()
        self.access.locked = True
        self.assert_rejected()

    def test_normal_user_topic_loss_rejects_before_second_call(self):
        self.begin_prompt()
        self.access.topic = False
        self.assert_rejected()

    def test_remote_alderman_role_loss_rejects(self):
        self.remote_alderman()
        self.begin_prompt()
        self.access.alderman = False
        self.assert_rejected()

    def test_locked_alderman_warrant_revocation_rejects(self):
        self.remote_alderman()
        self.begin_prompt()
        self.access.warrant = False
        self.assert_rejected()

    def test_locked_alderman_warrant_exhaustion_rejects(self):
        self.remote_alderman()
        self.begin_prompt()
        self.access.remaining = 0
        self.assert_rejected()

    def test_locked_alderman_assembly_loss_rejects(self):
        self.remote_alderman()
        self.begin_prompt()
        self.access.assembly = False
        self.assert_rejected()

    def test_unlocked_normal_user_valid_confirmation_preserved(self):
        self.begin_prompt()
        self.assert_settled()

    def test_locked_valid_warrant_alderman_preserved(self):
        self.remote_alderman()
        self.begin_prompt()
        self.assert_settled()

    def test_unlocked_alderman_without_warrant_preserved(self):
        self.access = Access(topic=False, alderman=True)
        self.begin_prompt()
        self.assert_settled()

    def test_unlock_with_warrant_revocation_preserves_entry_policy(self):
        self.remote_alderman()
        self.begin_prompt()
        self.access.locked = False
        self.access.warrant = False
        self.assert_settled()

    def test_role_loss_with_normal_topic_access_and_unlocked_preserved(self):
        self.remote_alderman()
        self.begin_prompt()
        self.access.alderman = False
        self.access.locked = False
        self.access.topic = True
        self.assert_settled()

    def test_sequestration_transition_does_not_block_fulfillment(self):
        self.begin_prompt()
        self.access.receivership = True
        self.assert_settled()

    def test_cancel_never_attempts_second_call(self):
        for answer in ('No', None):
            with self.subTest(answer=answer):
                self.setUp()
                self.begin_prompt()
                self.assert_rejected(confirm=answer)

    def test_current_pool_removal_still_rejects_in_economy(self):
        self.begin_prompt()
        self.world.pool.remove(self.order)
        self.assert_rejected(before_call=False)

    def test_already_fulfilled_still_rejects_in_economy(self):
        self.begin_prompt()
        self.order.fulfilled = True
        self.assert_rejected(before_call=False)

    def test_binding_rejects_any_other_source_change(self):
        # Hash pin is stronger than checking that policy snippets still exist.
        source = membership.UI.read_text()
        normalized = source.replace(CONFIRM + GUARD + CALL, CONFIRM + CALL, 1)
        self.assertNotEqual(membership.sha(normalized + '\n'), BASE_UI_SHA)


if __name__ == '__main__':
    unittest.main()
