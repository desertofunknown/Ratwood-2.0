"""Source-bound opt-in downstairs placement regression; never executes DM.

Run: python3 tools/ci/test_crafting_placement_recheck.py
Optional --source PATH reads a baseline/candidate crafting.dm without changing
the checkout. Baseline: 48f76e15. The entire construct_item body, minus only the
reviewed guard, is locked, including target selection, probability, consumption,
quality, output, and XP control flow. Unchanged ingredient helpers are locked too.

This is a bounded Python translation with inert wait, roll, resource, output and
XP spies, not a DM interpreter, live server test, or native geometry acceptance.
The tiny explicit graph supplies get_step/get_step_multiz results. It does not
claim to implement BYOND's map edges, multiz mapping, scheduling, object lifetime,
or interleavings after del_reqs. Preflight checks other than TurfCheck are supplied
as successful fixtures. Ingredient quantities and effects are spies, not execution
of the real selector, deletion, quality, constructors, or callbacks.

Only the wooden and stone downstairs recipes opt in: their checked direction is
also used by OnCrafted after the wait. Other checks must NOT be repeated globally;
spike_pit reads current facing for dirt but creates at the original frozen T.
"""

import argparse
from collections import Counter
from dataclasses import dataclass, field
from hashlib import sha256
import os
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
SOURCE = None
CRAFTING = 'code/datums/components/crafting/crafting.dm'
RECIPES = 'code/datums/components/crafting/recipes.dm'
STRUCTURE = 'code/modules/roguetown/roguecrafting/structure.dm'
STAIRS = 'code/game/objects/structures/stairs.dm'
CONSTRUCT = '/datum/component/personal_crafting/proc/construct_item(mob/user, datum/crafting_recipe/R)'
REPEAT = '/datum/component/personal_crafting/proc/construct_item_repeatable(mob/user, datum/crafting_recipe/R, amount = 1, auto)'
RECIPE = '/datum/crafting_recipe'
STRUCTURE_RECIPE = RECIPE + '/roguetown/structure/'
DO_AFTER = '/proc/do_after(mob/user, delay, needhand = TRUE, atom/target = null, progress = TRUE, datum/callback/extra_checks = null, same_direction = FALSE, no_interrupt = FALSE)'
BASE_SHA = '0feaa08b094c3d3f88b1e8857a43bf172036abff4cf0041bbacf00eb33c59e56'
DEFAULT = '\tvar/recheck_turf_after_delay = FALSE\n'
OPT_IN = '\trecheck_turf_after_delay = TRUE\n'
QUALITY = '\t\t\t\t\tvar/list/quality_capture = R.skip_quality ? list() : null\n'
GUARD = '''\t\t\t\t\tif(R.recheck_turf_after_delay && !R.TurfCheck(user, T))
\t\t\t\t\t\tto_chat(user, span_warning("I can't craft here."))
\t\t\t\t\t\treturn FALSE
'''
REPEAT_BODY = '''\twhile(amount > 0 || auto)
\t\tamount--
\t\tvar/result = construct_item(user, R)
\t\tif(!result)
\t\t\tbreak
'''
DOWNSTAIRS_CHECK = '''\tvar/turf/checking = get_step(T, user.dir)
\tif(!checking)
\t\treturn FALSE
\tif(!istype(checking,/turf/open/transparent/openspace))
\t\treturn FALSE
\tchecking = get_step_multiz(checking, DOWN)
\tif(!checking)
\t\treturn FALSE
\tif(!isopenturf(checking))
\t\treturn FALSE
\tif(istype(checking,/turf/open/transparent/openspace))
\t\treturn FALSE
\tfor(var/obj/structure/S in checking)
\t\tif(istype(S, /obj/structure/stairs))
\t\t\treturn FALSE
\t\tif(S.density)
\t\t\treturn FALSE
\treturn TRUE
'''
DECLARATIONS = {
    (RECIPES, RECIPE): '354b18d9c97d8f7f96415e57a78d4c32207fb73dd27bdaca9055883f51802338',
    (STRUCTURE, STRUCTURE_RECIPE + 'stairsd'): 'd3b5255b4ffef7b7fe42e4c8dfe4d02e96e690eadf0cc2b588163fedd1bd99e4',
    (STRUCTURE, STRUCTURE_RECIPE + 'stonestairsd'): 'ac2177866d9a4f259c1af0dbef6129cd3fda46e7cd80262d948eccf2c69a259b',
    (STRUCTURE, STRUCTURE_RECIPE + 'spike_pit'): '86c2610690281c93a6991565e0fe2bfc75d870ed5acae2a8ec1c0f4fa190ec7f',
}
BOUND = {
    (CRAFTING, '/datum/component/personal_crafting/proc/select_requirements(datum/crafting_recipe/R, list/contents)'):
        'dd3f582a55b42f7d5f88fc6619c82a201ddbd089b0cee9666f6ef53be0b80621',
    (CRAFTING, '/datum/component/personal_crafting/proc/del_reqs(datum/crafting_recipe/R, mob/user, list/quality_out = null)'):
        '958b1dc4c1c057053b716094e1a9e83668d9f1adc3fadd31c659880a81c310f2',
    ('code/__HELPERS/mobs.dm', DO_AFTER):
        'da014055a716470f17f44eea951ca0ec770d53e42d0b6d2b1be591a2789e4e91',
    ('code/modules/mapping/space_management/multiz_helpers.dm', '/proc/get_step_multiz(ref, dir)'):
        '1c6d232c1a1d147042e56646cee7f756175189f3d57302d27bcbbd1d9228152b',
    (STAIRS, '/obj/structure/stairs/d/OnCrafted(dirin, mob/user)'):
        '642b2a223057f980fe4d9e6b2a64a6caf228945c88145a0ec51f2b081c158397',
    (STAIRS, '/obj/structure/stairs/stone/d/OnCrafted(dirin, mob/user)'):
        '04056622e492318b554777825a28d1c19b9e3f485fbbaa7a01294704811d195b',
    (STRUCTURE, STRUCTURE_RECIPE + 'spike_pit/TurfCheck(mob/user, turf/T)'):
        '9e0fac872b264328c7bd2e3dbe0c4ce42ed359a75b782451d134caffbd959da2',
}


