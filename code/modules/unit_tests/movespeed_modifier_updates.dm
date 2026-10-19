/// Track work performed while retaining the production comparison and speed calculation.
/mob/movespeed_modifier_test
	var/movespeed_test_updates = 0
	var/movespeed_test_comparisons = 0
	var/movespeed_test_resort

/mob/movespeed_modifier_test/update_movespeed(resort = TRUE)
	movespeed_test_updates++
	movespeed_test_resort = resort
	return ..()

/mob/movespeed_modifier_test/movespeed_modifier_identical_check(list/mod1, list/mod2)
	movespeed_test_comparisons++
	return ..()

/mob/movespeed_modifier_test/proc/reset_movespeed_test_counts()
	movespeed_test_updates = 0
	movespeed_test_comparisons = 0
	movespeed_test_resort = null

/datum/unit_test/movespeed_modifier_updates/Run()
	var/mob/movespeed_modifier_test/subject = allocate(/mob/movespeed_modifier_test)
	// Discard initialization's config modifier so calculated speeds are deterministic.
	subject.movespeed_modification = null
	subject.cached_multiplicative_slowdown = 0
	subject.reset_movespeed_test_counts()
	var/modifier_id = "unit_test_movespeed"
	var/other_modifier_id = "unit_test_other_movespeed"

	TEST_ASSERT(subject.add_movespeed_modifier(modifier_id, priority = 10, multiplicative_slowdown = 2), "A new modifier was rejected.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_comparisons, 0, "A new modifier performed an unnecessary equality check.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_updates, 1, "A new modifier did not update movement exactly once.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_resort, TRUE, "A new modifier did not request sorting.")
	TEST_ASSERT_EQUAL(subject.cached_multiplicative_slowdown, 2, "A new modifier did not affect the calculated speed.")
	var/list/original_data = subject.has_movespeed_modifier(modifier_id)

	// Both identical and different non-overriding additions must reject immediately.
	subject.reset_movespeed_test_counts()
	TEST_ASSERT(!subject.add_movespeed_modifier(modifier_id, priority = 10, multiplicative_slowdown = 2), "An identical non-overriding modifier was accepted.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_comparisons, 0, "A rejected non-overriding modifier still built and compared replacement data.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_updates, 0, "A rejected modifier recalculated movement.")
	TEST_ASSERT_EQUAL(subject.has_movespeed_modifier(modifier_id), original_data, "A rejected modifier replaced the stored list.")

	subject.reset_movespeed_test_counts()
	TEST_ASSERT(!subject.add_movespeed_modifier(modifier_id, priority = 20, multiplicative_slowdown = 7), "A different non-overriding modifier was accepted.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_comparisons, 0, "A different non-overriding modifier performed an unnecessary equality check.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_updates, 0, "A different rejected modifier recalculated movement.")
	TEST_ASSERT_EQUAL(subject.has_movespeed_modifier(modifier_id), original_data, "A different rejected modifier replaced the stored list.")
	TEST_ASSERT_EQUAL(subject.cached_multiplicative_slowdown, 2, "A rejected modifier changed the calculated speed.")

	// Overriding additions retain the equality helper and do no work when identical.
	subject.reset_movespeed_test_counts()
	TEST_ASSERT(!subject.add_movespeed_modifier(modifier_id, priority = 10, override = TRUE, multiplicative_slowdown = 2), "An identical overriding modifier was accepted.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_comparisons, 1, "An overriding modifier bypassed the equality helper.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_updates, 0, "An identical overriding modifier recalculated movement.")
	TEST_ASSERT_EQUAL(subject.has_movespeed_modifier(modifier_id), original_data, "An identical overriding modifier replaced the stored list.")

	// Replacing values at the same priority updates speed without sorting.
	subject.reset_movespeed_test_counts()
	TEST_ASSERT(subject.add_movespeed_modifier(modifier_id, priority = 10, override = TRUE, multiplicative_slowdown = 3), "A changed overriding modifier was rejected.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_comparisons, 1, "A changed overriding modifier bypassed the equality helper.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_updates, 1, "A changed overriding modifier did not update movement exactly once.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_resort, FALSE, "An unchanged priority unnecessarily requested sorting.")
	TEST_ASSERT_NOTEQUAL(subject.has_movespeed_modifier(modifier_id), original_data, "An accepted replacement reused the old data list.")
	TEST_ASSERT_EQUAL(original_data[MOVESPEED_DATA_INDEX_MULTIPLICATIVE_SLOWDOWN], 2, "Replacement mutated the previous data list.")
	TEST_ASSERT_EQUAL(subject.cached_multiplicative_slowdown, 3, "An accepted replacement did not update the calculated speed.")

	// A changed priority requires sorting.
	subject.reset_movespeed_test_counts()
	TEST_ASSERT(subject.add_movespeed_modifier(modifier_id, priority = 20, override = TRUE, multiplicative_slowdown = 4), "A changed-priority modifier was rejected.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_comparisons, 1, "A changed-priority modifier bypassed the equality helper.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_updates, 1, "A changed-priority modifier did not update movement exactly once.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_resort, TRUE, "A changed priority did not request sorting.")
	TEST_ASSERT_EQUAL(subject.cached_multiplicative_slowdown, 4, "A changed-priority modifier did not update the calculated speed.")

	// update=FALSE stores both additions and replacements without recalculating.
	subject.reset_movespeed_test_counts()
	TEST_ASSERT(subject.add_movespeed_modifier(other_modifier_id, update = FALSE, priority = 30, multiplicative_slowdown = 1), "A deferred new modifier was rejected.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_comparisons, 0, "A deferred new modifier performed an equality check.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_updates, 0, "A deferred new modifier recalculated movement.")
	TEST_ASSERT_EQUAL(subject.cached_multiplicative_slowdown, 4, "A deferred new modifier changed the cached speed.")

	subject.reset_movespeed_test_counts()
	TEST_ASSERT(subject.add_movespeed_modifier(modifier_id, update = FALSE, priority = 40, override = TRUE, multiplicative_slowdown = 5), "A deferred replacement was rejected.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_comparisons, 1, "A deferred replacement bypassed the equality helper.")
	TEST_ASSERT_EQUAL(subject.movespeed_test_updates, 0, "A deferred replacement recalculated movement.")
	TEST_ASSERT_EQUAL(subject.cached_multiplicative_slowdown, 4, "A deferred replacement changed the cached speed.")
	subject.update_movespeed(TRUE)
	TEST_ASSERT_EQUAL(subject.cached_multiplicative_slowdown, 6, "Deferred modifiers did not contribute to the next speed calculation.")
	TEST_ASSERT_EQUAL(subject.movespeed_modification[1], modifier_id, "Deferred modifiers were not sorted by priority.")
	TEST_ASSERT_EQUAL(subject.movespeed_modification[2], other_modifier_id, "Deferred modifiers were not sorted by priority.")
