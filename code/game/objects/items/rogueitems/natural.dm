
/obj/item/natural
	icon = 'icons/roguetown/items/natural.dmi'
	lefthand_file = 'icons/mob/inhands/misc/food_lefthand.dmi'
	righthand_file = 'icons/mob/inhands/misc/food_righthand.dmi'
	desc = ""
	w_class = WEIGHT_CLASS_TINY
	var/bundletype = null
	var/bundling_time = 4 SECONDS		// Base bundling time - make lower for small objects. Higher for large.
	var/quality = SMELTERY_LEVEL_NORMAL // To not ruin blacksmith recipes
	grid_width = 32
	grid_height = 32
	var/sharpening_factor = 0
	var/spark_chance = 0

/obj/item/natural/attackby(obj/item/W, mob/living/user)
	if(istype(W, /obj/item/natural/bundle))
		if(item_flags & IN_STORAGE)
			to_chat(user, span_warning("It's hard to find [W] in my bag."))
			return
		var/obj/item/natural/bundle/B = W
		if(istype(src, B.stacktype))
			if(B.amount < B.maxamount)
				B.inherit_trade_provenance(src)
				B.amount++
				B.update_bundle()
				user.visible_message("[user] adds [src] to [W].")
				qdel(src)
			else
				to_chat(user, "There's not enough space in [W].")
			return
	else if(istype(W, /obj/item/natural/))
		var/obj/item/natural/B = W
		if(B.bundletype == src.bundletype && src.bundletype != null)
			var/obj/item/natural/bundle/N = new bundletype(src.loc)
			N.inherit_trade_provenance(src)
			N.inherit_trade_provenance(B)
			to_chat(user, "You tie the [N.stackname] into a bundle.")
			qdel(B)
			qdel(src)
			user.put_in_hands(N)
	else
		return ..()


/obj/item/natural/bundle
	name = "bundle"
	desc = "You shouldn't be seeing this."
	possible_item_intents = list(/datum/intent/use)
	force = 0
	throwforce = 0
	firefuel = 5 MINUTES
	resistance_flags = FLAMMABLE
	var/firemod = 5 MINUTES
	var/amount = 2
	var/maxamount = 10
	var/icon1 = "fibersroll1"
	var/icon1step = 3
	var/icon2 = "fibersroll2"
	var/icon2step = 6
	var/icon3 = null
	var/stacktype = /obj/item/natural/fibers/
	var/stackname = "fibers"
	var/base_width = 32
	var/base_height = 32

/obj/item/natural/bundle/burn()
	. = ..(amount)

// Mixed bundles retain every restriction on their contents, including after splitting.
/obj/item/proc/inherit_trade_provenance(obj/item/source)
	atc_sealed = atc_sealed || source.atc_sealed
	stockpile_withdrawn = stockpile_withdrawn || source.stockpile_withdrawn

/obj/item/natural/bundle/proc/create_single_material(atom/destination)
	var/obj/item/material = new stacktype(destination)
	material.inherit_trade_provenance(src)
	return material

/obj/item/proc/collect_material_bundles(mob/user, material_type, bundle_type, pickup_single = FALSE, pickup_bundles = TRUE)
	var/list/materials = list()
	for(var/obj/item/material in get_turf(src))
		if(material.type == material_type && !QDELETED(material))
			materials += material
	var/collected = length(materials)
	var/atom/destination = user.drop_location()
	while(length(materials) > 1)
		var/obj/item/natural/bundle/bundle = new bundle_type(destination)
		bundle.amount = min(length(materials), bundle.maxamount)
		for(var/i in 1 to bundle.amount)
			var/obj/item/material = materials[i]
			bundle.inherit_trade_provenance(material)
			qdel(material)
		materials.Cut(1, bundle.amount + 1)
		bundle.update_bundle()
		if(pickup_bundles)
			user.put_in_hands(bundle)
	if(length(materials))
		var/obj/item/material = materials[1]
		material.forceMove(destination)
		if(pickup_single)
			user.put_in_hands(material)
	return collected

