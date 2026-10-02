GLOBAL_LIST_EMPTY(custom_fermentation_recipes)

/datum/looping_sound/boiling
	mid_sounds = list('sound/foley/bubb (1).ogg' = 1,'sound/foley/bubb (2).ogg' = 1,'sound/foley/bubb (3).ogg' = 1,'sound/foley/bubb (4).ogg' = 1,'sound/foley/bubb (5).ogg' = 1)
	mid_length = 2 SECONDS
	volume = 25

/obj/structure/fermentation_keg
	name = "fermentation keg"
	desc = "A simple keg that is meant for making booze."

	icon = 'icons/obj/brewing.dmi'
	icon_state = "barrel_tapless"

	density = TRUE
	anchored = FALSE

	/// The sound of fermentation
	var/datum/looping_sound/boiling/soundloop
	/// The volume of the barrel sounds
	var/sound_volume = 25
	var/open_icon_state = "barrel_tapless_open"
	var/tapped_icon_state = "barrel_tapped_ready"

	//After brewing we can sell or bottle, this is for the latter
	var/ready_to_bottle = FALSE
	var/brewing = FALSE

	///our currently needed crops
	var/list/recipe_crop_stocks
	///our currently selected recipe
	var/datum/brewing_recipe/selected_recipe
	///our made item which we clear once its no longer ready to bottle
	var/made_item

	var/age_start_time = 0

	var/tapped = FALSE
	var/beer_left = 0

	var/selecting_recipe = FALSE

	var/heated = FALSE
	///machines heat in kelvin
	var/heat = 300
	///our start_time
	var/start_time
	///our brew progress time
	var/heated_progress_time
	///when our heat can decay
	var/heat_decay = 0
	sellprice = 15 // Default price for the keg.

/obj/structure/fermentation_keg/Initialize(mapload)
	. = ..()
	create_reagents(900, OPENCONTAINER | NO_REACT | AMOUNT_VISIBLE | REFILLABLE) //on agv it should be 120u for water then rest can be other needed chemicals
	recipe_crop_stocks = list()

	soundloop = new(src, brewing)
	soundloop.volume = sound_volume

	if(heated)
		START_PROCESSING(SSobj, src)

/obj/structure/fermentation_keg/Destroy()
	QDEL_NULL(soundloop)
	return ..()

/obj/structure/fermentation_keg/update_overlays()
	. = ..()
	if(length(overlays))
		overlays.Cut()

	if(!reagents.total_volume)
		return
	if(icon_state != open_icon_state)
		return
	var/mutable_appearance/MA = mutable_appearance(icon, "filling")
	MA.color = mix_color_from_reagents(reagents)
	overlays += MA

/obj/structure/fermentation_keg/attack_right(mob/user)
	. = ..()
	if(!ready_to_bottle && selected_recipe && !brewing)
		user.visible_message("[user] starts emptying out [src].", "You start emptying out [src].")
		if(!do_after(user, 5 SECONDS, src))
			return
		clear_keg(TRUE)
		return

	if(!brewing && (!selected_recipe || ready_to_bottle))
		if(!shopping_run(user))
			return

/obj/structure/fermentation_keg/MiddleClick(mob/user)
	. = ..()
	if(!user.Adjacent(src))
		return

	if(!brewing && ready_to_bottle)
		if(try_tapping(user))
			return

/obj/structure/fermentation_keg/attack_hand(mob/user)
	if((user.used_intent == /datum/intent/grab) || user.cmode)
		return ..()
	if(!selected_recipe)
		to_chat(user, span_warning("No recipe has been set yet!"))
		return ..()

	if(try_n_brew(user))
		start_brew()
		to_chat(user, span_info("[src] begins brewing [selected_recipe.name]."))
	..()

