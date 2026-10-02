/datum/time_of_day
	var/name = ""
	var/color = ""
	var/start = 216000 // 6:00 am

/datum/time_of_day/dawn
	name = "Dawn"
	color = list("#394579", "#49385d", "#3a1537")
	start = 8 HOURS //8:00:00 AM

/datum/time_of_day/sunrise
	name = "Sunrise"
	color = list("#F598AB","#e26d6d", "#e96e4f")
	start = 9.5 HOURS  //9:30:00 AM

/datum/time_of_day/daytime
	name = "Daytime"
	color = list("#dbbfbf", "#ddd7bd", "#add1b0", "#a4c0ca", "#ae9dc6", "#d09fbf")
	start = 10 HOURS //10:00:00 AM

/datum/time_of_day/sunset
	name = "Sunset"
	color = "#ff8a63"
	start = 15 HOURS //3:00:00 PM

/datum/time_of_day/dusk
	name = "Dusk"
	color = list("#c26f56", "#c05271", "#b84933")
	start = 15.5 HOURS //3:30:00 PM

/datum/time_of_day/midnight
	name = "Midnight"
	color = "#000000"
	start = 16 HOURS //4:00:00 PM

GLOBAL_VAR_INIT(GLOBAL_LIGHT_RANGE, 3)
GLOBAL_LIST_EMPTY(SUNLIGHT_QUEUE_WORK)   /* turfs to be stateChecked */
GLOBAL_LIST_EMPTY(SUNLIGHT_QUEUE_UPDATE) /* turfs to have their colors updated via corners (filter out the unroofed dudes) */
GLOBAL_LIST_EMPTY(SUNLIGHT_QUEUE_CORNER) /* turfs to have their color/lights/etc updated */

SUBSYSTEM_DEF(outdoor_effects)
	name = "Outdoor Weather Calc"
	wait = LIGHTING_INTERVAL
	flags = SS_TICKER
	init_order = INIT_ORDER_OUTDOOR_EFFECTS
	var/list/atom/movable/screen/plane_master/weather_effect/weather_planes_need_vis = list()

	var/list/atom/movable/screen/fullscreen/lighting_backdrop/sunlight/sunlighting_planes = list()
	var/static/mutable_appearance/shared_weather_overlay
	var/datum/time_of_day/current_step_datum
	var/datum/time_of_day/next_step_datum
	var/list/mutable_appearance/sunlight_overlays
	// Only retained during initialization; roof changes invalidate both views of a turf.
	var/alist/sky_status_cache
	var/alist/ceiling_status_cache

	var/last_color = null
	var/picked_color
	//Ensure midnight is the liast step
	var/list/datum/time_of_day/time_cycle_steps = list(new /datum/time_of_day/dawn(),
	                                                   new /datum/time_of_day/sunrise(),
	                                                   new /datum/time_of_day/daytime(),
	                                                   new /datum/time_of_day/sunset(),
	                                                   new /datum/time_of_day/dusk(),
	                                                   new /datum/time_of_day/midnight())
	var/next_day = FALSE // Resets when station_time is less than the next start time.

/datum/controller/subsystem/outdoor_effects/proc/fullPlonk()
	InitializeTurfs()

/datum/controller/subsystem/outdoor_effects/Initialize(timeofday)
	if(!initialized)
		init_weather_overlay()
		get_time_of_day()
		InitializeTurfs()
		initialized = TRUE
		sky_status_cache = alist()
		ceiling_status_cache = alist()
	fire(FALSE, TRUE)
	sky_status_cache = null
	ceiling_status_cache = null
	..()

/datum/controller/subsystem/outdoor_effects/stat_entry(msg)
	msg = "W:[GLOB.SUNLIGHT_QUEUE_WORK.len]|U:[GLOB.SUNLIGHT_QUEUE_UPDATE.len]|C:[GLOB.SUNLIGHT_QUEUE_CORNER.len]"
	return ..()

