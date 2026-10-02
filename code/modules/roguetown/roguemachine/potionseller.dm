/obj/structure/roguemachine/potionseller
	name = "POTION SELLER"
	desc = "The stomach of this thing can been stuffed with fluids for you to buy."
	icon = 'icons/roguetown/misc/machines.dmi'
	icon_state = "streetvendor1"
	density = TRUE
	blade_dulling = DULLING_BASH
	integrity_failure = 0.1
	max_integrity = 0
	debris = list(/obj/item/grown/log/tree/small, /obj/item/roguegear, /obj/item/natural/glass)
	anchored = TRUE
	layer = BELOW_OBJ_LAYER
	var/list/held_items = list()
	locked = TRUE
	var/wgain = 0
	var/is_crafted = FALSE
	var/keycontrol = "merchant"
	var/obj/item/reagent_containers/glass/bottle/inserted
	var/bottle_price = 10
	var/bottle_sold_max = 10
	var/budget
	
/obj/structure/roguemachine/potionseller/crafted
	is_crafted = TRUE
	max_integrity = 100

/obj/structure/roguemachine/potionseller/Initialize(mapload)
	. = ..()
	if(!reagents)
		create_reagents(200*3)
		reagents.flags |= NO_REACT
		reagents.flags &= ~OPENCONTAINER
	if(is_crafted) // spawn a key
		var/obj/item/roguekey/key = new /obj/item/roguekey/physician(get_turf(src))
		key.lockid = "random_potion_peddler_id_[rand(1,9999999)]" // I know, not foolproof
		key.name = "potion seller key"
		keycontrol = key.lockid
	update_icon()

/obj/structure/roguemachine/potionseller/Destroy()
	if(inserted)
		inserted.forceMove(drop_location())
		inserted = null
	if(budget > 0)
		budget2change(budget)
		budget = 0
	set_light(0)
	return ..()

/obj/structure/roguemachine/potionseller/proc/insert(obj/item/P, mob/living/user)
	if(!istype(P, /obj/item/reagent_containers/glass/bottle))
		to_chat(user, span_warning("Not a container."))
		return
	var/obj/item/reagent_containers/glass/bottle/B = P
	if(!B.reagents.total_volume)
		to_chat(user, span_warning("Nothing to add."))
		return
	if(reagents.maximum_volume < B.reagents.total_volume + reagents.total_volume)
		to_chat(user, span_warning("Machine is filled to the lid."))
		return
	testing("startadd")
	for(var/datum/reagent/to_add in B.reagents.reagent_list)
		var/already_exists = FALSE
		if(length(reagents.reagent_list))
			for(var/datum/reagent/existing in reagents.reagent_list)
				if(existing.type == to_add.type)
					already_exists = TRUE
					break
		if(!already_exists)
			held_items[to_add.type] = list()
			held_items[to_add.type]["NAME"] = to_add.name
			held_items[to_add.type]["PRICE"] = 0
		B.reagents.trans_to(src, B.reagents.total_volume, transfered_by = user)
		playsound(loc, 'sound/misc/machinevomit.ogg', 100, TRUE, -1)
		return attack_hand(user)

/obj/structure/roguemachine/potionseller/attackby(obj/item/P, mob/user, params)
	if(istype(P, /obj/item/roguecoin/gilbranze))
		return
	if(istype(P, /obj/item/roguecoin/inqcoin))
		return
	if(istype(P, /obj/item/roguecoin))
		budget += P.get_real_price()
		qdel(P)
		update_icon()
		playsound(loc, 'sound/misc/machinevomit.ogg', 100, TRUE, -1)
		return attack_hand(user)
	if(istype(P, /obj/item/roguekey))
		var/obj/item/roguekey/K = P
		if(K.lockid == keycontrol)
			locked = !locked
			playsound(loc, 'sound/misc/beep.ogg', 100, FALSE, -1)
			update_icon()
			return attack_hand(user)
		else
			if(!locked)
				insert(P, user)
			else
				to_chat(user, span_warning("Wrong key."))
				return
	if(istype(P, /obj/item/storage/keyring))
		var/obj/item/storage/keyring/K = P
		for(var/obj/item/roguekey/KE in K.keys)
			if(KE.lockid == keycontrol)
				locked = !locked
				playsound(loc, 'sound/misc/beep.ogg', 100, FALSE, -1)
				update_icon()
				return attack_hand(user)
	if(!locked)
		insert(P, user)
	else if(inserted)
		to_chat(user, span_warning("Something is already inside!"))
	else if(istype(P, /obj/item/reagent_containers/glass/bottle))
		if(user.transferItemToLoc(P, src))
			inserted = P
			return attack_hand(user)
		to_chat(user, span_warning("[P] is stuck to your hand!"))
	..()

