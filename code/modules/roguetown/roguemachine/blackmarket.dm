/////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////

// DESIGN NOTE
// The copperface exists once in the forest ruins near the bandit exit.
// Prices are steeper to not necessarily give the merchant in town competition.
// The intended customers are wretches, bandits and other outlaws.
// This provides especially wretches reasons to harrass adventurers and get vital items they usually can't out of town like lockpicks, red or prosthetics

/obj/structure/roguemachine/blackmarket
	name = "COPPERFACE"
	desc = "Never gets tired, does not ask questions, only minor signs of tampering. Alas, fashioned with copper of low quality."
	icon = 'icons/roguetown/misc/machines.dmi'
	icon_state = "copperface"
	density = TRUE
	blade_dulling = DULLING_BASH
	max_integrity = 0
	anchored = TRUE
	layer = BELOW_OBJ_LAYER
	var/budget
	var/list/held_items = list()
	locked = FALSE
	var/upgrade_flags
	var/current_cat = "1"
	var/list/categories = list(
		"General Labour",
		"Beverages",
		"Health and Hygiene"
	)
	var/list/categories_gamer = list(
		"Self Defense",
		"Diplomacy and Persuasion",
		"Exotic Import"
	)

/obj/structure/roguemachine/blackmarket/Initialize(mapload)
	. = ..()
	update_icon()

/obj/structure/roguemachine/blackmarket/update_icon()
	cut_overlays()
	if(obj_broken)
		set_light(0)
		return
	set_light(1, 1, 1, l_color = "#1b7bf1")
	add_overlay(mutable_appearance(icon, "vendor-merch"))

/obj/structure/roguemachine/blackmarket/attackby(obj/item/P, mob/user, params)
	if(istype(P, /obj/item/roguecoin))
		budget += P.get_real_price()
		qdel(P)
		update_icon()
		playsound(loc, 'sound/misc/machinevomit.ogg', 100, TRUE, -1)
		return attack_hand(user)
	..()

/obj/structure/roguemachine/blackmarket/Topic(href, href_list)
	. = ..()
	if(!ishuman(usr))
		return
	if(!usr.canUseTopic(src, BE_CLOSE))
		return
	if(href_list["buy"])
		var/mob/M = usr
		var/path = text2path(href_list["buy"])
		if(!ispath(path, /datum/supply_pack))
			message_admins("[usr.key] IS TRYING TO BUY A [path] WITH THE COPPERFACE. THIS SHOULDN'T BE POSSIBLE.")
			return
		var/datum/supply_pack/PA = SSmerchant.supply_packs[path]
		if(!can_sell_pack(PA))
			return
		var/cost = PA.cost
		if(budget >= cost)
			budget -= cost
			record_round_statistic(STATS_COPPERFACE_VALUE_SPENT, cost)
		else
			say("Not enough!")
			return
		var/shoplength = PA.contains.len
		var/l
		for(l=1,l<=shoplength,l++)
			var/pathi = pick(PA.contains)
			new pathi(get_turf(M))
	if(href_list["change"])
		if(budget > 0)
			budget2change(budget, usr)
			budget = 0
	if(href_list["changecat"])
		var/requested_category = href_list["changecat"]
		if(requested_category == "1" || requested_category in categories || requested_category in categories_gamer)
			current_cat = requested_category
	return attack_hand(usr)

/obj/structure/roguemachine/blackmarket/proc/can_sell_pack(datum/supply_pack/pack)
	if(!pack || !length(pack.contains) || pack.cost <= 0 || pack.hidden || pack.not_in_public || (pack.special && !pack.special_enabled))
		return FALSE
	return pack.group in categories || pack.group in categories_gamer

