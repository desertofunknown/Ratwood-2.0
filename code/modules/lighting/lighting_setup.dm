/proc/create_all_lighting_objects()
	// Unchanged dark tiles can share this immutable seed until their first update.
	var/list/dark_underlays = list(GLOB.lighting_underlay_dark.appearance)
	for(var/area/A in world)
		if(!IS_DYNAMIC_LIGHTING(A))
			continue

		for(var/turf/T in A)

			if(!IS_DYNAMIC_LIGHTING(T))
				continue

			var/list/next_underlays
			if(isnull(T.pending_lighting_underlays) && !length(T.underlays))
				next_underlays = dark_underlays
			else
				next_underlays = T.get_lighting_underlays()
				next_underlays += GLOB.lighting_underlay_dark
			T.set_lighting_underlays(next_underlays)
			T.luminosity = 0
			CHECK_TICK
		CHECK_TICK

/turf/var/tmp/list/pending_lighting_underlays

/turf/proc/get_lighting_underlays()
	if(!isnull(pending_lighting_underlays))
		return pending_lighting_underlays.Copy()
	return underlays.Copy()

/turf/proc/set_lighting_underlays(list/next_underlays)
	if(!SSlighting.batch_underlays)
		pending_lighting_underlays = null
		underlays = next_underlays
		return
	if(isnull(pending_lighting_underlays))
		SSlighting.pending_underlay_turfs += src
	// Each logical write must snapshot mutable operands, just like a native assignment.
	for(var/i in 1 to next_underlays.len)
		var/mutable_appearance/entry = next_underlays[i]
		if(istype(entry))
			next_underlays[i] = entry.appearance
	pending_lighting_underlays = next_underlays

/turf/proc/flush_lighting_underlays()
	if(isnull(pending_lighting_underlays))
		return
	var/list/pending = pending_lighting_underlays
	pending_lighting_underlays = null
	underlays = pending
