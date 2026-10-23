"""Source-bound Path of Order abort regression; no DM runtime/combat execution.

Run: python3 tools/ci/test_path_order_abort.py
Fix attributed to CentralSmith, upstream commit
311798db5f9766c98a37d9802ac73f391f396419:
https://github.com/Rotwood-Vale/Ratwood-2.0/pull/3129
Merged 2026-10-22. Only its three abort hunks are adopted.

This bounded Python model accepts only exact reviewed source bodies. It models
choice/return, spell-list mutations and the successful perform/after_cast gate,
not BYOND alert scheduling, signals, combat, devotion internals or live gameplay.
Recharge start is a call spy: timing, recalculation and subsequent processing are
not simulated. Only revert_cast's explicit counter reset for recharge-type spells
is represented as ready; success does not imply a particular charge-counter state.
Before-cast, attack logging, invisibility and parent signal/stat effects still
happen on abort. Reverting also changes recharge/attack/light state; cancellation
is NOT effect-free. Models assume an eligible human caster with a mind/devotion and recharge charge_type.
"""
from dataclasses import dataclass, field
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
ASTRATA = 'code/modules/spells/roguetown/acolyte/astrata.dm'
SPELL = 'code/modules/spells/spell.dm'
PATRON = 'code/datums/gods/patrons/divine/astrata.dm'
GRANTS = 'code/controllers/subsystem/rogue/miscprocs.dm'
HEADER = '/obj/effect/proc_holder/spell/self/astratan_path/cast(list/targets, mob/user)'
LANCE = '/obj/effect/proc_holder/spell/invoked/projectile/lightningbolt/sacred_flame_rogue'
SPEAR = '/obj/effect/proc_holder/spell/self/astratan_spear'
LEGACY = r"""	. = ..()
	var/choice = alert(user, "YOUR MARTIAL ARM, M'LORD?", "TAKE UP STRENGTH", "Lance", "Spear")
	switch(choice)
		if("Lance")
			if(user.mind?.has_spell(/obj/effect/proc_holder/spell/invoked/projectile/lightningbolt/sacred_flame_rogue))//No stacking.
				revert_cast()
			else
				user.mind?.AddSpell(new /obj/effect/proc_holder/spell/invoked/projectile/lightningbolt/sacred_flame_rogue)
				if(user.mind?.has_spell(/obj/effect/proc_holder/spell/self/astratan_spear))//No, thanks.
					user.mind?.RemoveSpell(/obj/effect/proc_holder/spell/self/astratan_spear)
		if("Spear")
			if(user.mind?.has_spell(/obj/effect/proc_holder/spell/self/astratan_spear))//No stacking. Again. As funny as a dozen of these were.
				revert_cast()
			else
				user.mind?.AddSpell(new /obj/effect/proc_holder/spell/self/astratan_spear)
				if(user.mind?.has_spell(/obj/effect/proc_holder/spell/invoked/projectile/lightningbolt/sacred_flame_rogue))//Nope.
					user.mind?.RemoveSpell(/obj/effect/proc_holder/spell/invoked/projectile/lightningbolt/sacred_flame_rogue)
		else
			revert_cast()
"""
FIXED = re.sub(r"(?m)^(\t+)revert_cast\(\)$", r"\1revert_cast(user)\n\1return FALSE", LEGACY)
BASELINE_FILE_SHA256 = '12e02e2ee76c5a9185c2bedc42ba22f1db95ca5d3b0a281b8731d87f81705739'
PERFORM = r"""	if(!ignore_los)
		if(length(targets))
			var/radius
			if(range > 0)	//accounts for touch / self spells that use negative range
				radius = range
			else
				radius = 1
			if(get_dist(targets[1], user) > radius)
				to_chat(user, span_warning("It's too far!"))
				revert_cast()
				return
			var/atom/A = targets[1]
			var/turf/target_turf = get_turf(A)
			var/turf/source_turf = get_turf(user)
			if(A.z > user.z)
				source_turf = get_step_multiz(source_turf, UP)
			if(A.z < user.z)
				source_turf = get_step_multiz(source_turf, DOWN)
			if(!(target_turf in view(source_turf)))
				to_chat(user, span_warning("I do not have line of sight! Casting on nearest tile."))
				var/list/possible_targets = getline(source_turf, target_turf)
				for(var/i = possible_targets.len; i > 0; i--) // Since turfs added by the getline are in ordered by distance, we need to start from the end
					var/atom/closest_tile = possible_targets[i]
					if(closest_tile in view(source_turf))
						targets[1] = closest_tile
						break; // Found furthest tile, do not self-frag

	before_cast(targets, user = user)
	if(user && user.ckey)
		user.log_message("cast the spell [name].", LOG_ATTACK, color = "red")
	if(breaks_invisibility)
		user.break_invisibility()
	if(cast(targets, user = user))
		invocation(user)
		start_recharge()
		if(sound)
			playMagSound()
		after_cast(targets, user = user)
		if(isliving(user))
			var/mob/living/L = user
			// Apply stamina drain — the on_mmb path is never reached due to check_click_intercept consuming the click first
			if(releasedrain > 0)
				var/fatigue = calculate_fatigue_drain(L)
				if(fatigue > 0)
					L.stamina_add(fatigue)
			if(L.has_status_effect(/datum/status_effect/buff/clash))
				var/mob/living/carbon/human/H = user
				H.bad_guard(span_warning("I can't focus while casting spells!"), cheesy = TRUE)
		if(action)
			action.UpdateButtonIcon()
		return TRUE
	return FALSE
"""
PARENT = r"""	SEND_SIGNAL(user, COMSIG_MOB_CAST_SPELL)
	record_featured_object_stat(FEATURED_STATS_SPELLS, name)
	return TRUE
"""
AFTER = r"""	user.stop_attack() // Clear lingering spell effects after it is successfully cast
	for(var/atom/target in targets)
		var/location
		if(isliving(target))
			location = target.loc
		else if(isturf(target))
			location = target
		if(isliving(target) && message)
			to_chat(target, text("[message]"))
		if(sparks_spread)
			do_sparks(sparks_amt, FALSE, location)
		if(smoke_spread)
			if(smoke_spread == 1)
				var/datum/effect_system/smoke_spread/smoke = new
				smoke.set_up(smoke_amt, location)
				smoke.start()
			else if(smoke_spread == 2)
				var/datum/effect_system/smoke_spread/bad/smoke = new
				smoke.set_up(smoke_amt, location)
				smoke.start()
			else if(smoke_spread == 3)
				var/datum/effect_system/smoke_spread/sleeping/smoke = new
				smoke.set_up(smoke_amt, location)
				smoke.start()
	if(devotion_cost && ishuman(user))
		var/mob/living/carbon/human/devotee = user
		devotee.devotion?.update_devotion(-devotion_cost)
		to_chat(devotee, "<font color='purple'>I [devotion_cost > 0 ? "lost" : "gained"] [abs(devotion_cost)] devotion.</font>")

	if(user.mmb_intent && user.mmb_intent.mob_light)
		QDEL_NULL(user.mmb_intent.mob_light)
	START_PROCESSING(SSfastprocess, src) // ensure we always end up reprocessing after casting
"""
REVERT = r"""	user.stop_attack()
	start_recharge()
	switch(charge_type)
		if("recharge")
			charge_counter = recharge_time
		if("charges")
			charge_counter++
		if("holdervar")
			adjust_var(user, holder_var_type, -holder_var_amount)
	START_PROCESSING(SSfastprocess, src)
	if(action?.button)
		action.button.update_maptext(0)
		action.UpdateButtonIcon()
	if(user.mmb_intent && user.mmb_intent.mob_light)
		QDEL_NULL(user.mmb_intent.mob_light)
"""
GRANT_BODY = r"""	if(!holder?.mind || !patron)
		return FALSE
	if(_is_clergy_radical(holder))
		return FALSE
	if(suppress_grants)
		return FALSE
	if(patron)
		if(length(patron.miracles))
			for(var/spell_type in patron.miracles)
				var/required_tier = patron.miracles[spell_type]
				if(required_tier <= level)
					if(holder.mind.has_spell(spell_type))
						continue

					var/obj/effect/proc_holder/spell/newspell = new spell_type
					if(istype(patron, /datum/patron/divine/xylix) && newspell.miracle)
						newspell.mute_allowed = TRUE
					if(!silent)
						to_chat(holder, span_boldnotice("I have unlocked a new spell: [newspell]"))
					holder.mind.AddSpell(newspell, holder)
					LAZYADD(granted_spells, newspell)

		if(length(patron.traits_tier))
			for(var/trait in patron.traits_tier)
				var/required_tier = patron.traits_tier[trait]
				if(required_tier <= level)
					if(!silent)
						to_chat(holder, span_boldnotice("I have unlocked a new trait: [trait]"))
					ADD_TRAIT(holder, trait, TRAIT_MIRACLE)
"""


