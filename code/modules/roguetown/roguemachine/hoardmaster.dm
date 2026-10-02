/obj/structure/roguemachine/Hoardmaster
	name = ""
	desc = ""
	icon = 'icons/roguetown/misc/96x96.dmi'
	icon_state = "Hoardmaster"
	pixel_x = -32
	density = TRUE
	blade_dulling = DULLING_BASH
	max_integrity = 0
	anchored = TRUE
	layer = ABOVE_MOB_LAYER
	var/upgrade_flags
	var/current_cat = "1"


/obj/structure/roguemachine/Hoardmaster/Initialize(mapload)
	. = ..()
	update_icon()
	var/namechance = rand(1,6)
	switch(namechance)
		if(1)
			name = "Hoardmaster Skyblue"
		if(2)
			name = "Hoardmaster Thea"
		if(3)
			name = "Hoardmaster Radagon"
		if(4)
			name = "Hoardmaster Shiver"
		if(5)
			name = "Hoardmaster Deathbringer"
		if(6)
			name = "Hoardmaster Darkstalker"

/obj/structure/roguemachine/Hoardmaster/examine(mob/user)
	. = ..()
	if(user.mind?.has_antag_datum(/datum/antagonist/bandit))
		. += "Formerly a covetous creature, this one now shares its Hoard with the Freefolk. Protecting the transactor's Hoard, and trading it for Favor."
		return
	else
		. += "Some mean looking statue of a dragon. Something about it makes me uneasy, like its eyes are following me."
		return

/obj/structure/roguemachine/Hoardmaster/Topic(href, href_list)
	. = ..()
	if(!HAS_TRAIT(usr, TRAIT_COMMIE))
		return
	if(!usr.canUseTopic(src, BE_CLOSE))
		return
	if(!ishuman(usr))
		return
	if(href_list["buy"])
		var/mob/M = usr
		var/datum/antagonist/bandit/B = M.mind?.has_antag_datum(/datum/antagonist/bandit)
		if(!B)
			return
		var/path = text2path(href_list["buy"])
		if(!ispath(path, /datum/supply_pack))
			message_admins("[usr.key] supplied an invalid Hoardmaster purchase path: [path].")
			return
		var/datum/supply_pack/PA = SSmerchant.supply_packs[path]
		if(!can_sell_pack(M, PA))
			return
		var/cost = PA.cost
		if(B.favor >= cost)
			B.favor -= cost
			playsound(loc, 'sound/misc/hoardmasterpurchase.ogg', 80, FALSE, -1)
		else
			say("Earn your keep first!")
			return
		var/shoplength = PA.contains.len
		var/l
		for(l=1,l<=shoplength,l++)
			var/pathi = pick(PA.contains)
			var/atom/hmasteritem = new pathi(get_turf(M))
			hmasteritem.flags_1 |= HOARDMASTER_SPAWNED_1
			if(istype(hmasteritem, /obj/item))
				var/obj/item/newitem = hmasteritem
				newitem.sellprice = 0
				if(newitem.smeltresult)
					newitem.smeltresult = /obj/item/ash
				if(newitem.salvage_result)
					newitem.salvage_result = /obj/item/ash
	if(href_list["changecat"])
		var/requested_category = href_list["changecat"]
		if(requested_category == "1" || requested_category in get_unlocked_categories(usr))
			current_cat = requested_category
	return attack_hand(usr)