/obj/structure/fermentation_keg/attackby(obj/item/I, mob/user)
	if(istype(I, /obj/item/reagent_containers) && tapped && (user.used_intent.type == /datum/intent/fill))
		if(try_filling(user, I))
			return

	if(heated)
		if(istype(I, /obj/item/rogueore/coal) || istype(I, /obj/item/grown/log/tree))
			refuel(I, user)
			return

	if(ready_to_bottle)
		if(selected_recipe.after_finish_attackby(user, I, src))
			create_items()
			return

	var/list/produce_list = list()
	var/list/storage_list = list()

	if(istype(I, /obj/item/bottle_kit))
		var/obj/item/bottle_kit/kit = I
		bottle(kit.glass_colour)

	if(I.type in selected_recipe?.needed_items)
		produce_list |= I

	if(I.type in selected_recipe?.needed_crops)
		produce_list |= I

	if(istype(I, /obj/item/storage))
		produce_list |= I.contents
		storage_list |= I.contents

	var/dumps = FALSE
	for(var/obj/item/reagent_containers/food/G in produce_list)
		if(G.type in selected_recipe?.needed_crops)
			if(recipe_crop_stocks[G.type] >= selected_recipe?.needed_crops[G.type])
				continue
			recipe_crop_stocks[G.type]++
			if(G in storage_list)
				dumps = TRUE
				SEND_SIGNAL(G.loc, COMSIG_TRY_STORAGE_TAKE, G, get_turf(src), TRUE)
			qdel(G)

	for(var/obj/item/item in produce_list)
		if(item.type in selected_recipe?.needed_items)
			if(recipe_crop_stocks[item.type] >= selected_recipe?.needed_items[item.type])
				continue
			var/amount = recipe_crop_stocks[item.type] || 0
			var/added_item = 1
			recipe_crop_stocks[item.type] = amount + added_item
			if(item in storage_list)
				dumps = TRUE
				SEND_SIGNAL(item.loc, COMSIG_TRY_STORAGE_TAKE, item, get_turf(src), TRUE)
			qdel(item)

	if(dumps)
		user.visible_message("[user] dumps some things into [src].", "You dump some things into [src].")

	. = ..()
	update_overlays()

/obj/structure/fermentation_keg/examine(mob/user)
	. =..()
	if(heated)
		. += "Internal Temperature of around [heat - 271.3]C."
	if(ready_to_bottle)
		. += span_boldnotice("[made_item]")
		if(age_start_time)
			. += "Aged for [(world.time - age_start_time) * 0.1] Seconds.\n"
		if(beer_left)
			. += "[((beer_left / FLOOR((selected_recipe.brewed_amount * selected_recipe.per_brew_amount) , 1))) * 100]% Full"
		if(!tapped)
			. += span_blue("Middle-Click on the Barrel to Tap it. It will lose its sale value.")

	else if(selected_recipe)
		var/message = "Currently making: [selected_recipe.name].\n"

		//time
		if(selected_recipe.brew_time)
			var/multiplier = 1
			if(heated && !selected_recipe.heat_required)
				multiplier = 0.5
			if((selected_recipe.brew_time * multiplier) >= 1 MINUTES)
				message += "Once set, will take [(selected_recipe.brew_time / 600) * multiplier] Minutes.\n"
			else
				message += "Once set, will take [(selected_recipe.brew_time / 10) & multiplier] Seconds.\n"

		//How many are brewed
		if(selected_recipe.brewed_amount)
			message += "Will produce [selected_recipe.brewed_amount] bottles when finished or [FLOOR((selected_recipe.brewed_amount * selected_recipe.per_brew_amount)/ 3 , 1)] oz.\n"

		if(selected_recipe.brewed_item && selected_recipe.brewed_item_count)
			var/name_to_use = selected_recipe.secondary_name
			if(!name_to_use)
				name_to_use = selected_recipe.name
			message += "Will produce [name_to_use] x [selected_recipe.brewed_item_count] when finished.\n"

		if(selected_recipe.helpful_hints)
			message += "[selected_recipe.helpful_hints].\n"

		. += span_blue("Right-Click on the Barrel to clear it. Left-Click to start brewing. Brewing will remove all existing reagents in the barrel!")
		/*
		if(istype(selected_recipe, /datum/brewing_recipe/custom_recipe))
			var/datum/brewing_recipe/custom_recipe/recipe = selected_recipe
			message += "Recipe Created By:[recipe.made_by]"
		. += message
		*/
		. += message
	else
		. += span_blue("Right-Click on the Barrel to select a recipe.")

