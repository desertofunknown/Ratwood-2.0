#define FIELD_MAP_MAX_TILES 8192
#define FIELD_MAP_MAX_PAGES 8
#define FIELD_MAP_MAX_MARKS 128
#define FIELD_MAP_MAX_POINTS 96

/datum/asset/simple/field_atlas
	assets = list("field-atlas-vellum.png" = 'icons/tgui/field-atlas-vellum.png')

/obj/item/field_map
	name = "field atlas"
	desc = "Bound sheets for charting country, tunnels and routes. Its drawings travel with the atlas."
	icon = 'icons/roguetown/items/books.dmi'
	icon_state = "hunt_map"
	w_class = WEIGHT_CLASS_SMALL
	resistance_flags = FLAMMABLE
	var/list/pages = list()
	var/list/marks = list()
	var/tile_count = 0
	var/next_mark_id = 1
	var/next_edit = 0
	var/next_chart = 0

/obj/item/field_map/examine(mob/user)
	. = ..()
	. += span_info("Use or right-click to read. Hold a feather or thorn to chart visible ground, draw routes and add notes. Each explored level has its own sheet. You can erase your own annotations.")

/obj/item/field_map/attack_self(mob/user)
	ui_interact(user)

/obj/item/field_map/attack_right(mob/user)
	ui_interact(user)

/obj/item/field_map/attackby(obj/item/item, mob/user, params)
	if(istype(item, /obj/item/natural/thorn) || istype(item, /obj/item/natural/feather))
		ui_interact(user)
		return
	return ..()

/obj/item/field_map/proc/can_read_map(mob/living/carbon/human/user)
	return istype(user) && get_turf(user) && !user.incapacitated() && user.can_read(src, TRUE) && (loc == user || (isturf(loc) && user.Adjacent(src)))

/obj/item/field_map/proc/can_write_map(mob/living/carbon/human/user)
	if(!can_read_map(user))
		return FALSE
	for(var/obj/item/tool in user.held_items)
		if(istype(tool, /obj/item/natural/thorn) || istype(tool, /obj/item/natural/feather))
			return TRUE
	return FALSE

/obj/item/field_map/ui_state(mob/user)
	return GLOB.physical_state

/obj/item/field_map/ui_assets(mob/user)
	return list(get_asset_datum(/datum/asset/simple/field_atlas))

/obj/item/field_map/ui_interact(mob/user, datum/tgui/ui)
	if(!can_read_map(user))
		ui?.close()
		to_chat(user, span_warning("I must be able to read and reach the atlas."))
		return
	ui = SStgui.try_update_ui(user, src, ui)
	if(!ui)
		ui = new(user, src, "FieldMap", name)
		ui.set_autoupdate(FALSE)
		ui.open()

/obj/item/field_map/ui_static_data(mob/user)
	if(!can_read_map(user))
		return list()
	return list("pages" = pages)

/obj/item/field_map/ui_data(mob/user)
	var/list/data = list("readable" = can_read_map(user), "writable" = can_write_map(user))
	if(!data["readable"])
		return data
	data["max_x"] = world.maxx
	data["max_y"] = world.maxy
	data["tile_count"] = tile_count
	data["max_tiles"] = FIELD_MAP_MAX_TILES
	data["max_marks"] = FIELD_MAP_MAX_MARKS
	data["max_points"] = FIELD_MAP_MAX_POINTS
	var/turf/position = get_turf(user)
	data["position"] = list("x" = position.x, "y" = position.y, "z" = position.z)
	var/list/visible_marks = list()
	for(var/id in marks)
		var/list/mark = marks[id]
		var/list/visible_mark = mark.Copy()
		visible_mark -= "author"
		visible_mark["id"] = id
		visible_mark["erasable"] = mark["author"] == user.ckey
		visible_marks += list(visible_mark)
	data["marks"] = visible_marks
	var/mob/living/living_user = user
	var/datum/field_survey/report = living_user.last_field_survey
	if(report)
		data["survey"] = list("x" = report.origin_x, "y" = report.origin_y, "z" = report.origin_z, "text" = report.summary)
	return data

