SUBSYSTEM_DEF(map_procgen)
	name = "Map Generators"
	flags = SS_NO_FIRE
	init_order = INIT_ORDER_MAPGEN

	/// Queued generators created by landmarks.
	var/list/datum/mapGenerator/generators_to_run = list()

/datum/controller/subsystem/map_procgen/proc/queue_map_generator(datum/mapGenerator/to_queue)
	if(Master.current_runlevel)
		message_admins("HEY CLOWNASS, DO NOT FUCKING SPAWN THESE.")
		CRASH("Admin attempted to spawn mapgen landmark post-init.")
	generators_to_run.Add(to_queue)

/datum/controller/subsystem/map_procgen/Initialize(start_timeofday)
	var/count = length(generators_to_run)
	to_chat_immediate(GLOB.admins, type = MESSAGE_TYPE_DEBUG, html = span_admin("PROCGEN: Running [count] queued generators."))
	log_world("Running [count] queued generators.")

	var/generator_index = 0
	for(var/datum/mapGenerator/map_gen as anything in generators_to_run)
		generator_index++
		var/start_time = REALTIMEOFDAY
		var/start_message = "Running generator [generator_index]/[count]: [map_gen.type] ([length(map_gen.map)] turfs)."
		to_chat_immediate(GLOB.admins, type = MESSAGE_TYPE_DEBUG, html = span_admin(start_message))
		log_world(start_message)
		log_game(start_message)
		map_gen.generate()
		CHECK_TICK
		var/finish_message = "Finished generator [generator_index]/[count]: [map_gen.type] in [(REALTIMEOFDAY - start_time) / 10] seconds."
		to_chat_immediate(GLOB.admins, type = MESSAGE_TYPE_DEBUG, html = span_admin(finish_message))
		log_world(finish_message)
		log_game(finish_message)
		map_gen.undefineRegion()
	generators_to_run.Cut()
	. = ..()