/datum/controller/subsystem/outdoor_effects/proc/InitializeTurfs()
	for (var/z in SSmapping.levels_by_trait(ZTRAIT_STATION))
		if(SSmapping.level_trait(z, ZTRAIT_IGNORE_WEATHER_TRAIT))
			continue
		for(var/turf/T as anything in block(locate(1,1,z), locate(world.maxx,world.maxy,z)))
			queue_turf(T)
			CHECK_TICK

/datum/controller/subsystem/outdoor_effects/proc/queue_turf(turf/T)
	if(!T || T.sunlight_work_queued || istype(T, /turf/closed/void))
		return
	T.sunlight_work_queued = TRUE
	GLOB.SUNLIGHT_QUEUE_WORK += T

/datum/controller/subsystem/outdoor_effects/proc/queue_outdoor_effect(datum/outdoor_info/OE)
	if(QDELETED(OE) || OE.update_queued)
		return
	OE.update_queued = TRUE
	GLOB.SUNLIGHT_QUEUE_UPDATE += OE

/datum/controller/subsystem/outdoor_effects/proc/queue_corner(turf/T)
	if(!T || T.sunlight_corner_queued || istype(T, /turf/closed/void))
		return
	T.sunlight_corner_queued = TRUE
	GLOB.SUNLIGHT_QUEUE_CORNER += T

/datum/controller/subsystem/outdoor_effects/proc/clear_ceiling_cache()
	if(!isnull(sky_status_cache))
		sky_status_cache = alist()
		ceiling_status_cache = alist()


/datum/controller/subsystem/outdoor_effects/proc/check_cycle()
	if(!next_step_datum)
		get_time_of_day()
		return TRUE

	if(station_time() > next_step_datum.start)
		if(next_day)
			return FALSE
		get_time_of_day()
		return TRUE
	else if (next_day) // It is now the next morning, reset our next day
		next_day = FALSE

	return FALSE

/datum/controller/subsystem/outdoor_effects/proc/get_time_of_day()

	//Set our current color as last_color so newly initialized sunlight screens have a color
	if(current_step_datum)
		last_color = picked_color

	//Get the next time step (first time where NOW > START_TIME)
	//If we don't find one - grab the LAST time step (which should be midnight)
	var/time = station_time()
	var/datum/time_of_day/new_step = null

	for(var/i in 1 to length(time_cycle_steps))
		if(time >= time_cycle_steps[i].start)
			new_step = time_cycle_steps[i]
			next_step_datum = i == length(time_cycle_steps) ? time_cycle_steps[1] : time_cycle_steps[i + 1]

	//New time is the last time step in list (midnight) - next time will be the first step
	if(!new_step)
		new_step = time_cycle_steps[length(time_cycle_steps)]
		next_step_datum = time_cycle_steps[1]

	current_step_datum = new_step
	picked_color = pick(current_step_datum.color)

	// If the next start time is less than the current start time (i.e 10 PM vs 5 AM) then set our NextDay value
	if(next_step_datum.start <= current_step_datum.start)
		next_day = TRUE

	//If it is round-start, we wouldn't have had a current_step_datum, so set our last_color to the current one
	if(!last_color)
		last_color = picked_color

