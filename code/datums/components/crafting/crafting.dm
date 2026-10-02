/datum/component/personal_crafting/Initialize()
	if(!ismob(parent))
		return COMPONENT_INCOMPATIBLE
	var/mob/living/L = parent
	L.craftingthing = src
//	RegisterSignal(parent, COMSIG_MOB_CLIENT_LOGIN, PROC_REF(create_mob_button))
/*
/datum/component/personal_crafting/proc/create_mob_button(mob/user, client/CL)
	var/datum/hud/H = user.hud_used
	var/atom/movable/screen/craft/C = new()
	C.icon = H.ui_style
	H.static_inventory += C
	CL.screen += C
	RegisterSignal(C, COMSIG_CLICK, PROC_REF(roguecraft))
*/

/datum/component/personal_crafting/proc/calculate_pottery_quality_score(skill_level)
	// Quality tiers: 0=Crude, 1=Rough, 2=Competent(regular), 3=Fine, 4=Flawless, 5=Masterwork
	// Gating: regular only from Apprentice, fine from Journeyman, masterwork from Master
	var/roll = rand(1, 100)
	switch(skill_level)
		if(SKILL_LEVEL_NONE)
			return 0
		if(SKILL_LEVEL_NOVICE)
			return roll <= 25 ? 1 : 0
		if(SKILL_LEVEL_APPRENTICE)
			if(roll <= 20) return 2
			if(roll <= 65) return 1
			return 0
		if(SKILL_LEVEL_JOURNEYMAN)
			if(roll <= 15) return 3
			if(roll <= 55) return 2
			if(roll <= 80) return 1
			return 0
		if(SKILL_LEVEL_EXPERT)
			if(roll <= 15) return 4
			if(roll <= 50) return 3
			if(roll <= 80) return 2
			if(roll <= 95) return 1
			return 0
		if(SKILL_LEVEL_MASTER)
			if(roll <= 20) return 5
			if(roll <= 50) return 4
			if(roll <= 80) return 3
			if(roll <= 95) return 2
			return 1
	// SKILL_LEVEL_LEGENDARY (and any above)
	if(roll <= 40) return 5
	if(roll <= 70) return 4
	if(roll <= 90) return 3
	return 2

/datum/component/personal_crafting/proc/apply_pottery_quality_to_item(obj/item/result, skill_level)
	if(!result || !("pottery_quality" in result.vars))
		return
	var/quality_tier = calculate_pottery_quality_score(skill_level)
	var/quality_prefix = ""
	var/quality_multiplier = 1.0
	switch(quality_tier)
		if(0)
			quality_prefix = "crude "
			quality_multiplier = 0.4
		if(1)
			quality_prefix = "rough "
			quality_multiplier = 0.6
		if(2)
			quality_prefix = ""
			quality_multiplier = 0.8
		if(3)
			quality_prefix = "fine "
			quality_multiplier = 1.04
		if(4)
			quality_prefix = "flawless "
			quality_multiplier = 1.28
		if(5)
			quality_prefix = "masterwork "
			quality_multiplier = 1.6
	// Apply quality prefix to name for tiers 3 and above
	if(quality_prefix && quality_tier >= 3)
		result.name = quality_prefix + initial(result.name)
	// Apply price multiplier
	if(result.sellprice)
		result.sellprice = round(result.sellprice * quality_multiplier)
	// Add masterwork sparkle effect for tier 4+
	if(quality_tier >= 4)
		result.polished = 4
		if(!result.GetComponent(/datum/component/metal_glint))
			result.AddComponent(/datum/component/metal_glint)
	// Store quality information on the result
	result.pottery_quality = quality_tier
	result.creator_skill = skill_level

/datum/component/personal_crafting
	var/busy
	var/viewing_category = 1 //typical powergamer starting on the Weapons tab
	var/viewing_subcategory = 1
	var/list/categories = list(
				CAT_NONE = CAT_NONE,
			)

	var/cur_category = CAT_NONE
	var/cur_subcategory = CAT_NONE
	var/datum/action/innate/crafting/button
	var/display_craftable_only = TRUE
	var/display_compact = TRUE
	var/showonlycraftable = TRUE
	var/craftability_next_update = 0
	var/list/cached_craftability = list()



