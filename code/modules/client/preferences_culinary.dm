/proc/get_cached_food_flat_icon(obj/item/reagent_containers/food/snacks/food_type)
	var/cache_key = "[food_type]"
	if(!GLOB.cached_food_flat_icons[cache_key])
		var/image/dummy = image(initial(food_type.icon), null, initial(food_type.icon_state), initial(food_type.layer))
		GLOB.cached_food_flat_icons[cache_key] = "<img src='data:image/png;base64, [icon2base64(getFlatIcon(dummy))]'>"
	return GLOB.cached_food_flat_icons[cache_key]

/proc/get_cached_drink_flat_icon(drink_quality)
	var/obj/item/reagent_containers/glass/icon_type
	if(drink_quality <= 0)
		icon_type = /obj/item/reagent_containers/glass/cup/wooden
	else if(drink_quality <= 1)
		icon_type = /obj/item/reagent_containers/glass/cup
	else if(drink_quality <= 2)
		icon_type = /obj/item/reagent_containers/glass/bottle
	else if(drink_quality <= 3)
		icon_type = /obj/item/reagent_containers/glass/cup/silver
	else
		icon_type = /obj/item/reagent_containers/glass/cup/golden

	var/cache_key = "[icon_type]"
	if(!GLOB.cached_drink_flat_icons[cache_key])
		var/image/dummy = image(initial(icon_type.icon), null, initial(icon_type.icon_state), initial(icon_type.layer))
		GLOB.cached_drink_flat_icons[cache_key] = "<img src='data:image/png;base64, [icon2base64(getFlatIcon(dummy))]'>"
	return GLOB.cached_drink_flat_icons[cache_key]

/datum/preferences/proc/validate_culinary_preferences()
	if(!culinary_preferences)
		culinary_preferences = list()

	if(!culinary_preferences[CULINARY_FAVOURITE_FOOD])
		culinary_preferences[CULINARY_FAVOURITE_FOOD] = get_default_food()

	if(!culinary_preferences[CULINARY_FAVOURITE_DRINK])
		culinary_preferences[CULINARY_FAVOURITE_DRINK] = get_default_drink()

	if(!culinary_preferences[CULINARY_HATED_FOOD])
		culinary_preferences[CULINARY_HATED_FOOD] = get_default_hated_food()

	if(!culinary_preferences[CULINARY_HATED_DRINK])
		culinary_preferences[CULINARY_HATED_DRINK] = get_default_hated_drink()

	if(culinary_preferences[CULINARY_FAVOURITE_FOOD] == culinary_preferences[CULINARY_HATED_FOOD])
		culinary_preferences[CULINARY_HATED_FOOD] = get_default_hated_food()
	if(culinary_preferences[CULINARY_FAVOURITE_DRINK] == culinary_preferences[CULINARY_HATED_DRINK])
		culinary_preferences[CULINARY_HATED_DRINK] = get_default_hated_drink()

/datum/preferences/proc/reset_culinary_preferences()
	culinary_preferences = list()
	culinary_preferences[CULINARY_FAVOURITE_FOOD] = get_default_food()
	culinary_preferences[CULINARY_FAVOURITE_DRINK] = get_default_drink()
	culinary_preferences[CULINARY_HATED_FOOD] = get_default_hated_food()
	culinary_preferences[CULINARY_HATED_DRINK] = get_default_hated_drink()

/datum/preferences/proc/get_default_food()
	return /obj/item/reagent_containers/food/snacks/rogue/bread

/datum/preferences/proc/get_default_hated_food()
	return /obj/item/reagent_containers/food/snacks/badrecipe

/datum/preferences/proc/get_default_drink()
	return /datum/reagent/consumable/ethanol/beer

/datum/preferences/proc/get_default_hated_drink()
	return //datum/container_craft/cooking/tea/badidea

/datum/preferences/proc/handle_culinary_topic(mob/user, href_list)
	switch(href_list["preference"])
		if("choose_food")
			show_food_selection_ui(user, CULINARY_FAVOURITE_FOOD)
		if("choose_drink")
			show_drink_selection_ui(user, CULINARY_FAVOURITE_DRINK)
		if("choose_hated_food")
			show_food_selection_ui(user, CULINARY_HATED_FOOD)
		if("choose_hated_drink")
			show_drink_selection_ui(user, CULINARY_HATED_DRINK)
		if("confirm_food")
			var/food_type = text2path(href_list["food_type"])
			var/preference_type = href_list["preference_type"]
			if(ispath(food_type, /obj/item/reagent_containers/food/snacks))
				var/opposite_preference = (preference_type == CULINARY_FAVOURITE_FOOD) ? CULINARY_HATED_FOOD : CULINARY_FAVOURITE_FOOD
				if(culinary_preferences[opposite_preference] == food_type)
					to_chat(user, span_warning("You can't set the same item as both favorite and hated!"))
				else
					culinary_preferences[preference_type] = food_type
					user << browse(null, "window=food_selection")
					show_culinary_ui(user)
		if("confirm_drink")
			var/drink_type = text2path(href_list["drink_type"])
			var/preference_type = href_list["preference_type"]
			if(ispath(drink_type, /datum/reagent/consumable))
				var/opposite_preference = (preference_type == CULINARY_FAVOURITE_DRINK) ? CULINARY_HATED_DRINK : CULINARY_FAVOURITE_DRINK
				if(culinary_preferences[opposite_preference] == drink_type)
					to_chat(user, span_warning("You can't set the same drink as both favorite and hated!"))
				else
					culinary_preferences[preference_type] = drink_type
					user << browse(null, "window=drink_selection")
					show_culinary_ui(user)

