GLOBAL_LIST_EMPTY(preferences_datums)

GLOBAL_LIST_EMPTY(chosen_names)

#define MAX_SONG_TITLE_LENGTH 60

/datum/preferences
	var/client/parent
	//doohickeys for savefiles
	var/path
	var/default_slot = 1				//Holder so it doesn't default to slot 1, rather the last one used
	var/max_save_slots = 60

	//non-preference stuff
	var/muted = 0
	var/last_ip
	var/last_id

	//game-preferences
	var/lastchangelog = ""				//Saved changlog filesize to detect if there was a change
	var/ooccolor = "#c43b23"
	var/asaycolor = "#ff4500"			//This won't change the color for current admins, only incoming ones.
	var/triumphs = 0
	var/enable_tips = TRUE
	var/tip_delay = 500 //tip delay in milliseconds
	// Commend variable on prefs instead of client to prevent reconnect abuse (is persistant on prefs, opposed to not on client)
	var/commendedsomeone = FALSE
	// History tracking for character customization undo
	var/list/customization_history = list()
	// Loadout preset storage - 3 slots for saving/loading character customization
	var/list/loadout_preset_1
	var/list/loadout_preset_2
	var/list/loadout_preset_3
	// Temporary storage for loadout item selection (per-user to prevent race conditions)
	var/list/temp_loadout_selection

	//Antag preferences
	var/list/be_special = list()		//Special role selection
	var/tmp/old_be_special = 0			//Bitflag version of be_special, used to update old savefiles and nothing more
										//If it's 0, that's good, if it's anything but 0, the owner of this prefs file's antag choices were,
										//autocorrected this round, not that you'd need to check that.

	var/UI_style = null
	var/hud_colorblind_palette = HUD_COLORBLIND_NONE
	var/buttons_locked = TRUE
	var/hotkeys = TRUE

	var/chat_on_map = TRUE
	var/showrolls = TRUE
	var/max_chat_length = CHAT_MESSAGE_MAX_LENGTH
	var/see_chat_non_mob = TRUE

	// Custom Keybindings
	var/list/key_bindings = list()
	/// Whether closing keybind setup should return to character preferences.
	var/keybinds_return_to_prefs = TRUE

	var/tgui_fancy = TRUE
	var/tgui_lock = TRUE
	var/tgui_theme = "azure_default"
	var/parchment_skin = "leatherbound"
	var/windowflashing = TRUE
	var/toggles = TOGGLES_DEFAULT
	var/floating_text_toggles = TOGGLES_TEXT_DEFAULT
	var/admin_chat_toggles = TOGGLES_DEFAULT_CHAT_ADMIN
	var/db_flags
	var/chat_toggles = TOGGLES_DEFAULT_CHAT
	var/ghost_form = "ghost"
	var/ghost_orbit = GHOST_ORBIT_CIRCLE
	var/ghost_accs = GHOST_ACCS_DEFAULT_OPTION
	var/ghost_others = GHOST_OTHERS_DEFAULT_OPTION
	var/icon/admin_ghost_icon
	var/ghost_hud = 1
	var/inquisitive_ghost = 1
	var/allow_midround_antag = 1
	var/preferred_map = null
	var/pda_style = MONO
	var/pda_color = "#808000"

	var/uses_glasses_colour = 0

	//character preferences
	var/slot_randomized					//keeps track of round-to-round randomization of the character slot, prevents overwriting
	var/real_name						//our character's name
	var/gender = MALE					//gender of character (well duh) (LETHALSTONE EDIT: this no longer references anything but whether the masculine or feminine model is used)
	var/pronouns = HE_HIM				// LETHALSTONE EDIT: character's pronouns (well duh)
	var/voice_pack = "Default"
	var/voice_type = VOICE_TYPE_MASC	// LETHALSTONE EDIT: the type of soundpack the mob should use
	var/datum/statpack/statpack	= new /datum/statpack/wildcard/fated // LETHALSTONE EDIT: the statpack we're giving our char instead of racial bonuses
	var/datum/virtue/virtue = new /datum/virtue/none // LETHALSTONE EDIT: the virtue we get for not picking a statpack
	var/datum/virtue/virtuetwo = new /datum/virtue/none
	var/list/quirks = list()
	var/selected_title = "None"
	var/age = AGE_ADULT						//age of character
	var/datum/origin/origin
	var/accessory = "Nothing"
	var/detail = "Nothing"
	var/backpack = DBACKPACK				//backpack type
	var/jumpsuit_style = PREF_SUIT		//suit/skirt
	var/hairstyle = "Bald"				//Hair type
	var/hair_color = "000"				//Hair color
	var/facial_hairstyle = "Shaved"	//Face hair type
	var/facial_hair_color = "000"		//Facial hair color
	var/skin_tone = "caucasian1"		//Skin color
	var/mutant_skin = FALSE			//Use mutant color as skin color instead of skin_tone
	var/eye_color = "000"				//Eye color
	var/extra_language = "None" // Extra language
	var/extra_language_1 = "None" // Additional triumph language slot 1
	var/extra_language_2 = "None" // Additional triumph language slot 2
	var/voice_color = "a0a0a0"
	var/voice_pitch = 1
	var/detail_color = "000"
	var/datum/species/pref_species = new /datum/species/human/northern()	//Mutant race
	var/const/datum/species/default_species = /datum/species/human/northern
	var/datum/patron/selected_patron
	var/static/datum/patron/default_patron = /datum/patron/divine/astrata
	var/list/features = MANDATORY_FEATURE_LIST
	var/list/randomise = list(RANDOM_UNDERWEAR = TRUE, RANDOM_UNDERWEAR_COLOR = TRUE, RANDOM_UNDERSHIRT = TRUE, RANDOM_SOCKS = TRUE, RANDOM_BACKPACK = TRUE, RANDOM_JUMPSUIT_STYLE = FALSE, RANDOM_SKIN_TONE = TRUE, RANDOM_EYE_COLOR = TRUE)
	var/list/friendlyGenders = list("male" = "masculine", "female" = "feminine")
	var/phobia = "spiders"
	var/shake = TRUE
	var/no_redflash = FALSE
	var/sexable = FALSE
	var/erp_visuals = TRUE
	var/chastenable = FALSE
	var/chastity_hardmode = CHASTITY_HARDMODE_DISABLED
	var/extreme_erp = FALSE
	var/edging = FALSE
	var/free_use_default = FALSE
	var/sensitive_brands = FALSE
	var/facial_brands = FALSE
	var/pubes = FALSE
	var/pits = FALSE
	var/descriptor_color = FALSE
	/// If a cursed collar can be equipped to them at all
	var/cursed_collarable = FALSE
	var/voting_popup = TRUE
	var/compliance_notifs = TRUE
	var/skillcap_notifs = TRUE
	var/restricted_species_pref = null
	var/wildshape_name = TRUE
	var/xenophobe_pref = 0

	var/list/custom_names = list()
	var/preferred_ai_core_display = "Blue"
	var/prefered_security_department = SEC_DEPT_RANDOM

	//Quirk list
	var/list/all_quirks = list()

	//Job preferences 2.0 - indexed by job title , no key or value implies never
	var/list/job_preferences = list()

		// Want randomjob if preferences already filled - Donkie
	var/joblessrole = RETURNTOLOBBY  //defaults to 1 for fewer assistants

	// 0 = character settings, 1 = game preferences
	var/current_tab = 0
	var/character_sheet_page = "identity"

// Point-buy system helpers
// Base points available to every character
/datum/preferences/proc/get_base_points()
	return 10

/datum/preferences/proc/get_default_redolent_scent(scent_type)
	switch(scent_type)
		if("Gross")
			return "rotting meat and sour sweat"
		if("Pleasant")
			return "wildflowers and clean rain"
	return "earth and sweat"

/// The leading text shown on examine before the custom scent, matching redolent_examine_text().
/datum/preferences/proc/redolent_scent_leadin(scent_type)
	return scent_type == "Gross" ? "They reek of" : "They smell of"

// Points gained from additional selected vices (+1 per vice after slot one)
/datum/preferences/proc/get_vice_points()
	var/points = 0
	for(var/i = 1 to 6)
		if(vars["vice[i]"])
			points++
	return points

// Quirk points gained from selected vices. Your first vice doesn't give any at all.
/datum/preferences/proc/get_quirk_points_earned()
	var/points = 0
	for(var/i = 2 to 6)
		var/datum/charflaw/vice = vars["vice[i]"]
		if(vice)
			points += vice.point_value
	return points

/datum/preferences/proc/get_quirk_points_spent()
	var/points = 0
	for(var/datum/quirk/Q in quirks)
		if(Q)
			points += Q.point_cost
	return points

/datum/preferences/proc/get_quirk_points_remaining()
	return get_quirk_points_earned() - get_quirk_points_spent()

// For when you don't have enough quirk points, you can pay the collateral with triumphs
/datum/preferences/proc/get_triumph_collateral()
	var/remaining = get_quirk_points_remaining()
	if(remaining >= 0)
		return 0
	return -remaining * 2

/datum/preferences/proc/get_quirk_typepaths()
	var/list/types = list()
	for(var/datum/quirk/Q in quirks)
		if(Q)
			types += Q.type
	return types

/datum/preferences/proc/has_quirk(quirk_typepath)
	for(var/datum/quirk/Q in quirks)
		if(Q && Q.type == quirk_typepath)
			return TRUE
	return FALSE

// Points spent on selected loadout items (uses triumph_cost as point cost)
/datum/preferences/proc/get_loadout_points_spent()
	var/spent = 0
	for(var/i = 1 to 10)
		var/datum/loadout_item/L = vars[i == 1 ? "loadout" : "loadout[i]"]
		if(L && L.triumph_cost)
			spent += L.triumph_cost
	return spent

// DEPRECATED - Languages now use actual triumph pool, not vice points
// Kept for backwards compatibility but no longer used in calculations
/datum/preferences/proc/get_language_points_spent()
	var/spent = 0
	if(extra_language_1 && extra_language_1 != "None")
		spent += 2
	if(extra_language_2 && extra_language_2 != "None")
		spent += 4
	return spent

// Total points available = base + points from vices
/datum/preferences/proc/get_total_points()
	return get_base_points() + get_vice_points()

// Legacy proc - remaining points after accounting for both loadouts and languages
// NOTE: Languages now use ACTUAL triumphs (player.get_triumphs()), not vice points
// This proc only calculates loadout point usage now
/datum/preferences/proc/get_remaining_points()
	var/total = get_total_points()
	var/spent = get_loadout_points_spent() // Languages no longer count toward this
	return total - spent


/datum/preferences
	var/unlock_content = 0

	var/list/ignoring = list()

	var/clientfps = 100//0 is sync

	var/parallax

	var/ambientocclusion = TRUE
	var/auto_fit_viewport = FALSE
	var/widescreenpref = TRUE

	var/musicvol = 50
	var/combatmusicvol = 50
	var/lobbymusicvol = 50
	var/ambiencevol = 50
	var/mastervol = 50

	var/anonymize = TRUE
	var/masked_examine = FALSE
	var/top_examine = FALSE
	var/show_mouseover_role = FALSE
	var/nsfw_examine_always = FALSE
	var/mute_animal_emotes = FALSE
	var/autoconsume = FALSE
	var/autowoodcut = TRUE
	var/autopicking = TRUE
	var/runmode = FALSE
	var/no_examine_blocks = FALSE
	var/no_autopunctuate = FALSE
	var/no_language_fonts = FALSE
	var/no_language_icon = FALSE
	var/hide_unavailable_emotes = FALSE
	var/hide_tongue_noise_warnings = FALSE
	var/ghost_protection = FALSE
	var/lastclass

	var/uplink_spawn_loc = UPLINK_PDA

	var/list/exp = list()
	var/list/menuoptions

	var/datum/loadout_menu/loadout_menu

	var/datum/migrant_pref/migrant
	var/next_special_trait = null

	var/action_buttons_screen_locs = list()

	var/domhand = 2
	var/nickname = "Please Change Me"
	var/highlight_color = "#FF0000"
	var/datum/charflaw/charflaw
	// Multiple vice selection (up to 6, slot 1 falls back to No Flaw if cleared)
	var/datum/charflaw/vice1
	var/datum/charflaw/vice2
	var/datum/charflaw/vice3
	var/datum/charflaw/vice4
	var/datum/charflaw/vice5
	var/datum/charflaw/vice6
	var/redolent_type = "Neutral"
	var/redolent_scent = ""

	var/setspouse = ""
	var/gender_choice = ANY_GENDER

	var/static/default_cmusic_type = /datum/combat_music/default
	var/datum/combat_music/combat_music
	var/combat_music_helptext_shown = FALSE

	var/family = FAMILY_NONE

	var/crt = FALSE
	var/grain = TRUE
	var/dnr_pref = FALSE

	var/list/customizer_entries = list()
	var/list/list/body_markings = list()
	var/update_mutant_colors = TRUE

	var/headshot_link
	var/chatheadshot = FALSE
	var/ooc_extra
	var/ooc_extra_img
	var/ooc_extra_img_link
	var/song_artist
	var/song_title
	var/list/descriptor_entries = list()
	var/list/custom_descriptors = list()

	var/char_accent = "No accent"
	var/char_mannerism = "No mannerism"

	// Vocal bark prefs
	var/bark_id = "mutedc3"
	var/bark_speed = 4
	var/bark_pitch = 1
	var/bark_variance = 0.2
	COOLDOWN_DECLARE(bark_previewing)
	COOLDOWN_DECLARE(descriptor_preview)
	var/hear_barks = TRUE

	// PATREON
	// Vrell - I fucking hate how inconsistent the variable style is for this shit. underscores? all lowercase? camelcase?
	var/patreon_say_color = "ff7a05"
	var/patreon_say_color_enabled = FALSE
	// END PATREON


	var/prefer_loadout_wearables = FALSE
	var/datum/loadout_item/loadout
	var/datum/loadout_item/loadout2
	var/datum/loadout_item/loadout3
	var/datum/loadout_item/loadout4
	var/datum/loadout_item/loadout5
	var/datum/loadout_item/loadout6
	var/datum/loadout_item/loadout7
	var/datum/loadout_item/loadout8
	var/datum/loadout_item/loadout9
	var/datum/loadout_item/loadout10

	var/loadout_1_hex
	var/loadout_2_hex
	var/loadout_3_hex
	var/loadout_4_hex
	var/loadout_5_hex
	var/loadout_6_hex
	var/loadout_7_hex
	var/loadout_8_hex
	var/loadout_9_hex
	var/loadout_10_hex

	// Custom names for loadout items
	var/loadout_1_name
	var/loadout_2_name
	var/loadout_3_name
	var/loadout_4_name
	var/loadout_5_name
	var/loadout_6_name
	var/loadout_7_name
	var/loadout_8_name
	var/loadout_9_name
	var/loadout_10_name

	// Custom descriptions for loadout items
	var/loadout_1_desc
	var/loadout_2_desc
	var/loadout_3_desc
	var/loadout_4_desc
	var/loadout_5_desc
	var/loadout_6_desc
	var/loadout_7_desc
	var/loadout_8_desc
	var/loadout_9_desc
	var/loadout_10_desc

	var/flavortext
	var/flavortext_display

	var/ooc_notes

	var/rumour

	var/noble_gossip

	var/nsfwflavortext

	var/nsfw_ooc_extra_img
	var/nsfw_ooc_extra_img_link

	var/erpprefs

	var/list/img_gallery = list()

	var/list/nsfw_img_gallery = list()

	var/datum/familiar_prefs/familiar_prefs
	var/datum/gnoll_prefs/gnoll_prefs

	var/taur_type = null
	var/taur_color = "ffffff"
	var/taur_markings = "ffffff"
	var/taur_tertiary = "ffffff"

	/// Assoc list of culinary preferences, where the key is the type of the culinary preference, and value is food/drink typepath
	var/list/culinary_preferences = list()

	var/datum/advclass/preview_subclass

	var/preview_erect_state = ERECT_STATE_NONE//toggle pintle floppy, half-chubbed, or full mast on preview dummy.

	var/tgui_pref = TRUE

	var/race_bonus

/datum/preferences/New(client/C)
	parent = C
	migrant  = new /datum/migrant_pref(src)
	familiar_prefs = new /datum/familiar_prefs(src)
	gnoll_prefs = new /datum/gnoll_prefs(src)

	for(var/custom_name_id in GLOB.preferences_custom_names)
		custom_names[custom_name_id] = get_default_name(custom_name_id)

	UI_style = GLOB.available_ui_styles[1]
	if(istype(C))
		if(!IsGuestKey(C.key))
			load_path(C.ckey)
			unlock_content = C.IsByondMember()
			if(unlock_content)
				max_save_slots = 100
	var/loaded_preferences_successfully = load_preferences()
	if(loaded_preferences_successfully)
		if(load_character())
			if(check_nameban(C.ckey) || (C.blacklisted() == 1))
				real_name = pref_species.random_name(gender,1)
			return
	//Set the race to properly run race setter logic
	set_new_race(pref_species, null)
	if(!charflaw)
		charflaw = pick(GLOB.character_flaws)
		charflaw = GLOB.character_flaws[charflaw]
		charflaw = new charflaw()
	if(!selected_patron)
		selected_patron = GLOB.patronlist[default_patron]
	if(!combat_music)
		combat_music = GLOB.cmode_tracks_by_type[default_cmusic_type]
	key_bindings = deepCopyList(GLOB.hotkey_keybinding_list_by_key) // give them default keybinds and update their movement keys
	C?.update_movement_keys()
	if(!loaded_preferences_successfully)
		save_preferences()
	save_character()		//let's save this new random character so it doesn't keep generating new ones.
	menuoptions = list()
	return

/datum/preferences/proc/get_roguehud_icon()
	return roguehud_icon_for_palette(hud_colorblind_palette)

/datum/preferences/proc/get_rogueheat_icon()
	return rogueheat_icon_for_palette(hud_colorblind_palette)

/datum/preferences/proc/set_hud_colorblind_palette(new_palette)
	if(!is_hud_colorblind_palette(new_palette))
		return FALSE
	hud_colorblind_palette = new_palette
	return TRUE

/datum/preferences/proc/set_new_race(datum/species/new_race, user)
	pref_species = new_race
	real_name = pref_species.random_name(gender,1)
	ResetJobs()
	if(user)
		if(pref_species.desc)
			to_chat(user, "[pref_species.desc]")
		if(pref_species.expanded_desc)
			to_chat(user, "<a href='?src=[REF(user)];view_species_info=[pref_species.expanded_desc]'>Read More</a>")
		to_chat(user, "<font color='red'>Classes reset.</font>")
	random_character(gender, FALSE, FALSE)
	accessory = "Nothing"

	if(pref_species.forced_taur && pref_species.allowed_taur_types.len)
		taur_type = pick(pref_species.allowed_taur_types)
	else
		taur_type = null

	selected_title = "None"

	customizer_entries = list()
	validate_customizer_entries()
	reset_all_customizer_accessory_colors()
	randomize_all_customizer_accessories()
	reset_descriptors()


#define APPEARANCE_CATEGORY_COLUMN "<td valign='top' width='14%'>"
#define MAX_MUTANT_ROWS 4

