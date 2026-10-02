/obj/structure/roguemachine/vendor
	name = "PEDDLER"
	desc = "The stomach of this thing can been stuffed with fun things for you to buy."
	icon = 'icons/roguetown/misc/machines.dmi'
	icon_state = "streetvendor1"
	density = TRUE
	blade_dulling = DULLING_BASH
	integrity_failure = 0.1
	max_integrity = 0
	anchored = TRUE
	layer = BELOW_OBJ_LAYER
	var/list/held_items = list()
	locked = TRUE
	var/wgain = 0
	var/keycontrol = "merchant"
	var/next_hawk = 0
	var/will_hawk = TRUE
	var/max_items = 30
	var/budget
	
/obj/structure/roguemachine/vendor/proc/get_group_items(param)
	// Accepts either:
	// - an object/ref (e.g. REF(rep) from attack_hand links), or
	// - a key string in the form "type_name"
	// Returns a list of held_items keys (actual obj/item refs) that match the group.

	var/obj/item/rep
	// try to resolve param to a held item first (safe for REF strings)
	if(param)
		rep = locate(param) in held_items
	// if param was already an object
	if(!rep && istype(param, /obj/item))
		rep = param

	var/key
	if(rep)
		var/namer = held_items[rep]["NAME"] || rep.name
		key = "[rep.type]_[namer]"
	else
		key = param

	var/list/matches = list()
	for(var/obj/item/O in held_items)
		var/oname = held_items[O]["NAME"] || O.name
		if("[O.type]_[oname]" == key)
			matches += O

	return matches

/obj/structure/roguemachine/vendor/proc/insert(obj/item/P, mob/living/user)
	if(P.w_class <= WEIGHT_CLASS_BULKY)
		if(held_items.len < max_items)
			var/price_to_set = 0

			for(var/obj/item/I in held_items)
				if(I.name == P.name)
					price_to_set = held_items[I]["PRICE"]
					break

			held_items[P] = list()
			held_items[P]["NAME"] = P.name
			held_items[P]["PRICE"] = price_to_set

			P.forceMove(src)
			playsound(loc, 'sound/misc/machinevomit.ogg', 100, TRUE, -1)
			return attack_hand(user)
		else
			to_chat(user, span_warning("Full."))
			return

/obj/structure/roguemachine/vendor/attackby(obj/item/P, mob/user, params)
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
		for(var/obj/item/roguekey/KE in K)
			if(KE.lockid == keycontrol)
				locked = !locked
				playsound(loc, 'sound/misc/beep.ogg', 100, FALSE, -1)
				update_icon()
				return attack_hand(user)
	if(!locked)
		insert(P, user)
	..()

/obj/structure/roguemachine/vendor/Topic(href, href_list)
	. = ..()
	// defensive checks
	if(!usr || !ishuman(usr))
		return

	// BUY
	if(href_list["buy"])
		// ensure caller has permission; buying usually requires machine locked
		if(!usr.canUseTopic(src, BE_CLOSE) || !locked)
			return

		var/keyorref = href_list["buy"]
		var/list/matches = get_group_items(keyorref)
		if(!length(matches))
			return

		// pick one item from the group to vend
		var/obj/item/O = matches[1]
		var/price = held_items[O]["PRICE"] || 0

		// if price > 0, charge buyer; price == 0 is free
		if(price > 0 && ishuman(usr))
			if(budget >= price)
				budget -= price
				wgain += price
			else
				say("NO MONEY NO HONEY!")
				return

		record_round_statistic(STATS_PEDDLER_REVENUE, held_items[O]["PRICE"])
		// remove one instance and deliver it
		held_items -= O
		if(!usr.put_in_hands(O))
			O.forceMove(get_turf(src))
		update_icon()

	// RETRIEVE (take out of vendor by owner/operator; usually only when unlocked)
	if(href_list["retrieve"])
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return

		var/keyorref = href_list["retrieve"]
		var/list/matches = get_group_items(keyorref)
		if(!length(matches))
			return

		var/obj/item/O = matches[1]
		held_items -= O
		if(!usr.put_in_hands(O))
			O.forceMove(get_turf(src))
		update_icon()

	// CHANGE (convert budget to change for player) - keep original permission logic
	if(href_list["change"])
		if(!usr.canUseTopic(src, BE_CLOSE) || !locked)
			return
		if(ishuman(usr) && budget > 0)
			budget2change(budget, usr)
			budget = 0

	// WITHDRAW GAIN (owner withdraws stored profit when unlocked)
	if(href_list["withdrawgain"])
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		if(ishuman(usr) && wgain > 0)
			budget2change(wgain, usr)
			wgain = 0

	// SET NAME (apply name to the whole group)
	if(href_list["setname"])
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return

		var/keyorref = href_list["setname"]
		var/list/matches = get_group_items(keyorref)
		if(!length(matches))
			return

		var/prename = held_items[matches[1]]["NAME"]
		var/newname = sanitize(input(usr, "SET A NEW NAME FOR THIS PRODUCT", src, prename))
		// explicit null check: input returns null on cancel; empty string allowed? we block empty.
		if(newname != null && newname != "")
			for(var/obj/item/I in matches)
				held_items[I]["NAME"] = newname
			update_icon()

	// SET PRICE (apply price to the whole group)
	if(href_list["setprice"])
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return

		var/keyorref = href_list["setprice"]
		var/list/matches = get_group_items(keyorref)
		if(!length(matches))
			return

		var/preprice = held_items[matches[1]]["PRICE"] || 0
		var/newprice = input(usr, "SET A NEW PRICE FOR THIS PRODUCT", src, preprice) as null|num
		// explicit null check so 0 is accepted
		if(newprice != null)
			// validation: no negative prices, no decimals
			if(newprice < 0 || findtext(num2text(newprice), "."))
				return attack_hand(usr)
			for(var/obj/item/I in matches)
				held_items[I]["PRICE"] = newprice
			update_icon()

	// redraw UI with updated groups / counts
	return attack_hand(usr)