/obj/item/field_map/proc/ensure_page(x, y, z, update_viewers = TRUE)
	var/page_id = "[z]"
	if(pages[page_id])
		return pages[page_id]
	if(length(pages) >= FIELD_MAP_MAX_PAGES)
		return null
	var/list/page = list("x" = x, "y" = y, "z" = z, "tiles" = list(), "features" = list())
	pages[page_id] = page
	if(update_viewers)
		update_static_data_for_all_viewers()
	return page

/obj/item/field_map/proc/terrain_kind(turf/ground)
	if(istype(ground, /turf/open/water))
		var/turf/open/water/water = ground
		return water.water_level >= 3 ? "deep_water" : "water"
	if(istype(ground, /turf/closed/mineral))
		return "rock"
	if(istype(ground, /turf/closed))
		return "wall"
	if(istype(ground, /turf/open/transparent/openspace))
		return "drop"
	if(istype(ground, /turf/open/floor/rogue/dirt/road))
		return "road"
	if(istype(ground, /turf/open/floor/rogue/dirt))
		var/turf/open/floor/rogue/dirt/dirt = ground
		return dirt.muddy ? "mud" : "dirt"
	var/static/list/wood_floors = typecacheof(list(
		/turf/open/floor/rogue/ruinedwood,
		/turf/open/floor/rogue/wood,
		/turf/open/floor/rogue/woodturned,
		/turf/open/floor/rogue/twig))
	if(is_type_in_typecache(ground, wood_floors))
		return "wood"
	var/static/list/grass_floors = typecacheof(list(
		/turf/open/floor/rogue/grass,
		/turf/open/floor/rogue/grasscold,
		/turf/open/floor/rogue/grasspurple,
		/turf/open/floor/rogue/grassgrey,
		/turf/open/floor/rogue/grassred,
		/turf/open/floor/rogue/grassyel))
	if(is_type_in_typecache(ground, grass_floors))
		return "grass"
	var/static/list/sand_floors = typecacheof(list(
		/turf/open/floor/rogue/AzureSand,
		/turf/open/floor/rogue/sand,
		/turf/open/floor/rogue/dunes))
	if(is_type_in_typecache(ground, sand_floors))
		return "sand"
	var/static/list/snow_floors = typecacheof(list(
		/turf/open/floor/rogue/snow,
		/turf/open/floor/rogue/snowrough,
		/turf/open/floor/rogue/snowpatchy))
	if(is_type_in_typecache(ground, snow_floors))
		return "snow"
	var/static/list/stone_floors = typecacheof(list(
		/turf/open/floor/rogue/blocks,
		/turf/open/floor/rogue/greenstone,
		/turf/open/floor/rogue/hexstone,
		/turf/open/floor/rogue/churchmarble,
		/turf/open/floor/rogue/church,
		/turf/open/floor/rogue/churchbrick,
		/turf/open/floor/rogue/churchrough,
		/turf/open/floor/rogue/herringbone,
		/turf/open/floor/rogue/cobble,
		/turf/open/floor/rogue/cobblerock,
		/turf/open/floor/rogue/tile,
		/turf/open/floor/rogue/concrete,
		/turf/open/floor/rogue/naturalstone))
	if(is_type_in_typecache(ground, stone_floors))
		return "stone"
	if(istype(ground, /turf/open/floor))
		return "floor"
	var/area/ground_area = get_area(ground)
	return ground_area.outdoors ? "ground" : "floor"

/obj/item/field_map/proc/landmark_kind(obj/structure/landmark)
	if(istype(landmark, /obj/structure/stairs))
		return "stairs"
	if(istype(landmark, /obj/structure/ladder) || istype(landmark, /obj/structure/wallladder) || istype(landmark, /obj/structure/rope_ladder))
		return "ladder"
	if(istype(landmark, /obj/structure/mineral_door))
		return "door"
	if(istype(landmark, /obj/structure/roguewindow))
		return "window"
	if(istype(landmark, /obj/structure/well))
		return "well"
	if(istype(landmark, /obj/structure/statue))
		return "statue"
	if(istype(landmark, /obj/structure/bars/grille))
		return (landmark.obj_flags & BLOCK_Z_OUT_DOWN) ? "grate" : null
	if(istype(landmark, /obj/structure/fluff/railing) || istype(landmark, /obj/structure/bars))
		return "fence"
	if(istype(landmark, /obj/structure/flora/roguetree/stump))
		return
	if(istype(landmark, /obj/structure/flora/tree) || istype(landmark, /obj/structure/flora/roguetree) || istype(landmark, /obj/structure/flora/newtree) || istype(landmark, /obj/structure/flora/newtreealt))
		return "tree"
	if(istype(landmark, /obj/structure/flora/bush) || istype(landmark, /obj/structure/flora/ausbushes))
		return "bush"
	if(istype(landmark, /obj/structure/flora/rock))
		return "rock"

