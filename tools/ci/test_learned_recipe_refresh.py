"""Source-bound learned-recipe refresh model; never executes DM or the game.

Run: python3 tools/ci/test_learned_recipe_refresh.py
Only the exact original or reviewed mind-helper bodies are accepted. The model
checks membership-change notification, cache invalidation and existing-UI-only
refresh routing. Full updates use successful/imposed-deferred delivery fixtures,
not executed client guards, engine cooldowns or timers. Recipe list operators,
transport and rendering are not a DM
interpreter or native-client acceptance. Null/scalar/list operands are forwarded
unchanged to an operator spy; fixture results specify the resulting membership
rather than claiming Python reproduces every DM list/association rule.
"""
from dataclasses import dataclass, field
from hashlib import sha256
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
CRAFTING = ROOT / 'code/datums/components/crafting/crafting.dm'
EXTERNAL = ROOT / 'code/modules/tgui/external.dm'
WONDERS = ROOT / 'code/modules/antagonists/roguetown/villain/maniac/maniac_wonders.dm'
TEACH = '/datum/mind/proc/teach_crafting_recipe(R)'
FORGET = '/datum/mind/proc/forget_crafting_recipe(R)'
UPDATE = '/datum/proc/update_static_data(mob/user, datum/tgui/ui)'
FIRST = '/datum/crafting_recipe/roguetown/structure/wonder/first'
SECOND = '/datum/crafting_recipe/roguetown/structure/wonder/second'
LEGACY_TEACH = '''\tif(!learned_recipes)
\t\tlearned_recipes = list()
\tlearned_recipes |= R
'''
LEGACY_FORGET = '''\tif(!learned_recipes)
\t\treturn
\tlearned_recipes -= R
'''
REFRESH = '''\tif(length(learned_recipes) != old_recipe_count)
\t\tvar/datum/component/personal_crafting/crafting = current?.craftingthing
\t\tif(crafting)
\t\t\tcrafting.craftability_next_update = 0
\t\t\tcrafting.update_static_data(current)
'''
COUNT = '\tvar/old_recipe_count = length(learned_recipes)\n'
FIXED_TEACH = LEGACY_TEACH.replace('\tlearned_recipes |= R\n', COUNT + '\tlearned_recipes |= R\n') + REFRESH
FIXED_FORGET = LEGACY_FORGET.replace('\tlearned_recipes -= R\n', COUNT + '\tlearned_recipes -= R\n') + REFRESH
UPDATE_BODY = '''\tif(!ui)
\t\tui = SStgui.get_open_ui(user, src)
\tif(ui)
\t\tui.send_full_update()
'''
BOUND = {
    ('code/modules/antagonists/roguetown/villain/maniac/maniac_wonders.dm',
     '/obj/structure/wonder/OnCrafted(dirin, mob/user)'):
        '341306ac162017692eebf8eb09da3674001d86883290e15e2018960d45829eb8',
    ('code/datums/components/crafting/crafting.dm',
     '/datum/component/personal_crafting/ui_static_data(mob/user)'):
        '3cda7b7d61c75cdec7d6b7711bf331b9d63eee356e2dc040178884cda02d6ab4',
    ('code/modules/tgui/tgui.dm', '/datum/tgui/proc/send_full_update(custom_data, force)'):
        'e79b0827157eb365a101ce8a372b9a8b245c12b81f93087f81d4248c8bdb0c3b',
}


def active_source(source):
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda match: '\n' * match[0].count('\n')
                  if match[0].startswith(('//', '/*')) else match[0], source, flags=re.S)


