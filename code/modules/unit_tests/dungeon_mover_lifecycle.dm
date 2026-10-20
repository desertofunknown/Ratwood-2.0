/datum/unit_test/dungeon_mover_lifecycle
	var/list/saved_currentrun
	var/saved_state
	var/dispatch_active = FALSE

/datum/unit_test/dungeon_mover_lifecycle/Destroy()
	restore_dispatch()
	return ..()

/datum/unit_test/dungeon_mover_lifecycle/proc/restore_dispatch()
	if(!dispatch_active)
		return
	SSobj.currentrun = saved_currentrun
	SSobj.state = saved_state
	saved_currentrun = null
	saved_state = null
	dispatch_active = FALSE

/datum/unit_test/dungeon_mover_lifecycle/proc/dispatch_mover(obj/structure/dungeontool/mover/mover)
	// Resume only this fixture's work without processing the rest of the world.
	saved_currentrun = SSobj.currentrun
	saved_state = SSobj.state
	dispatch_active = TRUE
	SSobj.currentrun = list()
	if(mover in SSobj.processing)
		SSobj.currentrun += mover
	SSobj.state = SS_RUNNING
	// These plain mobs take one cardinal step on the test room's floor.
	try
		SSobj.fire(TRUE)
	catch(var/exception/error)
		restore_dispatch()
		throw error
	restore_dispatch()

/datum/unit_test/dungeon_mover_lifecycle/Run()
	var/turf/start = run_loc_floor_bottom_left
	var/turf/destination = locate(start.x + 1, start.y, start.z)
	var/turf/parking = locate(start.x + 2, start.y, start.z)
	TEST_ASSERT_NOTNULL(parking, "The mover test needs three tiles in the test room.")
	TEST_ASSERT(parking.x <= run_loc_floor_top_right.x && isfloorturf(destination) && isfloorturf(parking), "The mover test needs three open tiles in the test room.")
	TEST_ASSERT_EQUAL(get_area(start), get_area(destination), "The mover test must stay in one area.")
	TEST_ASSERT_EQUAL(GET_SPATIAL_INDEX(start.x), GET_SPATIAL_INDEX(destination.x), "The mover test must stay in one spatial-grid cell.")

	// Plain mobs have no AI or living subsystem work.
	var/mob/first = allocate(/mob, parking)
	var/mob/second = allocate(/mob, parking)
	var/obj/structure/dungeontool/mover/mover = allocate(/obj/structure/dungeontool/mover, start)
	mover.setDir(EAST)
	var/registered_on_creation = (mover in SSobj.processing)
	var/flagged_on_creation = !!(mover.datum_flags & SSobj.processing_flag)

	dispatch_mover(mover)
	var/registered_after_empty = (mover in SSobj.processing)
	var/flagged_after_empty = !!(mover.datum_flags & SSobj.processing_flag)

	first.forceMove(start)
	dispatch_mover(mover)
	var/first_moved = (first.loc == destination)
	var/registered_after_first = (mover in SSobj.processing)
	first.forceMove(parking)

	second.forceMove(start)
	dispatch_mover(mover)
	var/second_moved = (second.loc == destination)
	var/registered_after_second = (mover in SSobj.processing)

	qdel(mover)
	var/deleted = QDELETED(mover)
	var/registered_after_delete = (mover in SSobj.processing)
	var/flagged_after_delete = mover && (mover.datum_flags & SSobj.processing_flag)

	// All shared state and the mover's registration are cleaned up before failure.
	TEST_ASSERT(registered_on_creation && flagged_on_creation, "A new dungeon mover was not registered for object processing.")
	TEST_ASSERT(registered_after_empty && flagged_after_empty, "An empty dungeon mover stopped processing after its first pass.")
	TEST_ASSERT(first_moved, "A dungeon mover did not move a mob arriving after its empty pass.")
	TEST_ASSERT(registered_after_first, "A dungeon mover stopped processing after moving its first mob.")
	TEST_ASSERT(second_moved, "A dungeon mover did not move a second later-arriving mob.")
	TEST_ASSERT(registered_after_second, "A dungeon mover stopped processing after moving its second mob.")
	TEST_ASSERT(deleted, "The dungeon mover was not deleted during cleanup.")
	TEST_ASSERT(!registered_after_delete && !flagged_after_delete, "A deleted dungeon mover remained registered for object processing.")
