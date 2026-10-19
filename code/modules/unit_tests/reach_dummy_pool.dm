/// Exercise the real reach algorithm and movement callbacks with ordinary objects.
/datum/unit_test/reach_dummy_pool
	var/list/saved_pool
	var/obj/watched_dummy
	var/obj/reach_source
	var/obj/reach_target
	var/cleanup_calls = 0
	var/returned_before_cleanup = FALSE
	var/delete_on_cleanup = FALSE
	var/reenter_on_cleanup = FALSE
	var/nested_result
	var/obj/nested_dummy

/datum/unit_test/reach_dummy_pool/Destroy()
	if(watched_dummy)
		UnregisterSignal(watched_dummy, COMSIG_MOVABLE_TURF_EXITED)
	if(!isnull(saved_pool))
		// Restore the shared pool before deleting any test-owned objects.
		var/list/test_pool = GLOB.reach_dummy_pool
		GLOB.reach_dummy_pool = saved_pool
		saved_pool = null
		for(var/obj/dummy in test_pool)
			if(!QDELETED(dummy))
				qdel(dummy)
	watched_dummy = null
	reach_source = null
	reach_target = null
	nested_dummy = null
	return ..()

/datum/unit_test/reach_dummy_pool/proc/watch_cleanup(obj/dummy)
	if(watched_dummy)
		UnregisterSignal(watched_dummy, COMSIG_MOVABLE_TURF_EXITED)
	watched_dummy = dummy
	cleanup_calls = 0
	returned_before_cleanup = FALSE
	RegisterSignal(dummy, COMSIG_MOVABLE_TURF_EXITED, PROC_REF(on_turf_exit))

/datum/unit_test/reach_dummy_pool/proc/on_turf_exit(obj/dummy, turf/old_turf, atom/new_location)
	SIGNAL_HANDLER
	if(!isnull(new_location))
		return
	cleanup_calls++
	returned_before_cleanup = (dummy in GLOB.reach_dummy_pool)
	if(delete_on_cleanup)
		// Avoid recursively observing Destroy()'s own nullspace movement.
		UnregisterSignal(dummy, COMSIG_MOVABLE_TURF_EXITED)
		qdel(dummy)
	else if(reenter_on_cleanup)
		UnregisterSignal(dummy, COMSIG_MOVABLE_TURF_EXITED)
		nested_result = CheckToolReach(reach_source, reach_target, 2)
		if(length(GLOB.reach_dummy_pool))
			nested_dummy = GLOB.reach_dummy_pool[1]
			allocated += nested_dummy