def active_source(source):
    # Locator only, not a general DM parser. Preserve quoted strings and tabs.
    pattern = r'''"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*.*?\*/'''
    return re.sub(pattern, lambda match: '\n' * match[0].count('\n')
                  if match[0].startswith(('//', '/*')) else match[0], source, flags=re.S)


def definition(source, header):
    matches = re.findall(r'^' + re.escape(header) + r'\n(.*?)(?=^/|\Z)',
                         active_source(source), re.M | re.S)
    if len(matches) != 1:
        raise AssertionError('Missing or duplicate active definition: ' + header)
    return '\n'.join(line.rstrip() for line in matches[0].splitlines() if line.strip()) + '\n'


def digest(value):
    return sha256(value.encode()).hexdigest()


def dm_sources():
    # Include modular_*, interface, maps, and future source directories, not
    # just code/. Do not traverse VCS, installed dependencies, or private tools.
    excluded = {'.git', '.aws', '.codex', '.agents', 'node_modules', '__pycache__'}
    for directory, children, files in os.walk(ROOT, followlinks=False):
        children[:] = [name for name in children if name not in excluded]
        for name in files:
            if name.endswith('.dm'):
                path = Path(directory) / name
                if not path.resolve().is_relative_to(ROOT):
                    raise AssertionError('DM source points outside the repository: ' + str(path))
                yield path


def bind_construct(body):
    fixed = GUARD in body
    baseline = body.replace(GUARD, '', 1) if fixed else body
    if digest(baseline) != BASE_SHA:
        raise AssertionError('Unreviewed construct_item control flow outside the exact guard')
    if fixed and body != baseline.replace(QUALITY, GUARD + QUALITY, 1):
        raise AssertionError('Placement guard must immediately precede quality capture/consumption')
    return fixed, baseline


@dataclass(frozen=True)
class RecipeFixture:
    kind: str
    recheck: bool
    ontile: bool
    units: int


def recipes_from_source():
    # Only three exact declarations are translated. All other policies remain
    # source contracts; this is not an implementation of DM type inheritance.
    result = []
    source = (ROOT / STRUCTURE).read_text()
    for kind, ontile, units in [('stairsd', True, 2), ('stonestairsd', True, 2),
                                ('spike_pit', False, 3)]:
        body = definition(source, STRUCTURE_RECIPE + kind)
        original = body.replace(OPT_IN, '', 1)
        if digest(original) != DECLARATIONS[(STRUCTURE, STRUCTURE_RECIPE + kind)]:
            raise AssertionError('Unreviewed recipe fixture: ' + kind)
        result.append(RecipeFixture(kind, OPT_IN in body, ontile, units))
    return result