/datum/preferences/proc/ShowChoices(mob/user, tabchoice)
	if(!user || !user.client)
		return
	if(slot_randomized)
		load_character(default_slot) // Reloads the character slot. Prevents random features from overwriting the slot if saved.
		slot_randomized = FALSE
	if(parent && !parent.is_new_player())
		validate_character_species()
		normalize_character_identity()
	var/list/dat = list("<div class='character-sheet'>")
	if(tabchoice)
		current_tab = tabchoice
	if(tabchoice == 4)
		current_tab = 0

	var/list/sheet_window_size = splittext(winget(user, "preferencess_window", "size"), "x")
	if(!user?.client)
		return
	var/sheet_window_width = length(sheet_window_size) == 2 ? text2num(sheet_window_size[1]) : 820
	var/sheet_window_height = length(sheet_window_size) == 2 ? text2num(sheet_window_size[2]) : 850
	var/show_sheet_preview = current_tab == 0 && character_sheet_page == "appearance" && sheet_window_width >= 640 && sheet_window_height >= 520 && !user.client.is_new_player()
	var/used_title
	switch(current_tab)
		if (0) // Character Settings
			used_title = "Character Sheet"
			var/list/identity = list()
			var/list/heritage = list()
			var/list/calling = list()
			var/list/round_options = list()
			var/list/appearance = list()
			var/list/voice = list()
			var/list/bark = list()
			var/list/record = list()
			var/list/media = list()
			if(is_banned_from(user.ckey, "Appearance"))
				identity += "<p class='sheet-warning'>Custom names and appearances are restricted for this account. You may adjust this character, but appearance will be randomised when joining.</p>"
			identity += "<div class='sheet-field'><span class='sheet-label'>Name</span><span class='sheet-value'>"
			if(check_nameban(user.ckey))
				identity += "<a href='?_src_=prefs;preference=name;task=input'>NAMEBANNED</a>"
			else
				identity += "<a href='?_src_=prefs;preference=name;task=input'>[html_encode(real_name)]</a> <a href='?_src_=prefs;preference=name;task=random'>Random</a>"
			identity += "</span></div>"
			identity += "<div class='sheet-field'><span class='sheet-label'>Nickname</span><span class='sheet-value'><a href='?_src_=prefs;preference=nickname;task=input'>[html_encode(nickname ? nickname : "Not set")]</a></span></div>"
			// LETHALSTONE EDIT BEGIN: add pronoun prefs
			identity += "<div class='sheet-field'><span class='sheet-label'>Pronouns</span><span class='sheet-value'><a href='?_src_=prefs;preference=pronouns;task=input'>[pronouns]</a></span></div>"
			// LETHALSTONE EDIT END
			if(!voice_pack)
				voice_pack = "Default"
			// LETHALSTONE EDIT BEGIN: add voice type prefs
			voice += "<div class='sheet-field'><span class='sheet-label'>Voice identity</span><span class='sheet-value'><a href='?_src_=prefs;preference=voicetype;task=input'>[voice_type]</a></span></div>"
			// LETHALSTONE EDIT END
			voice += "<div class='sheet-field'><span class='sheet-label'>Voice pack</span><span class='sheet-value'><a href='?_src_=prefs;preference=voicepack;task=input'>[voice_pack]</a></span></div>"

			heritage += "<h3>Heritage</h3>"
			heritage += "<div class='sheet-field'><span class='sheet-label'>Race</span><span class='sheet-value'><a href='?_src_=prefs;preference=species;task=input'>[pref_species.name]</a>[spec_check(user) ? "" : " <span class='sheet-warning'>Unavailable</span>"]</span></div>"
			if(pref_species.use_titles)
				var/display_title = selected_title ? selected_title : "None"
				heritage += "<div class='sheet-field'><span class='sheet-label'>Race Title</span><span class='sheet-value'><a href='?_src_=prefs;preference=race_title;task=input'>[display_title]</a></span></div>"
			heritage += "<div class='sheet-field'><span class='sheet-label'>Family</span><span class='sheet-value'><a href='?_src_=prefs;preference=family'>[family ? family : "None"]</a></span></div>"
			if(family != FAMILY_NONE)
				var/spousename = "Preferred Spouse"
				if(family == FAMILY_PARTIAL)
					spousename = "Preferred Parent"
				heritage += "<div class='sheet-field'><span class='sheet-label'>[spousename]</span><span class='sheet-value'><a href='?_src_=prefs;preference=setspouse'>[setspouse ? setspouse : "None"]</a></span></div>"
				if(family != FAMILY_NONE)
					heritage += "<div class='sheet-field'><span class='sheet-label'>Preferred Gender</span><span class='sheet-value'><a href='?_src_=prefs;preference=gender_choice'>[gender_choice ? gender_choice : "Any Gender"]</a></span></div>"
					var/species_text
					if(xenophobe_pref == 1)
						species_text = "<font color='#FFA500'>Same Race</font>"
					else if(xenophobe_pref == 2 && restricted_species_pref)
						species_text = "<font color='#aa0202'>[restricted_species_pref] Only</font>"
					else
						species_text = "<font color='#1cb308'>Unrestricted</font>"
					heritage += "<div class='sheet-field'><span class='sheet-label'>Restrict Species</span><span class='sheet-value'><a href='?_src_=prefs;preference=species_choice'>[species_text]</a></span></div>"
			if(length(pref_species.custom_selection))
				var/race_bonus_display
				if(race_bonus)
					for(var/bonus in pref_species.custom_selection)
						if(pref_species.custom_selection[bonus] == race_bonus)
							race_bonus_display = bonus
							break
				heritage += "<div class='sheet-field'><span class='sheet-label'>Race Bonus</span><span class='sheet-value'><a href='?_src_=prefs;preference=race_bonus_select;task=input'>[race_bonus_display ? "[race_bonus_display]" : "None"]</a></span></div>"
			else
				race_bonus = null
				heritage += "<BR>"


			if(!(AGENDER in pref_species.species_traits))
				var/dispGender
				if(gender == MALE)
					dispGender = "Masculine" // LETHALSTONE EDIT: repurpose gender as bodytype, display accordingly
				else if(gender == FEMALE)
					dispGender = "Feminine" // LETHALSTONE EDIT: repurpose gender as bodytype, display accordingly
				else
					dispGender = "Other"
				appearance += "<div class='sheet-field'><span class='sheet-label'>Body Type</span><span class='sheet-value'><a href='?_src_=prefs;preference=gender'>[dispGender]</a></span></div>"
				if(randomise[RANDOM_BODY] || randomise[RANDOM_BODY_ANTAG]) //doesn't work unless random body
					appearance += "<a href='?_src_=prefs;preference=toggle_random;random_type=[RANDOM_GENDER]'>Always Random Bodytype: [(randomise[RANDOM_GENDER]) ? "Yes" : "No"]</A>"
					appearance += "<a href='?_src_=prefs;preference=toggle_random;random_type=[RANDOM_GENDER_ANTAG]'>When Antagonist: [(randomise[RANDOM_GENDER_ANTAG]) ? "Yes" : "No"]</A>"

			if(LAZYLEN(pref_species.allowed_taur_types))
				var/obj/item/bodypart/taur/T = taur_type
				var/name = ispath(T) ? T::name : "None"
				appearance += "<div class='sheet-field'><span class='sheet-label'>Taur Body Type</span><span class='sheet-value'><a href='?_src_=prefs;preference=taur_type;task=input'>[name]</a></span></div>"
				appearance += "<div class='sheet-field'><span class='sheet-label'>Taur Color</span><span class='sheet-value'><span style='border: 1px solid #161616; background-color: #[taur_color];'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> <a href='?_src_=prefs;preference=taur_color;task=input'>Change</a></span></div>"
				appearance += "<div class='sheet-field'><span class='sheet-label'>Taur Markings</span><span class='sheet-value'><span style='border: 1px solid #161616; background-color: #[taur_markings];'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> <a href='?_src_=prefs;preference=taur_markings;task=input'>Change</a></span></div>"
				appearance += "<div class='sheet-field'><span class='sheet-label'>Taur Tertiary</span><span class='sheet-value'><span style='border: 1px solid #161616; background-color: #[taur_tertiary];'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> <a href='?_src_=prefs;preference=taur_tertiary;task=input'>Change</a></span></div>"

			identity += "<div class='sheet-field'><span class='sheet-label'>Age</span><span class='sheet-value'><a href='?_src_=prefs;preference=age;task=input'>[age]</a></span></div>"
			identity += "<div class='sheet-field'><span class='sheet-label'>Origin</span><span class='sheet-value'><a href='?_src_=prefs;preference=origin;task=input'>[origin ? origin.name : "None"]</a></span></div>"


			if(length(pref_species.restricted_virtues))
				if(virtue.type in pref_species.restricted_virtues)
					virtue = GLOB.virtues[/datum/virtue/none]
				if(virtuetwo.type in pref_species.restricted_virtues)
					virtuetwo = GLOB.virtues[/datum/virtue/none]
			if(length(pref_species.restricted_quirks))
				for(var/datum/quirk/Q in quirks)
					if(Q.type in pref_species.restricted_quirks)
						quirks -= Q
			if(statpack.name != "Virtuous")
				virtuetwo = GLOB.virtues[/datum/virtue/none]
			calling += "<h3>Beliefs &amp; calling</h3>"
			var/datum/faith/selected_faith = GLOB.faithlist[selected_patron?.associated_faith]
			calling += "<div class='sheet-field'><span class='sheet-label'>Faith</span><span class='sheet-value'><a href='?_src_=prefs;preference=faith;task=input'>[selected_faith?.name || "Not selected"]</a></span></div>"
			calling += "<div class='sheet-field'><span class='sheet-label'>Patron</span><span class='sheet-value'><a href='?_src_=prefs;preference=patron;task=input'>[selected_patron?.name || "Not selected"]</a></span></div>"
			calling += "<div class='sheet-field'><span class='sheet-label'>Dominance</span><span class='sheet-value'><a href='?_src_=prefs;preference=domhand'>[domhand == 1 ? "Left-handed" : "Right-handed"]</a></span></div>"
			calling += "<div class='sheet-field'><span class='sheet-label'>Food Preferences</span><span class='sheet-value'><a href='?_src_=prefs;preference=culinary;task=menu'>Change</a></span></div>"

			var/musicname = (combat_music.shortname ? combat_music.shortname : combat_music.name)
			round_options += "<div class='sheet-field'><span class='sheet-label'>Combat Music</span><span class='sheet-value'><a href='?_src_=prefs;preference=combat_music;task=input'>[musicname || "Not selected"]</a></span></div>"

			round_options += "<div class='sheet-field'><span class='sheet-label'>Unrevivable</span><span class='sheet-value'><a href='?_src_=prefs;preference=dnr;task=input'>[dnr_pref ? "Yes" : "No"]</a></span></div>"

			round_options += "<div class='sheet-field'><span class='sheet-label'>Be a Familiar</span><span class='sheet-value'><a href='?_src_=prefs;preference=familiar_prefs;task=input'>Familiar Preferences</a></span></div>"

			round_options += "<div class='sheet-field'><span class='sheet-label'>Preferred Map</span><span class='sheet-value'><a href='?_src_=prefs;preference=preferred_map;task=input'>[preferred_map || "No Preference"]</a></span></div>"

			round_options += "<div class='sheet-field'><span class='sheet-label'>Gnoll Customization</span><span class='sheet-value'><a href='?_src_=prefs;preference=gnoll_prefs;task=input'>Gnoll Preferences</a></span></div>"
			var/datum/bark/B = GLOB.bark_list[bark_id]
			bark += "<h3>Voice preview</h3>"
			bark += "<div class='sheet-field'><span class='sheet-label'>Vocal Bark Sound</span><span class='sheet-value'><a href='?_src_=prefs;preference=barksound;task=input'>[B ? initial(B.name) : "INVALID"]</a></span></div>"
			bark += "<div class='sheet-field'><span class='sheet-label'>Vocal Bark Speed</span><span class='sheet-value'><a href='?_src_=prefs;preference=barkspeed;task=input'>[bark_speed]</a></span></div>"
			bark += "<div class='sheet-field'><span class='sheet-label'>Vocal Bark Pitch</span><span class='sheet-value'><a href='?_src_=prefs;preference=barkpitch;task=input'>[bark_pitch]</a></span></div>"
			bark += "<div class='sheet-field'><span class='sheet-label'>Vocal Bark Variance</span><span class='sheet-value'><a href='?_src_=prefs;preference=barkvary;task=input'>[bark_variance]</a></span></div>"
			bark += "<b><a href='?_src_=prefs;preference=barkpreview;task=input'>Preview Bark</a></b><br>"
			appearance += "<h3>Portrait preview</h3>"
			var/datum/job/highest_pref = get_preview_job()
			if(preview_subclass && !(preview_subclass.type in highest_pref?.job_subclasses))
				preview_subclass = null
			if(!isnull(highest_pref) && !istype(highest_pref, /datum/job/roguetown/jester))
				appearance += "<div class='sheet-field'><span class='sheet-label'>Subclass Preview</span><span class='sheet-value'><a href='?_src_=prefs;preference=subclassoutfit;task=input'>[preview_subclass ? html_encode(preview_subclass.name) : "None"]</a></span></div>"
			else
				preview_subclass = null
			var/arousal_preview_label
			switch(preview_erect_state)
				if(ERECT_STATE_PARTIAL)
					arousal_preview_label = "Partial"
				if(ERECT_STATE_HARD)
					arousal_preview_label = "Hard"
				else
					arousal_preview_label = "None"
			appearance += "<div class='sheet-field'><span class='sheet-label'>Arousal Preview</span><span class='sheet-value'><a href='?_src_=prefs;preference=preview_erect_state'>[arousal_preview_label]</a></span></div>"
			appearance += "<h3>Colour &amp; complexion</h3>"
			appearance += "<div class='sheet-field'><span class='sheet-label'>Match feature colours</span><span class='sheet-value'><a href='?_src_=prefs;preference=update_mutant_colors;task=input'>[update_mutant_colors ? "Yes" : "No"]</a></span></div>"
			var/use_skintones = pref_species.use_skintones
			if(use_skintones)

				var/skin_tone_wording = pref_species.skin_tone_wording // Both the skintone names and the word swap here is useless fluff

				appearance += "<div class='sheet-field'><span class='sheet-label'>[skin_tone_wording]</span><span class='sheet-value'><a href='?_src_=prefs;preference=s_tone;task=input'>Change </a></span></div>"
				if(pref_species.mutant_skin_option)
					appearance += "<div class='sheet-field'><span class='sheet-label'>Mutant Skintone</span><span class='sheet-value'><a href='?_src_=prefs;preference=mutant_skin;task=input'>[mutant_skin ? "Yes" : "No"]</a></span></div>"

			if((MUTCOLORS in pref_species.species_traits) || (MUTCOLORS_PARTSONLY in pref_species.species_traits))

				appearance += "<div class='sheet-field'><span class='sheet-label'>Mutant Color #1</span><span class='sheet-value'><span style='border: 1px solid #161616; background-color: #[features["mcolor"]];'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> <a href='?_src_=prefs;preference=mutant_color;task=input'>Change</a></span></div>"
				appearance += "<div class='sheet-field'><span class='sheet-label'>Mutant Color #2</span><span class='sheet-value'><span style='border: 1px solid #161616; background-color: #[features["mcolor2"]];'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> <a href='?_src_=prefs;preference=mutant_color2;task=input'>Change</a></span></div>"
				appearance += "<div class='sheet-field'><span class='sheet-label'>Mutant Color #3</span><span class='sheet-value'><span style='border: 1px solid #161616; background-color: #[features["mcolor3"]];'>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> <a href='?_src_=prefs;preference=mutant_color3;task=input'>Change</a></span></div>"

			voice += "<h3>Voice &amp; presence</h3><div class='sheet-field'><span class='sheet-label'>Voice Color</span><span class='sheet-value'><a href='?_src_=prefs;preference=voice;task=input'>Change</a></span></div>"
			voice += "<div class='sheet-field'><span class='sheet-label'>Nickname Color</span><span class='sheet-value'><a href='?_src_=prefs;preference=highlight_color;task=input'>Change</a></span></div>"
			voice += "<div class='sheet-field'><span class='sheet-label'>Voice Pitch</span><span class='sheet-value'><a href='?_src_=prefs;preference=voice_pitch;task=input'>[voice_pitch]</a></span></div>"
			voice += "<div class='sheet-field'><span class='sheet-label'>Accent</span><span class='sheet-value'><a href='?_src_=prefs;preference=char_accent;task=input'>[char_accent]</a></span></div>"
			voice += "<div class='sheet-field'><span class='sheet-label'>Speech Mannerism</span><span class='sheet-value'><a href='?_src_=prefs;preference=char_mannerism;task=input'>[char_mannerism]</a></span></div>"
			appearance += "<h3>Details &amp; markings</h3><div class='sheet-field'><span class='sheet-label'>Features</span><span class='sheet-value'><a href='?_src_=prefs;preference=customizers;task=menu'>Change</a></span></div>"
			appearance += "<div class='sheet-field'><span class='sheet-label'>Sprite scale</span><span class='sheet-value'><a href='?_src_=prefs;preference=body_size;task=input'>[(features["body_size"] * 100)]%</a></span></div>"
			appearance += "<div class='sheet-field'><span class='sheet-label'>Markings</span><span class='sheet-value'><a href='?_src_=prefs;preference=markings;task=menu'>Change</a></span></div>"
			appearance += "<div class='sheet-field'><span class='sheet-label'>Descriptors</span><span class='sheet-value'><a href='?_src_=prefs;preference=descriptors;task=menu'>Change</a></span></div>"
			media += "<div class='sheet-field'><span class='sheet-label'>Headshot</span><span class='sheet-value'><a href='?_src_=prefs;preference=headshot;task=input'>Change</a></span></div>"
			if(headshot_link != null)
				media += "<br><img src='[headshot_link]' width='100px' height='100px'>"

			record += "<div class='sheet-field'><span class='sheet-label [(length(flavortext) < MINIMUM_FLAVOR_TEXT) ? "sheet-warning" : ""]'>Flavour text</span><span class='sheet-value'><a href='?_src_=prefs;preference=formathelp;task=input'>(?)</a><a href='?_src_=prefs;preference=flavortext;task=input'>Change</a></span></div>"
			record += "<div class='sheet-field'><span class='sheet-label'>Adult flavour text</span><span class='sheet-value'><a href='?_src_=prefs;preference=formathelp;task=input'>(?)</a><a href='?_src_=prefs;preference=nsfwflavortext;task=input'>Change</a></span></div>"
			record += "<div class='sheet-field'><span class='sheet-label [(length(ooc_notes) < MINIMUM_OOC_NOTES) ? "sheet-warning" : ""]'>OOC Notes</span><span class='sheet-value'><a href='?_src_=prefs;preference=formathelp;task=input'>(?)</a><a href='?_src_=prefs;preference=ooc_notes;task=input'>Change</a></span></div>"

			// Rumours / Gossip
			record += "<div class='sheet-field'><span class='sheet-label'>Rumours &amp; gossip</span><span class='sheet-value'><a href='?_src_=prefs;preference=formathelp;task=input'>(?)</a><a href='?_src_=prefs;preference=rumour;task=input'>Set Rumours</a><a href='?_src_=prefs;preference=gossip;task=input'>Set Gossip</a><a href='?_src_=prefs;preference=rumour_preview;task=input'><i>Preview</i></a></span></div>"

			record += "<div class='sheet-field'><span class='sheet-label'>ERP Preferences</span><span class='sheet-value'><a href='?_src_=prefs;preference=formathelp;task=input'>(?)</a><a href='?_src_=prefs;preference=erpprefs;task=input'>Change</a></span></div>"
			media += "<div class='sheet-field'><span class='sheet-label'>Song</span><span class='sheet-value'><a href='?_src_=prefs;preference=ooc_extra;task=input'>Change URL</a><a href='?_src_=prefs;preference=change_title;task=input'>Change Title</a><a href='?_src_=prefs;preference=change_artist;task=input'>Change Artist</a></span></div>"
			media += "<div class='sheet-field'><span class='sheet-label'>Profile media</span><span class='sheet-value'><a href='?_src_=prefs;preference=ooc_extra_img;task=input'>Change</a></span></div>"
			if(ooc_extra_img_link != null)
				media += "<br><img src='[ooc_extra_img_link]' width='100px' height='100px'>"
			media += "<div class='sheet-field'><span class='sheet-label'>Adult profile media</span><span class='sheet-value'><a href='?_src_=prefs;preference=nsfw_ooc_extra_img;task=input'>Change</a></span></div>"
			if(nsfw_ooc_extra_img_link != null)
				media += "<br><img src='[nsfw_ooc_extra_img_link]' width='100px' height='100px'>"
			media += "<div class='sheet-field'><span class='sheet-label'>Image Gallery</span><span class='sheet-value'><a href='?_src_=prefs;preference=img_gallery;task=input'>Add</a><a href='?_src_=prefs;preference=clear_gallery;task=input'>Clear Gallery</a></span></div>"
			media += "<div class='sheet-field'><span class='sheet-label'>Adult gallery</span><span class='sheet-value'><a href='?_src_=prefs;preference=nsfw_img_gallery;task=input'>Add</a><a href='?_src_=prefs;preference=clear_nsfw_gallery;task=input'>Clear gallery</a></span></div>"
			media += "<a class='sheet-primary' href='?_src_=prefs;preference=ooc_preview;task=input'>Preview Examine</a>"

			dat += "<div class='sheet-masthead'><div class='sheet-heading'><h1>[html_encode(real_name)] <small>Character [default_slot]</small></h1><p>[html_encode(pref_species.name)] &middot; [html_encode(age)] &middot; [html_encode(origin ? origin.name : "No origin selected")]</p></div>"
			dat += "<div class='sheet-navigation'><a href='?_src_=prefs;preference=changeslot;'>Change Character</a><a href='?_src_=prefs;preference=job;task=menu'>Choose Class</a>"
			dat += "<a class='sheet-primary' href='?_src_=prefs;preference=vices_menu;task=input'>Traits &amp; Gear</a><a href='?_src_=prefs;preference=antag;task=menu'>Villain Selection</a></div></div>"
			var/list/sheet_pages = list("identity" = "Identity", "appearance" = "Appearance", "voice" = "Voice", "record" = "Chronicle", "settings" = "Settings")
			dat += "<nav class='sheet-tabs' aria-label='Character pages'>"
			for(var/page_id in sheet_pages)
				dat += "<a class='[character_sheet_page == page_id ? "sheet-tab-active" : ""]' href='?_src_=prefs;preference=sheet_page;page=[page_id]' [character_sheet_page == page_id ? "aria-current='page'" : ""]>[sheet_pages[page_id]]</a>"
			dat += "</nav><div class='sheet-main [show_sheet_preview ? "sheet-main--portrait" : ""]'>"
			switch(character_sheet_page)
				if("identity")
					dat += "<div class='sheet-grid'>"
					dat += "<section class='sheet-column'><h3>Personal details</h3><div class='sheet-fields'>[identity.Join()]</div>"
					if(CONFIG_GET(flag/roundstart_traits))
						dat += "<h3>Quirks</h3><a href='?_src_=prefs;preference=trait;task=menu'>Configure Quirks</a><p>[all_quirks.len ? html_encode(all_quirks.Join(", ")) : "No quirks selected."]</p>"
					dat += "</section><section class='sheet-column'><div class='sheet-fields'>[heritage.Join()][calling.Join()]</div></section></div>"
				if("appearance")
					dat += "<div class='sheet-fields'>[appearance.Join()]</div>"
				if("voice")
					dat += "<div class='sheet-grid'><section class='sheet-column'><div class='sheet-fields'>[voice.Join()]</div></section><section class='sheet-column'><div class='sheet-fields'>[bark.Join()]</div></section></div>"
				if("record")
					dat += "<div class='sheet-grid'><section class='sheet-column'><h3>Character &amp; player notes</h3><div class='sheet-fields sheet-fields--stacked'>[record.Join()]</div></section><section class='sheet-column'><h3>Portrait &amp; accompanying media</h3><div class='sheet-fields sheet-fields--stacked'>[media.Join()]</div></section></div>"
				if("settings")
					dat += "<div class='sheet-grid'><section class='sheet-column'><h3>Presentation</h3><div class='sheet-fields'>"
					dat += "<div class='sheet-field'><span class='sheet-label'>Options</span><span class='sheet-value'><a href='?_src_=prefs;preference=tgui_ui_prefs;task=menu'>[tgui_pref ? "TGUI" : "Legacy"]</a></span></div><div class='sheet-field'><span class='sheet-label'>Theme</span><span class='sheet-value'><a href='?_src_=prefs;preference=tgui_theme'>[html_encode(get_tgui_theme_display_name())]</a></span></div><div class='sheet-field'><span class='sheet-label'>Parchment</span><span class='sheet-value'><a href='?_src_=prefs;preference=parchment_skin'>[html_encode(get_parchment_skin_display_name())]</a></span></div>"
					dat += "<div class='sheet-field'><span class='sheet-label'>Ambient occlusion</span><span class='sheet-value'><a href='?_src_=prefs;preference=ambientocclusion'>[ambientocclusion ? "Enabled" : "Disabled"]</a></span></div><div class='sheet-field'><span class='sheet-label'>Be voice</span><span class='sheet-value'><a href='?_src_=prefs;preference=schizo_voice'>[(toggles & SCHIZO_VOICE) ? "Enabled" : "Disabled"]</a></span></div><div class='sheet-field'><span class='sheet-label'>Admin sounds</span><span class='sheet-value'><a href='?_src_=prefs;preference=hear_midis'>[(toggles & SOUND_MIDI) ? "Enabled" : "Disabled"]</a></span></div></div></section>"
					dat += "<section class='sheet-column'><h3>Controls &amp; standing</h3><a href='?_src_=prefs;preference=keybinds;task=menu'>Configure Keybinds</a><div class='sheet-standing'><a href='?_src_=prefs;preference=playerquality;task=menu'>Player Quality</a> [get_playerquality(user.ckey, text = TRUE)]<br><a href='?_src_=prefs;preference=triumphs;task=menu'>Triumphs</a> [user.get_triumphs()]"
					if(SStriumphs.triumph_buys_enabled)
						dat += "<br><a href='?_src_=prefs;preference=triumph_buy_menu'>Triumph Buy</a>"
					dat += "</div><h3>Round preferences</h3><div class='sheet-fields'>[round_options.Join()]</div></section></div>"
			dat += "</div>"
			if(show_sheet_preview)
				dat += "<aside class='sheet-portrait'><h3>Preview</h3><div class='sheet-portrait-space'></div></aside>"

		if (1) // Game Preferences
			used_title = "Options"
			dat += "<table><tr><td width='340px' height='300px' valign='top'>"
			dat += "<h2>General Settings</h2>"