/obj/structure/fermentation_keg/proc/shopping_run(mob/user)
	if(brewing)
		return
	if(ready_to_bottle && beer_left < selected_recipe.brewed_amount * selected_recipe.per_brew_amount)
		to_chat(user, span_warning("Part of this batch has already been drawn. Pour or bottle the remainder before starting another brew."))
		return FALSE
	if(selecting_recipe)
		return
	var/datum/brewing_recipe/previous_recipe = selected_recipe
	var/previous_ready = ready_to_bottle
	var/previous_volume = beer_left
	selecting_recipe = TRUE
	addtimer(VARSET_CALLBACK(src, selecting_recipe, FALSE), 5 SECONDS)

	var/list/options = list()
	for(var/path in subtypesof(/datum/brewing_recipe))
		var/datum/brewing_recipe/recipe = path
		var/prereq = initial(recipe.pre_reqs)
		if(!heated && initial(recipe.heat_required))
			continue
		if(initial(recipe.req_species) && !is_species(user, initial(recipe.req_species)))
			continue
		if((!ready_to_bottle && prereq == null) || (selected_recipe?.reagent_to_brew == prereq && ready_to_bottle))
			options[initial(recipe.name)] = recipe


	for(var/datum/brewing_recipe/recipe in GLOB.custom_fermentation_recipes)
		var/prereq = recipe.pre_reqs
		if((!ready_to_bottle && prereq == null) || (selected_recipe?.reagent_to_brew == prereq && ready_to_bottle))
			options[recipe.name] = recipe

	if(options.len == 0)
		return

	if(user.get_skill_level(/datum/skill/craft/cooking) < SKILL_LEVEL_APPRENTICE)
		to_chat(user, span_notice("I am not knowledgable enough to brew."))
		return FALSE

	options = sortList(options)
	var/choice = input(user,"What brew do you want to make?", name) as null|anything in options

	if(!choice)
		return
	if(QDELETED(src) || !user.Adjacent(src) || brewing || selected_recipe != previous_recipe || ready_to_bottle != previous_ready || beer_left != previous_volume)
		return FALSE

	var/choice_to_spawn = options[choice]

	/*
	if(istype(choice_to_spawn, /datum/brewing_recipe/custom_recipe))
		selected_recipe = choice_to_spawn
	else
		selected_recipe = new choice_to_spawn
	*/
	selected_recipe = new choice_to_spawn
	selecting_recipe = FALSE

	//Second stage brewing gives no refunds! - This is intented design to help make it so folks dont quit halfway through and still get a rebate
	ready_to_bottle = FALSE
	tapped = FALSE
	beer_left = 0
	age_start_time = 0
	made_item = null
	sellprice = initial(sellprice)
	if(open_icon_state)
		icon_state = open_icon_state
	update_overlays()
	return TRUE

//Remove only chemicals
/obj/structure/fermentation_keg/proc/clear_keg_reagents()
	if(reagents)
		//consume consume consume consume
		reagents.clear_reagents()

//Remove and reset
/obj/structure/fermentation_keg/proc/clear_keg(force = FALSE)
	if(brewing)
		return FALSE

	if(!force && ready_to_bottle)
		return FALSE

	if(reagents)
		reagents.clear_reagents()

	ready_to_bottle = FALSE
	made_item = null
	if(open_icon_state)
		icon_state = open_icon_state
	update_overlays()

	recipe_crop_stocks.Cut()
	age_start_time = 0
	start_time = 0
	heated_progress_time = 0

	sellprice = initial(sellprice)
	tapped = FALSE
	beer_left = 0

	if(force)
		selected_recipe = null

	return TRUE

/obj/structure/fermentation_keg/proc/start_brew()
	brewing = TRUE

	for(var/obj/item/reagent_containers/food/item as anything in selected_recipe.needed_crops)
		if(!(item in recipe_crop_stocks))
			return
		var/amount = recipe_crop_stocks[item] || 0
		recipe_crop_stocks[item] = amount - selected_recipe.needed_crops[item]

	for(var/obj/item/item as anything in selected_recipe.needed_items)
		if(!(item in recipe_crop_stocks))
			return
		var/amount = recipe_crop_stocks[item] || 0
		recipe_crop_stocks[item] = amount - selected_recipe.needed_items[item]

	clear_keg_reagents()

	soundloop.start()
	if(!heated)
		addtimer(CALLBACK(src, PROC_REF(end_brew)), selected_recipe.brew_time)
	if(heated && !selected_recipe.heat_required)
		addtimer(CALLBACK(src, PROC_REF(end_brew)), selected_recipe.brew_time * 0.5)
	icon_state = initial(icon_state)
	start_time = world.time
	update_overlays()

/obj/structure/fermentation_keg/proc/end_brew()
	if(!heated)
		icon_state = "barrel_tapless_ready"
	update_overlays()
	soundloop.stop()
	ready_to_bottle = TRUE
	brewing = FALSE
	sellprice = selected_recipe.sell_value + initial(sellprice)
	made_item = selected_recipe.name
	beer_left = selected_recipe.reagent_to_brew ? selected_recipe.brewed_amount * selected_recipe.per_brew_amount : 0
	start_time = 0
	heated_progress_time = 0
	if(selected_recipe.ages)
		age_start_time = world.time

