/// Count the spell's damage without injuries or background mob processing.
/mob/living/blade_burst_test
	var/damage_calls = 0
	var/damage_total = 0

/mob/living/blade_burst_test/Initialize(mapload)
	. = ..()
	GLOB.mob_living_list -= src
	SSmobs.currentrun -= src

/mob/living/blade_burst_test/adjustBruteLoss(amount, updating_health = TRUE, forced = FALSE, required_status)
	damage_calls++
	damage_total += amount
	return amount

/datum/unit_test/blade_burst_antimagic
	var/obj/effect/proc_holder/spell/invoked/blade_burst/spell
	var/datum/mind/caster_mind

/datum/unit_test/blade_burst_antimagic/Destroy()
	// Release the learned spell before the test room removes its owner.
	QDEL_NULL(spell)
	QDEL_NULL(caster_mind)
	return ..()

/datum/unit_test/blade_burst_antimagic/Run()
	var/turf/target_turf = locate(run_loc_floor_bottom_left.x + 2, run_loc_floor_bottom_left.y + 2, run_loc_floor_bottom_left.z)
	TEST_ASSERT(isfloorturf(target_turf), "The Blade Burst target must be on the test room floor.")
	var/mob/living/carbon/human/caster = allocate(/mob/living/carbon/human)
	GLOB.mob_living_list -= caster
	SSmobs.currentrun -= caster
	TEST_ASSERT_NULL(caster.mind, "The test caster unexpectedly already has a mind.")
	caster_mind = new /datum/mind(null)
	caster_mind.current = caster
	caster.mind = caster_mind

	spell = new /obj/effect/proc_holder/spell/invoked/blade_burst(null)
	// The charge visual is created in nullspace and is not owned by the test room.
	if(spell.mob_charge_effect)
		allocated += spell.mob_charge_effect
	caster_mind.AddSpell(spell, caster)
	var/datum/action/spell_action/original_action = spell.action
	TEST_ASSERT_EQUAL(original_action.owner, caster, "Learning the spell did not grant its action.")
	TEST_ASSERT(spell.can_cast(caster), "The fixture must be able to cast Blade Burst before testing anti-magic.")

	var/mob/living/blade_burst_test/protected = allocate(/mob/living/blade_burst_test, target_turf)
	var/mob/living/blade_burst_test/unprotected = allocate(/mob/living/blade_burst_test, target_turf)
	ADD_TRAIT(protected, TRAIT_ANTIMAGIC, TRAIT_SOURCE_UNIT_TESTS)
	TEST_ASSERT(protected.anti_magic_check(), "The protected target must use the real anti-magic check.")
	TEST_ASSERT(!unprotected.anti_magic_check(), "The ordinary target unexpectedly has anti-magic.")
	TEST_ASSERT(target_turf.contents.Find(protected) < target_turf.contents.Find(unprotected), "The ordinary target must follow the protected target in the cast loop.")
	TEST_ASSERT(!(get_turf(caster) in view(spell.area_of_effect, target_turf)), "The caster must remain outside the damage area.")

	// Use the real cast, including its normal delay and target iteration.
	var/expected_damage = spell.damage
	var/cast_result = spell.cast(list(target_turf), caster)
	TEST_ASSERT(!QDELETED(spell), "Anti-magic deleted the learned Blade Burst spell.")
	TEST_ASSERT_EQUAL(cast_result, TRUE, "An anti-magic target changed the cast's success result.")
	TEST_ASSERT_EQUAL(protected.damage_calls, 0, "Blade Burst damaged an anti-magic target.")
	TEST_ASSERT_EQUAL(unprotected.damage_calls, 1, "An anti-magic target prevented damage to a later ordinary target.")
	TEST_ASSERT_EQUAL(unprotected.damage_total, expected_damage, "The ordinary target received a different damage amount.")
	TEST_ASSERT(spell in caster_mind.spell_list, "Anti-magic removed Blade Burst from the caster's learned spells.")
	TEST_ASSERT_EQUAL(spell.action, original_action, "Anti-magic replaced or removed the spell action.")
	TEST_ASSERT(!QDELETED(original_action), "Anti-magic deleted the spell action.")
	TEST_ASSERT_EQUAL(original_action.owner, caster, "Anti-magic detached the spell action from its caster.")
	TEST_ASSERT(original_action in caster.actions, "Anti-magic removed the caster's spell button.")
	TEST_ASSERT(spell.can_cast(caster), "The surviving learned spell is no longer castable.")

	// Reuse the same learned holder after removing the target's protection.
	REMOVE_TRAIT(protected, TRAIT_ANTIMAGIC, TRAIT_SOURCE_UNIT_TESTS)
	cast_result = spell.cast(list(target_turf), caster)
	TEST_ASSERT(!QDELETED(spell), "The repeated cast deleted the learned spell.")
	TEST_ASSERT_EQUAL(cast_result, TRUE, "The same learned holder could not cast again.")
	TEST_ASSERT_EQUAL(protected.damage_calls, 1, "The formerly protected target was not damaged by the next cast.")
	TEST_ASSERT_EQUAL(protected.damage_total, expected_damage, "Removing anti-magic changed Blade Burst's damage.")
	TEST_ASSERT_EQUAL(unprotected.damage_calls, 2, "The ordinary target was not damaged by both casts.")
	TEST_ASSERT_EQUAL(unprotected.damage_total, expected_damage * 2, "Repeated casts changed the ordinary target's damage.")
	TEST_ASSERT(spell in caster_mind.spell_list, "The repeated cast lost the learned spell.")
	TEST_ASSERT_EQUAL(spell.action, original_action, "The repeated cast changed the action identity.")
