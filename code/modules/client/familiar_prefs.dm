/datum/familiar_prefs
	/// Reference to our prefs
	var/datum/preferences/prefs
	var/familiar_name
	var/familiar_specie
	var/familiar_headshot_link
	var/familiar_flavortext
	var/familiar_flavortext_display
	var/familiar_ooc
	var/familiar_ooc_notes
	var/familiar_ooc_notes_display
	var/familiar_ooc_extra
	var/familiar_ooc_extra_link
	var/familiar_pronouns = THEY_THEM // Default pronouns

/datum/familiar_prefs/New(datum/preferences/passed_prefs)
	. = ..()
	prefs = passed_prefs

/datum/familiar_prefs/proc/fam_show_ui()
	var/client/client = prefs?.parent
	if (!client)
		return

	var/list/dat = list()
	var/list/missing_fields = list()
	if (!familiar_name)
		missing_fields += "name"
	if (!familiar_flavortext_display)
		missing_fields += "description"
	if (!familiar_specie)
		missing_fields += "familiar type"

	dat += "<p class='familiar-intro'>Prepare your familiar's identity and description, then join the summoning queue.</p>"
	dat += "<div class='familiar-card familiar-queue'><h2>Summoning queue</h2>"
	if (client in GLOB.familiar_queue)
		dat += "<p class='familiar-status'>You are in the familiar queue.</p>"
		dat += "<a href='?_src_=familiar_prefs;preference=familiar_queue;task=leave'>Leave queue</a>"
	else
		dat += "<p class='familiar-status'>You are not in the familiar queue.</p>"
		if (!length(missing_fields))
			dat += "<p class='familiar-hint'>Your required fields are complete.</p>"
		dat += "<a href='?_src_=familiar_prefs;preference=familiar_queue;task=join'>Join queue</a>"
	if (length(missing_fields))
		dat += "<p class='familiar-missing'>Required before joining: [missing_fields.Join(", ")].</p>"
	dat += "</div>"

	var/display_name = "None selected"
	var/list/all_types = GLOB.familiar_types
	for (var/name in all_types)
		if (all_types[name] == familiar_specie)
			display_name = name
			break
	var/list/pronoun_display = list(
		HE_HIM = "he/him",
		SHE_HER = "she/her",
		THEY_THEM = "they/them",
		IT_ITS = "it/its"
	)
	var/selected_pronoun = pronoun_display[familiar_pronouns] ? pronoun_display[familiar_pronouns] : "they/them"
	var/name_display = familiar_name ? html_encode(familiar_name) : "Set name"
	dat += "<div class='familiar-card'><h2>Identity</h2>"
	dat += "<div class='familiar-field'><span class='familiar-label'>Name <small>Required</small></span><span class='familiar-value'><a href='?_src_=familiar_prefs;preference=familiar_name;task=input'>[name_display]</a></span></div>"
	dat += "<div class='familiar-field'><span class='familiar-label'>Familiar type <small>Required</small></span><span class='familiar-value'><a href='?_src_=familiar_prefs;preference=familiar_specie;task=select'>[html_encode(display_name)]</a></span></div>"
	dat += "<div class='familiar-field'><span class='familiar-label'>Pronouns</span><span class='familiar-value'><a href='?_src_=familiar_prefs;preference=familiar_pronouns;task=select'>[selected_pronoun]</a></span></div>"
	if (familiar_specie)
		var/lore_blurb = GLOB.familiar_lore_blurbs[familiar_specie]
		if (lore_blurb)
			dat += "<div class='familiar-lore'><strong>Lore inspiration</strong><br>[lore_blurb]</div>"
	dat += "</div>"

	dat += "<div class='familiar-card'><h2>Description <small>Required</small></h2>"
	dat += "<p class='familiar-hint'>Describe physical, sensory details rather than backstory or internal thoughts.</p>"
	if (familiar_flavortext)
		dat += "<p class='familiar-preview'>[html_encode(copytext(familiar_flavortext, 1, 241))][length(familiar_flavortext) > 240 ? "..." : ""]</p>"
	else
		dat += "<p class='familiar-hint'>No description set.</p>"
	dat += "<a href='?_src_=familiar_prefs;preference=familiar_flavortext;task=input'>Edit description</a></div>"

	dat += "<div class='familiar-card'><h2>Profile <small>Optional</small></h2>"
	dat += "<div class='familiar-field'><span class='familiar-label'>Headshot</span><span class='familiar-value'><a href='?_src_=familiar_prefs;preference=familiar_headshot;task=input'>[familiar_headshot_link ? "Change headshot" : "Add headshot"]</a></span></div>"
	if (familiar_headshot_link)
		dat += "<div class='familiar-headshot'><img src='[html_encode(familiar_headshot_link)]' width='100' height='100' alt='Familiar headshot'></div>"
	dat += "<div class='familiar-field'><span class='familiar-label'>OOC notes</span><span class='familiar-value'><a href='?_src_=familiar_prefs;preference=familiar_ooc_notes;task=input'>[familiar_ooc_notes ? "Edit notes" : "Add notes"]</a></span></div>"
	if (familiar_ooc_notes)
		dat += "<p class='familiar-preview'>[html_encode(copytext(familiar_ooc_notes, 1, 241))][length(familiar_ooc_notes) > 240 ? "..." : ""]</p>"
	dat += "<div class='familiar-field'><span class='familiar-label'>OOC extra</span><span class='familiar-value'><a href='?_src_=familiar_prefs;preference=familiar_ooc_extra;task=input'>[familiar_ooc_extra_link ? "Change media link" : "Add media link"]</a></span></div>"
	dat += "<p class='familiar-hint'>Optional image, video, or audio. Enter a single space in the media prompt to remove it.</p></div>"

	var/datum/browser/popup = new(client.mob, "Be a Familiar", "Be a Familiar", 580, 740)
	popup.set_window_options("can_close=1;can_resize=1;can_minimize=1;can_maximize=1;titlebar=1;")
	popup.add_stylesheet("familiar_preferences", 'html/browser/familiar_preferences.css')
	var/datum/asset/simple/roguefonts/familiar_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = familiar_fonts.get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>")
	popup.set_content(dat.Join())
	popup.open(FALSE)