/obj/structure/roguemachine/vendor/attack_hand(mob/living/user)
	. = ..()
	if(.)
		return
	user.changeNext_move(CLICK_CD_INTENTCAP)
	playsound(loc, 'sound/misc/beep.ogg', 100, FALSE, -1)
	var/canread = user.can_read(src, TRUE)
	var/list/labels = list(
		"title" = "The Peddler",
		"edition" = "Third iteration",
		"mode" = locked ? "Customer" : "Operator / Unlocked",
		"help" = locked ? "Insert coins into the machine, then choose your wares." : "Insert wares to stock the shelves. Select a name or price to edit it.",
		"item" = "Wares",
		"quantity" = "Stock",
		"price" = "Mammon",
		"action" = "Action",
		"buy" = "Buy",
		"take" = "Take",
		"free" = "Free",
		"empty" = "The shelves are empty.",
		"balance" = locked ? "Stored Mammon" : "Stored Profits",
		"withdraw" = locked ? "Return change" : "Withdraw profits"
	)
	if(!canread)
		for(var/label in labels)
			labels[label] = stars(labels[label])
	var/list/contents = list("<div class='merchant-folio'><div class='merchant-heading'><div class='merchant-edition'>[labels["edition"]]</div><h1>[labels["title"]]</h1><div class='merchant-mode'>[labels["mode"]]</div><p>[labels["help"]]</p></div><div class='merchant-stock'>")

	var/list/groups = list()
	for(var/obj/item/I in held_items)
		var/namer = held_items[I]["NAME"] || "thing"
		var/key = "[I.type]_[namer]"
		if(!groups[key])
			groups[key] = list("REP" = I, "COUNT" = 0, "PRICE" = held_items[I]["PRICE"])
		groups[key]["COUNT"] += 1

	contents += "<table class='merchant-table'><thead><tr><th scope='col'>[labels["item"]]</th><th scope='col' class='merchant-quantity'>[labels["quantity"]]</th><th scope='col' class='merchant-price'>[labels["price"]]</th><th scope='col' class='merchant-action'>[labels["action"]]</th></tr></thead><tbody>"
	for(var/key in groups)
		var/obj/item/rep = groups[key]["REP"]
		var/namer = held_items[rep]["NAME"]
		var/price = groups[key]["PRICE"]
		var/count = groups[key]["COUNT"]
		var/display_name = html_encode(canread ? namer : stars(namer))
		var/display_price = price ? "[price]" : labels["free"]
		contents += "<tr><td class='merchant-product'><span class='merchant-icon'>[icon2html(rep, user)]</span><div class='merchant-name'>"
		if(locked)
			contents += "[display_name]</div></td><td class='merchant-quantity'>[count]</td><td class='merchant-price'>[display_price]</td><td class='merchant-action'><a href='?src=[REF(src)];buy=[REF(rep)]'>[price ? labels["buy"] : labels["take"]]</a></td></tr>"
		else
			contents += "<a class='merchant-edit' href='?src=[REF(src)];setname=[REF(rep)]'>[display_name]</a></div></td><td class='merchant-quantity'>[count]</td><td class='merchant-price'><a class='merchant-edit' href='?src=[REF(src)];setprice=[REF(rep)]'>[display_price]</a></td><td class='merchant-action'><a href='?src=[REF(src)];retrieve=[REF(rep)]'>[labels["take"]]</a></td></tr>"
	if(!length(groups))
		contents += "<tr><td colspan='4' class='merchant-empty'>[labels["empty"]]</td></tr>"
	contents += "</tbody></table></div><div class='merchant-footer'><div class='merchant-balance'><span>[labels["balance"]]</span><strong>[locked ? (budget ? budget : 0) : wgain]</strong></div><a href='?src=[REF(src)];[locked ? "change" : "withdrawgain"]=1'>[labels["withdraw"]]</a></div></div>"

	var/datum/browser/popup = new(user, "VENDORTHING", "", 640, 600)
	popup.add_stylesheet("merchant", 'html/browser/merchant.css')
	var/datum/asset/simple/roguefonts/merchant_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = merchant_fonts.get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Merchant Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Merchant Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Merchant Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>")
	popup.set_content(contents.Join())
	popup.open()