/obj/structure/fermentation_keg/proc/try_n_brew(mob/user)
	var/ready = TRUE
	if(!selected_recipe)
		if(user)
			to_chat(user, span_notice("You need to set a booze to brew!"))
		return FALSE

	if(brewing || ready_to_bottle)
		if(user)
			to_chat(user, span_notice("This keg already has a batch brewing or ready to collect!"))
		ready = FALSE
		return ready

	//Crops
	for(var/obj/item/reagent_containers/food/needed_crop as anything in selected_recipe.needed_crops)
		if(recipe_crop_stocks[needed_crop] < selected_recipe.needed_crops[needed_crop])
			if(user)
				to_chat(user, span_notice("This keg needs more [initial(needed_crop.name)]!"))
				ready = FALSE

	for(var/obj/item/needed_item as anything in selected_recipe.needed_items)
		if(recipe_crop_stocks[needed_item] < selected_recipe.needed_items[needed_item])
			if(user)
				to_chat(user, span_notice("This keg needs more [initial(needed_item.name)]!"))
				ready = FALSE

	for(var/datum/reagent/required_chem as anything in selected_recipe.needed_reagents)
		if(selected_recipe.needed_reagents[required_chem] > reagents.get_reagent_amount(required_chem))
			if(user)
				to_chat(user, span_notice("This keg needs more [initial(required_chem.name)]!"))
				ready = FALSE

	return ready

/obj/structure/fermentation_keg/proc/refuel(obj/item/item, mob/user)
	user.visible_message("[user] starts refueling [src].", "You start refueling [src].")
	if(!do_after(user, 1.5 SECONDS, src))
		return
	var/burn_time = 4 MINUTES
	var/burn_temp = 300
	if(istype(item, /obj/item/rogueore/coal))
		burn_time *= 1.5
		burn_temp *= 1.5

	heat_decay = world.time + burn_time
	heat = min(1000, burn_temp + heat)
	qdel(item)

/obj/structure/fermentation_keg/proc/create_items()
	if(!ready_to_bottle || !selected_recipe)
		return
	var/datum/brewing_recipe/recipe = selected_recipe
	clear_keg(TRUE)
	if(recipe.brewed_item)
		for(var/i in 1 to recipe.brewed_item_count)
			new recipe.brewed_item(get_turf(src))

/obj/structure/fermentation_keg/proc/current_brew_reagent()
	if(!ready_to_bottle || !selected_recipe)
		return null
	var/brewed_reagent = selected_recipe.reagent_to_brew
	if(selected_recipe.ages)
		var/age = world.time - age_start_time
		for(var/path in selected_recipe.age_times)
			if(age > selected_recipe.age_times[path])
				brewed_reagent = path
	return brewed_reagent

/obj/structure/fermentation_keg/proc/bottle(glass_colour)
	if(!ready_to_bottle || !selected_recipe)
		return FALSE
	var/datum/brewing_recipe/recipe = selected_recipe
	var/brewed_reagent = current_brew_reagent()
	var/volume_left = beer_left
	// Snapshot the batch before clearing it, including its age and remaining volume.
	clear_keg(TRUE)
	if(brewed_reagent && volume_left > 0)
		if(!glass_colour)
			glass_colour = "brew_bottle"
		var/bottle_path = recipe.output_bottle_type || /obj/item/reagent_containers/glass/bottle/brewing_bottle
		while(volume_left > 0)
			var/obj/item/reagent_containers/glass/bottle/brewing_bottle/bottle_made = new bottle_path(get_turf(src))
			var/volume = min(volume_left, recipe.per_brew_amount, bottle_made.reagents.maximum_volume)
			if(volume <= 0)
				qdel(bottle_made)
				break
			bottle_made.icon_state = glass_colour
			bottle_made.name = "brewer's bottle of [recipe.bottle_name]"
			bottle_made.sellprice = round(recipe.sell_value * volume / (recipe.brewed_amount * recipe.per_brew_amount))
			bottle_made.desc = recipe.bottle_desc || "A bottle of locally-brewed [recipe.bottle_name]."
			if(volume < recipe.per_brew_amount)
				bottle_made.sealed = FALSE
				bottle_made.sellprice = 0
				bottle_made.desc += " This bottle is only partly filled."
			bottle_made.reagents.add_reagent(brewed_reagent, volume)
			volume_left -= volume
	if(recipe.brewed_item)
		for(var/i in 1 to recipe.brewed_item_count)
			new recipe.brewed_item(get_turf(src))
	return TRUE

