/datum/preferences/proc/validate_customizer_entries()
	customizer_entries = SANITIZE_LIST(customizer_entries)
	listclearnulls(customizer_entries)
	var/datum/species/species = pref_species
	var/list/customizers = species.customizers
	/// Check if we have any customizer entries that don't match.
	for(var/datum/customizer_entry/entry as anything in customizer_entries)
		// Preserve saved tail choices and colors when adding the fertility setting.
		if(entry.type == /datum/customizer_entry && ispath(entry.customizer_choice_type, /datum/customizer_choice/organ/tail))
			var/datum/customizer_entry/organ/tail/tail_entry = new
			tail_entry.customizer_type = entry.customizer_type
			tail_entry.customizer_choice_type = entry.customizer_choice_type
			tail_entry.accessory_type = entry.accessory_type
			tail_entry.accessory_colors = entry.accessory_colors
			tail_entry.disabled = entry.disabled
			customizer_entries[customizer_entries.Find(entry)] = tail_entry
			entry = tail_entry
		var/validated = FALSE
		for(var/customizer_type as anything in customizers)
			if(customizer_type != entry.customizer_type)
				continue
			var/datum/customizer/customizer = CUSTOMIZER(customizer_type)
			if(!(entry.customizer_choice_type in customizer.customizer_choices))
				continue
			var/datum/customizer_choice/customizer_choice = CUSTOMIZER_CHOICE(entry.customizer_choice_type)
			if(entry.type != customizer_choice.customizer_entry_type)
				continue
			validated = TRUE
			break

		if(!validated)
			customizer_entries -= entry

	/// Check if we have any missing customizer entries
	for(var/customizer_type as anything in customizers)
		var/found = FALSE
		for(var/datum/customizer_entry/entry as anything in customizer_entries)
			if(entry.customizer_type != customizer_type)
				continue
			found = TRUE
			break
		var/datum/customizer/customizer = CUSTOMIZER(customizer_type)
		if(!found)
			if(customizer)
				customizer_entries += customizer.make_default_customizer_entry(src, FALSE)

	/// Validate the variables within customizer entries
	for(var/datum/customizer_entry/entry as anything in customizer_entries)
		var/datum/customizer_choice/customizer_choice = CUSTOMIZER_CHOICE(entry.customizer_choice_type)
		customizer_choice.validate_entry(src, entry)

/datum/preferences/proc/print_customizers_page()
	var/list/dat = list()
	. = dat
	if(!pref_species)
		dat += "<p class='appearance-empty'>Choose a species to customize your appearance.</p>"
		return
	var/list/customizers = pref_species.customizers
	if(!customizers)
		dat += "<p class='appearance-empty'>No appearance choices are available for this species.</p>"
		return
	dat += "<div class='appearance-cards'>"
	var/iterated_customizers = 0
	for(var/customizer_type in customizers)
		var/datum/customizer/customizer = CUSTOMIZER(customizer_type)
		if(!customizer)
			continue
		if(!customizer.is_allowed(src))
			continue
		var/datum/customizer_entry/entry = get_customizer_entry_for_customizer_type(customizer_type)
		if(!entry)
			stack_trace("Missing customizer entry in preferences for customizer [customizer_type]")
			continue
		var/datum/customizer_choice/choice = CUSTOMIZER_CHOICE(entry.customizer_choice_type)

		var/customizer_link

		if(entry.disabled)
			customizer_link = "href='?_src_=prefs;task=change_customizer;customizer=[customizer_type];customizer_task=toggle_missing'"
		else
			if(customizer.allows_disabling)
				customizer_link = "href='?_src_=prefs;task=change_customizer;customizer=[customizer_type];customizer_task=toggle_missing' class='linkOn'"
			else
				customizer_link = ""

		dat += "<div class='appearance-card'><h2>"
		if(customizer_link)
			dat += "<a [customizer_link]>[customizer.name]</a>"
		else
			dat += "[customizer.name]"
		dat += "</h2>"
		if(!entry.disabled)
			var/choice_link
			if(length(customizer.customizer_choices) > 1)
				choice_link = "href='?_src_=prefs;task=change_customizer;customizer=[customizer_type];customizer_task=change_choice'"
			else
				choice_link = "class='linkOff'"
			if(length(customizer.customizer_choices) > 1)
				dat += "<div class='appearance-choice'><span class='appearance-label'>Type</span> <a [choice_link]>[choice.name]</a></div>"

			var/list/choice_list = choice.show_pref_choices(src, entry, customizer_type)
			if(choice_list)
				dat += "<div class='appearance-controls'>"
				dat += choice_list
				dat += "</div>"

		else
			dat += "<p class='appearance-empty'>Disabled. Select the heading to enable.</p>"

		dat += "</div>"
		iterated_customizers += 1
	dat += "</div>"
	if(!iterated_customizers)
		dat += "<p class='appearance-empty'>No appearance choices are available for this character.</p>"
	return