/* set sunlight color + add weather effect to clients */
/datum/controller/subsystem/outdoor_effects/fire(resumed, init_tick_checks)
	MC_SPLIT_TICK_INIT(3)
	if(!init_tick_checks)
		MC_SPLIT_TICK
	var/i = 0

	//Add our weather particle obj to any new weather screens
	if(SSParticleWeather.initialized)
		if(length(weather_planes_need_vis))
			for (i in 1 to weather_planes_need_vis.len)
				var/atom/movable/screen/plane_master/weather_effect/W = weather_planes_need_vis[i]
				if(W)
					W.vis_contents = list(SSParticleWeather.getweatherEffect())
				if(init_tick_checks)
					CHECK_TICK
				else if (MC_TICK_CHECK)
					break
			if (i)
				weather_planes_need_vis.Cut(1, i+1)
				i = 0

	while(i < length(GLOB.SUNLIGHT_QUEUE_WORK))
		i++
		var/turf/T = GLOB.SUNLIGHT_QUEUE_WORK[i]
		if(T)
			T.sunlight_work_queued = FALSE
			T.get_sky_and_weather_states()
			if(T.outdoor_effect)
				queue_outdoor_effect(T.outdoor_effect)

		if(init_tick_checks)
			CHECK_TICK
		else if (MC_TICK_CHECK)
			break
	if (i)
		GLOB.SUNLIGHT_QUEUE_WORK.Cut(1, i+1)
		i = 0


	if(!init_tick_checks)
		MC_SPLIT_TICK

	while(i < length(GLOB.SUNLIGHT_QUEUE_UPDATE))
		i++
		var/datum/outdoor_info/U = GLOB.SUNLIGHT_QUEUE_UPDATE[i]
		if(!QDELETED(U))
			U.update_queued = FALSE
			U.process_state()
			update_outdoor_effect_overlays(U)

		if(init_tick_checks)
			CHECK_TICK
		else if (MC_TICK_CHECK)
			break
	if (i)
		GLOB.SUNLIGHT_QUEUE_UPDATE.Cut(1, i+1)
		i = 0


	if(!init_tick_checks)
		MC_SPLIT_TICK

	// update SKY_BLOCKED turfs so they can get their correct indirect lighting
	while(i < length(GLOB.SUNLIGHT_QUEUE_CORNER))
		i++
		var/turf/T = GLOB.SUNLIGHT_QUEUE_CORNER[i]
		if(T)
			T.sunlight_corner_queued = FALSE
			var/datum/outdoor_info/U = T.outdoor_effect

			if(!U)
				// Indirect sunlight also needs an overlay on roofed turfs.
				U = new /datum/outdoor_info(T)
				T.get_sky_and_weather_states()
				if(U.state != SKY_BLOCKED)
					queue_outdoor_effect(U)

			if(U.state == SKY_BLOCKED)
				update_outdoor_effect_overlays(U)

		if(init_tick_checks)
			CHECK_TICK
		else if (MC_TICK_CHECK)
			break

	if (i)
		GLOB.SUNLIGHT_QUEUE_CORNER.Cut(1, i+1)
		i = 0

	if(check_cycle())
		for (var/atom/movable/screen/fullscreen/lighting_backdrop/sunlight/SP in sunlighting_planes)
			transition_sunlight_color(SP)


//Transition from our last color to our current color (i.e if it is going from daylight (white) to sunset (red), we transition to red in the first hour of sunset)
/datum/controller/subsystem/outdoor_effects/proc/transition_sunlight_color(atom/movable/screen/fullscreen/lighting_backdrop/sunlight/SP)
	/* transistion in an hour or time diff from now to our next step, whichever is smaller */
	if(!next_step_datum)
		get_time_of_day()

	var timeDiff = min((1 HOURS / SSticker.station_time_rate_multiplier ),daytimeDiff(station_time(), next_step_datum.start))
	animate(SP,color=picked_color, time = timeDiff)

