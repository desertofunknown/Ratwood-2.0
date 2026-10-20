/// Real species eligibility, without equipping or moving the test items.
/datum/unit_test/empty_held_slot_species/Run()
	var/mob/living/carbon/human/subject = allocate(/mob/living/carbon/human/consistent)
	var/obj/item/item = allocate(/obj/item)
	var/list/original_hands = subject.held_items
	for(var/list/hands in list(list(), list(item,item), list(null,null), list(item,null,item)))
		subject.held_items = hands
		var/actual
		var/expected = !!subject.get_empty_held_indexes()
		try
			actual = subject.dna.species.can_equip(item, SLOT_HANDS, TRUE, subject)
		catch(var/exception/error)
			subject.held_items = original_hands
			throw error
		subject.held_items = original_hands
		TEST_ASSERT_EQUAL(actual,expected,"Species hand eligibility changed for [hands.len] slots.")

/// No possession, AI registration, movement or planning; inherited perform only
/// needs pawn/blackboard/cooldowns. Keep base Destroy safe via UnpossessPawn.
/datum/ai_controller/empty_hand_test/New(atom/new_pawn)
	change_ai_movement_type(ai_movement)
	pawn = new_pawn

/datum/ai_controller/empty_hand_test/UnpossessPawn(destroy)
	pawn = null

/mob/living/empty_hand_food_test
	var/pickup_calls = 0
	var/pickup_result = TRUE

/mob/living/empty_hand_food_test/put_in_hands(obj/item/I, del_on_fail = FALSE, merge_stacks = TRUE, forced = FALSE)
	pickup_calls++
	return pickup_result

/obj/item/empty_hand_food_test
	var/attack_calls = 0

/obj/item/empty_hand_food_test/melee_attack_chain(mob/user, atom/target, params)
	attack_calls++

/datum/ai_behavior/eat_food/empty_hand_test
	var/failures = 0

/datum/ai_behavior/eat_food/empty_hand_test/finish_action(datum/ai_controller/controller, succeeded, target_key, hunger_timer_key)
	// Record the decision without invoking movement cleanup or hunger timers.
	if(!succeeded)
		failures++

/datum/unit_test/empty_held_slot_eat_food/Run()
	var/mob/living/empty_hand_food_test/pawn = allocate(/mob/living/empty_hand_food_test)
	var/obj/item/empty_hand_food_test/food = allocate(/obj/item/empty_hand_food_test)
	var/obj/item/blocker = allocate(/obj/item)
	var/datum/ai_controller/empty_hand_test/controller = allocate(/datum/ai_controller/empty_hand_test,pawn)
	// This plain datum has no New override: do not forward allocate()'s
	// injected turf through arglist(). Construct it without arguments.
	var/datum/ai_behavior/eat_food/empty_hand_test/behavior = new
	allocated += behavior
	controller.set_blackboard_key("food",food)
	check_case(pawn, food, controller, behavior, list(blocker,blocker), TRUE, 0, 0, 1)
	check_case(pawn, food, controller, behavior, list(), TRUE, 0, 0, 1)
	check_case(pawn, food, controller, behavior, list(blocker,null), FALSE, 1, 0, 1)
	check_case(pawn, food, controller, behavior, list(blocker,null), TRUE, 1, 1, 0)
	check_case(pawn, food, controller, behavior, list(blocker,food), FALSE, 0, 1, 0)

/datum/unit_test/empty_held_slot_eat_food/proc/check_case(mob/living/empty_hand_food_test/pawn, obj/item/empty_hand_food_test/food, datum/ai_controller/controller, datum/ai_behavior/eat_food/empty_hand_test/behavior, list/hands, pickup_result, expected_pickups, expected_attacks, expected_failures)
	var/list/original_hands = pawn.held_items
	pawn.held_items = hands
	pawn.pickup_result = pickup_result
	pawn.pickup_calls = 0
	food.attack_calls = 0
	behavior.failures = 0
	try
		behavior.perform(1,controller,"food","hunger")
	catch(var/exception/error)
		pawn.held_items = original_hands
		throw error
	pawn.held_items = original_hands
	TEST_ASSERT_EQUAL(pawn.pickup_calls,expected_pickups,"Food behavior changed pickup short-circuiting.")
	TEST_ASSERT_EQUAL(food.attack_calls,expected_attacks,"Food behavior changed consumption eligibility.")
	TEST_ASSERT_EQUAL(behavior.failures,expected_failures,"Food behavior changed failure completion.")