/// We dont associate the entries just to be safer for save/load, so we can't lookup easily and we do this.
/datum/preferences/proc/get_customizer_entry_for_customizer_type(customizer_type)
	for(var/datum/customizer_entry/entry as anything in customizer_entries)
		if(entry.customizer_type == customizer_type)
			return entry

/// Gets an associative list of organ slots to organ dna created from organ customization
/datum/preferences/proc/get_organ_dna_list()
	var/list/organ_list = list()
	for(var/datum/customizer_entry/entry as anything in customizer_entries)
		var/datum/customizer_choice/customizer_choice = CUSTOMIZER_CHOICE(entry.customizer_choice_type)
		var/datum/customizer/customizer = CUSTOMIZER(entry.customizer_type)
		if(!customizer.is_allowed(src))
			continue
		if(entry.disabled)
			continue
		var/datum/organ_dna/dna = customizer_choice.create_organ_dna(entry, src)
		if(!dna)
			continue
		organ_list[customizer_choice.get_organ_slot()] = dna

	return organ_list

/datum/preferences/proc/customize_organ(obj/item/organ/organ)
	for(var/datum/customizer_entry/entry as anything in customizer_entries)
		var/datum/customizer_choice/customizer_choice = CUSTOMIZER_CHOICE(entry.customizer_choice_type)
		var/datum/customizer/customizer = CUSTOMIZER(entry.customizer_type)
		if(!customizer.is_allowed(src))
			continue
		if(entry.disabled)
			continue
		if(!(customizer_choice.get_organ_slot() == organ.slot))
			continue
		customizer_choice.customize_organ(organ, entry)

/datum/preferences/proc/apply_customizers_to_character(mob/living/carbon/human/human)
	for(var/datum/customizer_entry/entry as anything in customizer_entries)
		var/datum/customizer_choice/customizer_choice = CUSTOMIZER_CHOICE(entry.customizer_choice_type)
		var/datum/customizer/customizer = CUSTOMIZER(entry.customizer_type)
		if(!customizer.is_allowed(src))
			continue
		if(entry.disabled)
			continue
		customizer_choice.apply_customizer_to_character(human, src, entry)