/datum/familiar_prefs/proc/fam_process_link(mob/user, list/href_list)
	if(!user)
		return

	var/task = href_list["task"]

	switch(href_list["preference"])
		if("familiar_name")
			var/new_name = tgui_input_text(user, "Choose your Familiar character's name:", "Identity", familiar_name, encode = FALSE)
			if(new_name)
				new_name = reject_bad_name(new_name)
				if(new_name)
					familiar_name = new_name
					to_chat(user, "<span class='notice'>Familiar name set to [new_name].</span>")
				else
					to_chat(user, "<font color='red'>Invalid name. Your name should be at least 2 and at most [MAX_NAME_LEN] characters long. It may only contain the characters A-Z, a-z, -, ', . and ,.</font>")
				
		if ("familiar_pronouns")
			var/list/pronoun_options = list(
				"he/him" = HE_HIM,
				"she/her" = SHE_HER,
				"they/them" = THEY_THEM,
				"it/its" = IT_ITS
			)
			var/current_pronoun
			for(var/label in pronoun_options)
				if(pronoun_options[label] == familiar_pronouns)
					current_pronoun = label
					break
			var/choice = tgui_input_list(user, "Select your familiar's pronouns:", "Pronouns", pronoun_options, current_pronoun)
			if(choice)
				familiar_pronouns = pronoun_options[choice]
				to_chat(user, "<span class='notice'>Familiar pronouns set to [choice].</span>")
				
		if("familiar_headshot")
			to_chat(user, "<span class='notice'>Please use a relatively SFW image of the head and shoulder area to maintain immersion level. <b>Do not use a real life photo or unserious images.</b></span>")
			to_chat(user, "<span class='notice'>Ensure it's a direct image link. The photo will be resized to 325x325 pixels.</span>")
			var/new_headshot_link = tgui_input_text(user, "Input the headshot link (https, hosts: gyazo, discord, lensdump, imgbox, catbox, imgbb, filegarden):", "Headshot", familiar_headshot_link, encode = FALSE)
			if(new_headshot_link == null)
				return
			if(new_headshot_link == "")
				familiar_headshot_link = null
				fam_show_ui()
				return
			if(!valid_headshot_link(user, new_headshot_link))
				familiar_headshot_link = null
				fam_show_ui()
				return
			familiar_headshot_link = new_headshot_link
			to_chat(user, "<span class='notice'>Successfully updated Familiar headshot picture</span>")
			log_game("[user] has set their Familiar Headshot image to '[familiar_headshot_link]'.")

		if("familiar_flavortext")
			to_chat(user, "<span class='notice'><b>Flavortext should not include nonphysical nonsensory attributes such as backstory or internal thoughts.</b></span>")
			var/new_flavortext = tgui_input_text(user, "Input your Familiar character description:", "Flavortext", familiar_flavortext, multiline = TRUE, encode = FALSE)
			if(new_flavortext == null)
				return
			if(new_flavortext == "")
				familiar_flavortext = null
				familiar_flavortext_display = null
				fam_show_ui()
				return
			familiar_flavortext = new_flavortext
			var/ft = html_encode(parsemarkdown_basic(familiar_flavortext))
			ft = replacetext(ft, "\n", "<BR>")
			familiar_flavortext_display = ft
			to_chat(user, "<span class='notice'>Successfully updated familiar flavortext</span>")
			log_game("[user] has set their familiar flavortext.")

		if("familiar_ooc_notes")
			var/new_ooc_notes = tgui_input_text(user, "Input your OOC preferences:", "OOC notes", familiar_ooc_notes, multiline = TRUE, encode = FALSE)
			if(new_ooc_notes == null)
				return
			if(new_ooc_notes == "")
				familiar_ooc_notes = null
				familiar_ooc_notes_display = null
				fam_show_ui()
				return
			familiar_ooc_notes = new_ooc_notes
			var/ooc = html_encode(parsemarkdown_basic(familiar_ooc_notes))
			ooc = replacetext(ooc, "\n", "<BR>")
			familiar_ooc_notes_display = ooc
			to_chat(user, "<span class='notice'>Successfully updated Familiar OOC notes.</span>")
			log_game("[user] has set their Familiar OOC notes.")

		if("familiar_ooc_extra")
			to_chat(user, "<span class='notice'>Add a link to an mp3, mp4, or jpg/png (catbox, discord, etc).</span>")
			to_chat(user, "<span class='notice'>Videos are resized to ~300x300. Abuse = ban.</span>")
			to_chat(user, "<font color='#d6d6d6'>Leave a single space to delete it.</font>")
			var/link = input(user, "Input the accessory link (https)", "Familiar OOC Extra", familiar_ooc_extra_link) as text|null
			if(link == null)
				return
			if(link == "")
				link = null
				fam_show_ui()
				return
			if(link == " ")
				familiar_ooc_extra = null
				familiar_ooc_extra_link = null
				to_chat(user, "<span class='notice'>Successfully deleted Familiar OOC Extra.</span>")
				fam_show_ui()
				return
			var/static/list/valid_ext = list("jpg", "jpeg", "png", "gif", "mp4", "mp3")
			if(!valid_headshot_link(user, link, FALSE, valid_ext))
				link = null
				fam_show_ui()
				return
			familiar_ooc_extra_link = link
			var/ext = LOWER_TEXT(splittext(link, ".")[length(splittext(link, "."))])
			var/info
			switch(ext)
				if("jpg", "jpeg", "png", "gif")
					familiar_ooc_extra = "<div align='center'><br><img src='[link]'/></div>"
					info = "an embedded image."
				if("mp4")
					familiar_ooc_extra = "<div align='center'><br><video width='288' height='288' controls><source src='[link]' type='video/mp4'></video></div>"
					info = "a video."
				if("mp3")
					familiar_ooc_extra = "<div align='center'><br><audio controls><source src='[link]' type='audio/mp3'>Your browser does not support the audio element.</audio></div>"
					info = "embedded audio."
			to_chat(user, "<span class='notice'>Successfully updated Familiar OOC Extra with [info]</span>")
			log_game("[user] has set their Familiar OOC Extra to '[link]'.")

		if ("familiar_queue")
			if (task == "join")
				var/datum/preferences/prefs = user?.client?.prefs
				var/datum/familiar_prefs/fam_pref = prefs?.familiar_prefs
				
				if (!fam_pref)
					to_chat(user, "<span class='warning'>Familiar preferences are not initialized.</span>")
					return

				if (!fam_pref.familiar_name || !fam_pref.familiar_flavortext_display || !fam_pref.familiar_specie)
					to_chat(user, "<span class='warning'>You must set your Familiar's name, description, and type before joining the queue.</span>")
					return

				if (!(user.client in GLOB.familiar_queue))
					GLOB.familiar_queue += user.client
					to_chat(user, "<span class='notice'>You have been added to the Familiar queue.</span>")

			else if (task == "leave")
				if (user.client in GLOB.familiar_queue)
					GLOB.familiar_queue -= user.client
					to_chat(user, "<span class='notice'>You have been removed from the Familiar queue.</span>")

		if ("familiar_specie")
			var/list/all_types = GLOB.familiar_types
			var/current_type
			for(var/label in all_types)
				if(all_types[label] == familiar_specie)
					current_type = label
					break
			var/choice = tgui_input_list(user, "Select a Familiar type:", "Familiar Type", all_types, current_type)
			if (choice)
				var/path = all_types[choice]
				if (path)
					familiar_specie = path
					to_chat(user, "<span class='notice'>Familiar type set to [choice]</span>")
					log_game("[user] has set familiar type to [choice]")
				else
					to_chat(user, span_warning("Something went wrong selecting that familiar type."))

	if(user.client)
		fam_show_ui()