@dataclass
class Turf:
    kind: str = 'floor'
    structures: list = field(default_factory=list)  # (type, density)
    machinery: list = field(default_factory=list)  # Deliberately not checked.


class GeometryFixture:
    """Explicit lookup graph; no claim of native map or multiz equivalence."""
    def __init__(self):
        self.turfs = {
            'origin': Turf(), 'below_origin': Turf(),
            'north_gap': Turf('openspace'), 'north_landing': Turf(),
            'south_gap': Turf('openspace'), 'south_landing': Turf('wall'),
            'east_floor': Turf(),
        }
        self.steps = {('origin', 'north'): 'north_gap', ('origin', 'south'): 'south_gap',
                      ('origin', 'east'): 'east_floor',
                      ('below_origin', 'north'): 'north_landing',
                      ('below_origin', 'south'): 'south_landing'}
        self.below = {'origin': 'below_origin', 'north_gap': 'north_landing',
                      'south_gap': 'south_landing'}

    def step(self, turf, direction):
        return self.steps.get((turf, direction))

    def is_open(self, turf):
        return turf in self.turfs and self.turfs[turf].kind != 'wall'

    def downstairs_check(self, target, direction):
        checking = self.step(target, direction)
        if not checking or self.turfs[checking].kind != 'openspace':
            return False
        checking = self.below.get(checking)
        if not checking or not self.is_open(checking):
            return False
        if self.turfs[checking].kind == 'openspace':
            return False
        return not any(kind == 'stairs' or dense for kind, dense
                       in self.turfs[checking].structures)


@dataclass
class Effects:
    trace: list = field(default_factory=list)
    checks: list = field(default_factory=list)
    inventory: int = 20
    quality: int = 0
    consumptions: list = field(default_factory=list)
    outputs: list = field(default_factory=list)
    crafted: list = field(default_factory=list)
    partners: list = field(default_factory=list)
    success_messages: int = 0
    logs: int = 0
    xp: int = 0
    warnings: list = field(default_factory=list)
    waits: int = 0
    rolls: int = 0
    calls: int = 0


class CraftModel:
    def __init__(self, body, recipe, geometry=None):
        self.fixed, _ = bind_construct(body)
        self.recipe = recipe
        self.geometry = geometry or GeometryFixture()
        self.location = 'origin'
        self.direction = 'north'
        self.effects = Effects()

    def turf_check(self, target):
        self.effects.checks.append((target, self.direction))
        self.effects.trace.append('TurfCheck')
        if self.recipe.kind == 'spike_pit':
            facing = self.geometry.step(self.location, self.direction)
            return (facing in self.geometry.turfs
                    and self.geometry.turfs[facing].kind == 'dirt'
                    and not any(kind == 'spike_pit' for kind, _
                                in self.geometry.turfs[target].structures))
        return self.geometry.downstairs_check(target, self.direction)

    def construct(self, during_wait=lambda model, attempt: None, rolls=(True,),
                  interrupted=False, resources=True, tools=True, allocation=True):
        e = self.effects
        e.calls += 1
        target = self.geometry.step(self.location, self.direction)
        if not self.geometry.is_open(target) or self.recipe.ontile:
            target = self.location
        if not self.turf_check(target):
            e.warnings.append("I can't craft here.")
            return None  # Existing initial check has a bare return.
        # Unmodeled wall/table/density/tool/material preflight is supplied valid.
        for attempt, rolled in enumerate(rolls):
            e.waits += 1
            e.trace.append('do_after')
            during_wait(self, attempt)
            if interrupted:
                return False
            e.trace.append('check_contents')
            if not resources:
                return False
            e.trace.append('check_tools')
            if not tools:
                return False
            e.rolls += 1
            e.trace.append('roll')
            if not rolled:
                continue
            if self.fixed and self.recipe.recheck and not self.turf_check(target):
                e.warnings.append("I can't craft here.")
                return False
            e.quality += 1
            e.trace.append('quality_capture')
            e.trace.append('del_reqs')
            if not allocation:
                e.warnings.append('The required ingredients are no longer available.')
                return False
            e.inventory -= self.recipe.units
            e.consumptions.append(self.recipe.units)
            e.outputs.append((self.recipe.kind, target))
            e.trace.append('output')
            e.crafted.append((target, self.direction))
            e.trace.append('OnCrafted')
            if self.recipe.ontile:
                partner = self.geometry.step(self.geometry.below.get(target), self.direction)
                if self.geometry.is_open(partner):
                    e.partners.append(partner)
            e.success_messages += 1
            e.logs += 1
            e.xp += 1  # Call spy, not an implementation of the XP formula.
            e.trace.extend(('success', 'log', 'xp'))
            return True
        return False

    def repeat(self, amount=1, auto=False, **kwargs):
        while amount > 0 or auto:
            amount -= 1
            if not self.construct(**kwargs):
                break


class CraftingPlacementRecheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (SOURCE or ROOT / CRAFTING).read_text()
        cls.body = definition(cls.source, CONSTRUCT)
        cls.fixed, cls.baseline = bind_construct(cls.body)
        cls.recipes = recipes_from_source()

    def assert_no_commit_effects(self, effects):
        self.assertEqual(effects.inventory, 20)
        self.assertEqual(effects.quality, 0)
        self.assertEqual(effects.consumptions, [])
        self.assertEqual(effects.outputs, [])
        self.assertEqual(effects.crafted, [])
        self.assertEqual(effects.partners, [])
        self.assertEqual((effects.success_messages, effects.logs, effects.xp), (0, 0, 0))

    def test_only_exact_guard_is_added_after_roll_before_consumption(self):
        self.assertTrue(self.fixed, 'Successful crafts must recheck opted-in placement')
        self.assertEqual(self.body, self.baseline.replace(QUALITY, GUARD + QUALITY, 1))
        self.assertLess(self.body.index('if(!prob(prob2craft))'), self.body.index(GUARD))
        self.assertLess(self.body.index(GUARD), self.body.index('del_reqs(R, user, quality_capture)'))
        self.assertEqual(definition(self.source, REPEAT), REPEAT_BODY)

    def test_default_false_and_only_two_reviewed_recipe_opt_ins(self):
        base = definition((ROOT / RECIPES).read_text(), RECIPE)
        self.assertEqual(base.count(DEFAULT), 1)
        self.assertEqual(digest(base.replace(DEFAULT, '', 1)), DECLARATIONS[(RECIPES, RECIPE)])
        self.assertEqual([r.recheck for r in self.recipes], [True, True, False])
        writes = []
        for path in dm_sources():
            # This inventory matches ASCII identifiers only. Latin-1 preserves
            # every byte in legacy non-UTF8 files; locked fixtures stay UTF-8.
            for line in active_source(path.read_text(encoding='latin-1')).splitlines():
                if re.search(r'\b(?:var/)?recheck_turf_after_delay\s*=', line):
                    writes.append((path.relative_to(ROOT).as_posix(), line.strip()))
        self.assertEqual(Counter(writes), Counter([
            (RECIPES, DEFAULT.strip()), (STRUCTURE, OPT_IN.strip()), (STRUCTURE, OPT_IN.strip())]))

    def test_actual_helpers_resource_logic_and_callback_bodies_remain_bound(self):
        for (path, header), expected in BOUND.items():
            with self.subTest(path=path, header=header):
                source = self.source if path == CRAFTING else (ROOT / path).read_text()
                self.assertEqual(digest(definition(source, header)), expected)
        for recipe in self.recipes[:2]:
            self.assertEqual(definition((ROOT / STRUCTURE).read_text(),
                                       STRUCTURE_RECIPE + recipe.kind + '/TurfCheck(mob/user, turf/T)'),
                             DOWNSTAIRS_CHECK)
        self.assertEqual(definition(self.source, RECIPE + '/proc/TurfCheck(mob/user, turf/T)'),
                         '\treturn TRUE\n')
        self.assertIn('if(do_after(user, time2use, target = user))', self.body)
        wait = definition((ROOT / 'code/__HELPERS/mobs.dm').read_text(), DO_AFTER)
        self.assertIn('(same_direction && user.dir != original_dir)', wait)

    def test_turn_to_invalid_landing_has_no_consumption_output_or_xp(self):
        for recipe in self.recipes[:2]:
            with self.subTest(recipe=recipe.kind):
                model = CraftModel(self.body, recipe)
                self.assertIs(model.construct(lambda m, _: setattr(m, 'direction', 'south')), False)
                self.assertEqual(model.effects.checks, [('origin', 'north'), ('origin', 'south')])
                self.assertEqual(model.effects.warnings, ["I can't craft here."])
                self.assert_no_commit_effects(model.effects)

    def test_obstruction_introduced_during_wait_is_rejected(self):
        for recipe in self.recipes[:2]:
            for obstacle in [('stairs', False), ('wall_fixture', True)]:
                with self.subTest(recipe=recipe.kind, obstacle=obstacle):
                    model = CraftModel(self.body, recipe)
                    result = model.construct(lambda m, _: m.geometry.turfs['north_landing'].structures.append(obstacle))
                    self.assertIs(result, False)
                    self.assertEqual(model.effects.checks, [('origin', 'north')] * 2)
                    self.assert_no_commit_effects(model.effects)

    def test_landing_disappears_or_changes_turf_during_wait(self):
        changes = [lambda g: g.below.pop('north_gap'),
                   lambda g: setattr(g.turfs['north_landing'], 'kind', 'wall'),
                   lambda g: setattr(g.turfs['north_landing'], 'kind', 'openspace'),
                   lambda g: setattr(g.turfs['north_gap'], 'kind', 'floor')]
        for recipe in self.recipes[:2]:
            for change in changes:
                with self.subTest(recipe=recipe.kind, change=change):
                    model = CraftModel(self.body, recipe)
                    self.assertIs(model.construct(lambda m, _: change(m.geometry)), False)
                    self.assert_no_commit_effects(model.effects)

    def test_unchanged_valid_downstairs_preserve_success_order_and_cost(self):
        for recipe in self.recipes[:2]:
            model = CraftModel(self.body, recipe)
            self.assertIs(model.construct(), True)
            self.assertEqual(model.effects.checks, [('origin', 'north')] * 2)
            self.assertEqual(model.effects.inventory, 18)
            self.assertEqual(model.effects.consumptions, [2])
            self.assertEqual(model.effects.outputs, [(recipe.kind, 'origin')])
            self.assertEqual(model.effects.crafted, [('origin', 'north')])
            self.assertEqual(model.effects.partners, ['north_landing'])
            self.assertEqual((model.effects.success_messages, model.effects.logs, model.effects.xp), (1, 1, 1))
            self.assertEqual(model.effects.trace, ['TurfCheck', 'do_after', 'check_contents', 'check_tools',
                                                 'roll', 'TurfCheck', 'quality_capture', 'del_reqs',
                                                 'output', 'OnCrafted', 'success', 'log', 'xp'])

    def test_turn_to_another_valid_landing_is_allowed_with_original_target(self):
        for recipe in self.recipes[:2]:
            model = CraftModel(self.body, recipe)
            model.geometry.turfs['south_landing'].kind = 'floor'
            self.assertIs(model.construct(lambda m, _: setattr(m, 'direction', 'south')), True)
            self.assertEqual(model.effects.outputs, [(recipe.kind, 'origin')])
            self.assertEqual(model.effects.crafted, [('origin', 'south')])
            self.assertEqual(model.effects.partners, ['south_landing'])

    def test_existing_nondense_structure_and_machinery_policy_is_not_expanded(self):
        for recipe in self.recipes[:2]:
            model = CraftModel(self.body, recipe)
            model.geometry.turfs['north_landing'].structures.append(('decoration', False))
            model.geometry.turfs['north_landing'].machinery.append(('machine', True))
            self.assertIs(model.construct(), True)

    def test_spike_pit_turn_keeps_original_target_and_is_not_rechecked(self):
        model = CraftModel(self.body, self.recipes[2])
        model.geometry.turfs['north_gap'].kind = 'dirt'
        self.assertIs(model.construct(lambda m, _: setattr(m, 'direction', 'east')), True)
        self.assertEqual(model.effects.checks, [('north_gap', 'north')])
        self.assertEqual(model.effects.outputs, [('spike_pit', 'north_gap')])
        self.assertEqual(model.effects.inventory, 17)
        self.assertEqual(model.effects.warnings, [])

    def test_interrupted_missing_resources_or_tools_stop_before_recheck(self):
        for recipe in self.recipes[:2]:
            for failure in [{'interrupted': True}, {'resources': False}, {'tools': False}]:
                with self.subTest(recipe=recipe.kind, failure=failure):
                    model = CraftModel(self.body, recipe)
                    self.assertIs(model.construct(**failure), False)
                    self.assertEqual(model.effects.checks, [('origin', 'north')])
                    self.assertEqual(model.effects.rolls, 0)
                    self.assert_no_commit_effects(model.effects)

    def test_failed_roll_retries_without_placement_check_then_checks_success(self):
        for recipe in self.recipes[:2]:
            model = CraftModel(self.body, recipe)
            self.assertIs(model.construct(lambda m, _: setattr(m, 'direction', 'south'), rolls=(False, True)), False)
            self.assertEqual((model.effects.waits, model.effects.rolls), (2, 2))
            self.assertEqual(model.effects.checks, [('origin', 'north'), ('origin', 'south')])
            self.assert_no_commit_effects(model.effects)

    def test_initial_invalid_placement_never_waits_or_rolls(self):
        for recipe in self.recipes[:2]:
            model = CraftModel(self.body, recipe)
            model.direction = 'south'
            self.assertIsNone(model.construct())
            self.assertEqual((model.effects.waits, model.effects.rolls), (0, 0))
            self.assert_no_commit_effects(model.effects)

    def test_allocation_rejection_after_valid_recheck_still_prevents_outputs(self):
        for recipe in self.recipes[:2]:
            model = CraftModel(self.body, recipe)
            self.assertIs(model.construct(allocation=False), False)
            self.assertEqual(model.effects.inventory, 20)
            self.assertEqual(model.effects.outputs, [])
            self.assertEqual(model.effects.xp, 0)
            self.assertEqual(model.effects.warnings, ['The required ingredients are no longer available.'])

    def test_finite_and_auto_repeat_stop_on_first_placement_failure(self):
        for recipe in self.recipes[:2]:
            for amount, auto in [(5, False), (1, True), (0, True)]:
                with self.subTest(recipe=recipe.kind, amount=amount, auto=auto):
                    model = CraftModel(self.body, recipe)
                    model.repeat(amount, auto, during_wait=lambda m, _: setattr(m, 'direction', 'south'))
                    self.assertEqual(model.effects.calls, 1)
                    self.assertEqual(model.effects.waits, 1)
                    self.assert_no_commit_effects(model.effects)

    def test_historical_source_reproduces_consumption_and_success_without_partner(self):
        for recipe in self.recipes[:2]:
            model = CraftModel(self.baseline, recipe)
            self.assertIs(model.construct(lambda m, _: setattr(m, 'direction', 'south')), True)
            self.assertEqual(model.effects.checks, [('origin', 'north')])
            self.assertEqual(model.effects.consumptions, [2])
            self.assertEqual(model.effects.outputs, [(recipe.kind, 'origin')])
            self.assertEqual(model.effects.partners, [])
            self.assertEqual((model.effects.success_messages, model.effects.logs, model.effects.xp), (1, 1, 1))

    def test_source_binding_rejects_misplaced_broad_or_mutated_guards(self):
        fixed = self.baseline.replace(QUALITY, GUARD + QUALITY, 1)
        mutations = [fixed.replace('R.recheck_turf_after_delay && ', ''),
                     fixed.replace(GUARD + QUALITY, QUALITY + GUARD),
                     fixed.replace('prob2craft = 25', 'prob2craft = 50'),
                     fixed.replace('amt2raise = L.STAINT * 2', 'amt2raise = L.STAINT * 3'),
                     fixed.replace('del_reqs(R, user, quality_capture)', 'del_reqs(R, user, null)'),
                     fixed.replace(GUARD, GUARD.replace('return FALSE', 'continue')),
                     fixed.replace(GUARD, '// ' + GUARD), fixed + '\treturn TRUE\n']
        for body in mutations:
            with self.subTest(body=body):
                with self.assertRaises(AssertionError):
                    bind_construct(body)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument('--source', type=Path)
    args, remaining = parser.parse_known_args()
    SOURCE = args.source
    unittest.main(argv=[__file__, *remaining])