/*	This is what procs do:
	get_environment - gets a list of things accessable for crafting by user
	get_surroundings - takes a list of things and makes a list of key-types to values-amounts of said type in the list
	check_contents - takes a recipe and a key-type list and checks if said recipe can be done with available stuff
	check_tools - takes recipe, a key-type list, and a user and checks if there are enough tools to do the stuff, checks bugs one level deep
	construct_item - takes a recipe and a user, call all the checking procs, calls do_after,
	checks all the things again, calls del_reqs, creates result,
	calls CheckParts of said result with argument being list returned by del_reqs
	del_reqs - takes recipe and a user, loops over the recipes reqs var and tries to find everything in the list make by get_environment and delete it/add to parts list, then returns the said list
*/




/datum/component/personal_crafting/proc/check_contents(datum/crafting_recipe/R, list/contents)
	return !isnull(select_requirements(R, contents))

/// Select exact eligible instances and quantities before consuming any ingredient.
/datum/component/personal_crafting/proc/select_requirements(datum/crafting_recipe/R, list/contents)
	var/list/available = contents["resources"]
	var/list/remaining = available.Copy()
	var/list/selected = list()
	var/list/requirements = list()
	// Reserve narrower requirements first so broad types cannot take their only matches.
	for(var/requirement in R.reqs)
		var/insert_at = length(requirements) + 1
		for(var/i in 1 to length(requirements))
			if(ispath(requirement, requirements[i]))
				insert_at = i
				break
		requirements.Insert(insert_at, requirement)
	for(var/requirement in requirements)
		var/needed = R.reqs[requirement]
		for(var/datum/resource as anything in remaining)
			if(QDELETED(resource))
				continue
			var/material_type = crafting_material_type(resource)
			if((resource.type in R.blacklist) || (material_type in R.blacklist))
				continue
			if(material_type != requirement && (!R.subtype_reqs || !ispath(material_type, requirement)))
				continue
			var/taken = min(remaining[resource], needed)
			if(taken <= 0)
				continue
			selected[resource] += taken
			remaining[resource] -= taken
			needed -= taken
			if(needed <= 0)
				break
		if(needed > 0)
			return null
	for(var/catalyst in R.chem_catalysts)
		if(contents["other"][catalyst] < R.chem_catalysts[catalyst])
			return null
	return selected

/datum/component/personal_crafting/proc/crafting_material_type(datum/resource)
	if(istype(resource, /obj/item/natural/bundle))
		var/obj/item/natural/bundle/bundle = resource
		return bundle.stacktype
	if(istype(resource, /obj/item/construction/bundle))
		var/obj/item/construction/bundle/bundle = resource
		return bundle.stacktype
	return resource.type

/datum/component/personal_crafting/proc/get_environment(mob/user)
	. = list()
	for(var/obj/item/I in user.held_items)
		. += I
	if(!isturf(user.loc))
		return
	var/list/L = block(get_step(user, SOUTHWEST), get_step(user, NORTHEAST))
	for(var/A in L)
		var/turf/T = A
		if(T.Adjacent(user))
			for(var/B in T)
				var/atom/movable/AM = B
				if(AM.flags_1 & HOLOGRAM_1)
					continue
				. += AM
	for(var/slot in list(SLOT_R_STORE, SLOT_L_STORE))
		. += user.get_item_by_slot(slot)

/obj/item/proc/can_craft_with()
	if(craft_blocked)
		return FALSE
	if(istype(src, /obj/item/storage/roguebag) && src.contents.len > 0) //for bait bags
		return FALSE
	return TRUE

