"""Focused source contracts only: no DM execution or simulated timer claims.

Usage: python3 test_obsession_timer_contract.py --repo CHECKOUT [--source FILE]
--source selects a scratch candidate; otherwise checks checkout obsession.dm.
Dependency hashes deliberately fail closed when reviewed timer/lifecycle changes.
The source assertions establish scheduling/cleanup structure, not runtime timing,
BYOND compilation, timer subsystem scheduling, or in-game behavior.
"""
import argparse
import hashlib
from pathlib import Path
import re
import unittest

FLAGS = 'TIMER_UNIQUE | TIMER_OVERRIDE | TIMER_NO_HASH_WAIT'
COMPONENT = 'code/datums/components/obsession.dm'
BASELINE_HASH = 'b390cedf4273166657dfa4285ed17a288922805dbe813d9a4d64281300107502'
PINS = {'code/__DEFINES/subsystems.dm': '9a714b4234344d13128fb2eb67c4f209b2e1dad74d22e420a9f1cdf03f1e544f',
 'code/controllers/subsystem/timer.dm': 'eabc5a97116a56dde158299d289f3894170393e4d4d1bcefa5596e55e91cae49',
 'code/datums/components/_component.dm': 'f6cb32866b3498fa58bcf7f0faa3674723d4c75dfa1f9458faf59a1f761427e2',
 'code/datums/datum.dm': 'dc8dda5f2520977d09b5cda5510bf1c548d584bcdb798ab05e87927876517f1f',
 'code/modules/mob/living/death.dm': 'b623b727e9739da89692cea8f95635f77e5c0758ae6abca0d09d18bc98cdb9f2',
 'code/modules/vampire_neu/covens/coven_powers/eoran.dm': '7c32de4461ab785d402428c46c6378fba41c2fc65fb2fb99f9ba1668778c5df4'}
REPO = Path(__file__).resolve().parents[2]
SOURCE = None
PINS['code/modules/mob/living/carbon/human/death.dm'] = '6b091f7325e1874dad04043eead652548af99f5d004f57e39a984c974b68e33d'


def body(source, header):
    """Locate one top-level DM definition in these reviewed files, not a parser."""
    start = source.index(header + '\n') + len(header) + 1
    following = re.search(r'^/[^/*]', source[start:], re.M)
    return source[start:start + following.start()] if following else source[start:]


class ObsessionTimerContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = (SOURCE or REPO / COMPONENT).read_text()
        cls.timer = (REPO / 'code/controllers/subsystem/timer.dm').read_text()
        cls.init = body(cls.source, '/datum/component/empathic_obsession/Initialize(mob/living/carbon/human/target, duration)')
        cls.death = body(cls.source, '/datum/component/empathic_obsession/proc/on_target_death(mob/living/source)')

    def test_reviewed_dependencies_unchanged(self):
        for path, expected in PINS.items():
            with self.subTest(path=path):
                self.assertEqual(hashlib.sha256((REPO / path).read_bytes()).hexdigest(), expected)

    def test_only_two_flag_arguments_change(self):
        normalized = self.source.replace(', ' + FLAGS + ')', ')')
        self.assertEqual(hashlib.sha256(normalized.encode()).hexdigest(), BASELINE_HASH)

    def test_initial_expiry_joins_replaceable_identity(self):
        self.assertIn(f'addtimer(CALLBACK(src, PROC_REF(end_obsession)), duration, {FLAGS})', self.init)
        self.assertEqual(self.init.count('PROC_REF(end_obsession)'), 1)

    def test_target_death_replaces_initial_and_repeat_expiry(self):
        self.assertIn(f'addtimer(CALLBACK(src, PROC_REF(end_obsession)), obsession_duration, {FLAGS})', self.death)
        self.assertEqual(self.death.count('PROC_REF(end_obsession)'), 1)
        self.assertIn('RegisterSignal(obsession_target, COMSIG_LIVING_DEATH, PROC_REF(on_target_death))', self.init)
        self.assertIn('SEND_SIGNAL(src, COMSIG_LIVING_DEATH, gibbed)', (REPO / 'code/modules/mob/living/death.dm').read_text())

    def test_original_duration_semantics_preserved(self):
        self.assertIn('obsession_duration = duration', self.init)
        self.assertIn('// Extend obsession duration due to grief\n\tobsession_duration += 20 MINUTES', self.death)
        self.assertLess(self.death.index('obsession_duration += 20 MINUTES'), self.death.index('PROC_REF(end_obsession)'))
        self.assertIn('timeToRun = (flags & TIMER_CLIENT_TIME ? REALTIMEOFDAY : world.time) + wait', self.timer)

    def test_no_hash_wait_needed_for_different_delays(self):
        addtimer = body(self.timer, '/proc/_addtimer(datum/callback/callback, wait = 0, flags = 0, datum/controller/subsystem/timer/timer_subsystem, file, line)')
        self.assertIn('if(!(flags & TIMER_NO_HASH_WAIT))\n\t\t\thashlist += wait', addtimer)
        self.assertIn('var/list/hashlist = list(callback.object, "([REF(callback.object)])", callback.delegate, flags & TIMER_CLIENT_TIME)', addtimer)
        self.assertIn('hashlist += callback.arguments', addtimer)
        self.assertIn('if (flags & TIMER_OVERRIDE)\n\t\t\t\t\thash_timer.hash = null', addtimer)
        self.assertIn('qdel(hash_timer)', addtimer)
        for delay in ('duration', 'obsession_duration'):
            self.assertIn(f'PROC_REF(end_obsession)), {delay}, {FLAGS})', self.source)

    def test_ordinary_expiry_still_ends_component(self):
        end = body(self.source, '/datum/component/empathic_obsession/proc/end_obsession()')
        self.assertIn('STOP_PROCESSING(SSprocessing, src)\n\tqdel(src)', end)
        self.assertIn('callBack.InvokeAsync()', self.timer)
        self.assertNotIn('TIMER_LOOP', self.source)

    def test_component_deletion_cleans_timer_signals_and_processing(self):
        destroy = body(self.source, '/datum/component/empathic_obsession/Destroy()')
        self.assertIn('UnregisterSignal(obsession_target, list(COMSIG_LIVING_DEATH, COMSIG_LIVING_REVIVE))', destroy)
        self.assertIn('STOP_PROCESSING(SSprocessing, src)\n\treturn ..()', destroy)
        base = body((REPO / 'code/datums/components/_component.dm').read_text(), '/datum/component/Destroy(force=FALSE, silent=FALSE)')
        self.assertIn('parent = null\n\treturn ..()', base)
        datum = body((REPO / 'code/datums/datum.dm').read_text(), '/datum/proc/Destroy(force=FALSE, ...)')
        self.assertIn('var/list/timers = active_timers\n\tactive_timers = null', datum)
        self.assertIn('for(var/thing in timers)', datum)
        self.assertIn('qdel(timer)', datum)
        self.assertIn('LAZYADD(callBack.object.active_timers, src)', self.timer)
        timer_destroy = body(self.timer, '/datum/timedevent/Destroy()')
        self.assertIn('timer_subsystem.hashes -= hash', timer_destroy)
        self.assertIn('callBack.object.active_timers -= src', timer_destroy)
        self.assertIn('bucketEject()', timer_destroy)

    def test_parent_death_retains_early_teardown(self):
        parent_death = body(self.source, '/datum/component/empathic_obsession/proc/on_parent_death(mob/living/source)')
        self.assertIn('end_obsession()', parent_death)
        self.assertIn('RegisterSignal(parent, COMSIG_LIVING_DEATH, PROC_REF(on_parent_death))', self.init)

    def test_human_death_guard_prevents_unrevived_repeat_dispatch(self):
        self.assertIn('Initialize(mob/living/carbon/human/target, duration)', self.source)
        self.assertIn('if(!istype(target) || !istype(parent))', self.init)
        human_death = body((REPO / 'code/modules/mob/living/carbon/human/death.dm').read_text(), '/mob/living/carbon/human/death(gibbed, nocutscene = FALSE)')
        self.assertTrue(human_death.startswith('\tif(stat == DEAD)\n\t\treturn\n'))
        self.assertLess(human_death.index('if(stat == DEAD)'), human_death.index('. = ..()'))
        revive = body(self.source, '/datum/component/empathic_obsession/proc/on_target_revive(mob/living/source)')
        self.assertNotIn('end_obsession()', revive)
        self.assertNotIn('obsession_duration =', revive)
        self.assertNotIn('obsession_duration -=', revive)

    def test_highlander_recast_replaces_old_component_not_timer_identity(self):
        component = (REPO / 'code/datums/components/_component.dm').read_text()
        self.assertIn('var/dupe_mode = COMPONENT_DUPE_HIGHLANDER', component)
        self.assertNotIn('dupe_mode', self.source)
        self.assertNotIn('/datum/component/empathic_obsession/InheritComponent', self.source)
        self.assertIn('new_comp.InheritComponent(old_comp, FALSE)\n\t\t\t\t\t\tQDEL_NULL(old_comp)', component)
        inherit = body(component, '/datum/component/proc/InheritComponent(datum/component/C, i_am_original)')
        self.assertTrue(inherit.startswith('\treturn\n'))
        # Existing recast initializes a new duration and deletes the old component;
        # owned-timer cleanup and object-specific hash are asserted separately.
        self.assertIn('obsession_duration = duration', self.init)

    def test_live_power_callsites_keep_their_durations(self):
        eora = (REPO / 'code/modules/vampire_neu/covens/coven_powers/eoran.dm').read_text()
        self.assertIn('owner.AddComponent(/datum/component/empathic_obsession, victim, 2 MINUTES)', eora)
        self.assertIn('owner.AddComponent(/datum/component/empathic_obsession, patient, 5 MINUTES)', eora)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', default=REPO, type=Path)
    parser.add_argument('--source', type=Path)
    args, rest = parser.parse_known_args()
    REPO, SOURCE = args.repo, args.source
    unittest.main(argv=[__file__, *rest])