/obj/structure/roguemachine/vendor/obj_break(damage_flag)
	..()
	for(var/obj/item/I in held_items)
		I.forceMove(src.loc)
		held_items -= I
	budget2change(budget)
	set_light(0)
	update_icon()
	icon_state = "streetvendor0"

/obj/structure/roguemachine/vendor/Initialize(mapload)
	. = ..()
	update_icon()
	START_PROCESSING(SSroguemachine, src)

/obj/structure/roguemachine/vendor/update_icon()
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

/obj/structure/roguemachine/vendor/Destroy()
	STOP_PROCESSING(SSroguemachine, src)
	for(var/obj/item/I in held_items)
		I.forceMove(src.loc)
		held_items -= I
	set_light(0)
	return ..()

/obj/structure/roguemachine/vendor/process()
	if(obj_broken)
		return
	if(!will_hawk)
		return
	if(world.time > next_hawk)
		next_hawk = world.time + rand(1 MINUTES, 2 MINUTES)
		if(length(held_items))
			var/obj/item/I = pick(held_items)
			var/namer = held_items[I]["NAME"]
			namer = capitalize(namer)

			if(!findtext(namer, "s", -1)) // doesn't already end with "s"
				for(var/obj/item/O in held_items)
					if(O == I)
						continue
					if(O.type == I.type && (held_items[O]["NAME"]) == held_items[I]["NAME"])
						namer += "s" //add a plural s!
						break

			say("[namer] for sale! [held_items[I]["PRICE"]] mammons!")

/obj/structure/roguemachine/vendor/centcom
	name = "LANDLORD"
	desc = "Give this thing money, and you will immediately buy a neat property in the capital."
	max_integrity = 0
	icon_state = "streetvendor1"
	keycontrol = "dhjlashfdg"
	var/list/cachey = list()

/obj/structure/roguemachine/vendor/centcom/attack_hand(mob/living/user)
	return

/obj/structure/roguemachine/vendor/centcom/attackby(obj/item/P, mob/user, params)
	if(istype(P, /obj/item/roguecoin))
		if(!cachey[user])
			cachey[user] = list()
		cachey[user]["moneydonate"] += P.get_real_price()
		qdel(P)
		update_icon()
		playsound(loc, 'sound/misc/machinevomit.ogg', 100, TRUE, -1)

		if(cachey[user]["moneydonate"] > 99)
			if(!cachey[user]["trisawarded"])
				cachey[user]["trisawarded"] = 1
				user.adjust_triumphs(1)
				say("[user] has purchased a prole dwelling.")
				playsound(src, 'sound/misc/machinetalk.ogg', 100, FALSE, -1)
		if(cachey[user]["moneydonate"] > 499)
			if(cachey[user]["trisawarded"] < 2)
				cachey[user]["trisawarded"] = 2
				user.adjust_triumphs(1)
				say("[user] has been upgraded to a space in a serf apartment.")
				playsound(src, pick('sound/misc/machinetalk.ogg'), 100, FALSE, -1)
		if(cachey[user]["moneydonate"] > 999)
			if(cachey[user]["trisawarded"] < 3)
				cachey[user]["trisawarded"] = 3
				user.adjust_triumphs(1)
				say("[user] HAS BEEN UPGRADED TO A NOBLE BEDCHAMBER!")
				playsound(src, 'sound/misc/machinelong.ogg', 100, FALSE, -1)

