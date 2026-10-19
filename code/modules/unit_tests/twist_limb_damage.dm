/// Exercise the real twist action without random injuries or changing a live mob.
/mob/living/carbon/twist_limb_test
	// Bare carbons otherwise inherit bodypart typepaths, which human setup
	// normally instantiates. This fixture uses a separate instrumented limb.
	bodyparts = list()
	var/force_badluck = FALSE
	var/fixed_punch_damage = 12
	var/test_armor = 0
	var/damage_calls = 0
	var/last_damage
	var/last_damage_type
	var/last_damage_zone
	var/last_damage_blocked
	var/stop_pulling_calls = 0

/mob/living/carbon/twist_limb_test/Initialize(mapload)
	. = ..()
	// These action fixtures do not need background hunger, blood, or organ ticks.
	GLOB.mob_living_list -= src
	SSmobs.currentrun -= src

/mob/living/carbon/twist_limb_test/badluck(multi = 3, ignore_effects = FALSE)
	return force_badluck

/mob/living/carbon/twist_limb_test/get_punch_dmg()
	return fixed_punch_damage

/mob/living/carbon/twist_limb_test/run_armor_check(def_zone = null, attack_flag = "blunt", absorb_text = null, soften_text = null, armor_penetration, penetrated_text, damage, blade_dulling, peeldivisor, intdamfactor, used_weapon = null)
	return test_armor

/mob/living/carbon/twist_limb_test/apply_damage(damage, damagetype = BRUTE, def_zone = null, blocked = FALSE, forced = FALSE, spread_damage = FALSE)
	damage_calls++
	last_damage = damage
	last_damage_type = damagetype
	last_damage_zone = def_zone
	last_damage_blocked = blocked
	return TRUE

/mob/living/carbon/twist_limb_test/stop_pulling(forced = TRUE)
	stop_pulling_calls++
	return ..()

/mob/living/carbon/twist_limb_test/Destroy()
	last_damage_zone = null
	return ..()

/obj/item/bodypart/l_arm/twist_limb_test
	var/wound_calls = 0
	var/last_bclass
	var/last_wound_damage
	var/mob/living/last_attacker
	var/last_precise_zone
	var/last_crit_message
	var/drop_calls = 0
	var/last_drop_special

/obj/item/bodypart/l_arm/twist_limb_test/bodypart_attacked_by(bclass = BCLASS_BLUNT, dam, mob/living/user, zone_precise = src.body_zone, silent = FALSE, crit_message = FALSE, armor, obj/item/weapon, armor_penetration)
	wound_calls++
	last_bclass = bclass
	last_wound_damage = dam
	last_attacker = user
	last_precise_zone = zone_precise
	last_crit_message = crit_message
	return null

/obj/item/bodypart/l_arm/twist_limb_test/drop_limb(special)
	drop_calls++
	last_drop_special = special
	return TRUE

/obj/item/bodypart/l_arm/twist_limb_test/Destroy()
	last_attacker = null
	return ..()

/datum/unit_test/twist_limb_damage/Run()
	var/mob/living/carbon/twist_limb_test/attacker = allocate(/mob/living/carbon/twist_limb_test)
	var/mob/living/carbon/twist_limb_test/victim = allocate(/mob/living/carbon/twist_limb_test)
	var/obj/item/bodypart/l_arm/twist_limb_test/limb = allocate(/obj/item/bodypart/l_arm/twist_limb_test)
	var/obj/item/grabbing/grip = allocate(/obj/item/grabbing)
	STOP_PROCESSING(SSfastprocess, grip)
	grip.grabbee = attacker
	grip.grabbed = victim
	grip.limb_grabbed = limb
	grip.sublimb_grabbed = BODY_ZONE_PRECISE_L_HAND

	for(var/limb_status in list(BODYPART_ORGANIC, BODYPART_ROBOTIC))
		for(var/armor_value in list(0, 40))
			limb.status = limb_status
			victim.test_armor = armor_value
			victim.damage_calls = 0
			limb.wound_calls = 0
			limb.drop_calls = 0
			grip.twistlimb(attacker)
			TEST_ASSERT_EQUAL(victim.damage_calls, 1, "A twist must apply direct damage exactly once.")
			TEST_ASSERT_EQUAL(victim.last_damage, attacker.fixed_punch_damage, "The twist changed its direct damage amount.")
			TEST_ASSERT_EQUAL(victim.last_damage_type, BRUTE, "The twist changed its direct damage type.")
			TEST_ASSERT_EQUAL(victim.last_damage_zone, limb, "The twist damaged a different limb.")
			TEST_ASSERT_EQUAL(victim.last_damage_blocked, armor_value, "The twist did not preserve armor blocking.")
			TEST_ASSERT_EQUAL(limb.wound_calls, 1, "One twist processed wounds or critical hits more than once.")
			TEST_ASSERT_EQUAL(limb.last_bclass, BCLASS_TWIST, "The twist changed its wound class.")
			TEST_ASSERT_EQUAL(limb.last_wound_damage, attacker.fixed_punch_damage, "The twist changed its wound damage amount.")
			TEST_ASSERT_EQUAL(limb.last_attacker, attacker, "The twist lost its attacker attribution.")
			TEST_ASSERT_EQUAL(limb.last_precise_zone, BODY_ZONE_PRECISE_L_HAND, "The twist changed its precise target zone.")
			TEST_ASSERT_EQUAL(limb.last_crit_message, TRUE, "The twist disabled critical-hit messages.")
			var/expected_drops = (limb_status == BODYPART_ROBOTIC && armor_value == 0) ? 1 : 0
			TEST_ASSERT_EQUAL(limb.drop_calls, expected_drops, "The twist changed forced prosthetic removal conditions.")
			if(expected_drops)
				TEST_ASSERT_EQUAL(limb.last_drop_special, TRUE, "Forced prosthetic removal changed its special flag.")

	attacker.force_badluck = TRUE
	attacker.stop_pulling_calls = 0
	victim.damage_calls = 0
	limb.wound_calls = 0
	limb.drop_calls = 0
	grip.twistlimb(attacker)
	TEST_ASSERT_EQUAL(victim.damage_calls, 0, "An unlucky failed twist applied direct damage.")
	TEST_ASSERT_EQUAL(limb.wound_calls, 0, "An unlucky failed twist processed wounds.")
	TEST_ASSERT_EQUAL(limb.drop_calls, 0, "An unlucky failed twist removed a limb.")
	TEST_ASSERT_EQUAL(attacker.stop_pulling_calls, 1, "An unlucky failed twist did not release the pull.")