/datum/preferences/proc/print_culinary_page(mob/user)
	var/list/dat = list()

	var/current_food = culinary_preferences[CULINARY_FAVOURITE_FOOD]
	var/current_drink = culinary_preferences[CULINARY_FAVOURITE_DRINK]
	var/current_hated_food = culinary_preferences[CULINARY_HATED_FOOD]
	var/current_hated_drink = culinary_preferences[CULINARY_HATED_DRINK]

	var/food_name = "None"
	var/food_icon
	if(current_food)
		var/obj/item/food_instance = current_food
		food_name = capitalize(initial(food_instance.name))
		food_icon = get_cached_food_flat_icon(current_food)

	var/drink_name = "None"
	var/drink_icon
	if(current_drink)
		var/datum/reagent/consumable/drink_instance = current_drink
		drink_name = capitalize(initial(drink_instance.name))
		var/drink_quality = initial(drink_instance.quality)
		drink_icon = get_cached_drink_flat_icon(drink_quality)

	var/hated_food_name = "None"
	var/hated_food_icon
	if(current_hated_food)
		var/obj/item/hated_food_instance = current_hated_food
		hated_food_name = capitalize(initial(hated_food_instance.name))
		hated_food_icon = get_cached_food_flat_icon(current_hated_food)

	var/hated_drink_name = "None"
	var/hated_drink_icon
	if(current_hated_drink)
		var/datum/reagent/consumable/hated_drink_instance = current_hated_drink
		hated_drink_name = capitalize(initial(hated_drink_instance.name))
		var/hated_drink_quality = initial(hated_drink_instance.quality)
		hated_drink_icon = get_cached_drink_flat_icon(hated_drink_quality)

	dat += "<p class='culinary-intro'>Choose the food and drink your character enjoys or dislikes.</p>"
	dat += "<div class='culinary-summary'>"
	dat += "<a class='culinary-row' href='byond://?_src_=prefs;preference=choose_food;preference_type=[CULINARY_FAVOURITE_FOOD];task=change_culinary_preferences'><span class='culinary-icon'>[food_icon]</span><span class='culinary-detail'><span class='culinary-label'>Favourite food</span><strong>[encode_special_chars(html_encode(food_name))]</strong></span><span class='culinary-action'>Change</span></a>"
	dat += "<a class='culinary-row' href='byond://?_src_=prefs;preference=choose_drink;preference_type=[CULINARY_FAVOURITE_DRINK];task=change_culinary_preferences'><span class='culinary-icon'>[drink_icon]</span><span class='culinary-detail'><span class='culinary-label'>Favourite drink</span><strong>[encode_special_chars(html_encode(drink_name))]</strong></span><span class='culinary-action'>Change</span></a>"
	dat += "<a class='culinary-row' href='byond://?_src_=prefs;preference=choose_hated_food;preference_type=[CULINARY_HATED_FOOD];task=change_culinary_preferences'><span class='culinary-icon'>[hated_food_icon]</span><span class='culinary-detail'><span class='culinary-label'>Disliked food</span><strong>[encode_special_chars(html_encode(hated_food_name))]</strong></span><span class='culinary-action'>Change</span></a>"
	dat += "<a class='culinary-row' href='byond://?_src_=prefs;preference=choose_hated_drink;preference_type=[CULINARY_HATED_DRINK];task=change_culinary_preferences'><span class='culinary-icon'>[hated_drink_icon]</span><span class='culinary-detail'><span class='culinary-label'>Disliked drink</span><strong>[encode_special_chars(html_encode(hated_drink_name))]</strong></span><span class='culinary-action'>Change</span></a>"
	dat += "</div>"

	return dat