/obj/structure/roguemachine/blackmarket/attack_hand(mob/living/user)
	. = ..()
	if(.)
		return
	if(!ishuman(user))
		return
	user.changeNext_move(CLICK_CD_INTENTCAP)
	playsound(loc, 'sound/misc/gold_menu.ogg', 100, FALSE, -1)
	var/canread = user.can_read(src, TRUE)
	var/list/contents = list("<div class='merchant-folio copperface'><div class='merchant-heading'><div class='merchant-edition'>What's yours</div><h1>Copperface</h1><p>Insert coins into the machine, then choose your goods.</p></div><div class='merchant-stock'><div class='copperface-categories'><h2>Categories</h2><div class='copperface-category-list'>")
	for(var/i = 1, i <= categories.len, i++)
		var/category = categories[i]
		contents += "<a class='[current_cat == category ? "copperface-selected" : ""]' href='?src=[REF(src)];changecat=[url_encode(category)]'[current_cat == category ? " aria-current='page'" : ""]>[html_encode(category)]</a>"
		if(i <= categories_gamer.len)
			category = categories_gamer[i]
			contents += "<a class='[current_cat == category ? "copperface-selected" : ""]' href='?src=[REF(src)];changecat=[url_encode(category)]'[current_cat == category ? " aria-current='page'" : ""]>[html_encode(category)]</a>"
	contents += "</div></div>"
	if(current_cat == "1")
		contents += "<div class='copperface-empty'>Choose a category to browse the goods.</div>"
	else
		contents += "<div class='copperface-catalogue-heading'><h2>[html_encode(current_cat)]</h2><a href='?src=[REF(src)];changecat=1'>All categories</a></div>"
		var/list/pax = list()
		for(var/pack in SSmerchant.supply_packs)
			var/datum/supply_pack/PA = SSmerchant.supply_packs[pack]
			if(PA.group == current_cat && can_sell_pack(PA))
				pax += PA
		if(length(pax))
			contents += "<div class='copperface-search'><label for='copperface-search'>Find goods</label><input id='copperface-search' type='text' placeholder='Search this category...' oninput='filterCopperfaceGoods(this.value)'></div><table class='merchant-table copperface-goods'><thead><tr><th scope='col'>Goods</th><th scope='col' class='merchant-price'>Mammon</th><th scope='col' class='merchant-action'>Action</th></tr></thead><tbody id='copperface-goods'>"
			for(var/datum/supply_pack/PA in sortNames(pax))
				var/costy = PA.cost
				contents += "<tr><td class='copperface-product'>[html_encode(PA.name)]</td><td class='merchant-price'>[costy]</td><td class='merchant-action'>"
				if(budget >= costy)
					contents += "<a href='?src=[REF(src)];buy=[url_encode("[PA.type]")]'>Buy</a>"
				else
					contents += "<span class='copperface-unaffordable' aria-disabled='true'>Buy</span><small>Need [costy - budget] more</small>"
				contents += "</td></tr>"
			contents += "</tbody></table><div id='copperface-no-matches' class='copperface-empty' style='display:none'>No goods match your search.</div>"
		else
			contents += "<div class='copperface-empty'>No goods are available in this category.</div>"
	contents += "</div><div class='merchant-footer'><div class='merchant-balance'><span>Stored Mammon</span><strong>[budget ? budget : 0]</strong></div><a href='?src=[REF(src)];change=1'>Return coins</a></div></div>"

	if(!canread)
		contents = list("<div class='merchant-folio copperface'><div class='copperface-unreadable'>[html_encode(stars(contents.Join()))]</div></div>")

	var/datum/browser/popup = new(user, "VENDORTHING", "", 680, 680)
	popup.add_stylesheet("merchant", 'html/browser/merchant.css')
	var/datum/asset/simple/roguefonts/merchant_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = merchant_fonts.get_url_mappings()
	var/head = "<style>@font-face { font-family: 'Merchant Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Merchant Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Merchant Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>"
	head += {"<script type='text/javascript'>
function filterCopperfaceGoods(value) {
	var query = value.toLowerCase();
	var rows = document.getElementById('copperface-goods').getElementsByTagName('tr');
	var visible = 0;
	for (var i = 0; i < rows.length; i++) {
		var row = rows.item(i);
		var name = row.getElementsByTagName('td').item(0);
		var matches = (name.textContent || name.innerText || '').toLowerCase().indexOf(query) !== -1;
		row.style.display = matches ? '' : 'none';
		if (matches) visible++;
	}
	document.getElementById('copperface-no-matches').style.display = visible ? 'none' : 'block';
}
</script>"}
	popup.add_head_content(head)
	popup.set_content(contents.Join())
	popup.open()

/obj/structure/roguemachine/blackmarket/obj_break(damage_flag)
	..()
	budget2change(budget)
	set_light(0)
	update_icon()
	icon_state = "goldvendor0"

/obj/structure/roguemachine/blackmarket/Destroy()
	set_light(0)
	return ..()

/obj/structure/roguemachine/blackmarket/Initialize(mapload)
	. = ..()
	update_icon()