/obj/item/field_map/proc/chart_surroundings(mob/living/carbon/human/user)
	if(world.time < next_chart)
		return
	next_chart = world.time + 5 SECONDS
	var/turf/origin = get_turf(user)
	if(!origin)
		return
	var/area/origin_area = get_area(origin)
	if(origin_area.hidden)
		to_chat(user, span_warning("I cannot chart this place."))
		return
	var/changed = !pages["[origin.z]"]
	var/list/page = ensure_page(origin.x, origin.y, origin.z, FALSE)
	if(!page)
		to_chat(user, span_warning("There are no unused sheets left in this atlas."))
		return
	var/list/tiles = page["tiles"]
	var/list/features = page["features"]
	var/list/visible = view(7, user)
	var/list/concealed = list()
	for(var/image/override_image in user.client?.images)
		if(override_image.override && override_image.loc)
			concealed[override_image.loc] = TRUE
	var/list/observed_features = list()
	var/list/covered_tiles = list()
	var/static/list/feature_priority = list("stairs" = 10, "ladder" = 9, "door" = 8, "window" = 7, "well" = 6, "statue" = 5, "grate" = 4, "fence" = 3, "tree" = 2, "bush" = 1, "rock" = 1)
	for(var/obj/structure/landmark in visible)
		if(!isturf(landmark.loc) || landmark.z != origin.z || landmark.alpha <= 0 || landmark.invisibility > user.see_invisible || concealed[landmark])
			continue
		var/turf/ground = landmark.loc
		var/area/ground_area = get_area(ground)
		if(ground_area.hidden || concealed[ground])
			continue
		var/kind = landmark_kind(landmark)
		if(!kind)
			continue
		var/tile_id = "[ground.x],[ground.y]"
		if(kind == "grate")
			covered_tiles[tile_id] = TRUE
		var/list/existing = observed_features[tile_id]
		if(existing && feature_priority[existing["kind"]] >= feature_priority[kind])
			continue
		var/list/feature = list("kind" = kind, "dir" = landmark.dir)
		if(kind == "door")
			feature["open"] = !landmark.density
		observed_features[tile_id] = feature
	var/full = FALSE
	var/static/list/window_turfs = typecacheof(list(
		/turf/closed/wall/mineral/rogue/stone/window,
		/turf/closed/wall/mineral/rogue/wood/window,
		/turf/closed/wall/mineral/rogue/wooddark/window,
		/turf/closed/wall/mineral/rogue/brick/window))
	for(var/turf/ground in visible)
		var/area/ground_area = get_area(ground)
		if(ground.z != origin.z || ground_area.hidden || ground.alpha <= 0 || ground.invisibility > user.see_invisible || concealed[ground])
			continue
		var/tile_id = "[ground.x],[ground.y]"
		if(!tiles[tile_id])
			if(tile_count >= FIELD_MAP_MAX_TILES)
				full = TRUE
				continue
			tile_count++
		var/kind = terrain_kind(ground)
		if(kind == "drop" && covered_tiles[tile_id])
			kind = "floor"
		if(tiles[tile_id] != kind)
			tiles[tile_id] = kind
			changed = TRUE
		var/list/feature = observed_features[tile_id]
		if(!feature && is_type_in_typecache(ground, window_turfs))
			feature = list("kind" = "window", "dir" = ground.dir)
		var/list/existing = features[tile_id]
		if(feature)
			if(!existing || existing["kind"] != feature["kind"] || existing["dir"] != feature["dir"] || existing["open"] != feature["open"])
				features[tile_id] = feature
				changed = TRUE
		else if(existing)
			features -= tile_id
			changed = TRUE
	if(changed)
		update_static_data_for_all_viewers()
	if(full)
		to_chat(user, span_warning("The atlas is full. Existing ground and annotations can still be updated."))
	to_chat(user, span_notice("I sketch the visible ground. Unexplored ground remains blank."))
	return changed