/datum/preferences/proc/style_culinary_popup(datum/browser/popup)
	popup.add_stylesheet("culinary_preferences", 'html/browser/culinary_preferences.css')
	var/datum/asset/simple/roguefonts/culinary_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = culinary_fonts.get_url_mappings()
	var/head = "<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>"
	head += {"<script type='text/javascript'>
function filterCulinaryChoices(value) {
	var query = value.toLowerCase();
	var rows = document.getElementById('culinary-choices').getElementsByTagName('a');
	var visible = 0;
	for (var i = 0; i < rows.length; i++) {
		var row = rows.item(i);
		var name = row.getElementsByTagName('strong').item(0);
		var matches = (name.textContent || name.innerText || '').toLowerCase().indexOf(query) !== -1;
		row.style.display = matches ? '' : 'none';
		if (matches) visible++;
	}
	document.getElementById('culinary-empty').style.display = visible ? 'none' : 'block';
}
</script>"}
	popup.add_head_content(head)

/datum/preferences/proc/show_food_selection_ui(mob/user, preference_type)
	var/list/dat = list()
	dat += "<p class='culinary-intro'>Select a food below. Your favourite and disliked food must be different.</p>"
	dat += "<div class='culinary-search'><label for='culinary-search'>Find a food</label><input id='culinary-search' type='text' placeholder='Search by name...' oninput='filterCulinaryChoices(this.value)'></div>"
	dat += "<div id='culinary-choices'>"

	for(var/list/food_data in GLOB.food_with_faretypes)
		var/food_type = food_data["type"]
		var/food_name = food_data["name"]
		var/food_faretype = food_data["faretype"]

		var/display_name = capitalize(food_name)
		var/food_icon = get_cached_food_flat_icon(food_type)
		var/is_current = culinary_preferences[preference_type] == food_type
		dat += "<a class='culinary-row culinary-choice[is_current ? " culinary-current" : ""]' href='byond://?_src_=prefs;preference=confirm_food;food_type=[food_type];preference_type=[preference_type];task=change_culinary_preferences'><span class='culinary-icon'>[food_icon]</span><span class='culinary-detail'><strong>[encode_special_chars(html_encode(display_name))]</strong><span class='culinary-quality'>Quality: [food_faretype]</span></span><span class='culinary-action'>[is_current ? "Current" : "Choose"]</span></a>"

	dat += "</div><p id='culinary-empty' class='culinary-empty' style='display:none'>No food matches that name.</p>"
	var/title = (preference_type == CULINARY_FAVOURITE_FOOD) ? "Select Favourite Food" : "Select Disliked Food"
	var/datum/browser/popup = new(user, "food_selection", "<div align='center'>[title]</div>", 560, 650)
	style_culinary_popup(popup)
	popup.set_content(dat.Join())
	popup.open(FALSE)

/datum/preferences/proc/show_drink_selection_ui(mob/user, preference_type)
	var/list/dat = list()
	dat += "<p class='culinary-intro'>Select a drink below. Your favourite and disliked drink must be different.</p>"
	dat += "<div class='culinary-search'><label for='culinary-search'>Find a drink</label><input id='culinary-search' type='text' placeholder='Search by name...' oninput='filterCulinaryChoices(this.value)'></div>"
	dat += "<div id='culinary-choices'>"

	for(var/list/drink_data in GLOB.drink_with_qualities)
		var/drink_type = drink_data["type"]
		var/drink_name = drink_data["name"]
		var/drink_quality = drink_data["quality"]

		var/display_name = capitalize(drink_name)
		var/drink_icon = get_cached_drink_flat_icon(drink_quality)
		var/is_current = culinary_preferences[preference_type] == drink_type
		dat += "<a class='culinary-row culinary-choice[is_current ? " culinary-current" : ""]' href='byond://?_src_=prefs;preference=confirm_drink;drink_type=[drink_type];preference_type=[preference_type];task=change_culinary_preferences'><span class='culinary-icon'>[drink_icon]</span><span class='culinary-detail'><strong>[encode_special_chars(html_encode(display_name))]</strong><span class='culinary-quality'>Quality: [drink_quality]</span></span><span class='culinary-action'>[is_current ? "Current" : "Choose"]</span></a>"

	dat += "</div><p id='culinary-empty' class='culinary-empty' style='display:none'>No drink matches that name.</p>"
	var/title = (preference_type == CULINARY_FAVOURITE_DRINK) ? "Select Favourite Drink" : "Select Disliked Drink"
	var/datum/browser/popup = new(user, "drink_selection", "<div align='center'>[title]</div>", 560, 650)
	style_culinary_popup(popup)
	popup.set_content(dat.Join())
	popup.open(FALSE)

/datum/preferences/proc/show_culinary_ui(mob/user)
	var/list/dat = list()
	dat += print_culinary_page(user)
	var/datum/browser/popup = new(user, "culinary_customization", "<div align='center'>Culinary Preferences</div>", 540, 420)
	style_culinary_popup(popup)
	popup.set_content(dat.Join())
	popup.open(FALSE)

/datum/preferences/proc/apply_culinary_preferences(mob/living/carbon/human/character)
	if(!culinary_preferences)
		return

	character.culinary_preferences = culinary_preferences.Copy()

/proc/encode_special_chars(text)
	. = text
	. = replacetext(., "ü", "&uuml;")
	. = replacetext(., "Ü", "&Uuml;")
	. = replacetext(., "ö", "&ouml;")
	. = replacetext(., "Ö", "&Ouml;")
	. = replacetext(., "ä", "&auml;")
	. = replacetext(., "Ä", "&Auml;")
	. = replacetext(., "ß", "&szlig;")
	return .