def definition(source, header):
    signature = r'^' + re.escape(header) + r'\n'
    if len(re.findall(signature, active_source(source), re.M)) != 1:
        raise AssertionError('Missing or duplicate active definition: ' + header)
    matches = re.findall(signature + r'(.*?)(?=^/|\Z)', source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing or duplicate raw definition: ' + header)
    return matches[0].rstrip('\n') + '\n'


def helper_mode(body, operation):
    original, fixed = ((LEGACY_TEACH, FIXED_TEACH) if operation == 'teach'
                       else (LEGACY_FORGET, FIXED_FORGET))
    if body == original:
        return 'legacy'
    if body == fixed:
        return 'refresh'
    raise AssertionError('Unreviewed learned-recipe helper control flow')


@dataclass
class CraftingSpy:
    next_update: int = 110
    open_ui: bool = True
    catalog: list = field(default_factory=lambda: [FIRST])
    craftability: list = field(default_factory=lambda: [FIRST])
    trace: list = field(default_factory=list)
    full_updates: int = 0
    ui_creations: int = 0
    defer_full_update: bool = False
    deliveries: int = 0

    def update_static_data(self, current, learned):
        # The supported API body is checked separately against UPDATE_BODY.
        self.trace.append(('get_open_ui', current, self))
        if self.open_ui:
            self.trace.append('send_full_update')
            # Count calls, not completed transport: the real full-update API
            # retains its own client/initialized/closing and cooldown guards.
            self.full_updates += 1
            if not self.defer_full_update:
                self.deliver(learned)

    def deliver(self, learned):
        # Explicit success fixture, not an engine timer implementation. A later
        # delivery must query current learned membership, not a queued snapshot.
        self.deliveries += 1
        self.catalog = list(learned)
        # Every recipe here is learned-only; ingredients are always-true spies.
        if 100 >= self.next_update:
            self.craftability = list(learned)
            self.next_update = 110


@dataclass
class MobSpy:
    craftingthing: object = None


@dataclass
class MindSpy:
    learned: object = None
    current: object = None
    operator_calls: list = field(default_factory=list)


def mutate(body, operation, mind, operand, result):
    """Translate only the reviewed helper; list mutation is an injected spy."""
    mode = helper_mode(body, operation)
    if mind.learned is None:
        if operation == 'forget':
            return
        mind.learned = []
    before = len(mind.learned)
    mind.operator_calls.append((operation, operand))
    mind.learned = list(result)
    if mode == 'refresh' and len(mind.learned) != before:
        crafting = mind.current.craftingthing if mind.current is not None else None
        if crafting is not None:
            crafting.trace.append('invalidate')
            crafting.next_update = 0
            crafting.update_static_data(mind.current, mind.learned)


class LearnedRecipeRefreshTests(unittest.TestCase):
    def setUp(self):
        self.source = CRAFTING.read_text()
        self.teach = definition(self.source, TEACH)
        self.forget = definition(self.source, FORGET)

    def test_actual_helpers_add_only_count_guard_and_refresh(self):
        for actual, original, fixed in [(self.teach, LEGACY_TEACH, FIXED_TEACH),
                                        (self.forget, LEGACY_FORGET, FIXED_FORGET)]:
            self.assertEqual(actual, fixed)
            self.assertEqual(actual.replace(COUNT, '', 1).replace(REFRESH, '', 1), original)

    def test_supported_api_only_refreshes_existing_ui_and_current_owns_component(self):
        self.assertEqual(definition(EXTERNAL.read_text(), UPDATE), UPDATE_BODY)
        self.assertIn('\tvar/mob/living/current\n', (ROOT / 'code/datums/mind.dm').read_text())
        initialize = active_source(definition(self.source, '/datum/component/personal_crafting/Initialize()'))
        self.assertIn('\tvar/mob/living/L = parent\n\tL.craftingthing = src\n', initialize)
        self.assertIn('\tvar/datum/component/personal_crafting/craftingthing\n',
                      (ROOT / 'code/modules/mob/living/living_defines.dm').read_text())

    def test_actual_wonder_caller_and_catalog_transport_are_bound(self):
        for (path, header), expected in BOUND.items():
            self.assertEqual(sha256(definition((ROOT / path).read_text(), header).encode()).hexdigest(), expected)
        wonder = definition(WONDERS.read_text(), '/obj/structure/wonder/OnCrafted(dirin, mob/user)')
        self.assertLess(wonder.index('forget_crafting_recipe('), wonder.index('teach_crafting_recipe('))
        self.assertIn('\talways_availible = FALSE\n', definition(WONDERS.read_text(), FIRST.rsplit('/', 1)[0]))
        self.assertIn(FIRST + '\n', WONDERS.read_text())
        self.assertIn(SECOND + '\n', WONDERS.read_text())
        construct = definition(active_source(self.source), '/datum/component/personal_crafting/proc/construct_item(mob/user, datum/crafting_recipe/R)')
        self.assertIn('I.OnCrafted(user.dir, user)', construct)
        dynamic = definition(self.source, '/datum/component/personal_crafting/ui_data(mob/user)')
        self.assertIn('\tif(world.time >= craftability_next_update)\n', dynamic)
        self.assertIn('if(!R.always_availible && !(R.type in user?.mind?.learned_recipes))', dynamic)

    def test_gained_recipe_refreshes_catalog_and_invalidates_cache_first(self):
        crafting = CraftingSpy()
        mind = MindSpy([FIRST], MobSpy(crafting))
        mutate(self.teach, 'teach', mind, SECOND, [FIRST, SECOND])
        self.assertEqual(crafting.catalog, [FIRST, SECOND])
        self.assertEqual(crafting.craftability, [FIRST, SECOND])
        self.assertEqual(crafting.full_updates, 1)
        self.assertEqual(crafting.trace[0], 'invalidate')
        self.assertEqual(crafting.trace[1], ('get_open_ui', mind.current, crafting))

    def test_lost_recipe_is_removed_from_catalog_and_craftability(self):
        crafting = CraftingSpy()
        mind = MindSpy([FIRST], MobSpy(crafting))
        mutate(self.forget, 'forget', mind, FIRST, [])
        self.assertEqual((crafting.catalog, crafting.craftability), ([], []))
        self.assertEqual(crafting.full_updates, 1)

    def test_wonder_progression_replaces_first_with_second(self):
        crafting = CraftingSpy()
        mind = MindSpy([FIRST], MobSpy(crafting))
        mutate(self.forget, 'forget', mind, FIRST, [])
        self.assertEqual(crafting.catalog, [])  # Intermediate state is allowed.
        crafting.defer_full_update = True
        mutate(self.teach, 'teach', mind, SECOND, [SECOND])
        self.assertEqual(crafting.catalog, [])  # No claim of atomic delivery.
        self.assertEqual(crafting.full_updates, 2)
        self.assertEqual(crafting.deliveries, 1)
        crafting.deliver(mind.learned)  # Model a later successful full update.
        self.assertEqual((mind.learned, crafting.catalog, crafting.craftability), ([SECOND], [SECOND], [SECOND]))

    def test_duplicate_teach_and_absent_forget_do_not_refresh(self):
        for body, operation, operand in [(self.teach, 'teach', FIRST), (self.forget, 'forget', SECOND)]:
            crafting = CraftingSpy()
            mind = MindSpy([FIRST], MobSpy(crafting))
            mutate(body, operation, mind, operand, [FIRST])
            self.assertEqual(crafting.trace, [])
            self.assertEqual(crafting.next_update, 110)
            self.assertEqual(mind.operator_calls, [(operation, operand)])

    def test_missing_current_or_component_keeps_membership_change(self):
        for current in (None, MobSpy()):
            mind = MindSpy([FIRST], current)
            mutate(self.teach, 'teach', mind, SECOND, [FIRST, SECOND])
            self.assertEqual(mind.learned, [FIRST, SECOND])
            mutate(self.forget, 'forget', mind, FIRST, [SECOND])
            self.assertEqual(mind.learned, [SECOND])

    def test_closed_ui_invalidates_without_opening_a_window(self):
        crafting = CraftingSpy(open_ui=False)
        mind = MindSpy([FIRST], MobSpy(crafting))
        mutate(self.teach, 'teach', mind, SECOND, [FIRST, SECOND])
        self.assertEqual(crafting.next_update, 0)
        self.assertEqual((crafting.full_updates, crafting.ui_creations), (0, 0))
        self.assertEqual(crafting.trace, ['invalidate', ('get_open_ui', mind.current, crafting)])

    def test_null_learned_list_initializes_for_teach_but_forget_stays_noop(self):
        mind = MindSpy(None, MobSpy(CraftingSpy(catalog=[], craftability=[])))
        mutate(self.forget, 'forget', mind, FIRST, [])
        self.assertIsNone(mind.learned)
        self.assertEqual(mind.operator_calls, [])
        mutate(self.teach, 'teach', mind, FIRST, [FIRST])
        self.assertEqual(mind.learned, [FIRST])
        self.assertEqual(mind.current.craftingthing.full_updates, 1)

    def test_original_null_scalar_and_list_operands_are_forwarded_unchanged(self):
        # Inject both changed and unchanged results for every operand shape.
        # This asserts refresh depends only on the original operator's outcome.
        for body, operation in [(self.teach, 'teach'), (self.forget, 'forget')]:
            for operand in (None, FIRST, [], [FIRST, SECOND]):
                for result in ([FIRST], [FIRST, SECOND] if operation == 'teach' else []):
                    crafting = CraftingSpy()
                    mind = MindSpy([FIRST], MobSpy(crafting))
                    mutate(body, operation, mind, operand, result)
                    self.assertIs(mind.operator_calls[0][1], operand)
                    self.assertEqual(mind.learned, result)
                    self.assertEqual(crafting.full_updates, int(len(result) != 1))

    def test_list_argument_membership_change_triggers_one_refresh(self):
        crafting = CraftingSpy()
        mind = MindSpy([], MobSpy(crafting))
        operand = [FIRST, SECOND]
        mutate(self.teach, 'teach', mind, operand, operand)
        self.assertEqual(crafting.full_updates, 1)
        mutate(self.forget, 'forget', mind, operand, [])
        self.assertEqual(crafting.full_updates, 2)

    def test_historical_helpers_leave_open_catalog_stale(self):
        crafting = CraftingSpy()
        mind = MindSpy([FIRST], MobSpy(crafting))
        mutate(LEGACY_FORGET, 'forget', mind, FIRST, [])
        mutate(LEGACY_TEACH, 'teach', mind, SECOND, [SECOND])
        self.assertEqual(mind.learned, [SECOND])
        self.assertEqual(crafting.catalog, [FIRST])
        self.assertEqual(crafting.trace, [])

    def test_unreviewed_flow_is_rejected(self):
        for body, operation in [(self.teach, 'teach'), (self.forget, 'forget')]:
            with self.assertRaisesRegex(AssertionError, 'Unreviewed'):
                helper_mode(body + '\tunexpected_side_effect()\n', operation)


if __name__ == '__main__':
    unittest.main()