/obj/structure/fermentation_keg/proc/try_tapping(mob/user)
	if(tapped || !ready_to_bottle || !selected_recipe?.reagent_to_brew)
		return FALSE
	var/datum/brewing_recipe/recipe = selected_recipe
	visible_message("[user] starts tapping [src].", "You start tapping [src].")
	if(!do_after(user, 4 SECONDS, src))
		return FALSE
	if(tapped || !ready_to_bottle || selected_recipe != recipe)
		return FALSE
	tapped = TRUE
	if(tapped_icon_state)
		icon_state = tapped_icon_state
	sellprice = 0
	return TRUE

/obj/structure/fermentation_keg/proc/try_filling(mob/user, obj/item/reagent_containers/container)
	if(!tapped || !ready_to_bottle || !container.is_refillable())
		return FALSE
	var/datum/brewing_recipe/recipe = selected_recipe
	visible_message("[user] starts pouring from [src].", "You start pouring from [src].")
	if(!do_after(user, 1 SECONDS, src))
		return FALSE
	if(QDELETED(container) || !user.is_holding(container) || !container.is_refillable() || !tapped || !ready_to_bottle || selected_recipe != recipe)
		return FALSE
	var/beer_taken = min(container.reagents.maximum_volume - container.reagents.total_volume, beer_left)
	if(beer_taken <= 0)
		return FALSE
	if(!container.reagents.add_reagent(current_brew_reagent(), beer_taken))
		return FALSE
	beer_left -= beer_taken
	if(beer_left <= 0)
		clear_keg(TRUE)
	return TRUE

/obj/structure/fermentation_keg/process()
	if(brewing && selected_recipe.heat_required)
		var/end_time = world.time + (selected_recipe.brew_time - heated_progress_time)
		if(world.time > end_time)
			end_brew()
		if((heat > selected_recipe.heat_required))
			heated_progress_time += world.time - start_time
		start_time = world.time

	if(heat_decay < world.time)
		heat = max(300, heat-5)


/obj/item/reagent_containers/glass/bottle/brewing_bottle
	name = "brewer's bottle"
	desc = "A bottle with a cork."
	icon =  'icons/obj/bottle.dmi'
	icon_state = "brew_bottle"

	var/glass_name
	var/glass_desc
	var/sealed = TRUE
	glass_on_impact = FALSE // Prevent duping glass

/obj/item/reagent_containers/glass/bottle/brewing_bottle/afterattack(atom/target, mob/user, proximity_flag, click_parameters)
	. = ..()
	if(target.type in (typesof(/obj/item/reagent_containers/glass) - typesof(/obj/item/reagent_containers/glass/bottle)))
		if(glass_name)
			target.name = glass_name
		if(glass_desc)
			target.desc = glass_desc
	if(reagents.total_volume <= 0)
		glass_desc = null
		glass_name = null

/obj/item/reagent_containers/glass/bottle/brewing_bottle/examine()
	. = ..()
	if(sealed)
		. += span_notice("The bottle is sealed. It can sell for something.")
	else
		. += span_notice("The bottle has been unsealed. It cannot be sold anymore.")

/obj/item/reagent_containers/glass/bottle/brewing_bottle/rmb_self(mob/user)
	. = ..()
	sealed = FALSE
	sellprice = 0

/obj/structure/fermentation_keg/MouseDrop_T(atom/over, mob/living/user)
	if(!istype(over, /obj/structure/fermentation_keg) || over == src)
		return
	if(!Adjacent(over) || !Adjacent(user) || brewing || ready_to_bottle)
		return
	var/obj/structure/fermentation_keg/keg = over
	var/datum/brewing_recipe/destination_recipe = selected_recipe
	var/datum/brewing_recipe/source_recipe = keg.selected_recipe
	var/source_tapped = keg.tapped
	if(keg.brewing || (!source_tapped && !destination_recipe))
		return
	user.visible_message("[user] starts to pour [keg] into [src].", "You start to pour [keg] into [src].")
	if(!do_after(user, 5 SECONDS, keg))
		return
	if(QDELETED(keg) || QDELETED(src) || !Adjacent(keg) || !Adjacent(user) || brewing || ready_to_bottle || keg.brewing)
		return
	if(selected_recipe != destination_recipe || keg.selected_recipe != source_recipe || keg.tapped != source_tapped)
		return
	if(source_tapped)
		var/brewed_reagent = keg.current_brew_reagent()
		if(!brewed_reagent)
			return
		var/transfer_amount = min(keg.beer_left, reagents.maximum_volume - reagents.total_volume)
		if(destination_recipe)
			if(!(brewed_reagent in destination_recipe.needed_reagents))
				return
			transfer_amount = min(transfer_amount, destination_recipe.needed_reagents[brewed_reagent] - reagents.get_reagent_amount(brewed_reagent))
		if(transfer_amount <= 0 || !reagents.add_reagent(brewed_reagent, transfer_amount))
			return
		keg.beer_left -= transfer_amount
		if(keg.beer_left <= 0)
			keg.clear_keg(TRUE)
	else
		for(var/reagent_type in destination_recipe.needed_reagents)
			var/needed = destination_recipe.needed_reagents[reagent_type] - reagents.get_reagent_amount(reagent_type)
			if(needed > 0)
				keg.reagents.trans_id_to(src, reagent_type, needed)
	update_overlays()
	keg.update_overlays()