/datum/familiar_prefs/proc/load_familiar_prefs(savefile/S)
	S["familiar_name"]					>> familiar_name
	S["familiar_pronouns"]				>> familiar_pronouns
	S["familiar_specie"]				>> familiar_specie
	S["familiar_headshot_link"]			>> familiar_headshot_link
	S["familiar_flavortext"]			>> familiar_flavortext
	S["familiar_ooc_notes"]				>> familiar_ooc_notes
	S["familiar_ooc_extra"]				>> familiar_ooc_extra
	S["familiar_ooc_extra_link"]		>> familiar_ooc_extra_link
	familiar_flavortext_display = familiar_flavortext ? replacetext(html_encode(parsemarkdown_basic(familiar_flavortext)), "\n", "<BR>") : null
	familiar_ooc_notes_display = familiar_ooc_notes ? replacetext(html_encode(parsemarkdown_basic(familiar_ooc_notes)), "\n", "<BR>") : null
	return TRUE

/datum/familiar_prefs/proc/save_familiar_prefs(savefile/S)
	if(istype(S))
		WRITE_FILE(S["familiar_name"] , familiar_name)
		WRITE_FILE(S["familiar_pronouns"] , familiar_pronouns)
		WRITE_FILE(S["familiar_specie"] , familiar_specie)
		WRITE_FILE(S["familiar_headshot_link"] , familiar_headshot_link)
		WRITE_FILE(S["familiar_flavortext"] , familiar_flavortext)
		WRITE_FILE(S["familiar_ooc_notes"] , familiar_ooc_notes)
		WRITE_FILE(S["familiar_ooc_extra"] , familiar_ooc_extra)
		WRITE_FILE(S["familiar_ooc_extra_link"] , familiar_ooc_extra_link)
	return TRUE


