/// Count target scans without moving, attacking, or depending on nearby players.
/mob/living/simple_animal/hostile/target_scan_test
	environment_smash = ENVIRONMENT_SMASH_NONE
	wander = FALSE
	var/full_scans = 0
	var/lazy_scans = 0
	var/list/full_scan_targets = list()
	var/list/lazy_scan_targets = list()
	var/list/observed_targets

/mob/living/simple_animal/hostile/target_scan_test/ListTargets()
	full_scans++
	return full_scan_targets.Copy()

/mob/living/simple_animal/hostile/target_scan_test/ListTargetsLazy(_Z)
	lazy_scans++
	return lazy_scan_targets.Copy()

/mob/living/simple_animal/hostile/target_scan_test/AICanContinue(list/possible_targets)
	observed_targets = possible_targets.Copy()
	return FALSE

/mob/living/simple_animal/hostile/target_scan_test/proc/reset_scan_test()
	full_scans = 0
	lazy_scans = 0
	observed_targets = null
	target = null
	search_objects = 0
	use_lazy_target_scan = TRUE
	next_seek = world.time
	next_full_seek = world.time

/mob/living/simple_animal/hostile/target_scan_test/Destroy()
	full_scan_targets = null
	lazy_scan_targets = null
	observed_targets = null
	return ..()

/datum/unit_test/hostile_target_scan/Run()
	var/mob/living/simple_animal/hostile/target_scan_test/scanner = allocate(/mob/living/simple_animal/hostile/target_scan_test)
	scanner.full_scan_targets = list(run_loc_floor_bottom_left, run_loc_floor_top_right)
	scanner.lazy_scan_targets = list(run_loc_floor_top_right, scanner)

	// Every object-search mode and lazy-disabled mobs must scan once, even when
	// the periodic fallback is due. Their full scan still runs between deadlines.
	for(var/search_mode in 0 to 3)
		scanner.reset_scan_test()
		scanner.search_objects = search_mode
		scanner.use_lazy_target_scan = search_mode != 0
		scanner.handle_automated_action()
		TEST_ASSERT_EQUAL(scanner.full_scans, 1, "Search mode [search_mode] performed a duplicate full scan.")
		TEST_ASSERT_EQUAL(scanner.lazy_scans, 0, "Search mode [search_mode] unexpectedly performed a lazy scan.")
		TEST_ASSERT_EQUAL(length(scanner.observed_targets), 2, "A mandatory full scan changed the candidate set.")
		TEST_ASSERT_EQUAL(scanner.observed_targets[1], run_loc_floor_bottom_left, "The full-scan candidate order changed.")
		TEST_ASSERT_EQUAL(scanner.observed_targets[2], run_loc_floor_top_right, "The full-scan candidate order changed.")
		TEST_ASSERT_EQUAL(scanner.next_full_seek, world.time + scanner.full_seek_interval, "The full-scan cooldown was not advanced.")

		scanner.full_scans = 0
		var/full_deadline = scanner.next_full_seek
		scanner.handle_automated_action()
		TEST_ASSERT_EQUAL(scanner.full_scans, 1, "Search mode [search_mode] was incorrectly throttled between fallback deadlines.")
		TEST_ASSERT_EQUAL(scanner.next_full_seek, full_deadline, "A pending fallback deadline changed.")

	// Empty full snapshots count as completed scans too.
	scanner.reset_scan_test()
	scanner.use_lazy_target_scan = FALSE
	scanner.full_scan_targets = list()
	scanner.handle_automated_action()
	TEST_ASSERT_EQUAL(scanner.full_scans, 1, "An empty full snapshot caused a redundant fallback scan.")
	TEST_ASSERT_EQUAL(length(scanner.observed_targets), 0, "An empty full snapshot gained candidates.")
	scanner.full_scan_targets = list(run_loc_floor_bottom_left, run_loc_floor_top_right)

	// An existing target always uses one full scan, without updating idle deadlines.
	scanner.reset_scan_test()
	scanner.target = run_loc_floor_bottom_left
	var/targeted_deadline = scanner.next_full_seek
	scanner.handle_automated_action()
	TEST_ASSERT_EQUAL(scanner.full_scans, 1, "A targeted mob did not perform exactly one full scan.")
	TEST_ASSERT_EQUAL(scanner.lazy_scans, 0, "A targeted mob performed a lazy scan.")
	TEST_ASSERT_EQUAL(scanner.next_full_seek, targeted_deadline, "A targeted mob changed its idle fallback deadline.")

	// The ordinary lazy path must still merge a periodic full scan, removing overlap.
	scanner.reset_scan_test()
	scanner.handle_automated_action()
	TEST_ASSERT_EQUAL(scanner.full_scans, 1, "An overdue lazy-mode fallback did not run exactly once.")
	TEST_ASSERT_EQUAL(scanner.lazy_scans, 1, "An overdue lazy scan did not run exactly once.")
	TEST_ASSERT_EQUAL(length(scanner.observed_targets), 3, "Lazy and full scan candidates were not merged without duplicates.")
	TEST_ASSERT_EQUAL(scanner.observed_targets[1], run_loc_floor_top_right, "Lazy candidate order changed.")
	TEST_ASSERT_EQUAL(scanner.observed_targets[2], scanner, "A lazy-only candidate was lost.")
	TEST_ASSERT_EQUAL(scanner.observed_targets[3], run_loc_floor_bottom_left, "A full-only candidate was lost.")
	TEST_ASSERT_EQUAL(scanner.next_seek, world.time + scanner.lazy_seek_interval, "The lazy-scan cooldown was not advanced.")
	TEST_ASSERT_EQUAL(scanner.next_full_seek, world.time + scanner.full_seek_interval, "The fallback cooldown was not advanced.")

	// A pending lazy deadline must not suppress the full fallback.
	scanner.reset_scan_test()
	scanner.next_seek = world.time + scanner.lazy_seek_interval
	scanner.handle_automated_action()
	TEST_ASSERT_EQUAL(scanner.full_scans, 1, "A full fallback was skipped while the lazy scan was cooling down.")
	TEST_ASSERT_EQUAL(scanner.lazy_scans, 0, "A lazy scan ignored its cooldown.")
	TEST_ASSERT_EQUAL(length(scanner.observed_targets), 2, "The full fallback did not retain its candidates.")

	// A pending full deadline must not suppress a due lazy scan.
	scanner.reset_scan_test()
	scanner.next_full_seek = world.time + scanner.full_seek_interval
	scanner.handle_automated_action()
	TEST_ASSERT_EQUAL(scanner.full_scans, 0, "A full fallback ignored its cooldown.")
	TEST_ASSERT_EQUAL(scanner.lazy_scans, 1, "A due lazy scan was skipped.")
	TEST_ASSERT_EQUAL(length(scanner.observed_targets), 2, "The lazy scan did not retain its candidates.")

	// With neither deadline due, pass an empty list onward without scanning.
	scanner.reset_scan_test()
	scanner.next_seek = world.time + scanner.lazy_seek_interval
	scanner.next_full_seek = world.time + scanner.full_seek_interval
	scanner.handle_automated_action()
	TEST_ASSERT_EQUAL(scanner.full_scans, 0, "An idle tick performed an early full scan.")
	TEST_ASSERT_EQUAL(scanner.lazy_scans, 0, "An idle tick performed an early lazy scan.")
	TEST_ASSERT_EQUAL(length(scanner.observed_targets), 0, "An idle tick reused stale candidates.")