//used in trading and selling brewed sorts
/obj/item/reagent_containers/glass/bottle/brewing_bottle/mead
/obj/item/reagent_containers/glass/bottle/brewing_bottle/spidermead
/obj/item/reagent_containers/glass/bottle/brewing_bottle/jack_wine
/obj/item/reagent_containers/glass/bottle/brewing_bottle/plum_wine
/obj/item/reagent_containers/glass/bottle/brewing_bottle/tangerine_wine
/obj/item/reagent_containers/glass/bottle/brewing_bottle/blackberry_wine
/obj/item/reagent_containers/glass/bottle/brewing_bottle/raspberry_wine
/obj/item/reagent_containers/glass/bottle/brewing_bottle/whipwine
/obj/item/reagent_containers/glass/bottle/brewing_bottle/luxintenebre
/obj/item/reagent_containers/glass/bottle/brewing_bottle/voddena
/obj/item/reagent_containers/glass/bottle/brewing_bottle/beer
/obj/item/reagent_containers/glass/bottle/brewing_bottle/beer_oat
/obj/item/reagent_containers/glass/bottle/brewing_bottle/cider
/obj/item/reagent_containers/glass/bottle/brewing_bottle/gin
/obj/item/reagent_containers/glass/bottle/brewing_bottle/ricespirit
/obj/item/reagent_containers/glass/bottle/brewing_bottle/limoncello
/obj/item/reagent_containers/glass/bottle/brewing_bottle/rum
/obj/item/reagent_containers/glass/bottle/brewing_bottle/aqua_vitae
/obj/item/reagent_containers/glass/bottle/brewing_bottle/brandy
/obj/item/reagent_containers/glass/bottle/brewing_bottle/brandy_plum
/obj/item/reagent_containers/glass/bottle/brewing_bottle/brandy_pear
/obj/item/reagent_containers/glass/bottle/brewing_bottle/valerian_tea
/obj/item/reagent_containers/glass/bottle/brewing_bottle/calendula_tea

/obj/structure/fermentation_keg/distiller
	name = "copper distiller"

	icon = 'icons/obj/distillery.dmi'
	icon_state = "distillery"
	tapped_icon_state = null
	open_icon_state = null

	anchored = TRUE
	heated = TRUE

	// accepts_water_input = TRUE

// /obj/structure/fermentation_keg/distiller/valid_water_connection(direction, obj/structure/water_pipe/pipe)
// 	if(direction == SOUTH)
// 		input = pipe
// 		return TRUE
// 	return FALSE

// /obj/structure/fermentation_keg/distiller/setup_water()
// 	var/turf/north_turf = get_step(src, NORTH)
// 	input = locate(/obj/structure/water_pipe) in north_turf

// /obj/structure/fermentation_keg/distiller/return_rotation_chat(atom/movable/screen/movable/mouseover/mouseover)
// 	mouseover.maptext_height = 96
// 	if(!input)
// 		return {"<span style='font-size:8pt;font-family:"Pterra";color:#808000;text-shadow:0 0 1px #fff, 0 0 2px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073;' class='center maptext '>
// 			NO INPUT"}

// 	return {"<span style='font-size:8pt;font-family:"Pterra";color:#808000;text-shadow:0 0 1px #fff, 0 0 2px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073;' class='center maptext '>
// 			Pressure: [input.water_pressure]
// 			Fluid: [input.carrying_reagent ? initial(input.carrying_reagent.name) : "Nothing"]</span>"}