/datum/component/personal_crafting/proc/get_surroundings(mob/user)
	. = list("tool_behaviour" = list(), "other" = list(), "resources" = list())
	for(var/obj/item/I in get_environment(user))
		if(QDELETED(I) || !I.can_craft_with() || (I.flags_1 & HOLOGRAM_1))
			continue
		if(I in .["resources"])
			continue
		if(I.tool_behaviour)
			.["tool_behaviour"] |= I.tool_behaviour
		if(istype(I, /obj/item/natural/bundle))
			var/obj/item/natural/bundle/B = I
			.["other"][B.stacktype] += B.amount
			.["resources"][B] = B.amount
		else if(istype(I, /obj/item/construction/bundle))
			var/obj/item/construction/bundle/B = I
			.["other"][B.stacktype] += B.amount
			.["resources"][B] = B.amount
		else
			if(istype(I, /obj/item/reagent_containers))
				var/obj/item/reagent_containers/RC = I
				if(RC.is_drainable())
					for(var/datum/reagent/reagent in RC.reagents.reagent_list)
						.["other"][reagent.type] += reagent.volume
						.["resources"][reagent] = reagent.volume
				if(istype(RC, /obj/item/reagent_containers/glass) && RC.reagents.total_volume > 0)
					continue
			.["other"][I.type] += 1
			.["resources"][I] = 1

/datum/component/personal_crafting/proc/check_tools(mob/user, datum/crafting_recipe/R, list/contents)
	if(!R.tools.len)
		return TRUE
	var/list/possible_tools = list()
	var/list/present_qualities = list()
	present_qualities |= contents["tool_behaviour"]
	for(var/obj/item/I in user.contents)
		if(istype(I, /obj/item/storage))
			for(var/obj/item/SI in I.contents)
				possible_tools += SI.type
				if(SI.tool_behaviour)
					present_qualities.Add(SI.tool_behaviour)

		possible_tools += I.type

		if(I.tool_behaviour)
			present_qualities.Add(I.tool_behaviour)

	possible_tools |= contents["other"]

	main_loop:
		for(var/A in R.tools)
			if(A in present_qualities)
				continue
			else
				for(var/I in possible_tools)
					if(ispath(I, A))
						continue main_loop
			return FALSE
	return TRUE

/atom/proc/OnCrafted(dirin, mob/user)
	if(user)
		SEND_SIGNAL(user, COMSIG_ITEM_CRAFTED, user, type)
		record_featured_stat(FEATURED_STATS_CRAFTERS, user)
	dir = dirin
	record_featured_object_stat(FEATURED_STATS_CRAFTED_ITEMS, name)
	return

/obj/item/OnCrafted(dirin)
	. = ..()

/turf/open/OnCrafted(dirin)
	. = ..()
	START_PROCESSING(SSweather,src)
	var/turf/belo = get_step_multiz(src, DOWN)
	for(var/x in 1 to 5)
		if(belo)
			START_PROCESSING(SSweather,belo)
			belo = get_step_multiz(belo, DOWN)
		else
			break

/datum/crafting_recipe/proc/TurfCheck(mob/user, turf/T)
	return TRUE

/atom/proc/SelectDiagDirection()
	var/list/options = list("NORTHWEST", "SOUTHWEST", "SOUTHEAST", "NORTHEAST")
	var/select = input(usr, "Please select a direction.", "", null) in options
	if(!select)
		return FALSE
	switch(select)
		if("NORTHWEST")
			return NORTHWEST
		if("SOUTHWEST")
			return SOUTHWEST
		if("SOUTHEAST")
			return SOUTHEAST
		if("NORTHEAST")
			return NORTHEAST
	return FALSE

/datum/component/personal_crafting/proc/construct_item_repeatable(mob/user, datum/crafting_recipe/R, amount = 1, auto)
	while(amount > 0 || auto)
		amount--
		var/result = construct_item(user, R)
		if(!result)
			break

/datum/component/personal_crafting/proc/construct_item(mob/user, datum/crafting_recipe/R)
	if (HAS_TRAIT(user, TRAIT_CURSE_MALUM))
		to_chat(user, span_warning("Your cursed hands tremble and fail to craft... Malum forbids it."))
		return
	if(user.doing)
		return
	var/list/contents = get_surroundings(user)