/obj/structure/roguemachine/potionseller/Topic(href, href_list)
	. = ..()
	if(href_list["buy"])
		var/datum/reagent/R = locate(href_list["buy"]) in held_items
		if(!R || !ishuman(usr) || !usr.canUseTopic(src, BE_CLOSE) || !locked)
			return
		if(!inserted)
			say("MY POTIONS NEEDS A BOTTLE TO FILL, TRAVELER")
			return
		var/price = held_items[R.type]["PRICE"]
		if(price > budget)
			say("MY POTIONS ARE TOO EXPENSIVE FOR YOU, TRAVELER")
			return
		var/quantity = 0
		var/volume = reagents.get_reagent_amount(R)
		var/buyer_volume = inserted.reagents.maximum_volume - inserted.reagents.total_volume
		if(buyer_volume < 1)
			say("[uppertext("\the [inserted]")] IS TOO SMALL FOR MY POTIONS, TRAVELER")
			return
		if(price > 0)
			var/budget_vol = round(budget / price)
			if(budget_vol > volume)
				budget_vol = volume
			quantity = input(usr, "How many dram to buy (can afford [budget_vol] [UNIT_FORM_STRING(budget_vol)])?", "\The [held_items[R.type]["NAME"]]") as num|null
		else
			quantity = input(usr, "How many dram to pour?", "\The [held_items[R.type]["NAME"]]") as num|null
		if(!usr.Adjacent(src))
			return
		quantity = round(quantity)
		if(quantity <= 0)
			to_chat(usr, span_warning("The machine cannot pour such an small amount"))
			return
		if(quantity > buyer_volume)
			quantity = buyer_volume
		if(quantity > volume)
			quantity = volume
		if(price > 0)
			price *= quantity
			if(budget >= price)
				budget -= price
				wgain += price
				record_round_statistic(STATS_PEDDLER_REVENUE, price)
			else
				say("MY POTIONS ARE TOO EXPENSIVE FOR YOU, TRAVELER")
				return
		inserted.reagents.add_reagent(R.type, quantity)
		reagents.remove_reagent(R.type, quantity, FALSE)
		if(volume - quantity < 1)
			reagents.del_reagent(R.type)
			held_items -= R.type
			update_icon()
		playsound(loc, 'sound/misc/potionseller.ogg', 100, TRUE, -1)
	if(href_list["retrieve"])
		var/datum/reagent/R = locate(href_list["retrieve"]) in held_items
		if(!R || !ishuman(usr) || !usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		var/obj/item/reagent_containers/glass/bottle/alchemical/sold_bottle = new /obj/item/reagent_containers/glass/bottle/alchemical(get_turf(src))
		var/quantity = 0
		var/volume = reagents.get_reagent_amount(R)
		var/buyer_volume = sold_bottle.reagents.maximum_volume - sold_bottle.reagents.total_volume
		var/vol_max = min(buyer_volume,volume)
		quantity = input(usr, "How many dram to pour into \the [sold_bottle] ([vol_max] [UNIT_FORM_STRING(vol_max)] free)?", "\The [held_items[R.type]["NAME"]]") as num|null
		quantity = round(text2num(quantity))
		if(quantity <= 0 || !usr.Adjacent(src))
			qdel(sold_bottle)
			return
		if(quantity > buyer_volume)
			quantity = buyer_volume
		if(quantity > volume)
			quantity = volume
		sold_bottle.reagents.add_reagent(R.type, quantity)
		reagents.remove_reagent(R.type, quantity, FALSE)
		if(volume - quantity < 1)
			reagents.del_reagent(R.type)
			held_items -= R.type
			update_icon()
		if(!usr.put_in_hands(sold_bottle))
			sold_bottle.forceMove(get_turf(src))
		playsound(loc, 'sound/misc/potionseller.ogg', 100, TRUE, -1)
	if(href_list["change"])
		if(!usr.canUseTopic(src, BE_CLOSE) || !locked)
			return
		if(ishuman(usr))
			if(budget > 0)
				budget2change(budget, usr)
				budget = 0
	if(href_list["withdrawgain"])
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		if(ishuman(usr))
			if(wgain > 0)
				budget2change(wgain, usr)
				wgain = 0
	if(href_list["setname"])
		var/datum/reagent/R = locate(href_list["setname"]) in held_items
		if(!R || !usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		if(ishuman(usr))
			var/prename
			if(held_items[R.type]["NAME"])
				prename = held_items[R.type]["NAME"]
			var/newname = input(usr, "SET A NEW NAME FOR THIS POTION", src, prename)
			if(newname)
				held_items[R.type]["NAME"] = newname
	if(href_list["setprice"])
		var/datum/reagent/R = locate(href_list["setprice"]) in held_items
		if(!R || !usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		if(ishuman(usr))
			var/preprice
			if(held_items[R]["PRICE"])
				preprice = held_items[R]["PRICE"]
			var/newprice = input(usr, "SET A NEW PRICE FOR THIS POTION PER DRAM (0 IS FREE)", src, preprice) as null|num
			if(newprice)
				if(newprice < 0.1)
					return attack_hand(usr)
				held_items[R]["PRICE"] = round(newprice, 0.1)
			else if(text2num(newprice) == 0)
				held_items[R]["PRICE"] = 0 // free!
	if(href_list["setbottleprice"])
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		if(ishuman(usr))
			var/newprice = input(usr, "SET A NEW PRICE FOR BOTTLES (0 IS FREE)", src, bottle_price) as null|num
			bottle_price = round(newprice)
			if(bottle_price < 0)
				bottle_price = 0
	if(href_list["buybottle"])
		if(!usr.canUseTopic(src, BE_CLOSE) || !locked)
			return
		if(ishuman(usr))
			if(bottle_sold_max < 1)
				say("MY BOTTLES ARE ALL SOLD OUT, TRAVELER")
				return
			if(bottle_price > 0)
				if(budget < bottle_price)
					say("MY BOTTLES ARE TOO EXPENSIVE FOR YOU, TRAVELER")
					return
				budget -= bottle_price
				wgain += bottle_price
				record_round_statistic(STATS_PEDDLER_REVENUE, bottle_price)
			bottle_sold_max--
			var/obj/item/reagent_containers/glass/bottle/rogue/sold_bottle = new /obj/item/reagent_containers/glass/bottle/rogue(get_turf(src))
			if(!usr.put_in_hands(sold_bottle))
				sold_bottle.forceMove(get_turf(src))
	if(href_list["eject"])
		if(!inserted)
			return
		inserted.forceMove(drop_location())
		inserted = null
	return attack_hand(usr)

/obj/structure/roguemachine/potionseller/attack_hand(mob/living/user)
	. = ..()
	if(.)
		return
	user.changeNext_move(CLICK_CD_INTENTCAP)
	playsound(loc, 'sound/misc/beep.ogg', 100, FALSE, -1)
	var/canread = user.can_read(src, TRUE)
	var/list/labels = list(
		"title" = "Potion Seller",
		"edition" = "First iteration",
		"mode" = locked ? "Customer" : "Operator / Unlocked",
		"help" = locked ? "Insert coins and a bottle, then choose a potion to pour." : "Insert bottled potions to stock the machine. Select a name or price to edit it.",
		"item" = "Potions",
		"quantity" = "Stock",
		"price" = "Mammon",
		"action" = "Action",
		"buy" = "Buy",
		"take" = "Take",
		"free" = "Free",
		"unit" = "per dram",
		"empty" = "No potions are available.",
		"balance" = locked ? "Stored Mammon" : "Stored Profits",
		"withdraw" = locked ? "Return change" : "Withdraw profits",
		"bottleprice" = "Bottle price",
		"nobottle" = "No container inserted",
		"buybottle" = bottle_price ? "Buy bottle for [bottle_price] mammons" : "Take a free bottle",
		"container" = "Container",
		"eject" = "Eject bottle",
		"drams" = "drams"
	)
	if(!canread)
		for(var/label in labels)
			labels[label] = stars(labels[label])
	var/list/contents = list("<div class='merchant-folio'><div class='merchant-heading'><div class='merchant-edition'>[labels["edition"]]</div><h1>[labels["title"]]</h1><div class='merchant-mode'>[labels["mode"]]</div><p>[labels["help"]]</p></div><div class='merchant-container'>")
	if(!locked)
		contents += "<span>[labels["bottleprice"]]</span><a href='?src=[REF(src)];setbottleprice=1'>[bottle_price ? bottle_price : labels["free"]]</a>"
	else if(!inserted)
		contents += "<span>[labels["nobottle"]]</span><a href='?src=[REF(src)];buybottle=1'>[labels["buybottle"]]</a>"
	else
		var/container_name = html_encode(canread ? "[inserted]" : stars("[inserted]"))
		contents += "<div class='merchant-container-details'><span>[labels["container"]]: [container_name]</span><strong>[round(inserted.reagents.total_volume)] / [round(inserted.reagents.maximum_volume)] [labels["drams"]]</strong></div><a href='?src=[REF(src)];eject=1'>[labels["eject"]]</a>"
	contents += "</div><div class='merchant-stock'><table class='merchant-table'><thead><tr><th scope='col'>[labels["item"]]</th><th scope='col' class='merchant-quantity'>[labels["quantity"]]</th><th scope='col' class='merchant-price'>[labels["price"]]</th><th scope='col' class='merchant-action'>[labels["action"]]</th></tr></thead><tbody>"
	var/potion_icon
	var/visible_stock = 0
	for(var/I in held_items)
		var/price = held_items[I]["PRICE"]
		var/namer = held_items[I]["NAME"]
		var/volume = reagents.get_reagent_amount(I)
		if(volume < 1) // do not sell reagents less than 1 dram
			continue
		if(!namer)
			held_items[I]["NAME"] = "thing"
			namer = "thing"
		if(!potion_icon)
			potion_icon = icon2html(icon('icons/roguetown/items/cooking.dmi', "clear_bottle1"), user)
		visible_stock++
		var/display_name = html_encode(canread ? namer : stars(namer))
		var/display_quantity = canread ? "[volume]<small>[UNIT_FORM_STRING(volume)]</small>" : "&mdash;"
		var/display_price = price ? "[price]" : labels["free"]
		if(locked && !canread && price)
			display_price = stars("[price]")
		contents += "<tr><td class='merchant-product'><span class='merchant-icon'>[potion_icon]</span><div class='merchant-name'>"
		if(locked)
			contents += "[display_name]</div></td><td class='merchant-quantity'>[display_quantity]</td><td class='merchant-price'>[display_price]<small>[labels["unit"]]</small></td><td class='merchant-action'><a href='?src=[REF(src)];buy=[REF(I)]'>[price ? labels["buy"] : labels["take"]]</a></td></tr>"
		else
			contents += "<a class='merchant-edit' href='?src=[REF(src)];setname=[REF(I)]'>[display_name]</a></div></td><td class='merchant-quantity'>[display_quantity]</td><td class='merchant-price'><a class='merchant-edit' href='?src=[REF(src)];setprice=[REF(I)]'>[display_price]<small>[labels["unit"]]</small></a></td><td class='merchant-action'><a href='?src=[REF(src)];retrieve=[REF(I)]'>[labels["take"]]</a></td></tr>"
	if(!visible_stock)
		contents += "<tr><td colspan='4' class='merchant-empty'>[labels["empty"]]</td></tr>"
	contents += "</tbody></table></div><div class='merchant-footer'><div class='merchant-balance'><span>[labels["balance"]]</span><strong>[locked ? (budget ? budget : 0) : wgain]</strong></div><a href='?src=[REF(src)];[locked ? "change" : "withdrawgain"]=1'>[labels["withdraw"]]</a></div></div>"

	var/datum/browser/popup = new(user, "VENDORTHING", "", 640, 600)
	popup.add_stylesheet("merchant", 'html/browser/merchant.css')
	var/datum/asset/simple/roguefonts/merchant_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = merchant_fonts.get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Merchant Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Merchant Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Merchant Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>")
	popup.set_content(contents.Join())
	popup.open()

/obj/structure/roguemachine/potionseller/obj_break(damage_flag)
	..()
	held_items = list()
	reagents.clear_reagents()
	if(inserted)
		inserted.forceMove(drop_location())
		inserted = null
	if(budget > 0)
		budget2change(budget)
		budget = 0
	set_light(0)
	update_icon()
	icon_state = "streetvendor0"

/obj/structure/roguemachine/potionseller/update_icon()
	cut_overlays()
	if(obj_broken)
		set_light(0)
		return
	if(!locked)
		icon_state = "streetvendor0"
		return
	else
		icon_state = "streetvendor1"
	if(held_items.len)
		set_light(1, 1, 1, l_color = "#1b7bf1")
		add_overlay(mutable_appearance(icon, "vendor-gen"))