//			dat += "<b>UI Style:</b> <a href='?_src_=prefs;task=input;preference=ui'>[UI_style]</a><br>"
			dat += "<b>tgui Monitors:</b> <a href='?_src_=prefs;preference=tgui_lock'>[(tgui_lock) ? "Primary" : "All"]</a><br>"
//			dat += "<b>tgui Style:</b> <a href='?_src_=prefs;preference=tgui_fancy'>[(tgui_fancy) ? "Fancy" : "No Frills"]</a><br>"
//			dat += "<b>Show Runechat Chat Bubbles:</b> <a href='?_src_=prefs;preference=chat_on_map'>[chat_on_map ? "Enabled" : "Disabled"]</a><br>"
//			dat += "<b>Runechat message char limit:</b> <a href='?_src_=prefs;preference=max_chat_length;task=input'>[max_chat_length]</a><br>"
//			dat += "<b>See Runechat for non-mobs:</b> <a href='?_src_=prefs;preference=see_chat_non_mob'>[see_chat_non_mob ? "Enabled" : "Disabled"]</a><br>"
//			dat += "<br>"
//			dat += "<b>Action Buttons:</b> <a href='?_src_=prefs;preference=action_buttons'>[(buttons_locked) ? "Locked In Place" : "Unlocked"]</a><br>"
//			dat += "<b>Hotkey mode:</b> <a href='?_src_=prefs;preference=hotkeys'>[(hotkeys) ? "Hotkeys" : "Default"]</a><br>"
//			dat += "<br>"
//			dat += "<b>PDA Color:</b> <span style='border:1px solid #161616; background-color: [pda_color];'>&nbsp;&nbsp;&nbsp;</span> <a href='?_src_=prefs;preference=pda_color;task=input'>Change</a><BR>"
//			dat += "<b>PDA Style:</b> <a href='?_src_=prefs;task=input;preference=pda_style'>[pda_style]</a><br>"
//			dat += "<br>"
//			dat += "<b>Ghost Ears:</b> <a href='?_src_=prefs;preference=ghost_ears'>[(chat_toggles & CHAT_GHOSTEARS) ? "All Speech" : "Nearest Creatures"]</a><br>"
//			dat += "<b>Ghost Radio:</b> <a href='?_src_=prefs;preference=ghost_radio'>[(chat_toggles & CHAT_GHOSTRADIO) ? "All Messages":"No Messages"]</a><br>"
//			dat += "<b>Ghost Sight:</b> <a href='?_src_=prefs;preference=ghost_sight'>[(chat_toggles & CHAT_GHOSTSIGHT) ? "All Emotes" : "Nearest Creatures"]</a><br>"
//			dat += "<b>Ghost Whispers:</b> <a href='?_src_=prefs;preference=ghost_whispers'>[(chat_toggles & CHAT_GHOSTWHISPER) ? "All Speech" : "Nearest Creatures"]</a><br>"
//			dat += "<b>Ghost PDA:</b> <a href='?_src_=prefs;preference=ghost_pda'>[(chat_toggles & CHAT_GHOSTPDA) ? "All Messages" : "Nearest Creatures"]</a><br>"

/*			if(unlock_content)
				dat += "<b>Ghost Form:</b> <a href='?_src_=prefs;task=input;preference=ghostform'>[ghost_form]</a><br>"
				dat += "<B>Ghost Orbit: </B> <a href='?_src_=prefs;task=input;preference=ghostorbit'>[ghost_orbit]</a><br>"

			var/button_name = "If you see this something went wrong."
			switch(ghost_accs)
				if(GHOST_ACCS_FULL)
					button_name = GHOST_ACCS_FULL_NAME
				if(GHOST_ACCS_DIR)
					button_name = GHOST_ACCS_DIR_NAME
				if(GHOST_ACCS_NONE)
					button_name = GHOST_ACCS_NONE_NAME

			dat += "<b>Ghost Accessories:</b> <a href='?_src_=prefs;task=input;preference=ghostaccs'>[button_name]</a><br>"

			switch(ghost_others)
				if(GHOST_OTHERS_THEIR_SETTING)
					button_name = GHOST_OTHERS_THEIR_SETTING_NAME
				if(GHOST_OTHERS_DEFAULT_SPRITE)
					button_name = GHOST_OTHERS_DEFAULT_SPRITE_NAME
				if(GHOST_OTHERS_SIMPLE)
					button_name = GHOST_OTHERS_SIMPLE_NAME

			dat += "<b>Ghosts of Others:</b> <a href='?_src_=prefs;task=input;preference=ghostothers'>[button_name]</a><br>"
			dat += "<br>"

			dat += "<b>Income Updates:</b> <a href='?_src_=prefs;preference=income_pings'>[(chat_toggles & CHAT_BANKCARD) ? "Allowed" : "Muted"]</a><br>"
			dat += "<br>"
*/
			dat += "<b>FPS:</b> <a href='?_src_=prefs;preference=clientfps;task=input'>[clientfps]</a><br>"
/*
			dat += "<b>Parallax (Fancy Space):</b> <a href='?_src_=prefs;preference=parallaxdown' oncontextmenu='window.location.href=\"?_src_=prefs;preference=parallaxup\";return false;'>"
			switch (parallax)
				if (PARALLAX_LOW)
					dat += "Low"
				if (PARALLAX_MED)
					dat += "Medium"
				if (PARALLAX_INSANE)
					dat += "Insane"
				if (PARALLAX_DISABLE)
					dat += "Disabled"
				else
					dat += "High"
			dat += "</a><br>"
*/
//			dat += "<b>Fit Viewport:</b> <a href='?_src_=prefs;preference=auto_fit_viewport'>[auto_fit_viewport ? "Auto" : "Manual"]</a><br>"
//			if (CONFIG_GET(string/default_view) != CONFIG_GET(string/default_view_square))
//				dat += "<b>Widescreen:</b> <a href='?_src_=prefs;preference=widescreenpref'>[widescreenpref ? "Enabled ([CONFIG_GET(string/default_view)])" : "Disabled ([CONFIG_GET(string/default_view_square)])"]</a><br>"

/*			if (CONFIG_GET(flag/maprotation))
				var/p_map = preferred_map
				if (!p_map)
					p_map = "Default"
					if (config.defaultmap)
						p_map += " ([config.defaultmap.map_name])"
				else
					if (p_map in config.maplist)
						var/datum/map_config/VM = config.maplist[p_map]
						if (!VM)
							p_map += " (No longer exists)"
						else
							p_map = VM.map_name
					else
						p_map += " (No longer exists)"
				if(CONFIG_GET(flag/preference_map_voting))
					dat += "<b>Preferred Map:</b> <a href='?_src_=prefs;preference=preferred_map;task=input'>[p_map]</a><br>"
*/

//			dat += "<b>Play Lobby Music:</b> <a href='?_src_=prefs;preference=lobby_music'>[(toggles & SOUND_LOBBY) ? "Enabled":"Disabled"]</a><br>"

			dat += "<b>Preferred Map:</b> <a href='?_src_=prefs;preference=preferred_map;task=input'>[preferred_map || "Default"]</a><br>"
			dat += "</td><td width='300px' height='300px' valign='top'>"

			dat += "<h2>Special Role Settings</h2>"

			if(is_banned_from(user.ckey, ROLE_SYNDICATE))
				dat += "<font color=red><b>I am banned from antagonist roles.</b></font><br>"
				src.be_special = list()


			for (var/i in GLOB.special_roles_rogue)
				if(is_banned_from(user.ckey, i))
					dat += "<b>[capitalize(i)]:</b> <a href='?_src_=prefs;bancheck=[i]'>BANNED</a><br>"
				else
					var/days_remaining = null
					if(ispath(GLOB.special_roles_rogue[i]) && CONFIG_GET(flag/use_age_restriction_for_jobs)) //If it's a game mode antag, check if the player meets the minimum age
						days_remaining = get_remaining_days(user.client)

					if(days_remaining)
						dat += "<b>[capitalize(i)]:</b> <font color=red> \[IN [days_remaining] DAYS]</font><br>"
					else
						dat += "<b>[capitalize(i)]:</b> <a href='?_src_=prefs;preference=be_special;be_special_type=[i]'>[(i in be_special) ? "Enabled" : "Disabled"]</a><br>"
//			dat += "<br>"
//			dat += "<b>Midround Antagonist:</b> <a href='?_src_=prefs;preference=allow_midround_antag'>[(toggles & MIDROUND_ANTAG) ? "Enabled" : "Disabled"]</a><br>"
			dat += "</td></tr></table>"

		if(2) //OOC Preferences
			used_title = "ooc"
			dat += "<table><tr><td width='340px' height='300px' valign='top'>"
			dat += "<h2>OOC Settings</h2>"
			dat += "<b>Window Flashing:</b> <a href='?_src_=prefs;preference=winflash'>[(windowflashing) ? "Enabled":"Disabled"]</a><br>"
			dat += "<br>"
			dat += "<b>Play Admin MIDIs:</b> <a href='?_src_=prefs;preference=hear_midis'>[(toggles & SOUND_MIDI) ? "Enabled":"Disabled"]</a><br>"
			dat += "<b>Play Lobby Music:</b> <a href='?_src_=prefs;preference=lobby_music'>[(toggles & SOUND_LOBBY) ? "Enabled":"Disabled"]</a><br>"
			dat += "<b>See Pull Requests:</b> <a href='?_src_=prefs;preference=pull_requests'>[(chat_toggles & CHAT_PULLR) ? "Enabled":"Disabled"]</a><br>"
			dat += "<br>"


			if(user.client)
				if(unlock_content)
					dat += "<b>BYOND Membership Publicity:</b> <a href='?_src_=prefs;preference=publicity'>[(toggles & MEMBER_PUBLIC) ? "Public" : "Hidden"]</a><br>"

				if(unlock_content || check_rights_for(user.client, R_ADMIN))
					dat += "<b>OOC Color:</b> <span style='border: 1px solid #161616; background-color: [ooccolor ? ooccolor : GLOB.normal_ooc_colour];'>&nbsp;&nbsp;&nbsp;</span> <a href='?_src_=prefs;preference=ooccolor;task=input'>Change</a><br>"

			dat += "</td>"

			if(user.client.holder)
				dat +="<td width='300px' height='300px' valign='top'>"

				dat += "<h2>Admin Settings</h2>"

				dat += "<b>Adminhelp Sounds:</b> <a href='?_src_=prefs;preference=hear_adminhelps'>[(toggles & SOUND_ADMINHELP)?"Enabled":"Disabled"]</a><br>"
				dat += "<b>Prayer Sounds:</b> <a href = '?_src_=prefs;preference=hear_prayers'>[(toggles & SOUND_PRAYERS)?"Enabled":"Disabled"]</a><br>"
				dat += "<b>Announce Login:</b> <a href='?_src_=prefs;preference=announce_login'>[(toggles & ANNOUNCE_LOGIN)?"Enabled":"Disabled"]</a><br>"
				dat += "<br>"
				dat += "<b>Combo HUD Lighting:</b> <a href = '?_src_=prefs;preference=combohud_lighting'>[(toggles & COMBOHUD_LIGHTING)?"Full-bright":"No Change"]</a><br>"
				dat += "<br>"
				dat += "<b>Hide Dead Chat:</b> <a href = '?_src_=prefs;preference=toggle_dead_chat'>[(chat_toggles & CHAT_DSAY)?"Shown":"Hidden"]</a><br>"
				dat += "<b>Hide Radio Messages:</b> <a href = '?_src_=prefs;preference=toggle_radio_chatter'>[(chat_toggles & CHAT_RADIO)?"Shown":"Hidden"]</a><br>"
				dat += "<b>Hide Prayers:</b> <a href = '?_src_=prefs;preference=toggle_prayers'>[(chat_toggles & CHAT_PRAYER)?"Shown":"Hidden"]</a><br>"
				if(CONFIG_GET(flag/allow_admin_asaycolor))
					dat += "<br>"
					dat += "<b>ASAY Color:</b> <span style='border: 1px solid #161616; background-color: [asaycolor ? asaycolor : "#FF4500"];'>&nbsp;&nbsp;&nbsp;</span> <a href='?_src_=prefs;preference=asaycolor;task=input'>Change</a><br>"

				//deadmin
				dat += "<h2>Deadmin While Playing</h2>"
				if(CONFIG_GET(flag/auto_deadmin_players))
					dat += "<b>Always Deadmin:</b> FORCED</a><br>"
				else
					dat += "<b>Always Deadmin:</b> <a href = '?_src_=prefs;preference=toggle_deadmin_always'>[(toggles & DEADMIN_ALWAYS)?"Enabled":"Disabled"]</a><br>"
					if(!(toggles & DEADMIN_ALWAYS))
						dat += "<br>"
						if(!CONFIG_GET(flag/auto_deadmin_antagonists))
							dat += "<b>As Antag:</b> <a href = '?_src_=prefs;preference=toggle_deadmin_antag'>[(toggles & DEADMIN_ANTAGONIST)?"Deadmin":"Keep Admin"]</a><br>"
						else
							dat += "<b>As Antag:</b> FORCED<br>"

						if(!CONFIG_GET(flag/auto_deadmin_heads))
							dat += "<b>As Command:</b> <a href = '?_src_=prefs;preference=toggle_deadmin_head'>[(toggles & DEADMIN_POSITION_HEAD)?"Deadmin":"Keep Admin"]</a><br>"
						else
							dat += "<b>As Command:</b> FORCED<br>"

				dat += "</td>"
			dat += "</tr></table>"

		if(3) // Custom keybindings
			used_title = "Keybinds"
			// Create an inverted list of keybindings -> key
			var/list/user_binds = list()
			for (var/key in key_bindings)
				for(var/kb_name in key_bindings[key])
					user_binds[kb_name] += list(key)

			var/list/kb_categories = list()
			// Group keybinds by category
			for (var/name in GLOB.keybindings_by_name)
				var/datum/keybinding/kb = GLOB.keybindings_by_name[name]
				kb_categories[kb.category] += list(kb)

			dat += "<style>label { display: inline-block; width: 200px; }</style><body>"

			for (var/category in kb_categories)
				for (var/i in kb_categories[category])
					var/datum/keybinding/kb = i
					if(!length(user_binds[kb.name]))
						dat += "<label>[kb.full_name]</label> <a href ='?_src_=prefs;preference=keybindings_capture;keybinding=[kb.name];old_key=["Unbound"]'>Unbound</a>"
//						var/list/default_keys = hotkeys ? kb.hotkey_keys : kb.classic_keys
//						if(LAZYLEN(default_keys))
//							dat += "| Default: [default_keys.Join(", ")]"
						dat += "<br>"
					else
						var/bound_key = user_binds[kb.name][1]
						dat += "<label>[kb.full_name]</label> <a href ='?_src_=prefs;preference=keybindings_capture;keybinding=[kb.name];old_key=[bound_key]'>[bound_key]</a>"
						for(var/bound_key_index in 2 to length(user_binds[kb.name]))
							bound_key = user_binds[kb.name][bound_key_index]
							dat += " | <a href ='?_src_=prefs;preference=keybindings_capture;keybinding=[kb.name];old_key=[bound_key]'>[bound_key]</a>"
						if(length(user_binds[kb.name]) < MAX_KEYS_PER_KEYBIND)
							dat += "| <a href ='?_src_=prefs;preference=keybindings_capture;keybinding=[kb.name]'>Add Secondary</a>"
						var/list/default_keys = hotkeys ? kb.classic_keys : kb.hotkey_keys
						if(LAZYLEN(default_keys))
							dat += "| Default: [default_keys.Join(", ")]"
						dat += "<br>"

			dat += "<br><br>"
			dat += "<a href ='?_src_=prefs;preference=keybinds;task=keybindings_set'>\[Reset to default\]</a>"
			dat += "</body>"


	if(current_tab == 0)
		dat += "<div class='sheet-bottom-bar [show_sheet_preview ? "sheet-bottom-bar--portrait" : ""]'>"

	if(!IsGuestKey(user.key))
		dat += "<div class='sheet-record-actions'><a class='sheet-primary' href='?_src_=prefs;preference=save'>Save Character</a>"
		dat += "<a href='?_src_=prefs;preference=load'>Revert to Saved</a></div>"

	if(current_tab != 0)
		dat += "<div class='sheet-footer'><div class='sheet-footer-options'>"
		dat += "<b>Ambient Occlusion:</b> <a href='?_src_=prefs;preference=ambientocclusion'>[ambientocclusion ? "Enabled" : "Disabled"]</a><br>"
		dat += "<b>Be voice:</b> <a href='?_src_=prefs;preference=schizo_voice'>[(toggles & SCHIZO_VOICE) ? "Enabled":"Disabled"]</a><br>"
		dat += "<b>Admin Sounds:</b> <a href='?_src_=prefs;preference=hear_midis'>[(toggles & SOUND_MIDI) ? "Enabled":"Disabled"]</a></div>"
	dat += "<div class='sheet-session'>"
	var/mob/dead/new_player/N = user
	if(istype(N))
		//dat += "<a href='?_src_=prefs;preference=bespecial'><b>[next_special_trait ? "<font color='red'>SPECIAL</font>" : "Be Special"]</b></a><BR>"
		if(SSticker.current_state <= GAME_STATE_PREGAME)
			switch(N.ready)
				if(PLAYER_NOT_READY)
					dat += "<span class='sheet-hint'>Not ready</span> <a class='sheet-primary' href='byond://?src=[REF(N)];ready=[PLAYER_READY_TO_PLAY]'>Ready</a>"
				if(PLAYER_READY_TO_PLAY)
					dat += "<span class='sheet-hint'>Ready</span> <a href='byond://?src=[REF(N)];ready=[PLAYER_NOT_READY]'>Unready</a>"
					log_game("([user || "NO KEY"]) readied as ([real_name])")
			dat += " <a href='byond://?src=[REF(N)];show_lobby=1'>Round Lobby</a>"
			dat += "<br><a href='byond://?src=[REF(N)];villains=1'>Villains</a>"
		else
			if(!is_active_migrant())
				dat += "<a class='sheet-primary' href='byond://?src=[REF(N)];late_join=1'>Join the Round</a>"
			else
				dat += "<a class='linkOff' href='byond://?src=[REF(N)];late_join=1'>Join the Round</a>"
			dat += " <a href='?_src_=prefs;preference=migrants'>Migration</a>"
			dat += "<br><a href='?_src_=prefs;preference=manifest'>Actors</a>"
			dat += " <a href='?_src_=prefs;preference=observe'>Spectate</a>"
			dat += "<br><a href='byond://?src=[REF(N)];villains=1'>Villains</a>"
	else
		dat += "<a href='?_src_=prefs;preference=finished'>Done</a>"

	dat += "<a href='?_src_=prefs;preference=close_prefs'>Close</a></div></div></div>"


	if(user.client?.is_new_player())
		dat = list("<center>REGISTER!</center>")

	winshow(user, "preferencess_window", TRUE)
	winset(user, "preferences_browser", "pos=0,0;size=[sheet_window_width]x[sheet_window_height];anchor1=0,0;anchor2=100,100")
	winset(user, "character_preview_map", "pos=[sheet_window_width - 198],158;size=172x192;anchor1=100,0;anchor2=100,0;background-color=#181413;is-visible=[show_sheet_preview ? "true" : "false"]")
	winset(user, "preferencess_window", "background-color=#161817")
	var/datum/browser/noclose/popup = new(user, "preferences_browser", "<div align='center'>[used_title]</div>")
	popup.set_window_options("can_close=0")
	popup.add_stylesheet("character_sheet", 'html/browser/character_sheet.css')
	var/datum/asset/simple/roguefonts/sheet_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = sheet_fonts.get_url_mappings()
	var/list/common_urls = get_asset_datum(/datum/asset/simple/namespaced/common).get_url_mappings()
	var/sheet_head = "<style>@font-face { font-family: 'Sheet Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Sheet Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Sheet Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Sheet Rocker'; src: url('[font_urls["newrocker.ttf"]]'); } .sheet-masthead { background-image: url('[common_urls["flowers.png"]]'); }</style>"
	if(current_tab == 0)
		sheet_head += "<style>html, body { height:100%; overflow:hidden; } .uiWrapper { height:100%; } .uiWrapper .uiTitleWrapper { display:none; } .uiWrapper .uiContent { height:100%; padding:0; } .character-sheet { height:100%; display:flex; flex-direction:column; }</style>"
	popup.add_head_content(sheet_head)
	popup.set_content(dat.Join())
	popup.open(FALSE)
	if(show_sheet_preview)
		update_preview_icon()
//	onclose(user, "preferencess_window", src)

