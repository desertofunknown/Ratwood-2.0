//todo: handle moving sunlight turfs - see various uses of get_turf in lighting_object


/*

Sunlight System

	Objects + Details
		Sunlight Objects (this file)
			- Grayscale version of lighting_object
			- Has 3 states
				- SKY_BLOCKED  (0)
					- Turfs that have an opaque turf above them. Has no light themselves but is affected by SKY_VISIBLE_BORDER
				- SKY_VISIBLE (1)
					- Turfs that with no opaque turfs above it (no roof, glass roof, etc), with no neighbouring SKY_BLOCKED tiles
					  Emits no light, but is fully white to display the overlay color
				- SKY_VISIBLE_BORDER  (2)
					- Turfs that with no opaque turfs above it (no roof, glass roof, etc), which neighbour at least one SKY_BLOCKED tile.
				     Emits light to SKY_BLOCKED tiles, and fully white to display the overlay color

*/
/obj
	var/object_slowdown = 0
	var/weatherproof = FALSE
	var/weather = FALSE

/obj/proc/weather_act_on(weather_trait, severity)
	return

/datum/outdoor_info
	/* misc vars */
	var/state 					 = SKY_VISIBLE	// If we can see the see the sky, are blocked, or we have a blocked neighbour (SKY_BLOCKED/VISIBLE/VISIBLE_BORDER)
	var/weatherproof			 = FALSE        // If we have a weather overlay
	var/weather_applied			 = FALSE
	var/underlays_dirty			 = TRUE
	var/update_queued			 = FALSE
	var/turf/source_turf
	var/mutable_appearance/sunlight_overlay
	var/list/datum/lighting_corner/affecting_corners

/datum/outdoor_info/proc/reset_applied_overlays()
	underlays_dirty = TRUE
	SSoutdoor_effects.clear_ceiling_cache()

/datum/outdoor_info/Destroy(force, ...)
	if (!force)
		return QDEL_HINT_LETMELIVE
	//If we are a source of light - disable it, to fix corner refs
	disable_sunlight()
	//Remove ourselves from our turf
	if(source_turf?.outdoor_effect == src)
		source_turf.outdoor_effect = null
	return ..()

/datum/outdoor_info/New(turf/attached_turf)
	. = ..()
	source_turf = attached_turf
	if (attached_turf.outdoor_effect)
		qdel(attached_turf.outdoor_effect, force = TRUE)
		attached_turf.outdoor_effect = null
	source_turf.outdoor_effect = src


/datum/outdoor_info/proc/disable_sunlight()
	for(var/datum/lighting_corner/C in affecting_corners)
		var/old_falloff = C.sunFalloff
		C.globAffect -= src
		if(!length(C.globAffect))
			C.globAffect = null
		C.get_sunlight_falloff()
		if(C.sunFalloff != old_falloff)
			for(var/turf/T as anything in C.masters)
				SSoutdoor_effects.queue_corner(T)

	//Empty our affecting_corners list
	affecting_corners = null

/datum/outdoor_info/proc/process_state()
	if(state == SKY_VISIBLE_BORDER)
		calc_sunlight_spread()
	else if(length(affecting_corners))
		// Fully exposed turfs no longer cast sunlight into neighbouring rooms either.
		disable_sunlight()

#define hardSun 0.5 /* our hyperboloidy modifyer funky times - I wrote this in like, 2020 and can't remember how it works - I think it makes a 3D cone shape with a flat top */
/* calculate the indoor corners we are affecting */
#define SUN_FALLOFF(C, T) (1 - CLAMP01(sqrt((C.x - T.x) ** 2 + (C.y - T.y) ** 2 - hardSun) / max(1, GLOB.GLOBAL_LIGHT_RANGE)))


/datum/outdoor_info/proc/calc_sunlight_spread()

	var/datum/lighting_corner/C
	var/turf/T
	var/list/corners  = list() /* corners we are currently affecting */

	//Set lum so we can see things
	var/oldLum = source_turf.luminosity
	source_turf.luminosity = GLOB.GLOBAL_LIGHT_RANGE

	for(T in view(CEILING(GLOB.GLOBAL_LIGHT_RANGE, 1), source_turf))
		if(T.opacity) /* get_corners used to do opacity checks for arse */
			continue
		if (!T.lighting_corners_initialised)
			T.generate_missing_corners()
		corners |= T.corners

	//restore lum
	source_turf.luminosity = oldLum

	/* fix up the lists */
	/* add ourselves and our distance to the corner */
	LAZYINITLIST(affecting_corners)
	var/list/L = corners - affecting_corners
	affecting_corners += L
	for (C in L) // new corners
		C.globAffect ||= alist() // todo: make lazyalist macros? alazylist?
		C.globAffect[src] = SUN_FALLOFF(C,source_turf)
		if(C.globAffect[src] > C.sunFalloff) /* if are closer than current dist, update the corner */
			C.sunFalloff = C.globAffect[src]
			for(var/turf/master as anything in C.masters)
				SSoutdoor_effects.queue_corner(master)


	L = affecting_corners - corners // Now-gone corners, remove us from the affecting.
	affecting_corners -= L
	for (C in L) // removed corners
		var/old_falloff = C.sunFalloff
		C.globAffect -= src // wtb lazyalist (alazylist?) macro
		if(!length(C.globAffect))
			C.globAffect = null
		C.get_sunlight_falloff()
		if(C.sunFalloff != old_falloff)
			for(var/turf/master as anything in C.masters)
				SSoutdoor_effects.queue_corner(master)

/* Related object changes */
/* I moved this here to consolidate sunlight changes as much as possible, so its easily disabled */

/* area fuckery */
/area/var/turf/pseudo_roof