/obj/structure/roguemachine/Hoardmaster/attack_hand(mob/living/user)
	if(!HAS_TRAIT(user, TRAIT_COMMIE))
		return
	var/datum/antagonist/bandit/B = user.mind?.has_antag_datum(/datum/antagonist/bandit)
	if(!B)
		return
	. = ..()
	if(.)
		return
	if(!ishuman(user))
		return
	user.changeNext_move(CLICK_CD_INTENTCAP)
	var/list/unlocked_cats = get_unlocked_categories(user)
	if(!(current_cat in unlocked_cats))
		current_cat = "1"

	var/list/contents = list("<div class='merchant-folio hoardmaster'><div class='merchant-heading'><div class='merchant-edition'>Wishes for the Free</div><h1>[html_encode(name)]</h1><p>Choose goods from the hoard and spend your Favor.</p></div><div class='merchant-stock' tabindex='0' role='region' aria-label='Hoardmaster catalogue'><div class='hoardmaster-categories'><h2>Categories</h2><div class='hoardmaster-category-list'>")
	for(var/category in unlocked_cats)
		contents += "<a class='[current_cat == category ? "hoardmaster-selected" : ""]' href='?src=[REF(src)];changecat=[url_encode(category)]'[current_cat == category ? " aria-current='page'" : ""]>[html_encode(category)]</a>"
	contents += "</div></div>"
	if(current_cat == "1")
		contents += "<div class='hoardmaster-empty'>Choose a category to browse the hoard.</div>"
	else
		contents += "<div class='hoardmaster-catalogue-heading'><h2>[html_encode(current_cat)]</h2><a href='?src=[REF(src)];changecat=1'>All categories</a></div>"
		var/list/pax = list()
		for(var/pack in SSmerchant.supply_packs)
			var/datum/supply_pack/PA = SSmerchant.supply_packs[pack]
			if(PA.group == current_cat && can_sell_pack(user, PA))
				pax += PA
		if(length(pax))
			contents += "<div class='hoardmaster-search'><label for='hoardmaster-search'>Find goods</label><input id='hoardmaster-search' type='text' placeholder='Search this category...' oninput='filterHoardmasterGoods(this.value)'></div><table class='merchant-table hoardmaster-goods'><thead><tr><th scope='col'>Goods</th><th scope='col' class='merchant-quantity'>Items</th><th scope='col' class='merchant-price'>Favor cost</th><th scope='col' class='merchant-action'>Action</th></tr></thead><tbody id='hoardmaster-goods'>"
			for(var/datum/supply_pack/PA in sortList(pax))
				contents += "<tr><td class='hoardmaster-product'>[html_encode(PA.name)]</td><td class='merchant-quantity'>[PA.contains.len]</td><td class='merchant-price'>[PA.cost]</td><td class='merchant-action'>"
				if(B.favor >= PA.cost)
					contents += "<a href='?src=[REF(src)];buy=[url_encode("[PA.type]")]'>Buy</a>"
				else
					contents += "<span class='hoardmaster-unaffordable' aria-disabled='true'>Buy</span><small>Need [PA.cost - B.favor] more Favor</small>"
				contents += "</td></tr>"
			contents += "</tbody></table><div id='hoardmaster-no-matches' class='hoardmaster-empty' style='display:none'>No goods match your search.</div>"
		else
			contents += "<div class='hoardmaster-empty'>No goods are available in this category.</div>"
	contents += "</div><div class='merchant-footer'><div class='merchant-balance'><span>Your Favor</span><strong>[B.favor]</strong></div></div></div>"

	var/datum/browser/popup = new(user, "HOARDMASTER", "", 680, 680)
	popup.add_stylesheet("merchant", 'html/browser/merchant.css')
	var/datum/asset/simple/roguefonts/merchant_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = merchant_fonts.get_url_mappings()
	var/head = "<style>@font-face { font-family: 'Merchant Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Merchant Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Merchant Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>"
	head += {"<script type='text/javascript'>
function filterHoardmasterGoods(value) {
	var query = value.toLowerCase();
	var rows = document.getElementById('hoardmaster-goods').getElementsByTagName('tr');
	var visible = 0;
	for (var i = 0; i < rows.length; i++) {
		var row = rows.item(i);
		var name = row.getElementsByTagName('td').item(0);
		var matches = (name.textContent || name.innerText || '').toLowerCase().indexOf(query) !== -1;
		row.style.display = matches ? '' : 'none';
		if (matches) visible++;
	}
	document.getElementById('hoardmaster-no-matches').style.display = visible ? 'none' : 'block';
}
</script>"}
	popup.add_head_content(head)
	popup.set_content(contents.Join())
	popup.open()

/obj/structure/roguemachine/Hoardmaster/proc/get_unlocked_categories(mob/user)
	var/static/list/class_categories = list("Brigand" = "Brigand", "Sellsword" = "Sellsword", "Sawbones" = "Sawbones", "Hedge Knight" = "Knight", "Rogue Mage" = "Mage", "Knave" = "Knave", "Iconoclast" = "Iconoclast", "Pioneer" = "Pioneer")
	var/list/categories = list("Supplies", "Medicaments", "Clothing")
	var/class_category = class_categories[user.advjob]
	if(class_category)
		categories += class_category
	return categories

/obj/structure/roguemachine/Hoardmaster/proc/can_sell_pack(mob/user, datum/supply_pack/pack)
	if(!HAS_TRAIT(user, TRAIT_COMMIE) || !user.mind?.has_antag_datum(/datum/antagonist/bandit))
		return FALSE
	if(!pack || !length(pack.contains) || pack.cost <= 0 || pack.hidden || pack.not_in_public || (pack.special && !pack.special_enabled))
		return FALSE
	return pack.group in get_unlocked_categories(user)


/obj/structure/roguemachine/hoardbarrier //Blocks sprite locations
	name = ""
	desc = "Formerly a covetous creature, this one now shares its Hoard with the Freefolk. Protecting the transactor's Hoard, and trading it for Favor."
	icon = 'icons/roguetown/underworld/underworld.dmi'
	icon_state = "spiritpart"
	density = TRUE
	anchored = TRUE
