/datum/unit_test/empty_held_slot/Run()
	var/mob/subject = allocate(/mob)
	// Dynamic calls let the same fixture compile on the unchanged control.
	TEST_ASSERT(hascall(subject, "has_empty_held_slot"), "Candidate empty-hand predicate is absent on the control revision.")
	var/obj/item/occupied = allocate(/obj/item)
	var/list/original_hands = subject.held_items
	var/cases_checked = 0
	// Every occupied/empty pattern for capacities 0..6, including holes.
	for(var/capacity in 0 to 6)
		for(var/pattern in 0 to (1 << capacity) - 1)
			var/list/hands = new /list(capacity)
			for(var/index in 1 to capacity)
				if(pattern & (1 << (index - 1)))
					hands[index] = occupied
			var/list/snapshot = hands.Copy()
			subject.held_items = hands
			var/expected = !!subject.get_empty_held_indexes()
			var/actual = call(subject, "has_empty_held_slot")()
			var/same_list = subject.held_items == hands
			// Restore before assertions, so even failure leaves safe teardown.
			subject.held_items = original_hands
			TEST_ASSERT_EQUAL(actual, expected, "Predicate/list parity failed for [capacity] hands, occupancy [pattern].")
			TEST_ASSERT(same_list, "The predicate replaced the held-items list.")
			TEST_ASSERT_EQUAL(hands.len, snapshot.len, "A query resized the held-items list.")
			for(var/index in 1 to capacity)
				TEST_ASSERT_EQUAL(hands[index], snapshot[index], "A query changed hand [index].")
			cases_checked++
	TEST_ASSERT_EQUAL(cases_checked, 127, "Not all capacities and hole patterns were checked.")

	// Preserve the old !value contract, rather than matching only null slots.
	var/list/false_slot = list(occupied, FALSE, occupied)
	subject.held_items = false_slot
	var/expected_false_slot = !!subject.get_empty_held_indexes()
	var/actual_false_slot = call(subject, "has_empty_held_slot")()
	subject.held_items = original_hands
	TEST_ASSERT_EQUAL(actual_false_slot, expected_false_slot, "A false-valued hand slot changed eligibility.")
	TEST_ASSERT(actual_false_slot, "A false-valued slot should count as empty.")
	TEST_ASSERT_EQUAL(false_slot[2], FALSE, "The false-valued hand slot was modified.")