/* turf fuckery */
/turf/var/tmp/datum/outdoor_info/outdoor_effect /* a turf's sunlight info */
/turf/var/tmp/sunlight_work_queued = FALSE
/turf/var/tmp/sunlight_corner_queued = FALSE
/turf/var/turf/pseudo_roof /* our roof turf - may be a path for top z level, or a ref to the turf above*/

//non-weatherproof turfs
/turf/var/weatherproof = TRUE
/turf/open/transparent/openspace/weatherproof = FALSE

/datum/lighting_corner/var/alist/globAffect /* list of sunlight objects affecting this corner */
/datum/lighting_corner/var/sunFalloff = 0 /* smallest distance to sunlight turf, for sunlight falloff */

/* loop through and find our strongest sunlight value */
/datum/lighting_corner/proc/get_sunlight_falloff()
	sunFalloff = 0
	for(var/outdoor_info, sunlight_value in globAffect)
		sunFalloff = max(sunFalloff, sunlight_value)

/turf/proc/reassess_stack()
	if(!SSlighting.initialized)
		return
	SSoutdoor_effects.clear_ceiling_cache()

	/* remove roof refs (not path for psuedo roof) so we can recalculate it */
	if(pseudo_roof && !ispath(pseudo_roof))
		pseudo_roof = null

	//Add ourselves (we might not have corners initialized, and this handles it)
	SSoutdoor_effects.queue_turf(src)

	for(var/datum/lighting_corner/corner in corners)
		for(var/turf/T as anything in corner.masters)
			SSoutdoor_effects.queue_turf(T)

	var/turf/T = GET_TURF_BELOW(src)
	if(T)
		T.reassess_stack()

/* check ourselves and neighbours to see what outdoor effects we need */
/* turf won't initialize an outdoor_effect if sky_blocked*/
#define CEILING_SKY_VISIBLE (1<<0)
#define CEILING_WEATHERPROOF (1<<1)

/turf/proc/get_sky_and_weather_states()
	if(SSmapping.level_trait(z, ZTRAIT_IGNORE_WEATHER_TRAIT))
		return
	var/TempState

	var/roofStat = get_ceiling_status()
	var/tempRoofStat
	if(roofStat & CEILING_SKY_VISIBLE)
		TempState = SKY_VISIBLE
		for(var/turf/CT in orange(1, src))
			tempRoofStat = CT.get_ceiling_status()
			if(!(tempRoofStat & CEILING_SKY_VISIBLE)) /* if we have a single roofed/indoor neighbour, we are a border */
				TempState = SKY_VISIBLE_BORDER
				break
	else /* roofed, so turn off the lights */
		TempState = SKY_BLOCKED

	/* if border or outdoor, initialize. Set sunlight state if valid */
	if(!outdoor_effect && (TempState != SKY_BLOCKED || !(roofStat & CEILING_WEATHERPROOF)))
		outdoor_effect = new /datum/outdoor_info(src)
	if(outdoor_effect)
		outdoor_effect.state = TempState
		outdoor_effect.weatherproof = !!(roofStat & CEILING_WEATHERPROOF)

// The same turf has different blocking rules as a floor and as the ceiling below it.
/turf/proc/get_ceiling_status(recursionStarted = FALSE)
	var/alist/cache = recursionStarted ? SSoutdoor_effects.ceiling_status_cache : SSoutdoor_effects.sky_status_cache
	if(!isnull(cache))
		var/cached_status = cache[src]
		if(!isnull(cached_status))
			return cached_status
	. = calculate_ceiling_status(recursionStarted)
	if(!isnull(cache))
		cache[src] = .

/turf/proc/calculate_ceiling_status(recursionStarted)
	. = 0

	//Check yourself (before you wreck yourself)
	if(isclosedturf(src)) //Closed, but we might be transparent
		. = CEILING_WEATHERPROOF
		if(istransparentturf(src))
			. |= CEILING_SKY_VISIBLE // A column of glass should still let the sun in.
	else
		if(recursionStarted)
			// This src is acting as a ceiling - so if we are a floor we weatherproof + block the sunlight of our down-Z turf
			if(istransparentturf(src))
				. |= CEILING_SKY_VISIBLE
			for(var/obj/structure/thing in src.contents) // Checks to see if weatherproof objects on the tile
				if(thing.weatherproof == TRUE)
					return CEILING_WEATHERPROOF
			if(weatherproof)
				. |= CEILING_WEATHERPROOF
		else //We are open, so assume open to the elements
			. = CEILING_SKY_VISIBLE

	// Early leave if we can't see the sky - if we are an opaque turf, we already know the results
	// I can't think of a case where we would have a turf that would block light but let weather effects through - Maybe a vent?
	// fix this if that is the case
	if(!(. & CEILING_SKY_VISIBLE))
		return .

	//Ceiling Check
	var/turf/ceiling = get_step_multiz(src, UP)
	// Psuedo-roof, for the top of the map (no actual turf exists up here) -- We assume these are solid, if you add glass pseudo_roofs then fix this
	if (pseudo_roof)
		. = CEILING_WEATHERPROOF
	else
		// EVERY turf must be transparent for sunlight - so &=
		// ANY turf must be closed for weatherproof - so |=
		if(ceiling)
			var/ceilingStat = ceiling.get_ceiling_status(TRUE)
			if(!(ceilingStat & CEILING_SKY_VISIBLE))
				. &= ~CEILING_SKY_VISIBLE
			. |= ceilingStat & CEILING_WEATHERPROOF

	var/area/turf_area = get_area(src)
	if(!ceiling && !turf_area.outdoors)
		. = CEILING_WEATHERPROOF

#undef CEILING_SKY_VISIBLE
#undef CEILING_WEATHERPROOF