// Updates overlays and vis_contents for outdoor effects
/datum/controller/subsystem/outdoor_effects/proc/update_outdoor_effect_overlays(datum/outdoor_info/OE)
	var/mutable_appearance/MA
	if (OE.state != SKY_BLOCKED)
		MA = get_sunlight_overlay(1,1,1,1) /* fully lit */
	else //Indoor - do proper corner checks
		/* check if we are globally affected or not */
		var/static/datum/lighting_corner/dummy/dummy_lighting_corner = new
		if (!OE.source_turf.lighting_corners_initialised)
			OE.source_turf.generate_missing_corners()
		var/list/corners = OE.source_turf.corners
		var/datum/lighting_corner/cr = corners?[3] || dummy_lighting_corner
		var/datum/lighting_corner/cg = corners?[2] || dummy_lighting_corner
		var/datum/lighting_corner/cb = corners?[4] || dummy_lighting_corner
		var/datum/lighting_corner/ca = corners?[1] || dummy_lighting_corner

		var/fr = cr.sunFalloff
		var/fg = cg.sunFalloff
		var/fb = cb.sunFalloff
		var/fa = ca.sunFalloff

		MA = get_sunlight_overlay(fr, fg, fb, fa)

	var/turf/source_turf = OE.source_turf
	var/dirty = OE.underlays_dirty

	var/want_weather = !OE.weatherproof
	var/update_weather = dirty || want_weather != OE.weather_applied
	var/update_sunlight = dirty || MA != OE.sunlight_overlay
	var/list/next_underlays
	if(update_weather || update_sunlight)
		// Apply both effects in one appearance change, retaining unrelated underlays.
		next_underlays = source_turf.underlays.Copy()

	// Unions keep image operands; removals match their stored appearance snapshots.
	if(update_weather)
		if(want_weather)
			next_underlays |= shared_weather_overlay
		else
			next_underlays -= shared_weather_overlay?.appearance
		OE.weather_applied = want_weather

	if(update_sunlight)
		if(OE.sunlight_overlay?.luminosity && !MA.luminosity)
			// Recompute visibility when sunlight fades without a lamp changing.
			var/datum/lighting_object/lighting_object = source_turf.lighting_object
			if(!lighting_object)
				if(source_turf.has_dynamic_lighting())
					new /datum/lighting_object(source_turf)
			else if(!lighting_object.needs_update)
				lighting_object.needs_update = TRUE
				SSlighting.objects_queue += lighting_object
		next_underlays -= OE.sunlight_overlay?.appearance
		next_underlays |= MA
		OE.sunlight_overlay = MA

	if(!isnull(next_underlays))
		source_turf.underlays = next_underlays
	OE.underlays_dirty = FALSE
	source_turf.luminosity = max(source_turf.luminosity, MA.luminosity)

//Retrieve an overlay from the list - create if necessary
/datum/controller/subsystem/outdoor_effects/proc/get_sunlight_overlay(fr, fg, fb, fa)

	var/index = "[fr]|[fg]|[fb]|[fa]"
	LAZYINITLIST(sunlight_overlays)
	if(!sunlight_overlays[index])
		sunlight_overlays[index] = create_sunlight_overlay(fr, fg, fb, fa)
	return sunlight_overlays[index]


//set up our weather overlay
/datum/controller/subsystem/outdoor_effects/proc/init_weather_overlay() //TODO VANDERLIN: Restore this to 32x48 for some extra
	if(!shared_weather_overlay)
		shared_weather_overlay = new /mutable_appearance()
		shared_weather_overlay.icon 			  = 'icons/effects/weather_overlay.dmi'
		shared_weather_overlay.icon_state 		  = "weather_overlay"
		shared_weather_overlay.plane			  = WEATHER_OVERLAY_PLANE
		shared_weather_overlay.blend_mode   	  = BLEND_OVERLAY
		shared_weather_overlay.invisibility 	  = INVISIBILITY_LIGHTING



//Create an overlay appearance from corner values
/datum/controller/subsystem/outdoor_effects/proc/create_sunlight_overlay(fr, fg, fb, fa)

	var/mutable_appearance/MA = new /mutable_appearance()

	MA.blend_mode   = BLEND_OVERLAY
	MA.icon		 = LIGHTING_ICON
	MA.icon_state   = null
	MA.plane		= SUNLIGHTING_PLANE /* we put this on a lower level than lighting so we dont multiply anything */
	MA.invisibility = INVISIBILITY_LIGHTING


	//MA gets applied as an overlay, but we pull luminosity out to set our outdoor_effect object's lum
	#if LIGHTING_SOFT_THRESHOLD != 0
	MA.luminosity = max(fr, fg, fb, fa) > LIGHTING_SOFT_THRESHOLD
	#else
	MA.luminosity = max(fr, fg, fb, fa) > 1e-6
	#endif

	if((fr & fg & fb & fa) && (fr + fg + fb + fa == 4)) /* this will likely never happen */
		MA.color = LIGHTING_BASE_MATRIX
	else if(!MA.luminosity)
		MA.color = SUNLIGHT_DARK_MATRIX
	else
		MA.color = list(
					fr, fr, fr,  00 ,
					fg, fg, fg,  00 ,
					fb, fb, fb,  00 ,
					fa, fa, fa,  00 ,
					00, 00, 00,  01 )
	return MA