//	var/send_feedback = 1
	var/turf/T = get_step(user, user.dir)
	var/obj/N
	var/result_name
	if(islist(R.result))
		N = R.result[1]
	else
		N = R.result
	result_name = N.name
	if(isopenturf(T) && R.wallcraft)
		to_chat(user, span_warning("Need to craft this on a wall."))
		return
	if(!isopenturf(T) || R.ontile)
		T = get_turf(user.loc)
	if(!R.TurfCheck(user, T))
		to_chat(user, span_warning("I can't craft here."))
		return
	if(isturf(R.result))
		for(var/obj/structure/fluff/traveltile/TT in range(7, user))
			if(TT.craftblock)
				to_chat(user, span_warning("I can't craft here."))
				return
	if(ispath(R.result, /obj/structure) || ispath(R.result, /obj/machinery))
		for(var/obj/structure/fluff/traveltile/TT in range(7, user))
			if(TT.craftblock)
				to_chat(user, span_warning("I can't craft here."))
				return
		for(var/obj/structure/S in T)
			if(R.buildsame && istype(S, R.result))
				if(user.dir == S.dir)
					to_chat(user, span_warning("Something is in the way."))
					return
				continue
			if(R.structurecraft && istype(S, R.structurecraft))
				continue
			if(S.density && !R.ignoredensity)
				to_chat(user, span_warning("Something is in the way."))
				return
		for(var/obj/machinery/M in T)
			if(M.density)
				to_chat(user, span_warning("Something is in the way."))
				return
	if(R.req_table)
		if(!(locate(/obj/structure/table) in T))
			to_chat(user, span_warning("I need to make this on a table."))
			return
	if(R.structurecraft)
		if(!(locate(R.structurecraft) in T))
			var/str
			if(ispath(R.structurecraft, /obj/))
				var/obj/O = R.structurecraft
				str = initial(O.name)
			to_chat(user, span_warning("I'm missing a structure I need: \the <b>[str]</b>"))
			return
	if(check_contents(R, contents))
		if(check_tools(user, R, contents))
			if(R.craftsound)
				playsound(T, R.craftsound, 100, TRUE)
			var/time2use = 10
			for(var/i = 1 to 100)
				if(do_after(user, time2use, target = user))
					contents = get_surroundings(user)
					if(!check_contents(R, contents))
						return FALSE
					if(!check_tools(user, R, contents))
						return FALSE
					var/prob2craft = 25
					if(R.craftdiff)
						prob2craft -= (25*R.craftdiff)
					if(R.skillcraft)
						if(user.mind)
							prob2craft += (user.get_skill_level(R.skillcraft) * 25)
					else
						prob2craft = 100
					if(isliving(user))
						var/mob/living/L = user
						if(L.STAINT > 10)
							prob2craft += ((10-L.STAINT)*-1)*2
					prob2craft = CLAMP(prob2craft, 0, 99)
					if(!prob(prob2craft))
						if(user.client?.prefs.showrolls)
							to_chat(user, span_danger("I've failed to craft \the [result_name]... [prob2craft]%"))
							continue
						to_chat(user, span_danger("I've failed to craft \the [result_name]."))
						continue
					var/list/quality_capture = R.skip_quality ? list() : null
					var/list/parts = del_reqs(R, user, quality_capture)
					if(isnull(parts))
						to_chat(user, span_warning("The required ingredients are no longer available."))
						return FALSE
					var/inherited_quality = quality_capture?["min_quality"]
					if(islist(R.result))
						var/list/L = R.result
						for(var/IT in L)
							var/atom/movable/I = new IT(T)
							// Apply pottery quality if this is a pottery item
							if(R.skillcraft == /datum/skill/craft/ceramics && ismob(user))
								apply_pottery_quality_to_item(I, user.get_skill_level(R.skillcraft))
							I.CheckParts(parts, R)
							I.OnCrafted(user.dir, user)
							if(isitem(I))
								var/obj/item/CI = I
								CI.was_crafted = TRUE
								if(CI.has_item_quality)
									if(R.skip_quality)
										if(!isnull(inherited_quality))
											CI.apply_quality(null, null, inherited_quality)
									else
										CI.apply_quality(user, R.skillcraft)
							I.add_fingerprint(user)
					else
						if(ispath(R.result, /turf))
							var/turf/X = T.PlaceOnTop(R.result)
							if(X)
								X.OnCrafted(user.dir, user)
								X.add_fingerprint(user)
								if(R.loud)
									X.loud_message("Construction sounds can be heard")
						else
							var/atom/movable/I = new R.result (T)
							// Apply pottery quality if this is a pottery item
							if(R.skillcraft == /datum/skill/craft/ceramics && ismob(user))
								apply_pottery_quality_to_item(I, user.get_skill_level(R.skillcraft))
							I.CheckParts(parts, R)
							if(R.diagonal)
								I.OnCrafted(I.SelectDiagDirection(), user)
							else
								I.OnCrafted(user.dir, user)
							if(isitem(I))
								var/obj/item/CI = I
								CI.was_crafted = TRUE
								if(CI.has_item_quality)
									if(R.skip_quality)
										if(!isnull(inherited_quality))
											CI.apply_quality(null, null, inherited_quality)
									else
										CI.apply_quality(user, R.skillcraft)
							I.add_fingerprint(user)
					user.visible_message(span_notice("[user] [R.verbage] \a [result_name]!"), \
										span_notice("I [R.verbage_simple] \a [result_name]!"))
					user.log_message("crafted [result_name] ([R.type])", LOG_GAME)
					if(user.mind && R.skillcraft)
						if(isliving(user))
							var/mob/living/L = user
							var/amt2raise
							if(R.craft_xp_override >= 0)
								amt2raise = R.craft_xp_override
							else
								amt2raise = L.STAINT * 2
								if(R.craftdiff > 0) //difficult recipe
									amt2raise += (R.craftdiff * 10) // also gets more
							if(amt2raise > 0)
								user.mind.add_sleep_experience(R.skillcraft, amt2raise, FALSE)
					return TRUE
				return FALSE
			return FALSE
		var/str
		var/toollen = R.tools.len
		if(toollen)
			if(toollen > 1)
				for(var/i = 1, i<=toollen, i++)
					if(ispath(R.tools[i], /obj/))
						var/obj/O = R.tools[i]
						str += "[initial(O.name)][(i != toollen) ? ", " : ""]"
			else
				for(var/obj/O as anything in R.tools)
					str += "[initial(O.name)]"
		to_chat(usr, span_warning("I'm missing a tool. I need: <b>[str]</b>"))
		return FALSE
	return FALSE