#undef APPEARANCE_CATEGORY_COLUMN
#undef MAX_MUTANT_ROWS

/datum/preferences/proc/CaptureKeybinding(mob/user, datum/keybinding/kb, old_key)
	var/HTML = {"
	<div class='keep-keycapture' id='focus' tabindex=0>
		<header><h1>Assign key</h1></header><h2>[html_encode(kb.full_name)]</h2>
		<p>[html_encode(kb.description)]</p>
		<div class='keep-notice'>Press a key or key combination.<br><span class='keep-empty'>Press Escape to clear this binding.</span></div>
	</div>
	<script>
	var deedDone = false;
	document.onkeyup = function(e) {
		if(deedDone){ return; }
		var alt = e.altKey ? 1 : 0;
		var ctrl = e.ctrlKey ? 1 : 0;
		var shift = e.shiftKey ? 1 : 0;
		var numpad = (95 < e.keyCode && e.keyCode < 112) ? 1 : 0;
		var main_key = encodeURIComponent(e.key);
		var escPressed = e.keyCode == 27 ? 1 : 0;
		var url = 'byond://?_src_=prefs;preference=keybinds;task=keybindings_set;keybinding=[url_encode(kb.name)];old_key=[url_encode(old_key)];clear_key='+escPressed+';key='+main_key+';alt='+alt+';ctrl='+ctrl+';shift='+shift+';numpad='+numpad+';key_code='+e.keyCode;
		window.location=url;
		deedDone = true;
	}
	document.getElementById('focus').focus();
	</script>
	"}
	winshow(user, "capturekeypress", TRUE)
	var/datum/browser/noclose/popup = new(user, "capturekeypress", "", 480, 280)
	popup.add_stylesheet("keybindings", 'html/browser/keybindings.css')
	var/list/font_urls = get_asset_datum(/datum/asset/simple/roguefonts).get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Keep Rocker'; src: url('[font_urls["newrocker.ttf"]]'); }</style>")
	popup.set_content(HTML)
	popup.open(FALSE)
	onclose(user, "capturekeypress", src)

/datum/preferences/proc/SetChoices(mob/user)
	if(!SSjob)
		return

	if(joblessrole != RETURNTOLOBBY && joblessrole != BERANDOMJOB)
		joblessrole = RETURNTOLOBBY

	var/list/departments = list()
	for(var/datum/job/job in sortList(SSjob.occupations, GLOBAL_PROC_REF(cmp_job_display_asc)))
		if(!job.spawn_positions || (job.title in GLOB.villain_positions))
			continue
		var/department = SSjob.bitflag_to_department(job.department_flag, job.obsfuscated_job)
		if(!departments[department])
			departments[department] = list()
		departments[department] += job

	var/list/HTML = list()
	HTML += {"
	<div class='job-ledger'>
		<header class='job-header'>
			<h1>Class preferences</h1>
			<p>Choose one High preference, then rank your alternatives. Linked class names open their setup.</p>
			<div class='job-tools'>
				<label for='job-search'>Find a class<input id='job-search' type='text' placeholder='Search class names...' autocomplete='off'></label>
				<label for='job-department'>Department<select id='job-department'><option value=''>All departments</option>
	"}
	for(var/department in departments)
		HTML += "<option value='[html_encode(department)]'>[html_encode(department)]</option>"
	HTML += "</select></label></div><div class='job-fallback'>If no preferred role is available: <a href='?_src_=prefs;preference=job;task=nojob'>[html_encode(joblessrole)]</a></div></header>"
	HTML += "<main class='job-list' id='job-list'><p class='job-empty' id='job-empty' style='display:none'>No classes match your search.</p>"
	if(!length(departments))
		HTML += "<p class='job-empty'>Classes are not available yet. Close this ledger and try again shortly.</p>"

	var/role_index = 0
	var/player_quality = get_playerquality(user.ckey)
	var/static/list/acceptable_unavailables = list(JOB_AVAILABLE, JOB_UNAVAILABLE_SLOTFULL)
	var/static/list/preference_labels = list("High", "Medium", "Low", "Never")
	for(var/department in departments)
		HTML += "<section class='job-group' data-department='[html_encode(department)]'><h2>[html_encode(department)]</h2>"
		for(var/datum/job/job in departments[department])
			role_index++
			var/rank = job.title
			var/used_name = job.display_title || job.title
			if((pronouns == SHE_HER || pronouns == THEY_THEM_F) && job.f_title)
				used_name = job.f_title

			var/blocking_reason
			if(is_banned_from(user.ckey, rank))
				blocking_reason = "<a href='?_src_=prefs;bancheck=[url_encode(rank)]'>Banned &mdash; view reason</a>"
			if(!blocking_reason)
				var/required_playtime_remaining = job.required_playtime_remaining(user.client)
				if(required_playtime_remaining)
					blocking_reason = "Requires [html_encode(get_exp_format(required_playtime_remaining))] more as [html_encode(job.get_exp_req_type())]"
			if(!blocking_reason && !job.player_old_enough(user.client))
				blocking_reason = "Available in [job.available_in_days(user.client)] days"
			#ifdef USES_PQ
			if(!blocking_reason && !job.required && !isnull(job.min_pq) && (player_quality < job.min_pq))
				blocking_reason = "Minimum PQ: [job.min_pq]"
			#endif
			if(!blocking_reason && !job.required && !isnull(job.max_pq) && (player_quality > job.max_pq))
				blocking_reason = "Maximum PQ: [job.max_pq]"
			if(!blocking_reason)
				var/list/restricted_traits = list()
				if(length(job.virtue_restrictions))
					if(virtue.type in job.virtue_restrictions)
						restricted_traits += virtue.name
					if(virtuetwo?.type in job.virtue_restrictions)
						restricted_traits += virtuetwo.name
				if(length(job.vice_restrictions))
					for(var/datum/charflaw/vice in list(vice1, vice2, vice3, vice4, vice5, vice6, charflaw))
						if(vice?.type in job.vice_restrictions)
							restricted_traits += vice.name
				if(length(restricted_traits))
					blocking_reason = "Disallowed by virtues / vices: [html_encode(restricted_traits.Join(", "))]"
			if(!blocking_reason && isnewplayer(parent?.mob))
				var/mob/dead/new_player/new_player = parent.mob
				if(!(new_player.IsJobUnavailable(job.title, latejoin = FALSE, player_quality = player_quality) in acceptable_unavailables))
					blocking_reason = "Unavailable for this character"

			HTML += "<article class='job-row[blocking_reason ? " job-locked" : ""]' data-search='[html_encode("[used_name] [rank] [department]")]'><div class='job-summary'><div class='job-description'>"
			if(!blocking_reason && job.class_setup_examine)
				HTML += "<a class='job-name' href='?src=[REF(job)];explainjob=1'>[html_encode(used_name)]</a>"
			else
				HTML += "<span class='job-name'>[html_encode(used_name)]</span>"
			if(blocking_reason)
				HTML += "<div class='job-restriction'>[blocking_reason]</div></div><span class='job-unavailable'>Locked</span></div></article>"
				continue

			HTML += "<div class='job-meta'>Slots: [job.spawn_positions][job.round_contrib_points ? " &middot; RCP: +[job.round_contrib_points]" : ""]"
			if(job.tutorial)
				HTML += " &middot; <button type='button' class='job-details-toggle' aria-expanded='false' aria-controls='job-details-[role_index]' onclick='toggleJobDetails(this)'>Class details</button>"
			HTML += "</div></div><div class='job-preferences' role='group' aria-label='Preference for [html_encode(used_name)]'>"

			var/preference_level = 4
			switch(job_preferences[job.title])
				if(JP_HIGH)
					preference_level = 1
					var/mob/dead/new_player/P = user
					if(istype(P))
						P.topjob = job.title
				if(JP_MEDIUM)
					preference_level = 2
				if(JP_LOW)
					preference_level = 3
			var/low_only = FALSE
			#ifdef USES_PQ
			low_only = job.required && !isnull(job.min_pq) && player_quality < job.min_pq
			#endif
			for(var/level in 1 to 4)
				if(level == preference_level)
					HTML += "<span class='job-preference job-selected' aria-current='true'>[preference_labels[level]]</span>"
				else if(low_only && level < 3)
					HTML += "<span class='job-preference job-disabled' aria-disabled='true'>[preference_labels[level]]</span>"
				else
					HTML += "<a class='job-preference' href='?_src_=prefs;preference=job;task=setJobLevel;level=[level];text=[url_encode(rank)]'>[preference_labels[level]]</a>"
			HTML += "</div></div>"
			if(low_only)
				HTML += "<div class='job-restriction'>Only Low or Never is available below [job.min_pq] PQ.</div>"
			if(job.tutorial)
				HTML += "<div class='job-details' id='job-details-[role_index]' style='display:none'>[job.tutorial]</div>"
			HTML += "</article>"
		HTML += "</section>"

	HTML += "</main><footer class='job-footer'><div class='job-footer-options'><a href='?_src_=prefs;preference=job;task=reset'>Reset preferences</a>"
	if(user.client.prefs.lastclass)
		HTML += "<a class='job-repeat' href='?_src_=prefs;preference=job;task=triumphthing'>Clear repeat-class restriction: [html_encode(user.client.prefs.lastclass)] &mdash; 2 Triumphs</a>"
	HTML += "</div><a class='job-done' href='?_src_=prefs;preference=job;task=close'>Done</a></footer></div>"
	HTML += {"
	<script type='text/javascript'>
	function toggleJobDetails(button) {
		var expanded = button.getAttribute('aria-expanded') === 'true';
		button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
		document.getElementById(button.getAttribute('aria-controls')).style.display = expanded ? 'none' : 'block';
	}
	(function() {
		var search = document.getElementById('job-search');
		var department = document.getElementById('job-department');
		var ledger = document.getElementById('job-list');
		var groups = ledger.querySelectorAll('.job-group');
		function filterJobs() {
			var query = search.value.toLowerCase();
			var total = 0;
			for(var i = 0; i < groups.length; i++) {
				var group = groups.item(i);
				var rows = group.querySelectorAll('.job-row');
				var matches = 0;
				for(var j = 0; j < rows.length; j++) {
					var row = rows.item(j);
					var visible = (!department.value || department.value === group.getAttribute('data-department')) && row.getAttribute('data-search').toLowerCase().indexOf(query) !== -1;
					row.style.display = visible ? '' : 'none';
					if(visible) { matches++; }
				}
				group.style.display = matches ? '' : 'none';
				total += matches;
			}
			document.getElementById('job-empty').style.display = !total && groups.length ? 'block' : 'none';
			try {
				sessionStorage.setItem('keep-job-search', search.value);
				sessionStorage.setItem('keep-job-department', department.value);
			} catch(e) {}
		}
		try {
			search.value = sessionStorage.getItem('keep-job-search') || '';
			department.value = sessionStorage.getItem('keep-job-department') || '';
		} catch(e) {}
		search.oninput = filterJobs;
		department.onchange = filterJobs;
		filterJobs();
		try { ledger.scrollTop = Number(sessionStorage.getItem('keep-job-scroll')) || 0; } catch(e) {}
		ledger.onscroll = function() {
			try { sessionStorage.setItem('keep-job-scroll', ledger.scrollTop); } catch(e) {}
		};
	})();
	</script>
	"}

	var/datum/browser/noclose/popup = new(user, "mob_occupation", "", 900, 720)
	popup.set_window_options("can_close=0;can_resize=1;can_minimize=1;can_maximize=1;titlebar=1;")
	popup.add_stylesheet("job_preferences", 'html/browser/job_preferences.css')
	var/list/font_urls = get_asset_datum(/datum/asset/simple/roguefonts).get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Keep Rocker'; src: url('[font_urls["newrocker.ttf"]]'); }</style>")
	popup.set_content(HTML.Join())
	popup.open(FALSE)

/datum/preferences/proc/SetJobPreferenceLevel(datum/job/job, level)
	if (!job)
		return FALSE

	if (level == JP_HIGH) // to high
		//Set all other high to medium
		for(var/j in job_preferences)
			if(job_preferences[j] == JP_HIGH)
				job_preferences[j] = JP_MEDIUM
				//technically break here

	job_preferences[job.title] = level
	return TRUE

/datum/preferences/proc/UpdateJobPreference(mob/user, role, desiredLvl)
	if(!SSjob || SSjob.occupations.len <= 0)
		return
	var/datum/job/job = SSjob.GetJob(role)

	if(!job)
		user << browse(null, "window=mob_occupation")
		ShowChoices(user,4)
		return

	if (!isnum(desiredLvl))
		to_chat(user, span_danger("UpdateJobPreference - desired level was not a number. Please notify coders!"))
		ShowChoices(user,4)
		return

	var/jpval = null
	switch(desiredLvl)
		if(3)
			jpval = JP_LOW
		if(2)
			jpval = JP_MEDIUM
		if(1)
			jpval = JP_HIGH

	#ifdef USES_PQ
	if(job.required && !isnull(job.min_pq) && (get_playerquality(user.ckey) < job.min_pq))
		if(!isnull(jpval) && jpval != JP_LOW)
			var/used_name = job.display_title || job.title
			if((pronouns == SHE_HER || pronouns == THEY_THEM_F) && job.f_title)
				used_name = "[job.f_title]"
			to_chat(user, "<font color='red'>You have too low PQ for [used_name] (Min PQ: [job.min_pq]), you may only set it to low.</font>")
			jpval = JP_LOW
	#endif

	SetJobPreferenceLevel(job, jpval)
	SetChoices(user)

	return 1


/datum/preferences/proc/ResetJobs()
	job_preferences = list()

/datum/preferences/proc/ResetLastClass(mob/user)
	if(user.client?.prefs)
		if(!user.client.prefs.lastclass)
			return
	var/choice = tgalert(user, "Use 2 Triumphs to play as this class again?", "Reset LastPlayed", "Do It", "Cancel")
	if(choice == "Cancel")
		return
	if(!choice)
		return
	if(user.client?.prefs)
		if(user.client.prefs.lastclass)
			if(user.get_triumphs() < 2)
				to_chat(user, span_warning("I haven't TRIUMPHED enough."))
				return
			user.adjust_triumphs(-2)
			user.client.prefs.lastclass = null
			user.client.prefs.save_preferences()

/datum/preferences/proc/SetKeybinds(mob/user, return_to_prefs = null)
	if(!isnull(return_to_prefs))
		keybinds_return_to_prefs = !!return_to_prefs
	var/return_flag = keybinds_return_to_prefs ? 1 : 0
	var/list/dat = list()
	// Create an inverted list of keybindings -> key
	var/list/user_binds = list()
	for (var/key in key_bindings)
		for(var/kb_name in key_bindings[key])
			user_binds[kb_name] += list(key)

	var/list/kb_categories = list()
	// Group keybinds by category
	for (var/name in GLOB.keybindings_by_name)
		var/datum/keybinding/kb = GLOB.keybindings_by_name[name]
		kb_categories[kb.category] += list(kb)

	dat += "<div class='keep-keybindings'><header class='keep-key-heading'><h1>Keybindings</h1><p>Choose a binding to change it, or add a second key.</p></header>"
	dat += "<div class='keep-key-search'><label for='key-search'>Find a command</label><input id='key-search' type='text' placeholder='Search commands, categories, or keys...' autocomplete='off'></div><main id='key-list' class='keep-key-list' tabindex='0' aria-label='Keybindings'>"
	for (var/category in kb_categories)
		dat += "<section class='keep-key-group'><h2>[html_encode(category)]</h2><div>"
		for (var/i in kb_categories[category])
			var/datum/keybinding/kb = i
			dat += "<div class='keep-key-row' data-binding='[html_encode(kb.name)]' data-category='[html_encode(category)]'><div class='keep-key-command'><span>[html_encode(kb.full_name)]</span><small>[html_encode(kb.description)]</small></div><div class='keep-key-values'>"
			if(!length(user_binds[kb.name]))
				dat += "<a class='keep-key-unbound' href='?_src_=prefs;preference=keybinds;task=keybindings_capture;keybinding=[kb.name];old_key=Unbound'>Unbound</a>"
			else
				var/bound_key = user_binds[kb.name][1]
				dat += "<a href='?_src_=prefs;preference=keybinds;task=keybindings_capture;keybinding=[kb.name];old_key=[url_encode(bound_key)]'>[html_encode(bound_key)]</a>"
				for(var/bound_key_index in 2 to length(user_binds[kb.name]))
					bound_key = user_binds[kb.name][bound_key_index]
					dat += "<a href='?_src_=prefs;preference=keybinds;task=keybindings_capture;keybinding=[kb.name];old_key=[url_encode(bound_key)]'>[html_encode(bound_key)]</a>"
				if(length(user_binds[kb.name]) < MAX_KEYS_PER_KEYBIND)
					dat += "<a class='keep-key-secondary' href='?_src_=prefs;preference=keybinds;task=keybindings_capture;keybinding=[kb.name]'>+ Add key</a>"
			dat += "</div></div>"
		dat += "</div></section>"

	dat += "<p id='key-search-empty' class='keep-empty' style='display:none'>No commands match your search.</p></main><footer class='keep-key-footer'><a href='?_src_=prefs;preference=keybinds;task=keybindings_reset'>Reset to defaults</a><a class='keep-key-done' href='?_src_=prefs;preference=keybinds;task=close;return_to_prefs=[return_flag]'>Done</a></footer></div>"
	dat += {"<script>
	(function() {
		var search = document.getElementById('key-search');
		var ledger = document.getElementById('key-list');
		function filterKeys() {
			var query = search.value.toLowerCase().trim();
			var groups = document.querySelectorAll('.keep-key-group');
			var total = 0;
			for(var g = 0; g < groups.length; g++) {
				var rows = groups\[g\].querySelectorAll('.keep-key-row');
				var shown = 0;
				for(var r = 0; r < rows.length; r++) {
					var row = rows\[r\];
					var matches = (row.textContent + ' ' + row.getAttribute('data-category')).toLowerCase().indexOf(query) !== -1;
					row.style.display = matches ? '' : 'none';
					if(matches) shown++;
				}
				groups\[g\].style.display = shown ? '' : 'none';
				total += shown;
			}
			document.getElementById('key-search-empty').style.display = total ? 'none' : '';
			try { sessionStorage.setItem('keep-key-search', search.value); } catch(e) {}
		}
		try { search.value = sessionStorage.getItem('keep-key-search') || ''; } catch(e) {}
		search.oninput = filterKeys;
		filterKeys();
		var rows = ledger.querySelectorAll('.keep-key-row');
		var restoreBinding = '';
		var restoreScroll = 0;
		try {
			restoreBinding = sessionStorage.getItem('keep-key-focus') || '';
			restoreScroll = Number(sessionStorage.getItem('keep-key-scroll')) || 0;
			sessionStorage.removeItem('keep-key-focus');
		} catch(e) {}
		for(var i = 0; i < rows.length; i++) {
			var row = rows.item(i);
			row.onclick = function(event) {
				var target = event.target || event.srcElement;
				if(target.tagName !== 'A') { return; }
				try { sessionStorage.setItem('keep-key-focus', this.getAttribute('data-binding')); } catch(e) {}
			};
			if(row.getAttribute('data-binding') === restoreBinding && row.style.display !== 'none') {
				var control = row.querySelector('a');
				if(control) { control.focus(); }
			}
		}
		ledger.scrollTop = restoreScroll;
		ledger.onscroll = function() {
			try { sessionStorage.setItem('keep-key-scroll', ledger.scrollTop); } catch(e) {}
		};
	})();
	</script>"}

	var/datum/browser/noclose/popup = new(user, "keybind_setup", "", 760, 720)
	popup.set_window_options("can_close=0")
	popup.add_stylesheet("keybindings", 'html/browser/keybindings.css')
	var/list/font_urls = get_asset_datum(/datum/asset/simple/roguefonts).get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Keep Rocker'; src: url('[font_urls["newrocker.ttf"]]'); } html, body, .uiWrapper, .uiContent { height:100%; overflow:hidden; } .uiTitleWrapper { display:none; }</style>")
	popup.set_content(dat.Join())
	popup.open(FALSE)
	winset(user, "keybind_setup.browser", "focus=true")

/datum/preferences/proc/SetAntag(mob/user, focus_role = null)
	var/list/dat = list()

	dat += "<div class='role-preferences'><header><h1>Villain selection</h1><p>Enable the roles you wish to be considered for.</p></header><main id='role-list' tabindex='0' aria-label='Villain preferences' data-current-role='[html_encode(focus_role)]'>"

	if(is_banned_from(user.ckey, ROLE_SYNDICATE))
		dat += "<p class='role-notice'>I am banned from antagonist roles.</p>"
		src.be_special = list()

	dat += "<table><thead><tr><th scope='col'>Role</th><th scope='col' class='role-state'>Preference</th></tr></thead><tbody>"
	for (var/i in GLOB.special_roles_rogue)
		dat += "<tr><th scope='row'>[html_encode(capitalize(i))]</th><td class='role-state'>"
		if(is_banned_from(user.ckey, i))
			dat += "<a class='role-banned' href='?_src_=prefs;bancheck=[url_encode(i)]'>Banned</a>"
		else
			var/days_remaining = null
			if(ispath(GLOB.special_roles_rogue[i]) && CONFIG_GET(flag/use_age_restriction_for_jobs)) //If it's a game mode antag, check if the player meets the minimum age
				days_remaining = get_remaining_days(user.client)

			if(days_remaining)
				dat += "<span class='role-waiting'>In [days_remaining] days</span>"
			else
				var/enabled = (i in be_special)
				dat += "<a class='[enabled ? "role-enabled" : "role-disabled"]' role='button' aria-pressed='[enabled ? "true" : "false"]' aria-label='[enabled ? "Disable" : "Enable"] [html_encode(i)]' data-role='[html_encode(i)]' href='?_src_=prefs;preference=antag;task=be_special;be_special_type=[url_encode(i)]'>[enabled ? "Enabled" : "Disabled"]</a>"
		dat += "</td></tr>"

	dat += "</tbody></table></main><footer><a href='?_src_=prefs;preference=antag;task=close'>Done</a></footer></div>"
	dat += {"<script>
	(function() {
		var list = document.getElementById('role-list');
		var role = list.getAttribute('data-current-role');
		if(!role) { return; }
		var controls = list.querySelectorAll('a\[data-role\]');
		for(var i = 0; i < controls.length; i++) {
			var control = controls.item(i);
			if(control.getAttribute('data-role') === role) {
				control.focus();
				break;
			}
		}
	})();
	</script>"}

	var/datum/browser/noclose/popup = new(user, "antag_setup", "", 520, 560)
	popup.set_window_options("can_close=0")
	popup.add_stylesheet("special_roles", 'html/browser/special_roles.css')
	var/datum/asset/simple/roguefonts/panel_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = panel_fonts.get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Rocker'; src: url('[font_urls["newrocker.ttf"]]'); }</style>")
	popup.set_content(dat.Join())
	popup.open(FALSE)
	winset(user, "antag_setup.browser", "focus=true")


/datum/preferences/Topic(href, href_list, hsrc)			//yeah, gotta do this I guess..
	. = ..()
	if(href_list["close"])
		var/client/C = usr.client
		if(C)
			C.clear_character_previews()
	if(href_list["preference"] == "origin_select")
		var/mob/user = usr
		var/chosen_type = text2path(href_list["type"])
		if(chosen_type && (chosen_type in GLOB.origins))
			origin = GLOB.origins[chosen_type]
			save_character()
			user << browse(null, "window=origin_map")
			ShowChoices(user)
			return

/datum/preferences/proc/process_link(mob/user, list/href_list)
	if(href_list["bancheck"])
		var/list/ban_details = is_banned_from_with_details(user.ckey, user.client.address, user.client.computer_id, href_list["bancheck"])
		var/admin = FALSE
		if(GLOB.admin_datums[user.ckey] || GLOB.deadmins[user.ckey])
			admin = TRUE
		for(var/i in ban_details)
			if(admin && !text2num(i["applies_to_admins"]))
				continue
			ban_details = i
			break //we only want to get the most recent ban's details
		if(ban_details && ban_details.len)
			var/expires = "This is a permanent ban."
			if(ban_details["expiration_time"])
				expires = " The ban is for [DisplayTimeText(text2num(ban_details["duration"]) MINUTES)] and expires on [ban_details["expiration_time"]] (server time)."
			to_chat(user, span_danger("You, or another user of this computer or connection ([ban_details["key"]]) is banned from playing [href_list["bancheck"]].<br>The ban reason is: [ban_details["reason"]]<br>This ban (BanID #[ban_details["id"]]) was applied by [ban_details["admin_key"]] on [ban_details["bantime"]] during round ID [ban_details["round_id"]].<br>[expires]"))
			return
	if(href_list["preference"] == "sheet_page")
		if(href_list["page"] in list("identity", "appearance", "voice", "record", "settings"))
			character_sheet_page = href_list["page"]
			current_tab = 0
			ShowChoices(user)
		return
	if(href_list["preference"] == "job")
		switch(href_list["task"])
			if("close")
				user << browse(null, "window=mob_occupation")
				ShowChoices(user,4)
			if("reset")
				ResetJobs()
				SetChoices(user)
			if("triumphthing")
				ResetLastClass(user)
			if("nojob")
				switch(joblessrole)
					if(RETURNTOLOBBY)
						joblessrole = BERANDOMJOB
					if(BERANDOMJOB)
						joblessrole = RETURNTOLOBBY
				SetChoices(user)
			if("tutorial")
				if(href_list["tut"])
					testing("[href_list["tut"]]")
					to_chat(user, span_info("* ----------------------- *"))
					to_chat(user, href_list["tut"])
					to_chat(user, span_info("* ----------------------- *"))
			if("random")
				switch(joblessrole)
					if(RETURNTOLOBBY)
						if(is_banned_from(user.ckey, SSjob.overflow_role))
							joblessrole = BERANDOMJOB
						else
							joblessrole = BERANDOMJOB
					if(BEOVERFLOW)
						joblessrole = BERANDOMJOB
					if(BERANDOMJOB)
						joblessrole = BERANDOMJOB
				SetChoices(user)
			if("setJobLevel")
				if(SSticker.job_change_locked)
					return 1
				UpdateJobPreference(user, href_list["text"], text2num(href_list["level"]))
			else
				SetChoices(user)
		return 1

	else if(href_list["preference"] == "antag")
		switch(href_list["task"])
			if("close")
				user << browse(null, "window=antag_setup")
				ShowChoices(user)
			if("be_special")
				var/be_special_type = href_list["be_special_type"]
				if(be_special_type in be_special)
					be_special -= be_special_type
				else
					be_special += be_special_type
				SetAntag(user, be_special_type)
			if("update")
				SetAntag(user)
			else
				SetAntag(user)
	else if(href_list["preference"] == "tgui_ui_prefs")
		tgui_pref = !tgui_pref
	else if(href_list["preference"] == "triumphs")
		user.show_triumphs_list()

	else if(href_list["preference"] == "playerquality")
		check_pq_menu(user.ckey)

	else if(href_list["preference"] == "agevet")
		if(!user.check_agevet())
			to_chat(usr, span_info("- You are a whitelisted player with full access to the server's features. If you'd also like to show others that you've been <b>AGE-VERIFIED</b> with a censored ID, you can open a ticket in Azure Peak's <b>#vet-here</b> channel. Note that this is a purely optional process, and - besides awarding a special header for your flavortext - doesn't affect you in any other way."))
		else
			to_chat(usr, span_love("- You have been successfully <b>AGE-VERIFIED!</b>"))

	else if(href_list["preference"] == "culinary")
		show_culinary_ui(user)
		return
	else if(href_list["preference"] == "markings")
		ShowMarkings(user)
		return
	else if(href_list["preference"] == "descriptors")
		show_descriptors_ui(user)
		return

	else if(href_list["preference"] == "customizers")
		ShowCustomizers(user)
		return
	else if(href_list["preference"] == "origin_select")
		var/chosen_type = text2path(href_list["type"])
		if(chosen_type && (chosen_type in GLOB.origins))
			origin = GLOB.origins[chosen_type]
			save_character()
			user << browse(null, "window=origin_map")
			ShowChoices(user)
			return
		return
	else if(href_list["preference"] == "triumph_buy_menu")
		SStriumphs.startup_triumphs_menu(user.client)

	else if(href_list["preference"] == "keybinds")
		switch(href_list["task"])
			if("close")
				user << browse(null, "window=keybind_setup")
				if(text2num(href_list["return_to_prefs"]) || keybinds_return_to_prefs)
					ShowChoices(user)
			if("menu")
				SetKeybinds(user, TRUE)
			if("update")
				SetKeybinds(user)
			if("keybindings_capture")
				var/datum/keybinding/kb = GLOB.keybindings_by_name[href_list["keybinding"]]
				var/old_key = href_list["old_key"]
				CaptureKeybinding(user, kb, old_key)
				return

			if("keybindings_set")
				var/kb_name = href_list["keybinding"]
				if(!kb_name)
					user << browse(null, "window=capturekeypress")
					SetKeybinds(user)
					return

				var/clear_key = text2num(href_list["clear_key"])
				var/old_key = href_list["old_key"]
				if(clear_key)
					if(key_bindings[old_key])
						key_bindings[old_key] -= kb_name
						if(!length(key_bindings[old_key]))
							key_bindings -= old_key
					user << browse(null, "window=capturekeypress")
					apply_keybinding_changes(user.client)
					SetKeybinds(user)
					return

				var/new_key = uppertext(href_list["key"])
				var/AltMod = text2num(href_list["alt"]) ? "Alt" : ""
				var/CtrlMod = text2num(href_list["ctrl"]) ? "Ctrl" : ""
				var/ShiftMod = text2num(href_list["shift"]) ? "Shift" : ""
				var/numpad = text2num(href_list["numpad"]) ? "Numpad" : ""
				// var/key_code = text2num(href_list["key_code"])

				if(GLOB._kbMap[new_key])
					new_key = GLOB._kbMap[new_key]

				var/full_key
				switch(new_key)
					if("Alt")
						full_key = "[new_key][CtrlMod][ShiftMod]"
					if("Ctrl")
						full_key = "[AltMod][new_key][ShiftMod]"
					if("Shift")
						full_key = "[AltMod][CtrlMod][new_key]"
					else
						full_key = "[AltMod][CtrlMod][ShiftMod][numpad][new_key]"
				if(key_bindings[old_key])
					key_bindings[old_key] -= kb_name
					if(!length(key_bindings[old_key]))
						key_bindings -= old_key
				key_bindings[full_key] += list(kb_name)
				key_bindings[full_key] = sortList(key_bindings[full_key])

				user << browse(null, "window=capturekeypress")
				apply_keybinding_changes(user.client)
				SetKeybinds(user)

			if("keybindings_reset")
				var/choice = tgalert(user, "Do you really want to reset your keybindings?", "Setup keybindings", "Do It", "Cancel")
				if(choice == "Cancel")
					SetKeybinds(user)
					return
				hotkeys = (choice == "Do It")
				key_bindings = (hotkeys) ? deepCopyList(GLOB.hotkey_keybinding_list_by_key) : deepCopyList(GLOB.classic_keybinding_list_by_key)
				apply_keybinding_changes(user.client)
				SetKeybinds(user)
			else
				SetKeybinds(user)
		return TRUE

	switch(href_list["task"])
		if("change_customizer")
			handle_customizer_topic(user, href_list)
			ShowChoices(user)
			ShowCustomizers(user)
			return
		if("change_marking")
			handle_body_markings_topic(user, href_list)
			ShowChoices(user)
			ShowMarkings(user)
			return
		if("change_descriptor")
			handle_descriptors_topic(user, href_list)
			show_descriptors_ui(user)
			return
		if("change_culinary_preferences")
			handle_culinary_topic(user, href_list)
			show_culinary_ui(user)
			return
		if("random")
			switch(href_list["preference"])
				if("name")
					real_name = pref_species.random_name(gender,1)
				if("age")
					age = pick(pref_species.possible_ages)
				if("eyes")
					eye_color = random_eye_color()
				if("s_tone")
					var/list/skins = pref_species.get_skin_list()
					skin_tone = skins[pick(skins)]
				if("species")
					random_species()
				if("bag")
					backpack = pick(GLOB.backpacklist)
				if("suit")
					jumpsuit_style = PREF_SUIT
				if("all")
					random_character(gender, FALSE, FALSE)

		if("input")

			if(href_list["preference"] in GLOB.preferences_custom_names)
				ask_for_custom_name(user,href_list["preference"])

			switch(href_list["preference"])
				if("ghostform")
					if(unlock_content)
						var/new_form = tgui_input_list(user, "Thanks for supporting BYOND - Choose your ghostly form:", "Thanks for supporting BYOND", GLOB.ghost_forms, ghost_form)
						if(new_form)
							ghost_form = new_form
				if("ghostorbit")
					if(unlock_content)
						var/new_orbit = tgui_input_list(user, "Thanks for supporting BYOND - Choose your ghostly orbit:", "Thanks for supporting BYOND", GLOB.ghost_orbits, ghost_orbit)
						if(new_orbit)
							ghost_orbit = new_orbit

				if("ghostaccs")
					var/new_ghost_accs = alert("Do you want your ghost to show full accessories where possible, hide accessories but still use the directional sprites where possible, or also ignore the directions and stick to the default sprites?",,GHOST_ACCS_FULL_NAME, GHOST_ACCS_DIR_NAME, GHOST_ACCS_NONE_NAME)
					switch(new_ghost_accs)
						if(GHOST_ACCS_FULL_NAME)
							ghost_accs = GHOST_ACCS_FULL
						if(GHOST_ACCS_DIR_NAME)
							ghost_accs = GHOST_ACCS_DIR
						if(GHOST_ACCS_NONE_NAME)
							ghost_accs = GHOST_ACCS_NONE

				if("ghostothers")
					var/new_ghost_others = alert("Do you want the ghosts of others to show up as their own setting, as their default sprites or always as the default white ghost?",,GHOST_OTHERS_THEIR_SETTING_NAME, GHOST_OTHERS_DEFAULT_SPRITE_NAME, GHOST_OTHERS_SIMPLE_NAME)
					switch(new_ghost_others)
						if(GHOST_OTHERS_THEIR_SETTING_NAME)
							ghost_others = GHOST_OTHERS_THEIR_SETTING
						if(GHOST_OTHERS_DEFAULT_SPRITE_NAME)
							ghost_others = GHOST_OTHERS_DEFAULT_SPRITE
						if(GHOST_OTHERS_SIMPLE_NAME)
							ghost_others = GHOST_OTHERS_SIMPLE

				if("name")
					var/new_name = tgui_input_text(user, "The name of this vessel?", "IDENTITY", real_name, encode = FALSE)
					if(new_name)
						new_name = reject_bad_name(new_name)
						if(new_name)
							real_name = new_name
						else
							to_chat(user, "<font color='red'>Invalid name. Your name should be at least 2 and at most [MAX_NAME_LEN] characters long. It may only contain the characters A-Z, a-z, -, ', . and ,.</font>")

				if("nickname")
					var/new_name = tgui_input_text(user, "Choose your character's nickname (For Highlighting):", "NICKNAME", nickname, encode = FALSE)
					if(new_name)
						new_name = reject_bad_name(new_name)
						if(new_name)
							nickname = new_name
						else
							to_chat(user, "<font color='red'>Invalid name. Your name should be at least 2 and at most [MAX_NAME_LEN] characters long. It may only contain the characters A-Z, a-z, -, ', . and ,.</font>")

				if("subclassoutfit")
					var/list/choices = list("None")
					var/datum/job/highest_pref = get_preview_job()
					if(isnull(highest_pref))
						to_chat(user, span_warning("Choose a class preference before previewing an outfit."))
						return
					if(length(highest_pref.job_subclasses))
						for(var/adv in highest_pref.job_subclasses)
							var/datum/advclass/advpath = adv
							var/datum/advclass/advref = SSrole_class_handler.get_advclass_by_name(initial(advpath.name))
							choices[advref.name] = advref
					var/new_choice = tgui_input_list(user, "Choose an outfit preview:", "Outfit Preview", choices, preview_subclass ? preview_subclass.name : "None")
					if(isnull(new_choice))
						return
					preview_subclass = new_choice == "None" ? null : choices[new_choice]

//				if("age")
//					var/new_age = input(user, "Choose your character's age:\n([AGE_MIN]-[AGE_MAX])", "Years Dead") as num|null
//					if(new_age)
//						age = max(min( round(text2num(new_age)), AGE_MAX),AGE_MIN)

				if("age")
					var/new_age = tgui_input_list(user, "Choose your character's age (18-[pref_species.max_age])", "YILS LIVED", pref_species.possible_ages, age)
					if(new_age)
						age = new_age
						var/list/hairs
						if((age == AGE_OLD) && (OLDGREY in pref_species.species_traits))
							hairs = pref_species.get_oldhc_list()
						else
							hairs = pref_species.get_hairc_list()
						hair_color = hairs[pick(hairs)]
						facial_hair_color = hair_color
						// LETHALSTONE EDIT: let players know what this shit does stats-wise
						switch (age)
							if (AGE_ADULT)
								to_chat(user, "You preside in your 'prime', whatever this may be, and gain no bonus nor endure any penalty for your time spent alive.")
							if (AGE_MIDDLEAGED)
								to_chat(user, "Muscles ache and joints begin to slow as Aeon's grasp begins to settle upon your shoulders. (-1 SPD, +1 WIL)")
							if (AGE_OLD)
								to_chat(user, "In a place as lethal as PSYDONIA, the elderly are all but marvels... or beneficiaries of the habitually privileged. (-1 STR, -2 SPE, -1 PER, -2 CON, +2 INT, +1 FOR)")
						// LETHALSTONE EDIT END
						ResetJobs()
						family = FAMILY_NONE
						to_chat(user, "<font color='red'>Classes reset.</font>")

				if("map_preference")
					var/list/available_maps = list("Default")

					for(var/map_name in config.maplist)
						available_maps += map_name

					var/new_map = tgui_input_list(user, "Choose your preferred map.", "MAP PREFERENCE", available_maps)

					if(new_map)
						if(new_map == "Default")
							preferred_map = null
						else
							preferred_map = new_map

						to_chat(user, span_notice("Preferred map set to: [new_map]"))

					return
				// LETHALSTONE EDIT: add pronouns
				if ("pronouns")
					var pronouns_input = tgui_input_list(user, "Choose your character's pronouns", "PRONOUNS", GLOB.pronouns_list, pronouns)
					if(pronouns_input)
						pronouns = pronouns_input
						ResetJobs()
						to_chat(user, "<font color='red'>Your character's pronouns are now [pronouns].</font>")
						to_chat(user, "<font color='red'><b>Your classes have been reset.</b></font>")

				// LETHALSTONE EDIT: add voice type selection
				if ("voicetype")
					var voicetype_input = tgui_input_list(user, "Choose your character's voice type", "VOICE TYPE", GLOB.voice_types_list)
					if(voicetype_input)
						voice_type = voicetype_input
						to_chat(user, "<font color='red'>Your character will now vocalize with a [LOWER_TEXT(voice_type)] affect.</font>")

				if ("voicepack")
					var/voicepack_input = tgui_input_list(user, "Choose your character's emote voice pack", "VOICE PACK", GLOB.voice_packs_list)
					if(voicepack_input)
						voice_pack = voicepack_input
						if(voicepack_input != "Default")
							to_chat(user, span_red("<font color='red'>Your character will now audibly emote with a [LOWER_TEXT(voicepack_input)] affect.") + span_notice("<br>This will override your Voice Identity and Class-specific voice packs.</font>"))
						else
							to_chat(user, "<font color='red'>Your character will now audibly emote in accordance to their Voice Identity and any Racial / Class-specific voice packs.</font>")

				if("taur_type")
					var/list/species_taur_list = pref_species.get_taur_list()
					if(!LAZYLEN(species_taur_list))
						taur_type = null
						to_chat(user, span_bad("There are no available taur bodies for this species."))
						return

					var/list/taur_selection
					if(pref_species.forced_taur)
						taur_selection = list()
					else
						taur_selection = list("None")

					for(var/obj/item/bodypart/taur/tt as anything in pref_species.get_taur_list())
						taur_selection[tt::name] = tt

					var/new_taur_type = tgui_input_list(user, "Choose your character's taur body", "TAUR BODY", taur_selection)
					if(!new_taur_type)
						return

					if(new_taur_type == "None")
						taur_type = null
					else
						taur_type = taur_selection[new_taur_type]

					var/obj/item/bodypart/taur/tt = taur_type
					to_chat(user, span_red("Your character now has [tt ? tt::name : "no taurtype."]."))

				if("origin")
					open_origin_map(user)
					return

				if("faith")
					var/list/faiths_named = list()
					for(var/path as anything in GLOB.preference_faiths)
						var/datum/faith/faith = GLOB.faithlist[path]
						if(!faith.name)
							continue
						faiths_named[faith.name] = faith
					var/faith_input = tgui_input_list(user, "The world rots. Which truth you bear?", "FAITH", faiths_named)
					if(faith_input)
						var/datum/faith/faith = faiths_named[faith_input]
						to_chat(user, "<font color='yellow'>Faith: [faith.name]</font>")
						to_chat(user, "Background: [faith.desc]")
						to_chat(user, "<font color='purple'>Likely Worshippers: [faith.worshippers]</font>")
						selected_patron = GLOB.patronlist[faith.godhead] || GLOB.patronlist[pick(GLOB.patrons_by_faith[faith_input])]

				if("patron")
					var/list/patrons_named = list()
					for(var/path as anything in GLOB.patrons_by_faith[selected_patron?.associated_faith || initial(default_patron.associated_faith)])
						var/datum/patron/patron = GLOB.patronlist[path]
						if(!patron.name)
							continue
						if(patron.disabled_patron)
							continue
						patrons_named[patron.name] = patron
					var/god_input = tgui_input_list(user, "The first amongst many.", "PATRON", patrons_named)
					if(god_input)
						selected_patron = patrons_named[god_input]
						to_chat(user, "<font color='yellow'>Patron: [selected_patron]</font>")
						to_chat(user, "<font color='#FFA500'>Domain: [selected_patron.domain]</font>")
						to_chat(user, "Background: [selected_patron.desc]")
						to_chat(user, "<font color='purple'>Likely Worshippers: [selected_patron.worshippers]</font>")
						to_chat(user, "<font color='white'>Considers these to be VIRTUES: [selected_patron.virtues]</font>")
						to_chat(user, "<font color='red'>Considers these to be SINS: [selected_patron.sins]</font>")

				if("combat_music") // if u change shit here look at /client/verb/combat_music() too
					if(!combat_music_helptext_shown)
						to_chat(user, span_notice("<span class='bold'>Combat Music Override</span>\n") + \
						"Options other than \"Default\" override whatever the game dynamically sets for you, \
						which is influenced by your job class, villain status, or certain events.\n\
						You can change this later through \"Combat Mode Music\" in the Options tab.\"</span>")
						combat_music_helptext_shown = TRUE
					var/client/C = user?.client
					if(!C)
						return
					var/datum/combat_music/selected_track = C.pick_combat_music_with_listen(
						"To you, the Signal sounds like:",
						"COMBAT MUSIC",
						combat_music?.name,
					)
					if(selected_track)
						combat_music = selected_track
						to_chat(user, span_notice("Selected track: <b>[selected_track.name]</b>."))
						if(combat_music.desc)
							to_chat(user, "<i>[combat_music.desc]</i>")
						if(combat_music.credits)
							to_chat(user, span_info("Song name: <b>[combat_music.credits]</b>"))

				if("bdetail")
					var/list/loly = list("Not yet.","Work in progress.","Don't click me.","Stop clicking this.","Nope.","Be patient.","Sooner or later.")
					to_chat(user, "<font color='red'>[pick(loly)]</font>")
					return

				if("voice")
					var/new_voice = tgui_color_picker(user, "Choose your character's voice color:", "Voice colour", "#"+voice_color)
					if(new_voice)
						new_voice = sanitize_hexcolor(new_voice)
						if(color_hex2num("#[new_voice]") < 230)
							to_chat(user, "<font color='red'>This voice color is too dark for mortals.</font>")
							return
						voice_color = new_voice

				if("extra_language")
					var/static/list/selectable_languages = list(
						/datum/language/elvish,
						/datum/language/dwarvish,
						/datum/language/orcish,
						/datum/language/hellspeak,
						/datum/language/draconic,
						/datum/language/celestial,
						/datum/language/canilunzt,
						/datum/language/grenzelhoftian,
						/datum/language/kazengunese,
						/datum/language/etruscan,
						/datum/language/gronnic,
						/datum/language/hammerholdian,
						/datum/language/otavan,
						/datum/language/aavnic,
						/datum/language/merar
					)
					var/list/choices = list("None")
					for(var/language in selectable_languages)
						if(language in pref_species.languages)
							continue
						var/datum/language/a_language = new language()
						choices[a_language.name] = language

					var/chosen_language = tgui_input_list(user, "Choose your character's extra language:", "EXTRA LANGUAGE", choices)
					if(chosen_language)
						if(chosen_language == "None")
							extra_language = "None"
						else
							extra_language = choices[chosen_language]


				if("race_title")
					var/list/titles = pref_species.race_titles
					var/list/choices = list("None")
					for(var/A in titles)
						if(A == pref_species.languages)
							continue
						choices += list(A)
					if(user?.client)
						var/result = tgui_input_list(user, "What do they call your kind?", "RACE TITLE", choices)

						if(result)
							if(result == "None")
								selected_title = "None"
							else
								selected_title = result

				if("voice_pitch")
					var/new_voice_pitch = tgui_input_number(user, "Choose your character's voice pitch ([MIN_VOICE_PITCH] to [MAX_VOICE_PITCH], lower is deeper):", "Voice Pitch", 1, 1.35, 0.8, round_value = FALSE)
					if(new_voice_pitch)
						if(new_voice_pitch < MIN_VOICE_PITCH || new_voice_pitch > MAX_VOICE_PITCH)
							to_chat(user, "<font color='red'>Value must be between [MIN_VOICE_PITCH] and [MAX_VOICE_PITCH].</font>")
							return
						voice_pitch = new_voice_pitch

				if("barksound")
					var/list/woof_woof = list()
					var/current_bark
					for(var/path in GLOB.bark_list)
						var/datum/bark/B = GLOB.bark_list[path]
						if(initial(B.ignore))
							continue
						if(initial(B.ckeys_allowed))
							var/list/allowed = initial(B.ckeys_allowed)
							if(!allowed.Find(user.client.ckey))
								continue
						woof_woof[initial(B.name)] = initial(B.id)
						if(initial(B.id) == bark_id)
							current_bark = initial(B.name)
					var/new_bork = tgui_input_list(user, "Choose your vocal bark.", "Character voice", woof_woof, current_bark)
					if(new_bork)
						bark_id = woof_woof[new_bork]
						var/datum/bark/B = GLOB.bark_list[bark_id] //Now we need sanitization to take into account bark-specific min/max values
						bark_speed = round(clamp(bark_speed, initial(B.minspeed), initial(B.maxspeed)), 1)
						bark_pitch = clamp(bark_pitch, initial(B.minpitch), initial(B.maxpitch))
						bark_variance = clamp(bark_variance, initial(B.minvariance), initial(B.maxvariance))

				if("barkspeed")
					var/datum/bark/B = GLOB.bark_list[bark_id]
					var/borkset = tgui_input_number(user, "Choose your bark speed. Higher is slower; lower is faster.", "Bark speed", bark_speed, initial(B.maxspeed), initial(B.minspeed))
					if(!isnull(borkset))
						bark_speed = round(clamp(borkset, initial(B.minspeed), initial(B.maxspeed)), 1)

				if("barkpitch")
					var/datum/bark/B = GLOB.bark_list[bark_id]
					var/borkset = tgui_input_number(user, "Choose your baseline bark pitch.", "Bark pitch", bark_pitch, initial(B.maxpitch), initial(B.minpitch), round_value = FALSE)
					if(!isnull(borkset))
						bark_pitch = clamp(borkset, initial(B.minpitch), initial(B.maxpitch))

				if("barkvary")
					var/datum/bark/B = GLOB.bark_list[bark_id]
					var/borkset = tgui_input_number(user, "Choose how much your bark pitch varies.", "Bark variation", bark_variance, initial(B.maxvariance), initial(B.minvariance), round_value = FALSE)
					if(!isnull(borkset))
						bark_variance = clamp(borkset, initial(B.minvariance), initial(B.maxvariance))

				if("barkpreview")
					if(SSticker.current_state == GAME_STATE_STARTUP) //Timers don't tick at all during game startup, so let's just give an error message
						to_chat(user, "<span class='warning'>Bark previews can't play during initialization!</span>")
						return
					if(!COOLDOWN_FINISHED(src, bark_previewing))
						return
					if(!parent || !parent.mob)
						return
					COOLDOWN_START(src, bark_previewing, (5 SECONDS))
					var/atom/movable/barkbox = new(get_turf(parent.mob))
					barkbox.set_bark(bark_id)
					var/total_delay = 0
					for(var/i in 1 to (round((32 / bark_speed)) + 1))
						addtimer(CALLBACK(barkbox, TYPE_PROC_REF(/atom/movable, bark), list(parent.mob), 7, 70, BARK_DO_VARY(bark_pitch, bark_variance)), total_delay)
						total_delay += rand(DS2TICKS(bark_speed/4), DS2TICKS(bark_speed/4) + DS2TICKS(bark_speed/4)) TICKS
					QDEL_IN(barkbox, total_delay)

				if("highlight_color")
					var/new_color = color_pick_sanitized(user, "Choose your character's nickname highlight color:", "Character Preference","#"+highlight_color)
					if(new_color)
						highlight_color = sanitize_hexcolor(new_color)

				if("headshot")
					to_chat(user, "<span class='notice'>Please use a relatively SFW image of the head and shoulder area to maintain immersion level. Lastly, ["<span class='bold'>do not use a real life photo or use any image that is less than serious.</span>"]</span>")
					to_chat(user, "<span class='notice'>If the photo doesn't show up properly in-game, ensure that it's a direct image link that opens properly in a browser.</span>")
					to_chat(user, "<span class='notice'>Keep in mind that the photo will be downsized to 325x325 pixels, so the more square the photo, the better it will look.</span>")
					var/new_headshot_link = tgui_input_text(user, "Input the headshot link (https, hosts: gyazo, lensdump, imgbox, catbox, imgbb, filegarden):", "Headshot", headshot_link,  encode = FALSE)
					if(new_headshot_link == null)
						return
					if(new_headshot_link == "")
						headshot_link = null
						ShowChoices(user)
						return
					if(!valid_headshot_link(user, new_headshot_link))
						headshot_link = null
						ShowChoices(user)
						return
					headshot_link = new_headshot_link
					to_chat(user, "<span class='notice'>Successfully updated headshot picture</span>")
					log_game("[user] has set their Headshot image to '[headshot_link]'.")
				if("legacyhelp")
					var/list/dat = list()
					dat += "This slot was around since before major Flavortext / OOC changes.<br>"
					dat += "Due to this, it's been grandfathered in to keep its old profile layout and formatting, including html.<br>"
					dat += "If you wish to keep it as it is, <b>you cannot edit it anymore.</b><br><br>"
					dat += "ANY edit (Even pressing OK on an unchanged Flavortext / OOC notes) will <font color ='red'><b>irreversibly</b></font> override all html, and remove the legacy status of the slot.<br>"
					dat += "There are no exceptions. Have fun!"
					dat += "(You can still add an OOC Extra)"
					var/datum/browser/popup = new(user, "Legacy Help", nwidth = 450, nheight = 250)
					popup.set_content(dat.Join())
					popup.open(FALSE)
				if("formathelp")
					var/list/dat = list()
					dat += "<div class='chronicle-help' tabindex='0' role='region' aria-label='Chronicle formatting reference'>"
					dat += "<h1>Formatting Help</h1>"
					dat += "<table><thead><tr><th scope='col'>Syntax</th><th scope='col'>Result</th></tr></thead><tbody>"
					dat += "<tr><td><code># text</code></td><td><h2>text</h2>Header</td></tr>"
					dat += "<tr><td><code>|text|</code></td><td><div class='chronicle-center'>text</div>Centered text</td></tr>"
					dat += "<tr><td><code>**text**</code></td><td><b>text</b> &mdash; bold</td></tr>"
					dat += "<tr><td><code>*text*</code></td><td><i>text</i> &mdash; italic</td></tr>"
					dat += "<tr><td><code>^text^</code></td><td><font size='4'>text</font> &mdash; larger</td></tr>"
					dat += "<tr><td><code>((text))</code></td><td><font size='1'>text</font> &mdash; smaller</td></tr>"
					dat += "<tr><td><code>* item</code></td><td><ul><li>item</li></ul>Unordered list</td></tr>"
					dat += "<tr><td><code>---</code></td><td><hr>Horizontal rule</td></tr>"
					dat += "<tr><td><code>-=FFFFFFtext=-</code></td><td><font color='#FFFFFF'>text</font> &mdash; colour</td></tr>"
					dat += "</tbody></table>"
					dat += "<p class='chronicle-note'>Use a backslash (<code>&#92;</code>) to escape special characters. Replace <code>FFFFFF</code> with a six-digit colour code.</p>"
					dat += "<p class='chronicle-minimums'>Minimum Flavortext: <b>[MINIMUM_FLAVOR_TEXT]</b> characters.<br>Minimum OOC Notes: <b>[MINIMUM_OOC_NOTES]</b> characters.</p></div>"
					var/datum/browser/popup = new(user, "chronicle_formathelp", nwidth = 460, nheight = 560)
					popup.add_stylesheet("chronicle_help", 'html/browser/chronicle_help.css')
					var/datum/asset/simple/roguefonts/panel_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
					var/list/font_urls = panel_fonts.get_url_mappings()
					popup.add_head_content("<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Keep Rocker'; src: url('[font_urls["newrocker.ttf"]]'); }</style>")
					popup.set_content(dat.Join())
					popup.open(FALSE)
					winset(user, "chronicle_formathelp.browser", "focus=true")
				if("skin_color_ref_list")
					var/list/dat = list()
					dat +="Skin color codes reference list<br>"
					dat += "<br>"
					for(var/tone in pref_species.get_skin_list_tooltip())
						dat += "[tone]<br>"
					var/datum/browser/popup = new(user, "Formatting Help", nwidth = 400, nheight = 450)
					popup.set_content(dat.Join())
					popup.open(FALSE)
				if("flavortext")
					to_chat(user, "<span class='notice'>["<span class='bold'>Flavortext should not include nonphysical nonsensory attributes such as backstory or the character's internal thoughts.</span>"]</span>")
					var/new_flavortext = tgui_input_text(user, "Input your character description:", "Flavortext", flavortext, multiline = TRUE,  encode = FALSE, bigmodal = TRUE)
					if(new_flavortext == null)
						return
					if(new_flavortext == "")
						flavortext = null
						ShowChoices(user)
						return
					flavortext = new_flavortext
					to_chat(user, "<span class='notice'>Successfully updated flavortext</span>")
					log_game("[user] has set their flavortext'.")
				if("ooc_notes")
					to_chat(user, "<span class='notice'>["<span class='bold'>OOC notes should be used for roleplay hooks and general information about your character.</span>"]</span>")
					var/new_ooc_notes = tgui_input_text(user, "Input your OOC preferences:", "OOC notes", ooc_notes, multiline = TRUE,  encode = FALSE, bigmodal = TRUE)
					if(new_ooc_notes == null)
						return
					if(new_ooc_notes == "")
						ooc_notes = null
						ShowChoices(user)
						return
					ooc_notes = new_ooc_notes
					to_chat(user, "<span class='notice'>Successfully updated OOC notes.</span>")
					log_game("[user] has set their OOC notes'.")

				if("rumour")
					to_chat(user, span_notice("Rumours are things others might know, or think they know about you, they don't necessarily have to be precise, or even true. But remember that they can provide a hint to another player on how to interact with, or even think about your character.\n<b>Avoid explicit bodily descriptions, though rumors like \"sleeps around a lot\" are fine.</b>"))
					var/new_rumour = tgui_input_text(user, "Input rumours about your character: (400 Character Limit)", "Rumours", rumour, multiline = TRUE, encode = FALSE, bigmodal = TRUE)
					if(new_rumour == null)
						return
					if(new_rumour == "")
						rumour = null
						ShowChoices(user)
						return
					if(length(new_rumour) > 750)
						to_chat(user, span_warning("Rumours cannot exceed 750 characters."))
						ShowChoices(user)
						return
					rumour = new_rumour
					to_chat(user, span_notice("Successfully updated Rumours"))
					log_game("[user] has set their rumour'.")

				if("gossip")
					to_chat(user, span_notice("Gossip is rumours spread around, and known only in Noble circles, only other well-born individuals are aware of it. Gossip, similarly to standard rumours does not need to be precise or true, but remember that it can provide hints and avenues for other Nobles to interact with, and judge your Character.\n<b>Avoid explicit bodily descriptions, though rumors like \"sleeps around a lot\" are fine.</b>"))
					var/new_gossip = tgui_input_text(user, "Input noble gossip about your character: (400 Character Limit)", "Noble Gossip", noble_gossip, multiline = TRUE, encode = FALSE, bigmodal = TRUE)
					if(new_gossip == null)
						return
					if(new_gossip == "")
						noble_gossip = null
						ShowChoices(user)
						return
					if(length(new_gossip) > 750)
						to_chat(user, span_notice("Noble gossip cannot exceed 750 characters."))
						ShowChoices(user)
						return
					noble_gossip = new_gossip
					to_chat(user, span_notice("Successfully updated Noble Gossip"))
					log_game("[user] has set their noble gossip'.")

				if("nsfwflavortext")
					to_chat(user, "<span class='notice'>["<span class='bold'>NSFW Flavortext can be used for setting things like body descriptions and other physical details that may be conisdered explicit.</span>"]</span>")
					to_chat(user, "<font color = '#d6d6d6'>Leave blank to clear.</font>")
					var/new_nsfwflavortext = tgui_input_text(user, "Input your character description:", "NSFW Flavortext", nsfwflavortext, multiline = TRUE,  encode = FALSE, bigmodal = TRUE)
					if(new_nsfwflavortext == null)
						return
					if(new_nsfwflavortext == "")
						new_nsfwflavortext = null
						nsfwflavortext = null
						to_chat(user, "<span class='notice'>Successfully deleted NSFW Flavor Text.</span>")
						ShowChoices(user)
						return
					nsfwflavortext = new_nsfwflavortext
					to_chat(user, "<span class='notice'>Successfully updated NSFW flavortext</span>")
					log_game("[user] has set their NSFW flavortext'.")
				if("erpprefs")
					to_chat(user, "<span class='notice'>["<span class='bold'>Erotic Roleplay preferences. If you put 'anything goes' or 'no limits' here, do not be surprised if people take you up on it.</span>"]</span>")
					to_chat(user, "<font color = '#d6d6d6'>Leave blank to clear.</font>")
					var/new_erpprefs = tgui_input_text(user, "Input your preferences:", "ERP Preferences", erpprefs, multiline = TRUE,  encode = FALSE, bigmodal = TRUE)
					if(new_erpprefs == null)
						return
					if(new_erpprefs == "")
						new_erpprefs = null
						erpprefs = null
						to_chat(user, "<span class='notice'>Successfully deleted ERP preferences.</span>")
						ShowChoices(user)
						return
					erpprefs = new_erpprefs
					to_chat(user, "<span class='notice'>Successfully updated ERP Preferences.</span>")
					log_game("[user] has set their ERP preferences'.")

				if("img_gallery")

					if(img_gallery.len >= 3)
						to_chat(user, "You already have three images in your gallery!")
						return

					to_chat(user, "<span class='notice'>Please use an image ["<span class='bold'>of your character</span>"] to maintain immersion level. Lastly, ["<span class='bold'>do not use a real life photo or use any image that is less than serious.</span>"]</span>")
					to_chat(user, "<span class='notice'>If the photo doesn't show up properly in-game, ensure that it's a direct image link that opens properly in a browser.</span>")
					to_chat(user, "<span class='notice'>Keep in mind that all three images are displayed next to eachother and justified to fill a horizontal rectangle. As such, vertical images work best.</span>")
					to_chat(user, "<span class='notice'>You can only have a maximum of ["<span class='bold'>THREE IMAGES</span>"] in your gallery at a time.</span>")

					var/new_galleryimg = tgui_input_text(user, "Input the image link (https, hosts: gyazo, lensdump, imgbox, catbox, imgbb, filegarden):", "Gallery Image",  encode = FALSE)

					if(new_galleryimg == null)
						return
					if(new_galleryimg == "")
						new_galleryimg = null
						ShowChoices(user)
						return
					if(!valid_headshot_link(user, new_galleryimg))
						to_chat(user, "<span class='notice'>Invalid image link. Make sure it's a direct link from a valid host (gyazo, lensdump, imgbox, catbox, imgbb, filegarden).</span>")
						new_galleryimg = null
						ShowChoices(user)
						return
					img_gallery += new_galleryimg
					to_chat(user, "<span class='notice'>Successfully added image to gallery.</span>")
					log_game("[user] has added an image to their gallery: '[new_galleryimg]'.")

				if("nsfw_img_gallery")

					if(nsfw_img_gallery.len >= 3)
						to_chat(user, "You already have three images in your gallery!")
						return

					to_chat(user, "<span class='notice'>Please use an image ["<span class='bold'>of your character</span>"] to maintain immersion level. Lastly, ["<span class='bold'>do not use a real life photo or use any image that is less than serious.</span>"]</span>")
					to_chat(user, "<span class='notice'>If the photo doesn't show up properly in-game, ensure that it's a direct image link that opens properly in a browser.</span>")
					to_chat(user, "<span class='notice'>Keep in mind that all three images are displayed next to eachother and justified to fill a horizontal rectangle. As such, vertical images work best.</span>")
					to_chat(user, "<span class='notice'>You can only have a maximum of ["<span class='bold'>THREE IMAGES</span>"] in your gallery at a time.</span>")

					var/new_galleryimg = tgui_input_text(user, "Input the image link (https, hosts: gyazo, lensdump, imgbox, catbox, imgbb, filegarden):", "Gallery Image",  encode = FALSE)

					if(new_galleryimg == null)
						return
					if(new_galleryimg == "")
						new_galleryimg = null
						ShowChoices(user)
						return
					if(!valid_headshot_link(user, new_galleryimg))
						to_chat(user, "<span class='notice'>Invalid image link. Make sure it's a direct link from a valid host (gyazo, lensdump, imgbox, catbox, imgbb, filegarden).</span>")
						new_galleryimg = null
						ShowChoices(user)
						return
					nsfw_img_gallery += new_galleryimg
					to_chat(user, "<span class='notice'>Successfully added image to nsfw gallery.</span>")
					log_game("[user] has added an image to their nsfw gallery: '[new_galleryimg]'.")

				if("clear_gallery")
					if(!img_gallery.len)
						to_chat(user, "You don't have any images in your gallery to clear!")
						return
					var/dachoice = tgui_alert(user, "Do you really want to clear your image gallery?", "Clear Gallery", list("Yae", "Nae"))
					if(dachoice == "Nae")
						ShowChoices(user)
						return
					img_gallery = list()
					to_chat(user, "<span class='notice'>Successfully cleared image gallery.</span>")
					log_game("[user] has cleared their image gallery.")

				if("clear_nsfw_gallery")
					if(!nsfw_img_gallery.len)
						to_chat(user, "You don't have any images in your nsfw gallery to clear!")
						return
					var/dachoice = tgui_alert(user, "Do you really want to clear your nsfw image gallery?", "Clear nsfw Gallery", list("Yae", "Nae"))
					if(dachoice == "Nae")
						ShowChoices(user)
						return
					nsfw_img_gallery = list()
					to_chat(user, "<span class='notice'>Successfully cleared their nsfw image gallery.</span>")
					log_game("[user] has cleared their nsfw image gallery.")

				if("ooc_preview")
					var/datum/examine_panel/preview_examine_panel = new(user)
					preview_examine_panel.pref = src
					preview_examine_panel.holder = user
					preview_examine_panel.viewing = user
					preview_examine_panel.previewing = "character"
					preview_examine_panel.ui_interact(user)

				if("rumour_preview")
					var/msg = ""
					if(rumour && length(rumour))
						var/rumour_display = rumour
						rumour_display = html_encode(rumour_display)
						rumour_display = parsemarkdown_basic(rumour_display, hyperlink = TRUE)
						msg += "<b>You recall what you heard around Town about [real_name]...</b><br>[rumour_display]"
					if(length(noble_gossip))
						if(msg)
							msg += "<br><br>"
						var/gossip_display = noble_gossip
						gossip_display = html_encode(gossip_display)
						gossip_display = parsemarkdown_basic(gossip_display, hyperlink = TRUE)
						msg += "<b>You recall what the other Blue-bloods hushed about [real_name]...</b><br>[gossip_display]"
					if(msg)
						to_chat(user, "<span class='info'>[msg]</span>")

				if("ooc_extra")
					to_chat(user, "<span class='notice'>Add a link from a suitable host (catbox, etc) to an mp3 to embed in your flavor text.</span>")
					to_chat(user, "<span class='notice'>If the song doesn't  play properly, ensure that it's a direct link that opens properly in a browser.</span>")
					to_chat(user, "<font color = '#d6d6d6'>Leave blank to clear your current song.</font>")
					to_chat(user, "<font color ='red'>Abuse of this will get you banned.</font>")
					var/new_extra_link = tgui_input_text(user, "Input the accessory link (https, hosts: catbox):", "Song URL", ooc_extra, encode = FALSE)
					if(new_extra_link == null)
						return
					if(new_extra_link == "")
						new_extra_link = null
						ooc_extra = null
						to_chat(user, "<span class='notice'>Successfully deleted OOC Extra.</span>")
						ShowChoices(user)
						return
					var/static/list/valid_extensions = list("mp3")
					if(!valid_headshot_link(user, new_extra_link, FALSE, valid_extensions))
						new_extra_link = null
						ShowChoices(user)
						return

					var/list/value_split = splittext(new_extra_link, ".")

					// extension will always be the last entry
					var/extension = value_split[length(value_split)]
					if((extension in valid_extensions))
						ooc_extra = new_extra_link
						to_chat(user, "<span class='notice'>Successfully updated Song URL.</span>")
						log_game("[user] has set their Song URL to '[ooc_extra]'.")

				if("change_artist")
					var/new_artist = tgui_input_text(user, "Input your song's artist:", "Song Artist", song_artist,  encode = FALSE)
					if(new_artist == null)
						return
					if(new_artist == "")
						ShowChoices(user)
						return
					song_artist = new_artist
					to_chat(user, "<span class='notice'>Successfully updated song artist.</span>")
					log_game("[user] has set their song artist.")

				if("change_title")
					var/new_title = tgui_input_text(user, "Input your song's title (Character limit is [MAX_SONG_TITLE_LENGTH]):", "Song title", song_title,  encode = FALSE, max_length = MAX_SONG_TITLE_LENGTH)
					if(new_title== null)
						return
					if(new_title == "")
						ShowChoices(user)
						return
					song_title = new_title
					to_chat(user, "<span class='notice'>Successfully updated song title.</span>")
					log_game("[user] has set their song title.")

				if("ooc_extra_img")
					to_chat(user, "<span class='notice'>Add a link to images/videos (jpg, png, gif, mp4) that will be displayed in your Flavor Text.</span>")
					to_chat(user, "<span class='notice'>Images/videos will be constrained by width but have limitless height. Suitable hosts: catbox, discord, gyazo, lensdump, imgbox, imgbb, filegarden.</span>")
					to_chat(user, "<font color='#d6d6d6'>Leave a single space to delete it.</font>")
					to_chat(user, "<font color='red'>Abuse of this will get you banned.</font>")
					var/link = tgui_input_text(user, "Input the image/video link (https):", "OOC Extra Image", ooc_extra_img_link, encode = FALSE)
					if(link == null)
						return
					if(link == "")
						link = null
						var/choice = tgui_alert(user, "Do you really want to clear your OOC Extra Image/Video/Gif?", "Clear OOC Extra Image/Video/Gif", list("Yae", "Nae"))
						if(choice == "Nae")
							ShowChoices(user)
							return
						ooc_extra_img = null
						ooc_extra_img_link = null
						to_chat(user, "<span class='notice'>Successfully deleted OOC Extra Image.</span>")
						ShowChoices(user)
						return
					var/static/list/valid_ext = list("jpg", "jpeg", "png", "gif", "mp4")
					if(!valid_headshot_link(user, link, FALSE, valid_ext))
						link = null
						ShowChoices(user)
						return
					ooc_extra_img_link = link
					var/ext = LOWER_TEXT(splittext(link, ".")[length(splittext(link, "."))])
					var/info
					switch(ext)
						if("jpg", "jpeg", "png", "gif")
							ooc_extra_img = "<div align='center'><br><img src='[link]' style='max-width: 100%;'/></div>"
							info = "an image."
						if("mp4")
							ooc_extra_img = "<div align='center'><br><video style='max-width: 100%;' controls><source src='[link]' type='video/mp4'></video></div>"
							info = "a video."
					to_chat(user, "<span class='notice'>Successfully updated OOC Extra Image with [info]</span>")
					log_game("[user] has set their OOC Extra Image to '[link]'.")

				if("nsfw_ooc_extra_img")
					to_chat(user, "<span class='notice'>Add a link to NSFW images/videos (jpg, png, gif, mp4) that will be displayed in your NSFW Flavor Text.</span>")
					to_chat(user, "<span class='notice'>Images/videos will be constrained by width but have limitless height. Suitable hosts: catbox, discord, gyazo, lensdump, imgbox, imgbb, filegarden.</span>")
					to_chat(user, "<font color='#d6d6d6'>Leave a single space to delete it.</font>")
					to_chat(user, "<font color='red'>Abuse of this will get you banned.</font>")
					var/link = tgui_input_text(user, "Input the image/video link (https):", "NSFW OOC Extra Image", nsfw_ooc_extra_img_link, encode = FALSE)
					if(link == null)
						return
					if(link == "")
						link = null
						var/choice = tgui_alert(user, "Do you really want to clear your NSFW OOC Extra Image/Video/Gif?", "Clear NSFW OOC Extra Image/Video/Gif", list("Yae", "Nae"))
						if(choice == "Nae")
							ShowChoices(user)
							return
						nsfw_ooc_extra_img = null
						nsfw_ooc_extra_img_link = null
						to_chat(user, "<span class='notice'>Successfully deleted NSFW OOC Extra Image.</span>")
						ShowChoices(user)
						return
					var/static/list/valid_ext = list("jpg", "jpeg", "png", "gif", "mp4")
					if(!valid_headshot_link(user, link, FALSE, valid_ext))
						link = null
						ShowChoices(user)
						return
					nsfw_ooc_extra_img_link = link
					var/ext = LOWER_TEXT(splittext(link, ".")[length(splittext(link, "."))])
					var/info
					switch(ext)
						if("jpg", "jpeg", "png", "gif")
							nsfw_ooc_extra_img = "<div align='center'><br><img src='[link]' style='max-width: 100%;'/></div>"
							info = "an image."
						if("mp4")
							nsfw_ooc_extra_img = "<div align='center'><br><video style='max-width: 100%;' controls><source src='[link]' type='video/mp4'></video></div>"
							info = "a video."
					to_chat(user, "<span class='notice'>Successfully updated NSFW OOC Extra Image with [info]</span>")
					log_game("[user] has set their NSFW OOC Extra Image to '[link]'.")

				if("familiar_prefs")
					familiar_prefs.fam_show_ui()

				if("gnoll_prefs")
					gnoll_prefs.gnoll_show_ui(user)

				if("species")
					var/list/species = list()
					for(var/A in GLOB.roundstart_races)
						var/datum/species/race = GLOB.species_list[A]
						race = new race()
						if(user.client)
							if(race.patreon_req > user.client.patreonlevel())
								continue
						else
							continue
						species += race

					species = sortNames(species)

					var/result = tgui_input_list(user, "By what shape are you bound?", "RACE", species, pref_species.name)

					if(result)
						set_new_race(result, user)

				if("update_mutant_colors")
					update_mutant_colors = !update_mutant_colors

				if("mutant_skin")
					if(pref_species.mutant_skin_option)
						mutant_skin = !mutant_skin
						try_update_mutant_colors()

				if("dnr")
					dnr_pref = !dnr_pref

				if("charflaw")
					var/list/coom = GLOB.character_flaws.Copy()
					var/result = tgui_input_list(user, "What burden will you bear?", "FLAWS",coom)
					if(result)
						result = coom[result]
						var/datum/charflaw/C = new result()
						charflaw = C
						if(charflaw.desc)
							to_chat(user, "<span class='info'>[charflaw.desc]</span>")

				if("vices_menu")
					open_vices_menu(user)
					return

				if("race_bonus_select")
					if(length(pref_species.custom_selection))
						var/choice = tgui_input_list(user, "What has fate blessed your race with?", "BONUS", pref_species.custom_selection)
						if(choice)
							race_bonus = pref_species.custom_selection[choice]

				if("body_size")
					var/new_body_size = tgui_input_number(user, "Choose your desired sprite size:\n([BODY_SIZE_MIN*100]%-[BODY_SIZE_MAX*100]%), Warning: May make your character look distorted", "Character Preference", features["body_size"]*100)
					if(new_body_size)
						new_body_size = clamp(new_body_size * 0.01, BODY_SIZE_MIN, BODY_SIZE_MAX)
						features["body_size"] = new_body_size

				if("taur_color")
					var/new_taur_color = color_pick_sanitized(user, "Choose your character's taur color:", "Character Preference", "#"+taur_color)
					if(new_taur_color)
						taur_color = sanitize_hexcolor(new_taur_color)

				if("taur_markings")
					var/new_taur_markings = color_pick_sanitized(user, "Choose your character's taur markings color:", "Character Preference", "#"+taur_markings)
					if(new_taur_markings)
						taur_markings = sanitize_hexcolor(new_taur_markings)

				if("taur_tertiary")
					var/new_taur_tertiary = color_pick_sanitized(user, "Choose your character's taur tertiary markings color:", "Character Preference", "#"+taur_tertiary)
					if(new_taur_tertiary)
						taur_tertiary = sanitize_hexcolor(new_taur_tertiary)

				if("mutant_color")
					var/new_mutantcolor = color_pick_sanitized(user, "Choose your character's mutant #1 color:", "Character Preference","#"+features["mcolor"])
					if(new_mutantcolor)

						features["mcolor"] = sanitize_hexcolor(new_mutantcolor)
						try_update_mutant_colors()

				if("mutant_color2")
					var/new_mutantcolor = color_pick_sanitized(user, "Choose your character's mutant #2 color:", "Character Preference","#"+features["mcolor2"])
					if(new_mutantcolor)
						features["mcolor2"] = sanitize_hexcolor(new_mutantcolor)
						try_update_mutant_colors()

				if("mutant_color3")
					var/new_mutantcolor = color_pick_sanitized(user, "Choose your character's mutant #3 color:", "Character Preference","#"+features["mcolor3"])
					if(new_mutantcolor)
						features["mcolor3"] = sanitize_hexcolor(new_mutantcolor)
						try_update_mutant_colors()

				if("skin_choice_pick")
					var/prompt = alert(user, "Choose skin/scales color",, "Custom", "Predefined")
					if(prompt == "Custom")
						var/new_mutantcolor = color_pick_sanitized(user, "Choose your character's skin/scale color:", "Character Preference","#"+features["mcolor"])
						if(new_mutantcolor)
							features["mcolor"] = sanitize_hexcolor(new_mutantcolor)
							try_update_mutant_colors()
					if(prompt == "Predefined")
						var/listy = pref_species.get_skin_list()
						var/new_mutantcolor = tgui_input_list(user, "Choose your character's skin tone:", "Skin tone", listy)
						if(new_mutantcolor)
							features["mcolor"] = listy[new_mutantcolor]
							try_update_mutant_colors()

/*
				if("color_ethereal")
					var/new_etherealcolor = input(user, "Choose your ethereal color", "Character Preference") as null|anything in GLOB.color_list_ethereal
					if(new_etherealcolor)
						features["ethcolor"] = GLOB.color_list_ethereal[new_etherealcolor]

				if("legs")
					var/new_legs
					new_legs = input(user, "Choose your character's legs:", "Character Preference") as null|anything in GLOB.legs_list
					if(new_legs)
						features["legs"] = new_legs
*/
				if("s_tone")
					var/listy = pref_species.get_skin_list()
					var/new_s_tone = tgui_input_list(user, "Choose your character's skin tone:", "SKINTONE", listy)
					if(new_s_tone)
						skin_tone = listy[new_s_tone]
						try_update_mutant_colors()

				if("charflaw")
					var/selectedflaw
					selectedflaw = tgui_input_list(user, "Choose your character's flaw:", "FLAWS", GLOB.character_flaws)
					if(selectedflaw)
						charflaw = GLOB.character_flaws[selectedflaw]
						charflaw = new charflaw()
						if(charflaw.desc)
							to_chat(user, span_info("[charflaw.desc]"))

				if("char_accent")
					var/selectedaccent = tgui_input_list(user, "Choose your character's accent:", "Character Preference", GLOB.character_accents, char_accent)
					if(selectedaccent)
						char_accent = selectedaccent
						var/test_message = "Hello friend, yes this is good. My Lord rides through the Duchy with servants and soldiers; the captain and sergeant guard the church while archers and cavalry hold the north road. My sword and shield are sharp, the water flows refreshingly, and we thank the Duke before saying goodbye."
						var/preview = apply_accent_preview(selectedaccent, test_message)
						var/preview_text
						if(preview)
							preview_text = "[preview]"
						else
							preview_text = "[test_message] (this accent uses no text replacements)"

						var/list/accent_preview_spans = GLOB.accent_spans?[selectedaccent]
						if(accent_preview_spans?.len)
							var/accent_preview_span = accent_preview_spans[1]
							if(accent_preview_span)
								preview_text = "<span class='[accent_preview_span]'>[preview_text]</span>"

						to_chat(user, span_info("<b>[selectedaccent] Preview:</b> [preview_text]"))

				if("char_mannerism")
					var/selected_mannerism = tgui_input_list(user, "Choose your character's speech mannerism:", "Character Preference", GLOB.character_mannerisms, char_mannerism)
					if(selected_mannerism)
						char_mannerism = selected_mannerism
						var/test_message = "Hello friend, yes this is good. My Lord rides through the Duchy with servants and soldiers; the captain and sergeant guard the church while archers and cavalry hold the north road. My sword and shield are sharp, the water flows refreshingly, and we thank the Duke before saying goodbye."
						var/accent_preview = apply_accent_preview(char_accent, test_message)
						var/preview_message = accent_preview ? "[accent_preview]" : test_message
						var/preview_text = apply_mannerism_preview(selected_mannerism, preview_message)

						var/list/accent_preview_spans = GLOB.accent_spans?[char_accent]
						if(accent_preview_spans?.len)
							var/accent_preview_span = accent_preview_spans[1]
							if(accent_preview_span)
								preview_text = "<span class='[accent_preview_span]'>[preview_text]</span>"

						to_chat(user, span_info("<b>[selected_mannerism] Preview:</b> [preview_text]"))

				if("ooccolor")
					var/new_ooccolor = color_pick_sanitized(user, "Choose your OOC colour:", "Game Preference",ooccolor)
					if(new_ooccolor)
						ooccolor = new_ooccolor

				if("asaycolor")
					var/new_asaycolor = color_pick_sanitized(user, "Choose your ASAY color:", "Game Preference",asaycolor)
					if(new_asaycolor)
						asaycolor = new_asaycolor

				if("bag")
					var/new_backpack = input(user, "Choose your character's style of bag:", "Character Preference")  as null|anything in GLOB.backpacklist
					if(new_backpack)
						backpack = new_backpack

				if("suit")
					if(jumpsuit_style == PREF_SUIT)
						jumpsuit_style = PREF_SUIT
					else
						jumpsuit_style = PREF_SUIT

				if("uplink_loc")
					var/new_loc = input(user, "Choose your character's traitor uplink spawn location:", "Character Preference") as null|anything in GLOB.uplink_spawn_loc_list
					if(new_loc)
						uplink_spawn_loc = new_loc

				if("ai_core_icon")
					var/ai_core_icon = input(user, "Choose your preferred AI core display screen:", "AI Core Display Screen Selection") as null|anything in GLOB.ai_core_display_screens
					if(ai_core_icon)
						preferred_ai_core_display = ai_core_icon

				if("sec_dept")
					var/department = input(user, "Choose your preferred security department:", "Security Departments") as null|anything in GLOB.security_depts_prefs
					if(department)
						prefered_security_department = department

				if ("preferred_map")
					var/maplist = list()
					var/no_preference = "No Preference"
					var/current_map = no_preference
					for(var/M in config.maplist)
						var/datum/map_config/VM = config.maplist[M]

						if(!VM.votable)
							continue

						var/friendlyname = "[VM.map_name] "
						if (VM.voteweight <= 0)
							friendlyname += " (disabled)"
						maplist[friendlyname] = VM.map_name
						if(VM.map_name == preferred_map)
							current_map = friendlyname
					maplist[no_preference] = null
					var/pickedmap = tgui_input_list(user, "Choose your preferred map. This will be used to help weight random map selection.", "Preferred Map", sortList(maplist), current_map)
					if (pickedmap)
						preferred_map = maplist[pickedmap]

				if ("clientfps")
					var/desiredfps = tgui_input_number(user, "Choose your frame rate. Use 0 to follow the server tick rate (currently [world.fps]).", "Frame Rate", clientfps, 1000, 0)
					if (!isnull(desiredfps))
						clientfps = desiredfps
						parent.fps = desiredfps
				if("ui")
					var/pickedui = input(user, "Choose your UI style.", "Character Preference", UI_style)  as null|anything in sortList(GLOB.available_ui_styles)
					if(pickedui)
						UI_style = "Rogue"
						if (parent && parent.mob && parent.mob.hud_used)
							parent.mob.hud_used.update_ui_style(ui_style2icon(UI_style, src))
				if("pda_style")
					var/pickedPDAStyle = input(user, "Choose your PDA style.", "Character Preference", pda_style)  as null|anything in GLOB.pda_styles
					if(pickedPDAStyle)
						pda_style = pickedPDAStyle
				if("pda_color")
					var/pickedPDAColor = input(user, "Choose your PDA Interface color.", "Character Preference", pda_color) as color|null
					if(pickedPDAColor)
						pda_color = pickedPDAColor

				if("phobia")
					var/phobiaType = input(user, "What are you scared of?", "Character Preference", phobia) as null|anything in SStraumas.phobia_types
					if(phobiaType)
						phobia = phobiaType

		else
			switch(href_list["preference"])
				if("publicity")
					if(unlock_content)
						toggles ^= MEMBER_PUBLIC
				if ("max_chat_length")
					var/desiredlength = tgui_input_number(user, "Choose the maximum length of Runechat messages. Range: 1 to [CHAT_MESSAGE_MAX_LENGTH]. Default: [initial(max_chat_length)].", "Runechat Length", max_chat_length, CHAT_MESSAGE_MAX_LENGTH, 1)
					if (!isnull(desiredlength))
						max_chat_length = clamp(desiredlength, 1, CHAT_MESSAGE_MAX_LENGTH)
				if("gender")
					var/pickedGender = "male"
					if(gender == "male")
						pickedGender = "female"
					if(pickedGender && pickedGender != gender)
						gender = pickedGender
						to_chat(user, "<font color='red'>Your character will now use a [friendlyGenders[pickedGender]] sprite.</font>")
						//random_character(gender)
					genderize_customizer_entries()
				if("domhand")
					if(domhand == 1)
						domhand = 2
					else
						domhand = 1
				if("family")
					var/list/famtree_options_list = list(FAMILY_NONE, FAMILY_PARTIAL, FAMILY_NEWLYWED, "EXPLAIN THIS TO ME")
					if(age != AGE_ADULT)
						famtree_options_list = list(FAMILY_NONE, FAMILY_PARTIAL, FAMILY_NEWLYWED, FAMILY_FULL, "EXPLAIN THIS TO ME")
					var/new_family = tgui_input_list(user, "SELECT YOUR HERO'S BOND", "BLOOD IS THICKER THAN WATER", famtree_options_list, family)
					if(new_family == "EXPLAIN THIS TO ME")
						to_chat(user, span_purple("\
						--[FAMILY_NONE] will disable this feature.<br>\
						--[FAMILY_PARTIAL] will assign you as a progeny of a local house based on your species. This feature will instead assign you as a aunt or uncle to a local family if your older than ADULT.<br>\
						--[FAMILY_NEWLYWED] assigns you a spouse without adding you to a family. Setspouse will prioritize pairing you with another newlywed with the same name as your setspouse.<br>\
						--[FAMILY_FULL] will attempt to assign you as matriarch or patriarch of one of the local houses of the kingdom/town. Setspouse will will prevent \
						players with the setspouse = None from matching with you unless their name equals your setspouse."))

					else if(new_family)
						family = new_family
						setspouse = null
						gender_choice = ANY_GENDER
						xenophobe_pref = 0
				//Setspouse is part of the family subsystem. It will check existing families for this character and attempt to place you in this family.
				if("setspouse")
					var/newspouse = tgui_input_text(user, "INPUT THE IDENTITY OF ANOTHER HERO", "TIL DEATH DO US PART")
					if(newspouse)
						setspouse = newspouse
					else
						setspouse = null
				//Gender_choice is part of the family subsytem. It will check existing families members with the same preference of this character and attempt to place you in this family.
				if("gender_choice")
					// If pronouns are neutral, lock to ANY_GENDER
					if(pronouns == THEY_THEM || pronouns == IT_ITS)
						to_chat(user, span_warning("With neutral pronouns, you may only choose [ANY_GENDER]."))
						gender_choice = ANY_GENDER
					else
						var/list/gender_choice_option_list = list(ANY_GENDER, SAME_GENDER, DIFFERENT_GENDER)
						var/new_gender_choice  = tgui_input_list(user, "SELECT YOUR HERO'S PREFERENCE", "TO LOVE AND TO CHERISH", gender_choice_option_list, gender_choice)
						if(new_gender_choice)
							gender_choice = new_gender_choice
				if("species_choice")
					var/list/restriction_options = list("Unrestricted", "Same Race", "Select Specific Race")
					var/choice = tgui_input_list(user, "SELECT SPOUSE SPECIES RESTRICTION", "SPECIES RESTRICTION", restriction_options)
					if(choice == "Unrestricted")
						xenophobe_pref = 0
						restricted_species_pref = null
						to_chat(user, "Spouse species is unrestricted.")
					else if(choice == "Same Race")
						xenophobe_pref = 1
						restricted_species_pref = null
						to_chat(user, "Spouse species will be restricted to your race.")
					else if(choice == "Select Specific Race")
						var/list/available_races = list()
						for(var/race_name in GLOB.roundstart_races)
							available_races += race_name
						var/selected_race = tgui_input_list(user, "SELECT ALLOWED SPOUSE RACE", "SPECIES SELECTION", available_races)
						if(selected_race)
							xenophobe_pref = 2
							restricted_species_pref = selected_race
							to_chat(user, "Spouse species will be restricted to [selected_race].")
				if("hotkeys")
					hotkeys = !hotkeys
					if(hotkeys)
						winset(user, null, "input.focus=true command=activeInput input.background-color=[COLOR_INPUT_ENABLED]  input.text-color = #EEEEEE")
					else
						winset(user, null, "input.focus=true command=activeInput input.background-color=[COLOR_INPUT_DISABLED]  input.text-color = #ad9eb4")

				if("keybindings_capture")
					var/datum/keybinding/kb = GLOB.keybindings_by_name[href_list["keybinding"]]
					var/old_key = href_list["old_key"]
					CaptureKeybinding(user, kb, old_key)
					return

				if("keybindings_set")
					var/kb_name = href_list["keybinding"]
					if(!kb_name)
						user << browse(null, "window=capturekeypress")
						ShowChoices(user, 3)
						return

					var/clear_key = text2num(href_list["clear_key"])
					var/old_key = href_list["old_key"]
					if(clear_key)
						if(key_bindings[old_key])
							key_bindings[old_key] -= kb_name
							if(!length(key_bindings[old_key]))
								key_bindings -= old_key
						user << browse(null, "window=capturekeypress")
						apply_keybinding_changes(user.client)
						ShowChoices(user, 3)
						return

					var/new_key = uppertext(href_list["key"])
					var/AltMod = text2num(href_list["alt"]) ? "Alt" : ""
					var/CtrlMod = text2num(href_list["ctrl"]) ? "Ctrl" : ""
					var/ShiftMod = text2num(href_list["shift"]) ? "Shift" : ""
					var/numpad = text2num(href_list["numpad"]) ? "Numpad" : ""
					// var/key_code = text2num(href_list["key_code"])

					if(GLOB._kbMap[new_key])
						new_key = GLOB._kbMap[new_key]

					var/full_key
					switch(new_key)
						if("Alt")
							full_key = "[new_key][CtrlMod][ShiftMod]"
						if("Ctrl")
							full_key = "[AltMod][new_key][ShiftMod]"
						if("Shift")
							full_key = "[AltMod][CtrlMod][new_key]"
						else
							full_key = "[AltMod][CtrlMod][ShiftMod][numpad][new_key]"
					if(key_bindings[old_key])
						key_bindings[old_key] -= kb_name
						if(!length(key_bindings[old_key]))
							key_bindings -= old_key
					key_bindings[full_key] += list(kb_name)
					key_bindings[full_key] = sortList(key_bindings[full_key])

					user << browse(null, "window=capturekeypress")
					apply_keybinding_changes(user.client)

				if("keybindings_reset")
					var/choice = tgalert(user, "Would you prefer 'hotkey' or 'classic' defaults?", "Setup keybindings", "Hotkey", "Classic", "Cancel")
					if(choice == "Cancel")
						ShowChoices(user)
						return
					hotkeys = (choice == "Hotkey")
					key_bindings = (hotkeys) ? deepCopyList(GLOB.hotkey_keybinding_list_by_key) : deepCopyList(GLOB.classic_keybinding_list_by_key)
					apply_keybinding_changes(user.client)
				if("chat_on_map")
					chat_on_map = !chat_on_map
				if("see_chat_non_mob")
					see_chat_non_mob = !see_chat_non_mob
				if("action_buttons")
					buttons_locked = !buttons_locked
				if("tgui_fancy")
					tgui_fancy = !tgui_fancy
				if("tgui_lock")
					tgui_lock = !tgui_lock
				if("tgui_theme")
					setTguiStyle()
				if("parchment_skin")
					cycle_parchment_skin()
				if("winflash")
					windowflashing = !windowflashing

				//here lies the badmins
				if("hear_adminhelps")
					user.client.toggleadminhelpsound()
				if("hear_prayers")
					user.client.toggle_prayer_sound()
				if("announce_login")
					user.client.toggleannouncelogin()
				if("combohud_lighting")
					toggles ^= COMBOHUD_LIGHTING
				if("toggle_radio_chatter")
					user.client.toggle_hear_radio()
				if("toggle_prayers")
					user.client.toggleprayers()
				if("toggle_deadmin_always")
					toggles ^= DEADMIN_ALWAYS
				if("toggle_deadmin_antag")
					toggles ^= DEADMIN_ANTAGONIST
				if("toggle_deadmin_head")
					toggles ^= DEADMIN_POSITION_HEAD


				if("be_special")
					var/be_special_type = href_list["be_special_type"]
					if(be_special_type in be_special)
						be_special -= be_special_type
					else
						be_special += be_special_type

				if("toggle_random")
					var/random_type = href_list["random_type"]
					if(randomise[random_type])
						randomise -= random_type
					else
						randomise[random_type] = TRUE

				if("hear_midis")
					toggles ^= SOUND_MIDI

				if("lobby_music")
					toggles ^= SOUND_LOBBY
					if((toggles & SOUND_LOBBY) && user.client && isnewplayer(user))
						user.client.playtitlemusic()
					else
						user.stop_sound_channel(CHANNEL_LOBBYMUSIC)

/* 				if("ghost_ears")
					chat_toggles ^= CHAT_GHOSTEARS

				if("ghost_sight")
					chat_toggles ^= CHAT_GHOSTSIGHT

				if("ghost_whispers")
					chat_toggles ^= CHAT_GHOSTWHISPER

				if("ghost_radio")
					chat_toggles ^= CHAT_GHOSTRADIO

				if("ghost_pda")
					chat_toggles ^= CHAT_GHOSTPDA */

				if("income_pings")
					chat_toggles ^= CHAT_BANKCARD

				if("pull_requests")
					chat_toggles ^= CHAT_PULLR

				if("allow_midround_antag")
					toggles ^= MIDROUND_ANTAG

				if("parallaxup")
					parallax = WRAP(parallax + 1, PARALLAX_INSANE, PARALLAX_DISABLE + 1)
					if (parent && parent.mob && parent.mob.hud_used)
						parent.mob.hud_used.update_parallax_pref(parent.mob)

				if("parallaxdown")
					parallax = WRAP(parallax - 1, PARALLAX_INSANE, PARALLAX_DISABLE + 1)
					if (parent && parent.mob && parent.mob.hud_used)
						parent.mob.hud_used.update_parallax_pref(parent.mob)

				if("ambientocclusion")
					ambientocclusion = !ambientocclusion
					if(parent && parent.screen && parent.screen.len)
						var/atom/movable/screen/plane_master/game_world/PM = locate(/atom/movable/screen/plane_master/game_world) in parent.screen
						PM.backdrop(parent.mob)
						PM = locate(/atom/movable/screen/plane_master/game_world_fov_hidden) in parent.screen
						PM.backdrop(parent.mob)
						PM = locate(/atom/movable/screen/plane_master/game_world_above) in parent.screen
						PM.backdrop(parent.mob)

				if("auto_fit_viewport")
					auto_fit_viewport = !auto_fit_viewport
					if(auto_fit_viewport && parent)
						parent.fit_viewport()

				if("widescreenpref")
					widescreenpref = !widescreenpref
					user.client.change_view(CONFIG_GET(string/default_view))

				if("schizo_voice")
					toggles ^= SCHIZO_VOICE
					if(toggles & SCHIZO_VOICE)
						to_chat(user, "<span class='warning'>You are now a voice.\n\
										As a voice, you will receive meditations from players asking about game mechanics!\n\
										Good voices will be rewarded with PQ for answering meditations, while bad ones are punished at the discretion of The Management.</span>")
					else
						to_chat(user, span_warning("You are no longer a voice."))

				if("close_prefs")
					winshow(user, "preferencess_window", FALSE)
					user << browse(null, "window=preferences_browser")
					return

				if("migrants")
					migrant.show_ui()
					return

				if("manifest")
					parent.view_actors_manifest()
					return

				if("observe")
					if(is_banned_from(user.ckey, "Observer"))
						to_chat(user, span_danger("You are banned from observing."))
						return
					var/mob/dead/new_player/P = user
					P.make_me_an_observer()
					return

				if("finished")
					user << browse(null, "window=latechoices") //closes late choices window
					user << browse(null, "window=playersetup") //closes the player setup window
					user << browse(null, "window=preferences") //closes job selection
					user << browse(null, "window=mob_occupation")
					user << browse(null, "window=latechoices") //closes late job selection
					migrant.hide_ui() // Closes migrant menu

					SStriumphs.remove_triumph_buy_menu(user.client)

					winshow(user, "preferencess_window", FALSE)
					user << browse(null, "window=preferences_browser")
					user << browse(null, "window=lobby_window")
					return

				if("preview_erect_state")
					switch(preview_erect_state)
						if(ERECT_STATE_NONE)
							preview_erect_state = ERECT_STATE_PARTIAL
						if(ERECT_STATE_PARTIAL)
							preview_erect_state = ERECT_STATE_HARD
						else
							preview_erect_state = ERECT_STATE_NONE

				if("save")
					save_preferences()
					save_character()
					to_chat(user, span_notice("CHARACTER SAVED."))

				if("load")
					load_preferences()
					load_character()

				if("changeslot")
					var/list/choices = list()
					if(path)
						var/savefile/S = new /savefile(path)
						if(S)
							for(var/i=1, i<=max_save_slots, i++)
								var/name
								S.cd = "/character[i]"
								S["real_name"] >> name
								if(!name)
									name = "Slot[i]"
								choices["Slot [i]: [name]"] = i
					var/choice = tgui_input_list(user, "CHOOSE A HERO","ROGUETOWN", choices)
					if(choice)
						choice = choices[choice]
						if(!load_character(choice))
							random_character(null, FALSE, FALSE)
							save_character()

				if("tab")
					if (href_list["tab"])
						current_tab = text2num(href_list["tab"])

	ShowChoices(user)
	return 1

/datum/preferences/proc/validate_character_species()
	if(!(pref_species.name in GLOB.roundstart_races))
		set_new_race(new /datum/species/human/northern)
		random_character(gender, FALSE, FALSE)
	if(parent && pref_species.patreon_req > parent.patreonlevel())
		set_new_race(new /datum/species/human/northern)
		random_character(gender, FALSE, FALSE)

// Preference validation must also run when the portrait is not visible.
/datum/preferences/proc/normalize_character_identity(roundstart_checks = TRUE)
	if(roundstart_checks && CONFIG_GET(flag/humans_need_surnames) && (pref_species.id == "human" || pref_species.id == "humen"))
		var/firstspace = findtext(real_name, " ")
		if(!firstspace)
			real_name += " [pick(GLOB.last_names)]"
		else if(firstspace == length(real_name))
			real_name += "[pick(GLOB.last_names)]"
	if(!(char_accent in GLOB.character_accents))
		char_accent = "No accent"
	if(!(char_mannerism in GLOB.character_mannerisms))
		char_mannerism = "No mannerism"

/datum/preferences/proc/copy_to(mob/living/carbon/human/character, icon_updates = 1, roundstart_checks = TRUE, character_setup = FALSE, antagonist = FALSE, skip_normal_prefs = FALSE)
	if(skip_normal_prefs)
		// For gnolls spawning from a non-gnoll base slot, we must not apply any base-slot state.
		// Set species to gnoll immediately so advclass check_requirements can read dna.species.type.
		character.set_species(/datum/species/gnoll, icon_update = FALSE)
		// Set gender to MALE as a neutral default; gnoll pronouns override the displayed pronoun.
		character.gender = MALE
		if(gnoll_prefs?.gnoll_pronouns)
			character.pronouns = gnoll_prefs.gnoll_pronouns
		var/gnoll_name = gnoll_prefs?.ensure_gnoll_name() || "Gnoll"
		character.real_name = gnoll_name
		character.name = gnoll_name
		character.dna.real_name = gnoll_name
		return

	if(randomise[RANDOM_SPECIES] && !character_setup)
		random_species()

	if((randomise[RANDOM_BODY] || randomise[RANDOM_BODY_ANTAG] && antagonist) && !character_setup)
		slot_randomized = TRUE
		random_character(gender, antagonist)

	// Bandaid to undo no arm flaw prosthesis
	if(charflaw)
		var/obj/item/bodypart/O = character.get_bodypart(BODY_ZONE_R_ARM)
		if(O)
			O.drop_limb(TRUE)
			qdel(O)
		O = character.get_bodypart(BODY_ZONE_L_ARM)
		if(O)
			O.drop_limb(TRUE)
			qdel(O)
		character.regenerate_limb(BODY_ZONE_R_ARM)
		character.regenerate_limb(BODY_ZONE_L_ARM)

	validate_character_species()

	character.age = age
	character.dna.features = features.Copy()
	character.gender = gender
	character.set_species(pref_species.type, icon_update = FALSE, pref_load = src)
	character.dna.update_body_size()

	if((randomise[RANDOM_NAME] || randomise[RANDOM_NAME_ANTAG] && antagonist) && !character_setup)
		slot_randomized = TRUE
		real_name = pref_species.random_name(gender)

	normalize_character_identity(roundstart_checks)

	if(real_name in GLOB.chosen_names)
		character.real_name = pref_species.random_name(gender)
	else
		character.real_name = real_name
	character.name = character.real_name

	if((selected_title != "None" && pref_species.use_titles) && selected_title != null)
		character.dna.species.name = selected_title

	character.domhand = domhand
	character.cmode_music_override = combat_music.musicpath
	character.cmode_music_override_name = combat_music.name
	character.highlight_color = highlight_color
	character.nickname = nickname

	if(character.sexcon && free_use_default)
		character.sexcon.freeuse = TRUE

	character.eye_color = eye_color
	var/origin_lang = FALSE
	if(origin && origin.origin_language)
		origin_lang = TRUE
	if(!origin_lang && extra_language && extra_language != "None")
		character.grant_language(extra_language)
	if(extra_language_1 && extra_language_1 != "None")
		character.grant_language(extra_language_1)
	if(extra_language_2 && extra_language_2 != "None")
		character.grant_language(extra_language_2)
	character.voice_color = voice_color
	character.voice_pitch = voice_pitch
	var/obj/item/organ/eyes/organ_eyes = character.getorgan(/obj/item/organ/eyes)
	if(organ_eyes)
		if(!initial(organ_eyes.eye_color))
			organ_eyes.eye_color = eye_color
	character.hair_color = hair_color
	character.facial_hair_color = facial_hair_color
	character.skin_tone = skin_tone
	character.mutant_skin = mutant_skin
	character.hairstyle = hairstyle
	character.facial_hairstyle = facial_hairstyle
	character.detail = detail
	character.set_patron(selected_patron)
	character.backpack = backpack

	character.familytree_pref = family
	character.gender_choice_pref = gender_choice
	character.setspouse = setspouse
	character.xenophobe = xenophobe_pref
	character.restricted_species = restricted_species_pref

	character.jumpsuit_style = jumpsuit_style

	// Apply multiple vices system
	character.vices = list()
	for(var/i = 1 to 6)
		var/datum/charflaw/vice = vars["vice[i]"]
		if(vice)
			var/datum/charflaw/new_vice = new vice.type()
			character.vices += new_vice
			new_vice.on_mob_creation(character)
			// Set first vice as the legacy charflaw for compatibility
			if(i == 1)
				character.charflaw = new_vice

	// Legacy single vice support (if new system not used)
	if(!length(character.vices) && charflaw)
		character.charflaw = new charflaw.type()
		character.charflaw.on_mob_creation(character)
		character.vices += character.charflaw

	character.dna.real_name = character.real_name

	character.headshot_link = headshot_link

	character.origin = origin ? origin.name : "Unknown"

	character.statpack = statpack

	character.flavortext = flavortext

	character.ooc_notes = ooc_notes

	// Rumours / Noble gossip
	character.rumour = rumour
	character.noble_gossip = noble_gossip

	character.nsfwflavortext = nsfwflavortext

	character.nsfw_ooc_extra_img = nsfw_ooc_extra_img

	character.nsfw_ooc_extra_img_link = nsfw_ooc_extra_img_link

	character.erpprefs = erpprefs

	character.img_gallery = img_gallery

	character.nsfw_img_gallery = nsfw_img_gallery

	character.ooc_extra = ooc_extra

	character.ooc_extra_img = ooc_extra_img

	character.ooc_extra_img_link = ooc_extra_img_link

	character.song_title = song_title

	character.song_artist = song_artist
	// LETHALSTONE ADDITION BEGIN: additional customizations

	character.pronouns = pronouns
	character.voice_type = voice_type

	// LETHALSTONE ADDITION END

	character.set_bark(bark_id)
	character.vocal_speed = bark_speed
	character.vocal_pitch = bark_pitch
	character.vocal_pitch_range = bark_variance

	//if(parent)
	//	var/list/L = get_player_curses(parent.ckey)
	//	if(L)
	//		for(var/X in L)
	//			ADD_TRAIT(character, curse2trait(X), TRAIT_GENERIC)

	if(taur_type)
		character.Taurize(taur_type, "#[taur_color]", "#[taur_markings]", "#[taur_tertiary]")
	else if(character_setup)
		// This should only ever ~do~ anything for previews
		character.ensure_not_taur()

	if(icon_updates)
		character.update_body()
		character.update_hair()
		character.update_body_parts(redraw = TRUE)

	character.char_accent = char_accent
	character.char_mannerism = char_mannerism

	if(culinary_preferences)
		apply_culinary_preferences(character)

/datum/preferences/proc/get_default_name(name_id)
	switch(name_id)
		if("human")
			return random_unique_name()
		if("ai")
			return pick(GLOB.ai_names)
		if("cyborg")
			return DEFAULT_CYBORG_NAME
		if("clown")
			return pick(GLOB.clown_names)
		if("mime")
			return pick(GLOB.mime_names)
		if("religion")
			return DEFAULT_RELIGION
		if("deity")
			return DEFAULT_DEITY
	return random_unique_name()

/datum/preferences/proc/ask_for_custom_name(mob/user,name_id)
	var/namedata = GLOB.preferences_custom_names[name_id]
	if(!namedata)
		return

	var/raw_name = input(user, "Choose your character's [namedata["qdesc"]]:","Character Preference") as text|null
	if(!raw_name)
		if(namedata["allow_null"])
			custom_names[name_id] = get_default_name(name_id)
		else
			return
	else
		var/sanitized_name = reject_bad_name(raw_name,namedata["allow_numbers"])
		if(!sanitized_name)
			to_chat(user, "<font color='red'>Invalid name. Your name should be at least 2 and at most [MAX_NAME_LEN] characters long. It may only contain the characters A-Z, a-z,[namedata["allow_numbers"] ? ",0-9," : ""] -, ' and .</font>")
			return
		else
			custom_names[name_id] = sanitized_name

/// Resets the client's keybindings. Asks them for which
/datum/preferences/proc/force_reset_keybindings()
	var/choice = tgalert(parent.mob, "Your basic keybindings need to be reset, the custom keybinds you've set will remain. Would you prefer 'hotkey' or 'classic TG' mode? DO NOT CLICK CLASSIC UNLESS YOU KNOW WHAT YOU'RE DOING.", "Reset keybindings", "Hotkey", "Classic")
	hotkeys = (choice != "Classic")
	force_reset_keybindings_direct(hotkeys)

/// Does the actual reset
/datum/preferences/proc/force_reset_keybindings_direct(hotkeys = TRUE)
	var/list/oldkeys = key_bindings
	key_bindings = (hotkeys) ? deepCopyList(GLOB.hotkey_keybinding_list_by_key) : deepCopyList(GLOB.classic_keybinding_list_by_key)

	for(var/key in oldkeys)
		if(!key_bindings[key])
			key_bindings[key] = oldkeys[key]
	parent?.ensure_keys_set(src)

/datum/preferences/proc/try_update_mutant_colors()
	if(update_mutant_colors)
		reset_body_marking_colors()
		reset_all_customizer_accessory_colors()

/proc/valid_headshot_link(mob/user, value, silent = FALSE, list/valid_extensions = list("jpg", "png", "jpeg"))
	var/static/link_regex = regex(@"i\.gyazo\.com/|.\.l3n\.co/|(images2|thumbs2)\.imgbox\.com/|files\.catbox\.moe/|i\.ibb\.co/|file\.garden/") //gyazo, lensdump, imgbox, catbox, imgbb, filegarden

	if(!length(value))
		return FALSE

	var/find_index = findtext(value, "https://")
	if(find_index != 1)
		if(!silent)
			to_chat(user, "<span class='warning'>Your link must be https!</span>")
		return FALSE

	if(!findtext(value, ".") || findtext(value, "<") || findtext(value, ">") || findtext(value, "]") || findtext(value, "\[") || findtext(value, "'") || findtext(value, "\""))	//there is no link in the world that would ever need < or >
		if(!silent)
			to_chat(user, "<span class='warning'>Invalid link!</span>")
		return FALSE
	var/list/value_split = splittext(value, ".")

	// extension will always be the last entry
	var/extension = value_split[length(value_split)]
	if(!(extension in valid_extensions))
		if(!silent)
			to_chat(usr, "<span class='warning'>The link must be one of the following extensions: '[english_list(valid_extensions)]'</span>")
		return FALSE

	find_index = findtext(value, link_regex)
	if(find_index != 9)
		if(!silent)
			to_chat(usr, "<span class='warning'>The link must be hosted on one of the following sites: 'Gyazo, Lensdump, Imgbox, Catbox, ImgBB, File Garden'</span>")
		return FALSE
	return TRUE

/datum/preferences/proc/is_active_migrant()
	if(!migrant)
		return FALSE
	if(!migrant.queued_wave)
		return FALSE
	return TRUE

/datum/preferences/proc/process_virtue_text(datum/virtue/V)
	var/dat
	if(V.desc)
		dat += "<font size = 3>[span_purple(V.desc)]</font><br>"
	if(length(V.added_skills))
		dat += "<font color = '#a3e2ff'><font size = 3>This Virtue adds the following skills: <br>"
		for(var/list/L in V.added_skills)
			var/name
			if(ispath(L[1],/datum/skill))
				var/datum/skill/S = L[1]
				name = initial(S.name)
			dat += "["\Roman[L[2]]"] level[L[2] > 1 ? "s" : ""] of <b>[name]</b>[L[3] ? ", up to <b>[SSskills.level_names_plain[L[3]]]</b>" : ""] <br>"
		dat += "</font>"
	if(length(V.added_traits))
		dat += "<font color = '#a3ffe0'><font size = 3>This Virtue grants the following traits: <br>"
		for(var/TR in V.added_traits)
			dat += "[TR] — <font size = 2>[GLOB.roguetraits[TR]]</font><br>"
		dat += "</font>"
	if(length(V.added_stashed_items))
		dat += "<font color = '#eeffa3'><font size = 3>This Virtue adds the following items to your stash: <br>"
		for(var/I in V.added_stashed_items)
			dat += "<i>[I]</i> <br>"
		dat += "</font>"
	if(V.custom_text)
		dat += "<font color = '#ffffff'><font size = 3>This Virtue has this special behaviour: <br>"
		dat += "[V.custom_text]"
		dat += "</font>"
	return dat

#undef MAX_SONG_TITLE_LENGTH

/datum/preferences/proc/apply_keybinding_changes(client/user)
	save_preferences()
	user?.set_macros(src, preserve_focus = TRUE)