def active_source(source):
    """Strip comments, preserving strings. A locator, not a general DM parser."""
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
    if body == FIXED:
        return 'fixed'
    if body == LEGACY:
        return 'legacy'
    raise AssertionError('Unreviewed Path of Order control flow')


def require_flow(perform, parent, after, revert):
    if (perform, parent, after, revert) != (PERFORM, PARENT, AFTER, REVERT):
        raise AssertionError('Unreviewed spell lifecycle control flow')


@dataclass
class Caster:
    spells: set = field(default_factory=set)
    devotion: int = 750
    trace: list = field(default_factory=list)
    mutations: list = field(default_factory=list)
    reverts: list = field(default_factory=list)
    charge: str = 'spent'
    attacking: bool = True
    light: bool = True
    processing: bool = False


def perform_choice(body, choice, user, ambient_usr, flow):
    """Bounded interpretation of exact bodies; lifecycle operations are spies."""
    kind = mode(body)
    require_flow(*flow)
    user.trace.extend(['before_cast', 'attack_log', 'break_invisibility',
                       'parent_signal', 'parent_stat'])
    result = True  # Exact PARENT returns TRUE and '. = ..()' preserves it.
    selected = {'Lance': LANCE, 'Spear': SPEAR}.get(choice)
    if selected is None or selected in user.spells:
        # Legacy implicit usr differs from fixed explicit caller forwarding.
        target = user if kind == 'fixed' else ambient_usr
        user.reverts.append(target)
        user.trace.append('revert_cast')
        target.attacking = False
        target.charge = 'ready'
        target.processing = True
        target.light = False
        if kind == 'fixed':
            result = False
    else:
        other = SPEAR if selected == LANCE else LANCE
        user.spells.add(selected)
        user.mutations.append(('add', selected))
        if other in user.spells:
            user.spells.remove(other)
            user.mutations.append(('remove', other))
    # Exact PERFORM guards ALL of these with if(cast(targets, user = user)).
    if result:
        user.trace.extend(['invocation', 'start_recharge', 'sound_if_present', 'after_cast'])
        user.attacking = False
        user.devotion -= 100  # Exact AFTER + Path of Order devotion_cost = 100.
        user.processing = True
        user.light = False
        user.trace.extend(['stamina_if_applicable', 'clash_if_applicable', 'button_if_present'])
    return result