/// Commit a complete ingredient allocation, returning retained recipe parts or null on failure.
/datum/component/personal_crafting/proc/del_reqs(datum/crafting_recipe/R, mob/user, list/quality_out = null)
	var/list/selected = select_requirements(R, get_surroundings(user))
	if(isnull(selected))
		return null
	var/list/consumed = list()
	var/min_quality
	// Remove chemicals before any containers that are also ingredients.
	for(var/datum/reagent/reagent in selected)
		var/datum/reagent/portion = new reagent.type()
		portion.volume = selected[reagent]
		portion.data = islist(reagent.data) ? reagent.data.Copy() : reagent.data
		consumed += portion
		reagent.holder.remove_reagent(reagent.type, selected[reagent], TRUE)
	for(var/obj/item/ingredient in selected)
		if(ingredient.has_item_quality && (isnull(min_quality) || ingredient.item_quality < min_quality))
			min_quality = ingredient.item_quality
		var/material_type = crafting_material_type(ingredient)
		var/amount = selected[ingredient]
		if(istype(ingredient, /obj/item/natural/bundle) || istype(ingredient, /obj/item/construction/bundle))
			// Only materialize consumed bundle units if the result retains them as parts.
			for(var/part_type in R.parts)
				if(ispath(material_type, part_type))
					for(var/i in 1 to amount)
						var/obj/item/part = new material_type(null)
						part.inherit_trade_provenance(ingredient)
						consumed += part
					break
			if(istype(ingredient, /obj/item/natural/bundle))
				var/obj/item/natural/bundle/bundle = ingredient
				bundle.amount -= amount
				if(bundle.amount == 1)
					var/atom/destination = bundle.loc
					var/obj/item/remainder = bundle.create_single_material(destination)
					qdel(bundle)
					if(ismob(destination))
						var/mob/holder = destination
						holder.put_in_hands(remainder)
				else if(bundle.amount <= 0)
					qdel(bundle)
				else
					bundle.update_bundle()
			else
				var/obj/item/construction/bundle/bundle = ingredient
				bundle.amount -= amount
				if(bundle.amount == 1)
					var/atom/destination = bundle.loc
					var/obj/item/remainder = new bundle.stacktype(destination)
					remainder.inherit_trade_provenance(bundle)
					qdel(bundle)
					if(ismob(destination))
						var/mob/holder = destination
						holder.put_in_hands(remainder)
				else if(bundle.amount <= 0)
					qdel(bundle)
				else
					bundle.update_bundle()
		else
			consumed += ingredient
	. = list()
	for(var/part_type in R.parts)
		var/needed = R.parts[part_type]
		for(var/datum/part as anything in consumed.Copy())
			if(!istype(part, part_type))
				continue
			if(istype(part, /datum/reagent))
				var/datum/reagent/reagent = part
				reagent.volume = min(reagent.volume, needed)
				needed -= reagent.volume
			else
				needed--
			. += part
			consumed -= part
			if(needed <= 0)
				break
	if(quality_out)
		quality_out["min_quality"] = min_quality
	for(var/datum/unused as anything in consumed)
		qdel(unused)