/obj/item/field_map/proc/valid_point(list/point)
	return islist(point) && length(point) == 2 && isnum(point[1]) && isnum(point[2]) && point[1] >= 1 && point[1] <= world.maxx && point[2] >= 1 && point[2] <= world.maxy

/obj/item/field_map/ui_act(action, list/params, datum/tgui/ui, datum/ui_state/state)
	if(..())
		ui?.send_update()
		return FALSE
	var/mob/living/carbon/human/user = ui.user
	if(!can_read_map(user))
		ui.close()
		return FALSE
	if(world.time < next_edit)
		ui.send_update()
		return FALSE
	next_edit = world.time + 0.2 SECONDS
	if(action == "refresh")
		ui.send_update()
		return FALSE
	if(!can_write_map(user))
		ui.send_update()
		return FALSE
	if(action == "chart")
		if(chart_surroundings(user))
			return TRUE
		ui.send_update()
		return FALSE
	if(action == "erase")
		var/id = params["id"]
		if(!istext(id) || length(id) > 10)
			ui.send_update()
			return FALSE
		var/list/mark = marks[id]
		if(mark && mark["author"] == user.ckey)
			marks -= id
			return TRUE
		ui.send_update()
		return FALSE
	if(length(marks) >= FIELD_MAP_MAX_MARKS)
		to_chat(user, span_warning("There is no room for another annotation. Erase one of your old marks first."))
		ui.send_update()
		return FALSE
	var/list/new_mark
	if(action == "record_survey")
		var/datum/field_survey/report = user.last_field_survey
		if(!report || !ensure_page(report.origin_x, report.origin_y, report.origin_z))
			ui.send_update()
			return FALSE
		new_mark = list("z" = report.origin_z, "x" = report.origin_x, "y" = report.origin_y, "text" = report.summary, "color" = "blue", "kind" = "survey")
	else if(action == "stroke" || action == "marker")
		var/z = params["z"]
		if(!isnum(z) || !pages["[z]"] || !(params["color"] in list("ink", "red", "blue")))
			ui.send_update()
			return FALSE
		new_mark = list("z" = z, "color" = params["color"], "kind" = action)
		if(action == "stroke")
			var/list/points = params["points"]
			if(!islist(points) || length(points) < 2 || length(points) > FIELD_MAP_MAX_POINTS)
				ui.send_update()
				return FALSE
			var/list/clean_points = list()
			for(var/list/point as anything in points)
				if(!valid_point(point))
					ui.send_update()
					return FALSE
				clean_points += list(list(round(point[1], 0.1), round(point[2], 0.1)))
			new_mark["points"] = clean_points
		else
			var/list/point = list(params["x"], params["y"])
			if(!valid_point(point) || !istext(params["text"]) || length(params["text"]) > 64)
				ui.send_update()
				return FALSE
			var/label = trim(sanitize(params["text"]))
			if(!length(label))
				ui.send_update()
				return FALSE
			new_mark["x"] = round(point[1], 0.1)
			new_mark["y"] = round(point[2], 0.1)
			new_mark["text"] = label
	else
		ui.send_update()
		return FALSE
	new_mark["author"] = user.ckey
	marks["[next_mark_id++]"] = new_mark
	return TRUE

/datum/field_survey
	var/origin_x
	var/origin_y
	var/origin_z
	var/summary

/mob/living
	var/datum/field_survey/last_field_survey
	var/next_field_survey = 0

/obj/item/prospecting_kit
	name = "prospector's kit"
	desc = "A compass, sounding hammer and sample lens. Compare soundings from different sites to find promising ground."
	icon = 'icons/roguetown/weapons/stationary/bombard.dmi'
	icon_state = "compass"
	w_class = WEIGHT_CLASS_SMALL
	var/surveying = FALSE

/obj/item/prospecting_kit/examine(mob/user)
	. = ..()
	. += span_info("Use beside natural rock to survey this level. Mining skill improves range. Findings are approximate bearings and abundance, not a route through the rock. Hold a feather or thorn while using a field atlas to record your latest findings.")