class PathOrderAbortTests(unittest.TestCase):
    def setUp(self):
        self.source = (ROOT / ASTRATA).read_text()
        self.body = definition(self.source, HEADER)
        spell = (ROOT / SPELL).read_text()
        self.flow = tuple(definition(spell, '/obj/effect/proc_holder/spell/proc/' + h)
                          for h in ('perform(list/targets, recharge = TRUE, mob/user = usr)',
                                    'cast(list/targets, mob/user = usr)',
                                    'after_cast(list/targets, mob/user = usr)',
                                    'revert_cast(mob/user = usr)'))
        require_flow(*self.flow)

    def test_only_exact_three_abort_hunks_change(self):
        self.assertEqual(mode(self.body), 'fixed')
        self.assertEqual(self.body.count('revert_cast(user)'), 3)
        self.assertEqual(self.body.count('return FALSE'), 3)
        self.assertEqual(self.body.count('. = ..()'), 1)
        restored = self.source.replace(FIXED, LEGACY, 1)
        self.assertEqual(hashlib.sha256(restored.encode()).hexdigest(), BASELINE_FILE_SHA256)

    def test_duplicates_cancel_and_unknown_do_not_take_success_path(self):
        for owned in (set(), {LANCE}, {SPEAR}, {LANCE, SPEAR}):
            for choice in (None, '', 'unknown', 'Lance', 'Spear'):
                selected = {'Lance': LANCE, 'Spear': SPEAR}.get(choice)
                if selected is not None and selected not in owned:
                    continue
                with self.subTest(owned=owned, choice=choice):
                    user, ambient = Caster(set(owned)), Caster()
                    self.assertIs(perform_choice(self.body, choice, user, ambient, self.flow), False)
                    self.assertEqual(user.spells, owned)
                    self.assertEqual(user.mutations, [])
                    self.assertEqual(user.devotion, 750)
                    self.assertEqual(user.reverts, [user])
                    self.assertEqual(user.trace, ['before_cast', 'attack_log', 'break_invisibility',
                                                 'parent_signal', 'parent_stat', 'revert_cast'])
                    self.assertEqual((user.charge, user.attacking, user.light, user.processing),
                                     ('ready', False, False, True))
                    self.assertEqual((ambient.charge, ambient.attacking, ambient.light, ambient.processing),
                                     ('spent', True, True, False))

    def test_fresh_and_opposite_choices_preserve_success_and_mutation_order(self):
        for choice, selected, other in [('Lance', LANCE, SPEAR), ('Spear', SPEAR, LANCE)]:
            for owned in (set(), {other}):
                with self.subTest(choice=choice, owned=owned):
                    user = Caster(set(owned))
                    self.assertIs(perform_choice(self.body, choice, user, Caster(), self.flow), True)
                    self.assertEqual(user.spells, {selected})
                    self.assertEqual(user.mutations, [('add', selected)] +
                                     ([('remove', other)] if other in owned else []))
                    self.assertEqual(user.devotion, 650)
                    self.assertEqual(user.reverts, [])
                    self.assertEqual(user.trace.count('after_cast'), 1)
                    self.assertEqual(user.trace.count('start_recharge'), 1)

    def test_repeated_same_then_opposite_choices(self):
        for first, second in [('Lance', 'Spear'), ('Spear', 'Lance')]:
            user = Caster()
            self.assertTrue(perform_choice(self.body, first, user, Caster(), self.flow))
            self.assertFalse(perform_choice(self.body, first, user, Caster(), self.flow))
            self.assertEqual(user.devotion, 650)
            self.assertTrue(perform_choice(self.body, second, user, Caster(), self.flow))
            self.assertEqual(user.devotion, 550)
            self.assertEqual(user.trace.count('after_cast'), 2)

    def test_historical_body_reproduces_all_three_false_success_branches(self):
        for choice, owned in [('Lance', {LANCE}), ('Spear', {SPEAR}), (None, set()), ('unknown', set())]:
            with self.subTest(choice=choice):
                user = Caster(set(owned))
                self.assertTrue(perform_choice(LEGACY, choice, user, user, self.flow))
                self.assertEqual(user.devotion, 650)
                self.assertEqual(user.spells, owned)
                self.assertEqual(user.mutations, [])
                self.assertEqual(user.trace.count('after_cast'), 1)
                self.assertEqual(user.trace.count('start_recharge'), 1)

    def test_unreviewed_choice_parent_and_return_changes_fail_closed(self):
        for altered in (FIXED.replace('revert_cast(user)', 'revert_cast()'),
                        FIXED.replace('return FALSE', 'return TRUE', 1),
                        FIXED.replace('\t. = ..()\n', ''),
                        FIXED.replace('RemoveSpell', 'AddSpell'),
                        FIXED.replace('if("Lance")', 'if("Other")')):
            with self.subTest(altered=altered), self.assertRaisesRegex(AssertionError, 'Unreviewed'):
                perform_choice(altered, None, Caster(), Caster(), self.flow)

    def test_actual_resource_gate_parent_and_revert_are_bound(self):
        perform, parent, after, revert = self.flow
        self.assertIn('\treturn TRUE\n', parent)
        self.assertIn('\tif(cast(targets, user = user))\n\t\tinvocation(user)', perform)
        self.assertIn('\t\tafter_cast(targets, user = user)\n', perform)
        self.assertIn('\t\tdevotee.devotion?.update_devotion(-devotion_cost)\n', after)
        for line in ('\tuser.stop_attack()\n', '\t\t\tcharge_counter = recharge_time\n',
                     '\tSTART_PROCESSING(SSfastprocess, src)\n', '\t\tQDEL_NULL(user.mmb_intent.mob_light)\n'):
            self.assertIn(line, revert)
        for index, old, new in [(0, 'if(cast(targets, user = user))', 'if(TRUE)'),
                                (1, 'return TRUE', 'return FALSE'),
                                (2, '-devotion_cost', 'devotion_cost'),
                                (3, 'user.stop_attack()', 'usr.stop_attack()')]:
            flow = list(self.flow)
            flow[index] = flow[index].replace(old, new)
            with self.subTest(index=index), self.assertRaisesRegex(AssertionError, 'Unreviewed'):
                perform_choice(self.body, None, Caster(), Caster(), flow)

    def test_constants_includes_and_patron_grant_reachability(self):
        config = definition(self.source, '/obj/effect/proc_holder/spell/self/astratan_path')
        for line in ('\tdevotion_cost = 100\n', '\trecharge_time = 10 MINUTES\n',
                     '\tchargetime = 0\n', '\tchargedrain = 0\n', '\tmiracle = TRUE\n'):
            self.assertIn(line, config)
        dme = active_source((ROOT / 'roguetown.dme').read_text()).replace('\\', '/')
        for path in (ASTRATA, SPELL, PATRON, GRANTS):
            self.assertIn('#include "' + path + '"', dme)
        patron = active_source((ROOT / PATRON).read_text())
        self.assertRegex(patron, r'/obj/effect/proc_holder/spell/self/astratan_path\s*= CLERIC_T1,')
        grants = definition((ROOT / GRANTS).read_text(), '/datum/devotion/proc/try_add_spells(silent = FALSE)')
        self.assertEqual(grants, GRANT_BODY)
        self.assertIn('var/required_tier = patron.miracles[spell_type]', grants)
        self.assertIn('if(required_tier <= level)', grants)
        self.assertIn('holder.mind.AddSpell(newspell, holder)', grants)
        # No self/cast override is permitted between this spell and its parent.
        spell = active_source((ROOT / SPELL).read_text())
        self.assertNotRegex(spell, r'(?m)^/obj/effect/proc_holder/spell/self/(?:proc/)?cast\(')

    def test_locator_rejects_commented_and_duplicate_definitions(self):
        source = HEADER + '\n' + FIXED
        for invalid in ('/*\n' + source + '*/\n', source + '\n' + source):
            with self.assertRaisesRegex(AssertionError, 'active definition'):
                definition(invalid, HEADER)


if __name__ == '__main__':
    unittest.main()