/datum/component/personal_crafting/proc/component_ui_interact(atom/movable/screen/craft/image, location, control, params, user)
	if(user == parent)
		ui_interact(user)

/datum/component/personal_crafting/ui_data(mob/user)
	var/list/data = list()
	data["busy"] = busy

	if(world.time >= craftability_next_update)
		craftability_next_update = world.time + 10
		var/list/surroundings = get_surroundings(user)
		cached_craftability = list()
		for(var/rec in GLOB.crafting_recipes)
			var/datum/crafting_recipe/R = rec

			if(R.hides_from_crafting_menu)
				continue
			if(!R.always_availible && !(R.type in user?.mind?.learned_recipes)) //User doesn't actually know how to make this.
				continue
			if(R.required_tech_node && !R.tech_unlocked)
				continue

			var/can_craft_recipe = check_contents(R, surroundings)
			// Multiple recipe paths can intentionally share a display name (e.g. log/plank alternates).
			// Keep the entry craftable if any variant with that name is craftable.
			cached_craftability[R.name] = cached_craftability[R.name] || can_craft_recipe

	data["craftability"] = cached_craftability
	data["showonlycraftable"] = showonlycraftable
	return data

/datum/component/personal_crafting/ui_static_data(mob/user)
	var/list/data = list()

	var/list/crafting_recipes = list()
	for(var/datum/crafting_recipe/R as anything in GLOB.crafting_recipes)
		if(!R.name)
			continue
		if(R.hides_from_crafting_menu)
			continue
		if(!R.always_availible && !(R.type in user?.mind?.learned_recipes)) //User doesn't actually know how to make this.
			continue
		if(R.required_tech_node && !R.tech_unlocked)
			continue
		if(isnull(crafting_recipes[R.cached_category]))
			crafting_recipes[R.cached_category] = list()
		crafting_recipes[R.cached_category] += list(R.cached_display_data)

	data["crafting_recipes"] = crafting_recipes
	return data

/datum/component/personal_crafting/ui_interact(mob/user, datum/tgui/ui)
	var/area/A = get_area(user)
	if(!A.can_craft_here())
		to_chat(user, span_warning("You cannot craft here."))
		if(ui) ui.close()
		return

	ui = SStgui.try_update_ui(user, src, ui)
	if(!ui)
		ui = new(user, src, "MiaCraft", "Crafting Menu", 700, 800)
		ui.set_state(GLOB.not_incapacitated_turf_state)
		ui.open()

/datum/component/personal_crafting/ui_state(mob/user)
	var/area/A = get_area(user)
	if(!A.can_craft_here())
		return UI_CLOSE
	return ..()

/datum/component/personal_crafting/ui_act(action, params)
	. = ..()
	switch(action)
		if("craft")
			var/path = text2path(params["item"])
			var/amount = params["amount"] || 1
			var/auto = params["auto"]
			var/recipe = new path
			construct_item_repeatable(usr, recipe, amount, auto)
			usr.mind.lastrecipe = recipe
		if("checkboxonlycraftable")
			showonlycraftable = params["state"]