/obj/item/natural/bundle/attackby(obj/item/W, mob/living/user)
	if(item_flags & IN_STORAGE)
		return
	if(istype(W, /obj/item/natural/bundle))
		var/obj/item/natural/bundle/B = W
		if(src.stacktype == B.stacktype)
			if(src == B || amount >= maxamount)
				return
			inherit_trade_provenance(B)
			if(src.amount + B.amount > maxamount)
				B.amount = (src.amount + B.amount) - maxamount
				src.amount = maxamount
				src.update_bundle()
				B.update_bundle()
				to_chat(user, "There's not enough space in [src].")
				if(B.amount == 1)
					var/obj/item/H = B.create_single_material(B.loc)
					user.put_in_hands(H)
					qdel(B)
			else
				to_chat(user, "I add the [W] to the [src].")
				src.amount += B.amount
				update_bundle()
				qdel(B)
	else if(istype(W, stacktype))
		if(item_flags & IN_STORAGE)
			return
		if(src.amount < src.maxamount)
			inherit_trade_provenance(W)
			to_chat(user, "I add the [W] to the [src].")
			src.amount++
			update_bundle()
			qdel(W)
		else
			to_chat(user, "There's not enough space in [src].")
	else
		return ..()

/obj/item/natural/bundle/use(used)
	if(used <= 0)
		return FALSE
	if(src.amount >= used)
		src.amount -= used
		src.update_bundle()
		switch(src.amount)
			if(1)
				create_single_material(loc)
				qdel(src)
			if(0)
				qdel(src)
		return TRUE
	else
		return FALSE

/obj/item/natural/bundle/attack_right(mob/user)
	if(item_flags & IN_STORAGE)
		return
	var/mob/living/carbon/human/H = user
	switch(amount)
		if(1)
			H.put_in_hands(create_single_material(loc))
			qdel(src)
			return
		if(2)
			var/obj/item/F = create_single_material(loc)
			var/obj/item/I = create_single_material(loc)
			H.put_in_hands(F)
			H.put_in_hands(I)
			qdel(src)
			return
		else
			amount -= 1
			var/obj/item/F = create_single_material(loc)
			H.put_in_hands(F)
			user.visible_message("[user] removes [F] from [src].", "I remove [F] from [src].")
	update_bundle()

/obj/item/natural/bundle/attack_turf(turf/T, mob/living/user)
	var/list/obj/item/stackables = list()
	for(var/obj/I in T.contents)
		if(I.type == stacktype)
			stackables += I
	if(stackables.len)
		if(amount >= maxamount)
			to_chat(user, span_info("[src] can't hold any more without falling apart."))
			return
		to_chat(user, span_info("I begin filling [src]..."))
		for(var/obj/item/I in stackables)
			if(amount >= maxamount)
				break
			if(I.type == stacktype)
				if(!do_after(user, 5, TRUE, src))
					break
				if(QDELETED(I) || !(I in T.contents) || amount >= maxamount)
					continue
				inherit_trade_provenance(I)
				qdel(I)
				src.amount++
				update_bundle()


/obj/item/natural/bundle/examine(mob/user)
	. = ..()
	if(amount == maxamount )
		to_chat(user, span_notice("There are [amount] [stackname] in this bundle. It can not take any more."))
	else
		to_chat(user, span_notice("There are [amount] [stackname] in this bundle."))

/obj/item/natural/bundle/proc/update_bundle()
	if(firefuel != 0)
		firefuel = firemod * amount
	if((amount <= icon1step) && (icon1 != null))
		icon_state = icon1
	else if((icon1step < amount <= icon2step) && (icon2 != null))
		icon_state = icon2
	else
		if(icon3 != null)
			icon_state = icon3
	grid_height = base_height
	grid_width = base_width
	if(FLOOR(maxamount / 2, 1) < amount)
		grid_width += base_width
	if(item_flags & IN_STORAGE)
		var/obj/item/location = loc
		var/datum/component/storage/storage = location.GetComponent(/datum/component/storage)

		storage.update_item(src)
		storage.orient2hud()
