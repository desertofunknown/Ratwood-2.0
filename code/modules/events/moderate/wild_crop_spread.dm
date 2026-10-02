/datum/round_event_control/wild_crops
	name = "Wild Crop Sprout"
	track = EVENT_TRACK_MODERATE
	typepath = /datum/round_event/wild_crops
	weight = 7
	max_occurrences = 10
	min_players = 0
	earliest_start = 12 MINUTES

	tags = list(
		TAG_NATURE,
		TAG_BOON,
	)

/datum/round_event/wild_crops/start()
	. = ..()
	var/list/turfs = get_area_turfs(/area/rogue/outdoors/woods, subtypes = TRUE)
	var/list/eligible_turfs = list()
	for(var/turf/candidate as anything in turfs)
		if(istype(candidate, /turf/open/floor/rogue/dirt) || istype(candidate, /turf/open/floor/rogue/grass) || istype(candidate, /turf/open/floor/rogue/snow))
			eligible_turfs += candidate
	if(!length(eligible_turfs))
		return
	for(var/i = 1 to rand(2, 12))
		new /obj/structure/wild_plant(pick(eligible_turfs))