/datum/component/personal_crafting/proc/build_recipe_data(datum/crafting_recipe/R)
	var/list/data = list()
	data["name"] = R.name
	data["ref"] = "[REF(R)]"
	data["path"] = R.type
	data["sellprice"] = R.sellprice
	var/result_path
	if(islist(R.result))
		var/list/result_list = R.result
		if(result_list.len)
			result_path = result_list[1]
	else if(ispath(R.result, /atom/movable))
		result_path = R.result
	data["has_item_quality"] = result_path && ispath(result_path, /obj/item) ? initial(result_path:has_item_quality) : FALSE
	var/req_text = ""
	var/tool_text = ""
	var/catalyst_text = ""

	for(var/a in R.reqs)
		//We just need the name, so cheat-typecast to /atom for speed (even tho Reagents are /datum they DO have a "name" var)
		//Also these are typepaths so sadly we can't just do "[a]"
		var/atom/A = a
		req_text += " [R.reqs[A]] [initial(A.name)],"
	req_text = replacetext(req_text,",","",-1)
	data["req_text"] = req_text

	for(var/a in R.chem_catalysts)
		var/atom/A = a //cheat-typecast
		catalyst_text += " [R.chem_catalysts[A]] [initial(A.name)],"
	catalyst_text = replacetext(catalyst_text,",","",-1)
	data["catalyst_text"] = catalyst_text

	for(var/a in R.tools)
		if(ispath(a, /obj/item))
			var/obj/item/b = a
			tool_text += " [initial(b.name)],"
		else
			tool_text += " [a],"
	tool_text = replacetext(tool_text,",","",-1)
	data["tool_text"] = tool_text

	data["craftingdifficulty"] = skill_to_string(R.craftdiff)


	return data

//Mind helpers

/datum/mind/proc/teach_crafting_recipe(R)
	if(!learned_recipes)
		learned_recipes = list()
	learned_recipes |= R

/datum/mind/proc/forget_crafting_recipe(R)
	if(!learned_recipes)
		return
	learned_recipes -= R

// new crafting button interaction

/datum/component/personal_crafting/proc/roguecraft(location, control, params, mob/user)

	if(user.doing)
		return
	var/area/A = get_area(user)
	if(!A.can_craft_here())
		to_chat(user, span_warning("I can't craft here."))
		return

	var/list/data = list()
	var/list/catty = list()
	var/list/surroundings = get_surroundings(user)
	for(var/rec in GLOB.crafting_recipes)
		var/datum/crafting_recipe/R = rec
		if(R.hides_from_crafting_menu)
			continue
		if(!R.always_availible && !(R.type in user?.mind?.learned_recipes)) //User doesn't actually know how to make this.
			continue
		if(R.required_tech_node && !R.tech_unlocked)
			continue

		if(check_contents(R, surroundings))
			if(R.name)
				data += R
				if(R.skillcraft)
					catty |= initial(R.skillcraft:name)
				else
					catty |= "Other"
	if(!data.len)
		to_chat(user, span_warning("There is nothing I can craft."))
		return
	if(!catty.len)
		return
	var/t
	if(catty.len > 1)
		t=input(user, "CHOOSE SKILL") as null|anything in catty
	else
		t=pick(catty)
	if(t)
		var/list/realdata = list()
		for(var/datum/crafting_recipe/X in data)
			if(X.skillcraft)
				if(t == initial(X.skillcraft:name))
					realdata += X
			else
				if(t == "Other")
					realdata += X
		if(realdata.len)
			realdata = sortNames(realdata)
			var/r = input(user, "What should I craft?") as null|anything in realdata
			if(r)
				construct_item_repeatable(user, r)
				user.mind.lastrecipe = r




/client/verb/toggle_legacycraft()
	set name = "Toggle legacy craft"
	set category = "Options"
	set desc = "Toggles between legacy and miacraft"
	set hidden = 1
	usr.client.legacycraft = !legacycraft

/client
	var/legacycraft = FALSE