/datum/unit_test/reach_dummy_pool/Run()
	var/turf/start = run_loc_floor_bottom_left
	var/turf/middle = locate(start.x + 1, start.y, start.z)
	var/turf/near_target = locate(start.x + 2, start.y, start.z)
	var/turf/far_target = locate(start.x + 4, start.y, start.z)
	TEST_ASSERT_NOTNULL(far_target, "The reach test needs five tiles in the test room.")
	TEST_ASSERT(far_target.x <= run_loc_floor_top_right.x && isfloorturf(far_target), "The reach test needs five open tiles in the test room.")
	reach_source = allocate(/obj, start)
	reach_target = allocate(/obj, near_target)

	// No sleeps while the global pool is replaced. Teardown restores it even
	// when an assertion fails or the focused runner catches a runtime.
	saved_pool = GLOB.reach_dummy_pool
	GLOB.reach_dummy_pool = list()
	TEST_ASSERT(CheckToolReach(reach_source, reach_target, 2), "An unobstructed target two tiles away should be reachable.")
	TEST_ASSERT_EQUAL(length(GLOB.reach_dummy_pool), 1, "A successful reach should return exactly one dummy.")
	var/obj/dummy = GLOB.reach_dummy_pool[1]
	allocated += dummy
	TEST_ASSERT(!QDELETED(dummy), "A successful reach returned a deleted dummy.")
	TEST_ASSERT_NULL(dummy.loc, "An idle reach dummy remained on the map.")
	TEST_ASSERT(dummy.pass_flags & PASSTABLE, "New reach dummies must retain table passage.")
	TEST_ASSERT_EQUAL(dummy.invisibility, INVISIBILITY_ABSTRACT, "New reach dummies must remain invisible.")
	TEST_ASSERT(!(dummy in start.contents) && !(dummy in middle.contents), "A returned dummy remained in turf contents.")

	// A normal dense object forces the blocked-movement exit; a distant target
	// forces the exhausted-loop exit. Neither path replaces the pooled object.
	var/obj/blocker = allocate(/obj, middle)
	blocker.density = TRUE
	reach_target.forceMove(far_target)
	watch_cleanup(dummy)
	TEST_ASSERT(!CheckToolReach(reach_source, reach_target, 4), "A dense intermediate object should block extended reach.")
	TEST_ASSERT_EQUAL(cleanup_calls, 1, "Blocked reach did not run normal nullspace exit cleanup exactly once.")
	TEST_ASSERT(!returned_before_cleanup, "A dummy was available in the pool before its exit callback completed.")
	TEST_ASSERT_EQUAL(length(GLOB.reach_dummy_pool), 1, "Blocked reach returned the dummy more than once.")
	TEST_ASSERT_EQUAL(GLOB.reach_dummy_pool[1], dummy, "Blocked reach failed to reuse the existing dummy.")
	TEST_ASSERT_NULL(dummy.loc, "Blocked reach left the dummy on a turf.")
	qdel(blocker)

	watch_cleanup(dummy)
	TEST_ASSERT(!CheckToolReach(reach_source, reach_target, 2), "A target beyond maximum reach should not be reachable.")
	TEST_ASSERT_EQUAL(cleanup_calls, 1, "Exhausted reach did not run normal nullspace exit cleanup exactly once.")
	TEST_ASSERT_EQUAL(length(GLOB.reach_dummy_pool), 1, "Exhausted reach changed the pool size.")
	TEST_ASSERT_EQUAL(GLOB.reach_dummy_pool[1], dummy, "Exhausted reach replaced a reusable dummy.")
	TEST_ASSERT_NULL(dummy.loc, "Exhausted reach left the dummy on a turf.")

	reach_target.forceMove(near_target)
	for(var/repetition in 1 to 3)
		watch_cleanup(dummy)
		TEST_ASSERT(CheckToolReach(reach_source, reach_target, 2), "Repeated unobstructed reach unexpectedly failed.")
		TEST_ASSERT_EQUAL(cleanup_calls, 1, "Successful reach did not run normal nullspace exit cleanup exactly once.")
		TEST_ASSERT_EQUAL(length(GLOB.reach_dummy_pool), 1, "Repeated reach grew the pool.")
		TEST_ASSERT_EQUAL(GLOB.reach_dummy_pool[1], dummy, "Repeated reach failed to reuse the pooled dummy.")
		TEST_ASSERT_NULL(dummy.loc, "Repeated reach left the dummy on the map.")

	watch_cleanup(dummy)
	TEST_ASSERT(!CheckToolReach(reach_source, reach_target, 0), "Zero reach unexpectedly succeeded.")
	TEST_ASSERT(!CheckToolReach(reach_source, reach_target, 1), "Ordinary adjacency should not borrow an extended-reach dummy.")
	TEST_ASSERT(!CheckToolReach(null, reach_target, 2), "A null source unexpectedly succeeded.")
	TEST_ASSERT(!CheckToolReach(reach_source, null, 2), "A null target unexpectedly succeeded.")
	TEST_ASSERT_EQUAL(cleanup_calls, 0, "An early return borrowed a dummy.")
	TEST_ASSERT_EQUAL(length(GLOB.reach_dummy_pool), 1, "An early return changed the pool size.")

	// Checkout must skip both null and qdeleted entries, then reuse a live one.
	var/obj/stale = allocate(/obj, start)
	qdel(stale)
	GLOB.reach_dummy_pool = list(dummy, stale, null)
	TEST_ASSERT(CheckToolReach(reach_source, reach_target, 2), "Stale pool entries prevented valid reach.")
	TEST_ASSERT_EQUAL(length(GLOB.reach_dummy_pool), 1, "Checkout did not discard stale entries.")
	TEST_ASSERT_EQUAL(GLOB.reach_dummy_pool[1], dummy, "Checkout discarded a reusable live dummy.")
	TEST_ASSERT_NULL(dummy.loc, "Reuse after stale-entry cleanup left the dummy on the map.")

	UnregisterSignal(dummy, COMSIG_MOVABLE_TURF_EXITED)
	qdel(dummy)
	GLOB.reach_dummy_pool = list(dummy, null)
	TEST_ASSERT(CheckToolReach(reach_source, reach_target, 2), "An all-stale pool failed to allocate a replacement.")
	TEST_ASSERT_EQUAL(length(GLOB.reach_dummy_pool), 1, "An all-stale pool retained invalid entries.")
	var/obj/replacement = GLOB.reach_dummy_pool[1]
	allocated += replacement
	TEST_ASSERT(!QDELETED(replacement), "An all-stale pool returned a deleted replacement.")
	TEST_ASSERT_NOTEQUAL(replacement, dummy, "An all-stale pool reused its deleted dummy.")
	TEST_ASSERT_NULL(replacement.loc, "The replacement dummy remained on the map.")

	// Cleanup callbacks may themselves check reach. The outer loan must stay
	// unavailable until its cleanup finishes, so the nested call gets another.
	reenter_on_cleanup = TRUE
	watch_cleanup(replacement)
	TEST_ASSERT(CheckToolReach(reach_source, reach_target, 2), "Reach failed during a nested cleanup callback.")
	TEST_ASSERT(nested_result, "A nested production reach check failed.")
	TEST_ASSERT_EQUAL(cleanup_calls, 1, "A nested check reused the outer loan's cleanup callback.")
	TEST_ASSERT(!returned_before_cleanup, "Cleanup exposed the outer loan before it was returned.")
	TEST_ASSERT_NOTEQUAL(nested_dummy, replacement, "A nested reach check borrowed the still-active outer dummy.")
	TEST_ASSERT_EQUAL(length(GLOB.reach_dummy_pool), 2, "Nested reach did not return both distinct loans exactly once.")
	TEST_ASSERT_NULL(replacement.loc, "The outer nested-check dummy remained on the map.")
	TEST_ASSERT_NULL(nested_dummy.loc, "The inner nested-check dummy remained on the map.")
	reenter_on_cleanup = FALSE

	// An exit callback can delete a loan during release. The exact upstream
	// helper may enqueue that stale reference; the next checkout must reject it.
	GLOB.reach_dummy_pool = list(replacement)
	delete_on_cleanup = TRUE
	watch_cleanup(replacement)
	TEST_ASSERT(CheckToolReach(reach_source, reach_target, 2), "Reach failed when a cleanup callback deleted its loan.")
	TEST_ASSERT_EQUAL(cleanup_calls, 1, "Deleting cleanup ran more than once.")
	TEST_ASSERT(QDELETED(replacement), "The deleting cleanup callback did not execute.")
	delete_on_cleanup = FALSE
	TEST_ASSERT(CheckToolReach(reach_source, reach_target, 2), "Checkout reused a loan deleted by an exit callback.")
	TEST_ASSERT_EQUAL(length(GLOB.reach_dummy_pool), 1, "Checkout retained a loan deleted during cleanup.")
	var/obj/final_dummy = GLOB.reach_dummy_pool[1]
	allocated += final_dummy
	TEST_ASSERT(!QDELETED(final_dummy), "Checkout returned a loan deleted during cleanup.")
	TEST_ASSERT_NULL(final_dummy.loc, "The final replacement dummy remained on the map.")