/obj/structure/roguemachine/vendor/inn
	keycontrol = "tavern"
	will_hawk = FALSE

/obj/structure/roguemachine/vendor/inn/Initialize(mapload)
	. = ..()

	// Add room keys with a price of 20
	for (var/X in list(/obj/item/roguekey/roomi, /obj/item/roguekey/roomii, /obj/item/roguekey/roomiii, /obj/item/roguekey/roomiv, /obj/item/roguekey/roomv, /obj/item/roguekey/roomvi, /obj/item/roguekey/roomvii, /obj/item/roguekey/roomviii))
		var/obj/P = new X(src)
		held_items[P] = list()
		held_items[P]["NAME"] = P.name
		held_items[P]["PRICE"] = 20

	// Add fancy keys with a price of 100
	for (var/Y in list(/obj/item/storage/keyring/innfancyi, /obj/item/roguekey/fancyroomii, /obj/item/storage/keyring/innfancyiii, /obj/item/storage/keyring/innfancyiv, /obj/item/storage/keyring/innfancyv))
		var/obj/Q = new Y(src)
		held_items[Q] = list()
		held_items[Q]["NAME"] = Q.name
		held_items[Q]["PRICE"] = 100

	update_icon()

/obj/structure/roguemachine/vendor/innrockhill
	keycontrol = "tavern"
	will_hawk = FALSE

/obj/structure/roguemachine/vendor/innrockhill/Initialize(mapload)
	. = ..()

	// Add room keys with a price of 20
	for (var/X in list(/obj/item/roguekey/roomi, /obj/item/roguekey/roomii, /obj/item/roguekey/roomiii, /obj/item/roguekey/roomiv, /obj/item/roguekey/roomv, /obj/item/roguekey/roomvi, /obj/item/roguekey/roomvii, /obj/item/roguekey/roomviii, /obj/item/roguekey/roomix, /obj/item/roguekey/roomx))
		var/obj/P = new X(src)
		held_items[P] = list()
		held_items[P]["NAME"] = P.name
		held_items[P]["PRICE"] = 20

	// Add fancy keys with a price of 100
	for (var/Y in list(/obj/item/storage/keyring/innfancyi, /obj/item/storage/keyring/innfancyii, /obj/item/storage/keyring/innfancyiii))
		var/obj/Q = new Y(src)
		held_items[Q] = list()
		held_items[Q]["NAME"] = Q.name
		held_items[Q]["PRICE"] = 100

	update_icon()


/obj/structure/roguemachine/vendor/bathhouse
	keycontrol = "nightmaiden"//used to be nightman but it's nice for them to be able to stock the shelves too when the master isn't around

/obj/structure/roguemachine/vendor/bathhouse/locker
	will_hawk = FALSE

/obj/structure/roguemachine/vendor/bathhouse/locker/Initialize(mapload)
	. = ..()

	// Add locker keys with a price of 10
	for (var/X in list(/obj/item/roguekey/bathlocker1, /obj/item/roguekey/bathlocker2, /obj/item/roguekey/bathlocker3, /obj/item/roguekey/bathlocker4, /obj/item/roguekey/bathlocker5, /obj/item/roguekey/bathlocker6))
		var/obj/P = new X(src)
		held_items[P] = list()
		held_items[P]["NAME"] = P.name
		held_items[P]["PRICE"] = 5

	update_icon()


/obj/structure/roguemachine/vendor/merchant
	keycontrol = "merchant"

/obj/structure/roguemachine/vendor/merchant/Initialize(mapload)
	. = ..()
	for(var/X in list(/obj/item/roguekey/apartments/stall1,/obj/item/roguekey/apartments/stall2,/obj/item/roguekey/apartments/stall3))
		var/obj/P = new X(src)
		held_items[P] = list()
		held_items[P]["NAME"] = P.name
		held_items[P]["PRICE"] = 10
	update_icon()

/obj/structure/roguemachine/vendor/stablemaster
	keycontrol = "stablemaster"

/obj/structure/roguemachine/vendor/stablemaster/Initialize(mapload)
	. = ..()
	for(var/X in list(/obj/item/roguekey/apartments/stablemaster_1,/obj/item/roguekey/apartments/stablemaster_2,/obj/item/roguekey/apartments/stablemaster_3,/obj/item/roguekey/apartments/stablemaster_4,/obj/item/roguekey/apartments/stablemaster_5))
		var/obj/P = new X(src)
		held_items[P] = list()
		held_items[P]["NAME"] = P.name
		held_items[P]["PRICE"] = 30
	update_icon()
