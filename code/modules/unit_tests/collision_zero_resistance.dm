/// Capture damage without sound, armor, destruction or changes to a live object.
/obj/collision_resistance_test
	var/damage_calls = 0
	var/last_damage
	var/last_damage_type

/obj/collision_resistance_test/take_damage(damage_amount, damage_type = BRUTE, damage_flag = "", sound_effect = TRUE, attack_dir, armor_penetration = 0)
	damage_calls++
	last_damage = damage_amount
	last_damage_type = damage_type

/datum/unit_test/collision_zero_resistance/Run()
	var/obj/collision_resistance_test/target = allocate(/obj/collision_resistance_test)
	for(var/resistance in list(0, -1))
		target.move_resist = resistance
		TEST_ASSERT_EQUAL(target.move_crushed(null, MOVE_FORCE_DEFAULT, NORTH),TRUE,"Nonpositive resistance must retain crush/movement permission.")
		TEST_ASSERT_EQUAL(target.damage_calls,0,"Nonpositive resistance must not attempt collision damage.")

	target.move_resist = 10
	var/crush_threshold = target.move_resist * MOVE_FORCE_CRUSH_RATIO
	TEST_ASSERT_EQUAL(target.move_crushed(null, crush_threshold / 2, NORTH),TRUE,"Below-threshold collision must retain its return contract.")
	TEST_ASSERT_EQUAL(target.damage_calls,1,"Positive resistance must retain the existing damage callback.")
	TEST_ASSERT_EQUAL(target.last_damage,0,"Below-threshold damage must remain clamped to zero.")
	TEST_ASSERT_EQUAL(target.move_crushed(null, crush_threshold, NORTH),TRUE,"At-threshold collision must retain its return contract.")
	TEST_ASSERT_EQUAL(target.damage_calls,2,"At-threshold damage callback was lost.")
	TEST_ASSERT_EQUAL(target.last_damage,0,"At-threshold collision must cause zero damage.")
	TEST_ASSERT_EQUAL(target.move_crushed(null, crush_threshold * 2, NORTH),TRUE,"Above-threshold collision must retain its return contract.")
	TEST_ASSERT_EQUAL(target.damage_calls,3,"Above-threshold damage callback was lost.")
	TEST_ASSERT_EQUAL(target.last_damage,10,"Twice the crush threshold must cause ten damage.")
	TEST_ASSERT_EQUAL(target.last_damage_type,BRUTE,"Collision damage type must remain brute.")