/obj/item/prospecting_kit/attack_self(mob/living/user)
	if(!istype(user) || !user.is_holding(src) || user.incapacitated() || surveying || user.doing || world.time < user.next_field_survey)
		return
	var/skill = user.get_skill_level(/datum/skill/labor/mining)
	if(skill < SKILL_LEVEL_NOVICE)
		to_chat(user, span_warning("I need some mining training to interpret the soundings."))
		return
	var/turf/origin = get_turf(user)
	if(!origin)
		return
	var/area/origin_area = get_area(origin)
	if(origin_area.hidden)
		return
	var/has_rock = FALSE
	for(var/turf/closed/mineral/rock in range(1, origin))
		has_rock = TRUE
		break
	if(!has_rock)
		to_chat(user, span_warning("I need a natural rock face beside me to take a sounding."))
		return
	surveying = TRUE
	user.next_field_survey = world.time + 30 SECONDS
	to_chat(user, span_notice("I compare the rock, take soundings and check my bearings..."))
	var/completed = do_after(user, 10 SECONDS, target = src)
	if(QDELETED(src))
		return
	surveying = FALSE
	if(!completed || QDELETED(user) || !user.is_holding(src) || get_turf(user) != origin)
		return
	var/radius = min(30, 12 + skill * 3)
	var/list/observations = list()
	for(var/turf/closed/mineral/deposit in range(radius, origin))
		var/area/deposit_area = get_area(deposit)
		if(deposit_area.hidden || !deposit.mineralType || deposit.mineralAmt <= 0)
			continue
		var/obj/item/ore_type = deposit.mineralType
		var/material = initial(ore_type.name)
		var/direction = dir2text(get_dir(origin, deposit))
		if(deposit == origin)
			direction = "here"
		var/bearing = "[material]|[direction]"
		if(!observations[bearing])
			observations[bearing] = list("material" = material, "direction" = direction, "count" = 0, "distance" = 0)
		var/list/observation = observations[bearing]
		observation["count"]++
		observation["distance"] += get_dist(origin, deposit)
	var/list/lines = list()
	var/list/reported_materials = list()
	for(var/i in 1 to 3)
		var/list/strongest
		for(var/bearing in observations)
			var/list/observation = observations[bearing]
			if(observation["material"] in reported_materials)
				continue
			if(!strongest || observation["count"] > strongest["count"])
				strongest = observation
		if(!strongest)
			break
		reported_materials += strongest["material"]
		var/count = strongest["count"]
		var/abundance = count < 5 ? "faint" : count < 15 ? "promising" : "strong"
		var/distance = strongest["distance"] / count <= radius / 2 ? "nearby" : "farther away"
		lines += "[strongest["material"]]: [abundance] indications [strongest["direction"]], [distance]"
	var/datum/field_survey/report = new
	report.origin_x = origin.x
	report.origin_y = origin.y
	report.origin_z = origin.z
	report.summary = "Sounding at [origin.x], [origin.y], level [origin.z] (within [radius] paces): [length(lines) ? jointext(lines, "; ") : "no clear ore indications"]. Compare another site; depth and intervening passages remain unknown."
	QDEL_NULL(user.last_field_survey)
	user.last_field_survey = report
	to_chat(user, span_notice(report.summary))

/datum/crafting_recipe/roguetown/survival/field_atlas
	name = "field atlas"
	result = /obj/item/field_map
	reqs = list(/obj/item/paper/scroll = 2, /obj/item/natural/fibers = 1)
	craftdiff = 0

/datum/crafting_recipe/roguetown/survival/prospecting_kit
	name = "prospector's kit"
	result = /obj/item/prospecting_kit
	reqs = list(/obj/item/ingot/iron = 1, /obj/item/natural/stone = 1, /obj/item/natural/fibers = 1)
	tools = list(/obj/item/rogueweapon/hammer)
	craftdiff = 1

#undef FIELD_MAP_MAX_TILES
#undef FIELD_MAP_MAX_PAGES
#undef FIELD_MAP_MAX_MARKS
#undef FIELD_MAP_MAX_POINTS