/datum/preferences/proc/handle_customizer_topic(mob/user, href_list)
	//needs_update = TRUE
	var/customizer_type = text2path(href_list["customizer"])
	var/datum/customizer_entry/entry = get_customizer_entry_for_customizer_type(customizer_type)
	if(!entry)
		return
	var/datum/customizer_choice/choice = CUSTOMIZER_CHOICE(entry.customizer_choice_type)
	var/datum/customizer/customizer = CUSTOMIZER(customizer_type)
	switch(href_list["customizer_task"])
		if("toggle_missing")
			if(customizer.allows_disabling)
				entry.disabled = !entry.disabled
		if("change_choice")
			var/list/choice_list = list()
			for(var/choice_type in customizer.customizer_choices)
				var/datum/customizer_choice/iter_choice = CUSTOMIZER_CHOICE(choice_type)
				choice_list[iter_choice.name] = choice_type
			var/chosen_input = tgui_input_list(user, "Choose your [LOWER_TEXT(customizer.name)]:", "Character Preference", choice_list)
			if(!chosen_input)
				return
			var/choice_type = choice_list[chosen_input]
			if(choice_type == choice.type)
				return
			customizer_entries -= entry
			customizer_entries += customizer.create_customizer_entry(src, choice_type)
		else
			choice.handle_topic(user, href_list, src, entry, customizer_type)
	if(ishuman(user))
		var/mob/living/carbon/human/humanized = user
		humanized.update_body_parts(TRUE)

/datum/preferences/proc/reset_all_customizer_accessory_colors()
	for(var/datum/customizer_entry/entry as anything in customizer_entries)
		var/datum/customizer_choice/choice = CUSTOMIZER_CHOICE(entry.customizer_choice_type)
		choice.reset_accessory_colors(src, entry)

/datum/preferences/proc/randomize_all_customizer_accessories()
	for(var/datum/customizer_entry/entry as anything in customizer_entries)
		var/datum/customizer_choice/choice = CUSTOMIZER_CHOICE(entry.customizer_choice_type)
		choice.randomize_entry(entry, src)

/datum/preferences/proc/ShowCustomizers(mob/user)
	var/list/dat = list()
	dat += "<p class='appearance-intro'>Choose features, styles and colors for your character.</p>"
	dat += print_customizers_page()
	var/datum/browser/popup = new(user, "customization", "Customization", 630, 730)
	popup.add_stylesheet("appearance_editor", 'html/browser/appearance_editor.css')
	var/datum/asset/simple/roguefonts/appearance_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = appearance_fonts.get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>")
	popup.set_content(dat.Join())
	popup.open(FALSE)

/datum/preferences/proc/get_hair_color()
	var/datum/customizer_entry/hair/entry = get_customizer_entry_of_type(/datum/customizer_entry/hair)
	if(entry)
		return entry.hair_color
	else
		return "FFFFFF"

/datum/preferences/proc/get_facial_hair_color()
	var/datum/customizer_entry/hair/entry = get_customizer_entry_of_type(/datum/customizer_entry/hair/facial)
	if(entry)
		return entry.hair_color
	else
		return "FFFFFF"

/datum/preferences/proc/get_eye_color()
	var/datum/customizer_entry/organ/eyes/entry = get_customizer_entry_of_type(/datum/customizer_entry/organ/eyes)
	if(entry)
		return entry.eye_color
	else
		return "FFFFFF"

/datum/preferences/proc/get_chest_color()
	var/list/zone_list = body_markings[BODY_ZONE_CHEST]
	if(!zone_list)
		return null
	for(var/marking_name in zone_list)
		var/datum/body_marking/marking = GLOB.body_markings[marking_name]
		if(!marking.covers_chest)
			continue
		var/marking_color = zone_list[marking_name]
		return marking_color
	return null

/datum/preferences/proc/get_customizer_entry_of_type(entry_type)
	for(var/datum/customizer_entry/entry as anything in customizer_entries)
		if(entry.type == entry_type)
			return entry
	return null

/datum/preferences/proc/genderize_customizer_entries()
	customizer_entries = SANITIZE_LIST(customizer_entries)
	var/datum/species/species = pref_species
	var/list/customizers = species.customizers

	/// Check if we have any missing customizer entries
	for(var/datum/customizer/customizer_type as anything in customizers)
		if(customizer_type.gender_enabled == null)
			continue
		for(var/datum/customizer_entry/entry as anything in customizer_entries)
			if(entry.customizer_type != customizer_type)
				continue
			if(customizer_type.gender_enabled == gender)
				entry.disabled = FALSE
			else
				entry.disabled = TRUE
			break
