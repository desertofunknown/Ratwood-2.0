#define LINKIFY_READY(string, value) "<a href='byond://?src=[REF(src)];ready=[value]'>[string]</a>"
GLOBAL_LIST_INIT(roleplay_readme, world.file2list("strings/rt/rp_prompt.txt"))

/mob/dead/new_player
	var/ready = 0
	var/lobby_opened = FALSE
	var/spawning = 0//Referenced when you want to delete the new_player later on in the code.
	var/topjob = "Hero!"
	flags_1 = NONE

	invisibility = INVISIBILITY_ABSTRACT

//	hud_type = /datum/hud/new_player

	density = FALSE
	stat = DEAD
	hud_possible = list()

	var/mob/living/new_character	//for instant transfer once the round is set up

	//Used to make sure someone doesn't get spammed with messages if they're ineligible for roles
	var/ineligible_for_roles = FALSE

/mob/dead/new_player/Initialize(mapload)
//	if(client && SSticker.state == GAME_STATE_STARTUP)
//		var/atom/movable/screen/splash/S = new(client, TRUE, TRUE)
//		S.Fade(TRUE)

	if(length(GLOB.newplayer_start))
		forceMove(pick(GLOB.newplayer_start))
	else
		forceMove(locate(1,1,1))

	ComponentInitialize()

	. = ..()

	GLOB.new_player_list += src

/mob/dead/new_player/Destroy()
	GLOB.new_player_list -= src
	return ..()


///Say verb
/mob/dead/new_player/say_verb(message as text)
	set name = "Say"
	set category = "IC"
	set hidden = 1

#ifdef MATURESERVER

	if(message)
		if(client)
			if(GLOB.ooc_allowed)
				client.ooc(message)
			else
				client.lobbyooc(message)

#endif

/mob/dead/new_player/prepare_huds()
	return

/mob/dead/new_player/proc/new_player_panel()
/*
	var/output = "<center>"
	if(SSticker.current_state <= GAME_STATE_PREGAME)
		switch(ready)
			if(PLAYER_NOT_READY)
				output += "<p>[LINKIFY_READY("READY", PLAYER_READY_TO_PLAY)] | <b>UNREADY</b></p>"
			if(PLAYER_READY_TO_PLAY)
				output += "<p><b>READY</b> | [LINKIFY_READY("UNREADY", PLAYER_NOT_READY)]</p>"
			if(PLAYER_READY_TO_OBSERVE)
				output += "<p>[LINKIFY_READY("READY", PLAYER_READY_TO_PLAY)]</p>"
				output += "<p>[LINKIFY_READY("UNREADY", PLAYER_NOT_READY)]</p>"
	else
//		output += "<p><a href='byond://?src=[REF(src)];manifest=1'>View the Crew Manifest</a></p>"
//		output += "<p><a href='byond://?src=[REF(src)];manifest=1'>FOLK</a></p>"
		output += "<p><a href='byond://?src=[REF(src)];late_join=1'>LATEJOIN</a></p>"
	output += "<p><a href='byond://?src=[REF(src)];show_preferences=1'>CHARACTER</a></p>"

//	output += "<p><a href='byond://?src=[REF(src)];show_options=1'>OPTIONS</a></p>"

	output += "<p><a href='byond://?src=[REF(src)];show_keybinds=1'>KEYBINDS</a></p>"

	if(!IsGuestKey(src.key))
		if (SSdbcore.Connect())
			var/isadmin = 0
			if(src.client && src.client.holder)
				isadmin = 1
			var/datum/DBQuery/query_get_new_polls = SSdbcore.NewQuery("SELECT id FROM [format_table_name("poll_question")] WHERE [(isadmin ? "" : "adminonly = false AND")] Now() BETWEEN starttime AND endtime AND id NOT IN (SELECT pollid FROM [format_table_name("poll_vote")] WHERE ckey = \"[sanitizeSQL(ckey)]\") AND id NOT IN (SELECT pollid FROM [format_table_name("poll_textreply")] WHERE ckey = \"[sanitizeSQL(ckey)]\")")
			var/rs = REF(src)
			if(query_get_new_polls.Execute())
				var/newpoll = 0
				if(query_get_new_polls.NextRow())
					newpoll = 1

				if(newpoll)
					output += "<p><b><a href='byond://?src=[rs];showpoll=1'>Show Player Polls</A> (NEW!)</b></p>"
				else
					output += "<p><a href='byond://?src=[rs];showpoll=1'>Show Player Polls</A></p>"
			qdel(query_get_new_polls)
			if(QDELETED(src))
				return

	output += "</center>"

	//src << browse(output,"window=playersetup;size=210x240;can_close=0")
	var/datum/browser/popup = new(src, "playersetup", "<div align='center'>LOBBY MENU</div>", 250, 200)
	popup.set_window_options("can_close=0")
	popup.set_content(output)
	popup.open(FALSE)*/
	if(client)
		if(client.prefs)
			client.prefs.ShowChoices(src, 4)

/mob/dead/new_player/Topic(href, href_list[])
	if(src != usr)
		return 0

	if(!client)
		return 0

	//Determines Relevent Population Cap
	var/relevant_cap
	var/hpc = CONFIG_GET(number/hard_popcap)
	var/epc = CONFIG_GET(number/extreme_popcap)
	if(hpc && epc)
		relevant_cap = min(hpc, epc)
	else
		relevant_cap = max(hpc, epc)

	if(href_list["show_preferences"])
		client.prefs.ShowChoices(src, 4)
		return 1

	if(href_list["show_lobby"])
		open_lobby()
		lobby_refresh(SSlobbymenu.current_actor_list)
		return 1

	if(href_list["show_options"])
		client.prefs.ShowChoices(src, 1)
		return 1

	if(href_list["show_keybinds"])
		client.prefs.ShowChoices(src, 3)
		return 1

	if(href_list["join_server"])
		var/target_server
		switch(href_list["join_server"])
			if("primary")
				target_server = "byond://ratwood.rip:22096"
			if("secondary")
				target_server = "byond://ratwood.rip:22099"

		if(!target_server)
			return 1

		if(alert(src, "Switch to [target_server]? This will close my current connection.", "Switch Server", "Yes", "No") != "Yes")
			return 1

		src << browse({"<a id='link' href='[target_server]'>[target_server]</a><script type='text/javascript'>document.getElementById('link').click();window.location='byond://winset?command=.quit'</script>"}, "border=0;titlebar=0;size=1x1;window=server_switch")
		to_chat(src, "<a href='[target_server]' style='color:#638500;text-decoration:underline;'><b>If I was not switched automatically, click here.</b></a>")
		return 1

	if(href_list["open_changelog"])
		var/datum/changelog/changelog_ui = GLOB.changelog_tgui
		if(!changelog_ui)
			changelog_ui = new /datum/changelog
			GLOB.changelog_tgui = changelog_ui
		changelog_ui.ui_interact(src)
		return 1

	if(href_list["ready"])
		var/tready = text2num(href_list["ready"])
		//Avoid updating ready if we're after PREGAME (they should use latejoin instead)
		//This is likely not an actual issue but I don't have time to prove that this
		//no longer is required
		if(tready == PLAYER_NOT_READY)
			if(SSticker.job_change_locked)
				return
		if(SSticker.current_state <= GAME_STATE_PREGAME)
			if(tready == PLAYER_READY_TO_PLAY)
				if(length(client.prefs.flavortext) < MINIMUM_FLAVOR_TEXT)
					to_chat(src, span_boldwarning("You need a minimum of [MINIMUM_FLAVOR_TEXT] characters in your flavor text in order to play."))
					return
				if(length(client.prefs.ooc_notes) < MINIMUM_OOC_NOTES)
					to_chat(src, span_boldwarning("You need at least a few words in your OOC notes in order to play."))
					return

			if(ready != tready)
				ready = tready
		//if it's post initialisation and they're trying to observe we do the needful
		
		if(!SSticker.current_state < GAME_STATE_PREGAME && tready == PLAYER_READY_TO_OBSERVE)
			ready = tready
			make_me_an_observer()
			return

	if(href_list["refresh"])
		winshow(src, "preferencess_window", FALSE)
		src << browse(null, "window=preferences_browser")
//		src << browse(null, "window=playersetup") //closes the player setup window
		new_player_panel()

//	if(href_list["rpprompt"])
//		do_rp_prompt()
//		return

	if(href_list["late_join"])
		if(!SSticker?.IsRoundInProgress())
			to_chat(usr, span_boldwarning("The game is starting. You cannot join yet."))
			return

		if(client && client.prefs.is_active_migrant())
			to_chat(usr, span_boldwarning("You are in the migrant queue."))
			return

		if(href_list["late_join"] == "override")
			LateChoices()
			return
/*#ifdef MATURESERVER
		if(key && (world.time < GLOB.respawntimes[key] + RESPAWNTIME))
			to_chat(usr, span_warning("I can return in [GLOB.respawntimes[key] + RESPAWNTIME - world.time]."))
			return
#else*/


		var/timetojoin = 5 MINUTES
#ifdef ALLOWPLAY
		timetojoin = 1 SECONDS
#endif
#ifdef TESTSERVER
		timetojoin = 0
#endif
		if(SSticker.round_start_time)
			if(world.time < SSticker.round_start_time + timetojoin)
				var/ttime = round((SSticker.round_start_time + timetojoin - world.time) / 10)
				var/list/choicez = list("Not yet.", "You cannot join yet.", "It won't work yet.", "Please be patient.", "Try again later.", "Late-joining is not yet possible.")
				to_chat(usr, span_warning("[pick(choicez)] ([ttime])."))
				return

		var/plevel = 0
		if(ismob(usr))
			var/mob/user = usr
			if(user.client)
				plevel = user.client.patreonlevel()
		if(!IsPatreon(ckey))
			if(SSticker.queued_players.len || (relevant_cap && living_player_count() >= relevant_cap && !(ckey(key) in GLOB.admin_datums) && plevel < 1))
				to_chat(usr, span_danger("[CONFIG_GET(string/hard_popcap_message)]"))

				var/queue_position = SSticker.queued_players.Find(usr)
				if(queue_position == 1)
					to_chat(usr, span_notice("Thou art next in line to join the game. You will be notified when a slot opens up."))
				else if(queue_position)
					to_chat(usr, span_notice("Thou art [queue_position-1] players in front of you in the queue to join the game."))
				else
					SSticker.queued_players += usr
					to_chat(usr, span_notice("Thou have been added to the queue to join the game. Your position in queue is [SSticker.queued_players.len]."))
				return
		LateChoices()

	if(href_list["villains"])
		VillainChoices()
		return

	if(href_list["villain_pref"])
		if(SSticker.current_state > GAME_STATE_PREGAME)
			return
		var/datum/job/J = SSjob.GetJob(href_list["villain_pref"])
		if(!J || !(J.title in GLOB.villain_positions))
			return
		var/jpval = null
		switch(text2num(href_list["level"]))
			if(1)
				jpval = JP_HIGH
			if(2)
				jpval = JP_MEDIUM
			if(3)
				jpval = JP_LOW
		client.prefs.SetJobPreferenceLevel(J, jpval)
		VillainChoices()
		return

	if(href_list["manifest"])
		ViewManifest()

	if(href_list["SelectedJob"])
		if(!SSticker?.IsRoundInProgress())
			to_chat(usr, span_danger("The round is either not ready, or has already finished..."))
			return

		if(!GLOB.enter_allowed)
			to_chat(usr, span_notice("There is a lock on entering the game!"))
			return

		if(SSticker.queued_players.len && !(ckey(key) in GLOB.admin_datums))
			if((living_player_count() >= relevant_cap) || (src != SSticker.queued_players[1]))
				to_chat(usr, span_warning("Server is full."))
				return

		if(client && client.prefs.is_active_migrant())
			to_chat(usr, span_boldwarning("You are in the migrant queue."))
			return

		if(length(client.prefs.flavortext) < MINIMUM_FLAVOR_TEXT)
			to_chat(usr, span_boldwarning("You need a minimum of [MINIMUM_FLAVOR_TEXT] characters in your flavor text in order to play."))
			return

		if(length(client.prefs.ooc_notes) < MINIMUM_OOC_NOTES)
			to_chat(src, span_boldwarning("You need at least a few words in your OOC notes in order to play."))
			return

		AttemptLateSpawn(href_list["SelectedJob"])
		return

	if(!ready && href_list["preference"])
		if(client)
			client.prefs.process_link(src, href_list)
	else if(!href_list["late_join"])
		new_player_panel()

	if(href_list["showpoll"])
		handle_player_polling()
		return

	if(href_list["viewpoll"])
		var/datum/poll_question/poll = locate(href_list["viewpoll"]) in GLOB.polls
		poll_player(poll)

	if(href_list["votepollref"])
		var/datum/poll_question/poll = locate(href_list["votepollref"]) in GLOB.polls
		vote_on_poll_handler(poll, href_list)

/mob/dead/new_player/verb/do_rp_prompt()
	set name = "Lore Primer"
	set category = "IC"
	var/list/dat = list()
	dat += GLOB.roleplay_readme
	if(dat)
		var/datum/browser/popup = new(src, "Primer", "ROTWOOD VALE", 460, 550)
		popup.set_content(dat.Join())
		popup.open()

//When you cop out of the round (NB: this HAS A SLEEP FOR PLAYER INPUT IN IT)
/mob/dead/new_player/proc/make_me_an_observer()
	if(QDELETED(src) || !src.client)
		ready = PLAYER_NOT_READY
		return FALSE

	var/this_is_like_playing_right = alert(src,"Are you sure you wish to observe? Playing is a lot more fun.","SPECTATE","Yes","No")

	if(QDELETED(src) || !src.client || this_is_like_playing_right != "Yes")
		ready = PLAYER_NOT_READY
		src << browse(null, "window=playersetup") //closes the player setup window
		new_player_panel()
		return FALSE

	var/mob/dead/observer/observer	// Transfer safety to observer spawning proc.
	if(check_rights(R_WATCH, FALSE))
		observer = new /mob/dead/observer/admin(src)
	else
		observer = new /mob/dead/observer/rogue/nodraw(src)
	spawning = TRUE

	observer.started_as_observer = TRUE
	close_spawn_windows()
	var/obj/effect/landmark/observer_start/O = locate(/obj/effect/landmark/observer_start) in GLOB.landmarks_list
	to_chat(src, span_notice("Now teleporting."))
	if (O)
		observer.forceMove(O.loc)
	else
		to_chat(src, span_notice("Teleporting failed. Ahelp an admin please"))
		stack_trace("There's no freaking observer landmark available on this map or you're making observers before the map is initialised")
	observer.key = key
	observer.client = client
	observer.set_ghost_appearance()
	if(observer.client)
		observer.client.update_ooc_verb_visibility()
	if(observer.client && observer.client.prefs)
		observer.real_name = observer.client.prefs.real_name
		observer.name = observer.real_name
	observer.update_icon()
	observer.stop_sound_channel(CHANNEL_LOBBYMUSIC)
	QDEL_NULL(mind)
	qdel(src)
	return TRUE

/proc/get_job_unavailable_error_message(retval, jobtitle)
	switch(retval)
		if(JOB_AVAILABLE)
			return "[jobtitle] is available."
		if(JOB_UNAVAILABLE_GENERIC)
			return "[jobtitle] is unavailable."
		if(JOB_UNAVAILABLE_BANNED)
			return "You are currently banned from [jobtitle]."
		if(JOB_UNAVAILABLE_PLAYTIME)
			return "You do not have enough relevant playtime for [jobtitle]."
		if(JOB_UNAVAILABLE_ACCOUNTAGE)
			return "Your account is not old enough for [jobtitle]."
		if(JOB_UNAVAILABLE_SLOTFULL)
			return "[jobtitle] is already filled to capacity."
		if(JOB_UNAVAILABLE_RACE)
			return "[jobtitle] is not meant for your kind."
		if(JOB_UNAVAILABLE_SEX)
			return "[jobtitle] is not meant for your lesser sex."
		if(JOB_UNAVAILABLE_AGE)
			return "[jobtitle] is not meant for your age."
		if(JOB_UNAVAILABLE_PATRON)
			return "[jobtitle] requires more faith."
		if(JOB_UNAVAILABLE_LASTCLASS)
			return "You have played [jobtitle] recently."
		if(JOB_UNAVAILABLE_JOB_COOLDOWN)
			if(usr.ckey in GLOB.job_respawn_delays)
				var/remaining_time = round((GLOB.job_respawn_delays[usr.ckey] - world.time) / 10)
				return "You must wait [remaining_time] seconds before playing as an [jobtitle] again."
		if(JOB_UNAVAILABLE_VIRTUESVICE)
			return "[jobtitle] is restricted by your Virtues or Vices."
		if(JOB_UNAVAILABLE_PQ)
			var/datum/job/job = SSjob.GetJob(jobtitle)
			if(job && !isnull(job.min_pq))
				var/player_pq = get_playerquality(usr?.ckey)
				return "You do not meet the Player Quality requirement for [jobtitle]. (Required: [job.min_pq], Your PQ: [player_pq])"
			else if(job && !isnull(job.max_pq))
				var/player_pq = get_playerquality(usr?.ckey)
				return "You exceed the Player Quality requirement for [jobtitle]. (Maximum: [job.max_pq], Your PQ: [player_pq])"
			return "You do not meet the Player Quality requirement for [jobtitle]."
	return "Error: Unknown job availability."

//used for latejoining
/mob/dead/new_player/proc/IsJobUnavailable(rank, latejoin = FALSE, player_quality = null)
	if(QDELETED(src))
		return JOB_UNAVAILABLE_GENERIC
	if(has_world_trait(/datum/world_trait/skeleton_siege))
		if(rank != "Skeleton")
			return JOB_UNAVAILABLE_GENERIC
		else
			return JOB_AVAILABLE
	else
		if(rank == "Skeleton")
			return JOB_UNAVAILABLE_GENERIC

	if(has_world_trait(/datum/world_trait/goblin_siege))
		if(rank != "Goblin")
			return JOB_UNAVAILABLE_GENERIC
		else
			return JOB_AVAILABLE
	else
		if(rank == "Goblin")
			return JOB_UNAVAILABLE_GENERIC

	var/datum/job/job = SSjob.GetJob(rank)
	if(!job)
		return JOB_UNAVAILABLE_GENERIC
	if(CONFIG_GET(flag/usewhitelist))
		if(job.whitelist_req && !client.whitelisted())
			return JOB_UNAVAILABLE_GENERIC
	if(!job.bypass_jobban)
		if(is_banned_from(ckey, rank))
			return JOB_UNAVAILABLE_BANNED
		if(client.blacklisted())
			return JOB_UNAVAILABLE_BANNED
	if(!job.player_old_enough(client))
		return JOB_UNAVAILABLE_ACCOUNTAGE
	if(job.required_playtime_remaining(client))
		return JOB_UNAVAILABLE_PLAYTIME
	if(job.plevel_req > client.patreonlevel())
		testing("PATREONLEVEL [client.patreonlevel()] req [job.plevel_req]")
		return JOB_UNAVAILABLE_GENERIC
	#ifdef USES_PQ
	if(!job.required || latejoin)
		if((!isnull(job.min_pq) || !isnull(job.max_pq)) && !isnum(player_quality))
			player_quality = get_playerquality(ckey)
		if(!isnull(job.min_pq) && (player_quality < job.min_pq))
			return JOB_UNAVAILABLE_PQ
		if(!isnull(job.max_pq) && (player_quality > job.max_pq))
			return JOB_UNAVAILABLE_PQ
	#endif
	var/datum/species/pref_species = client.prefs.pref_species
	if(length(job.allowed_races) && !(pref_species.type in job.allowed_races))
		return JOB_UNAVAILABLE_RACE
	if(length(job.disallowed_races) && (pref_species.type in job.disallowed_races))
		return JOB_UNAVAILABLE_RACE
	var/list/allowed_sexes = list()
	if(length(job.allowed_sexes))
		allowed_sexes |= job.allowed_sexes
	if(!job.immune_to_genderswap && pref_species?.gender_swapping)
		if(MALE in job.allowed_sexes)
			allowed_sexes -= MALE
			allowed_sexes += FEMALE
		if(FEMALE in job.allowed_sexes)
			allowed_sexes -= FEMALE
			allowed_sexes += MALE
	if(length(allowed_sexes) && !(client.prefs.gender in allowed_sexes))
		return JOB_UNAVAILABLE_SEX
	if(length(job.allowed_ages) && !(client.prefs.age in job.allowed_ages))
		return JOB_UNAVAILABLE_AGE
	if(length(job.allowed_patrons) && !(client.prefs.selected_patron.type in job.allowed_patrons))
		return JOB_UNAVAILABLE_PATRON
	if((client.prefs.lastclass == job.title) && !job.bypass_lastclass)
		return JOB_UNAVAILABLE_LASTCLASS
	// Check if the player is on cooldown for the hiv+ role
	if((job.same_job_respawn_delay) && (ckey in GLOB.job_respawn_delays))
		if(world.time < GLOB.job_respawn_delays[ckey])
			return JOB_UNAVAILABLE_JOB_COOLDOWN
	if((job.current_positions >= job.total_positions) && job.total_positions != -1)
		if(job.title == "Assistant")
			if(isnum(client.player_age) && client.player_age <= 14) //Newbies can always be assistants
				return JOB_AVAILABLE
			for(var/datum/job/J in SSjob.occupations)
				if(J && J.current_positions < J.total_positions && J.title != job.title)
					return JOB_UNAVAILABLE_SLOTFULL
		else
			return JOB_UNAVAILABLE_SLOTFULL
	if(length(job.vice_restrictions) || length(job.virtue_restrictions))
		if((client.prefs.virtue?.type in job.virtue_restrictions) || (client.prefs.virtuetwo?.type in job.virtue_restrictions))
			return JOB_UNAVAILABLE_VIRTUESVICE
		// Check all vices
		for(var/datum/charflaw/vice in list(client.prefs.vice1, client.prefs.vice2, client.prefs.vice3, client.prefs.vice4, client.prefs.vice5, client.prefs.vice6, client.prefs.charflaw))
			if(vice?.type in job.vice_restrictions)
				return JOB_UNAVAILABLE_VIRTUESVICE
//	if(job.title == "Adventurer" && latejoin)
//		for(var/datum/job/J in SSjob.occupations)
//			if(J && J.total_positions && J.current_positions < 1 && J.title != job.title && (IsJobUnavailable(J.title))
//				return JOB_UNAVAILABLE_GENERIC //we can't play adventurer if there isn't 1 of every other job that we can play
	if(latejoin && !job.special_check_latejoin(client))
		return JOB_UNAVAILABLE_GENERIC
	return JOB_AVAILABLE

/mob/dead/new_player/proc/AttemptLateSpawn(rank)
	if(rank == "Enslaved Adventurer" && istype(SSmapping?.map_adjustment, /datum/map_adjustment/template/rockhill))
		to_chat(src, span_warning("Enslaved Adventurer is roundstart-only on Rockhill."))
		return FALSE

	var/error = IsJobUnavailable(rank, TRUE)
	if(error != JOB_AVAILABLE)
		to_chat(src, span_warning("[get_job_unavailable_error_message(error, rank)]"))
		return FALSE

	if(SSticker.late_join_disabled)
		alert(src, "Something went bad.")
		return FALSE
/*
	var/arrivals_docked = TRUE
	if(SSshuttle.arrivals)
		close_spawn_windows()	//In case we get held up
		if(SSshuttle.arrivals.damaged && CONFIG_GET(flag/arrivals_shuttle_require_safe_latejoin))
			src << alert("WEIRD!")
			return FALSE

		if(CONFIG_GET(flag/arrivals_shuttle_require_undocked))
			SSshuttle.arrivals.RequireUndocked(src)
		arrivals_docked = SSshuttle.arrivals.mode != SHUTTLE_CALL
*/

	//Remove the player from the join queue if he was in one and reset the timer
	SSticker.queued_players -= src
	SSticker.queue_delay = 4

	testing("basedtest 1")

	SSjob.AssignRole(src, rank, 1)
	testing("basedtest 2")
	var/mob/living/character = create_character(TRUE)	//creates the human and transfers vars and mind
	testing("basedtest 3")
	character.islatejoin = TRUE
	var/equip = SSjob.EquipRank(character, rank, TRUE)
	testing("basedtest 4")

	if(isliving(equip))	//Borgs get borged in the equip, so we need to make sure we handle the new mob.
		character = equip

	var/datum/job/job = SSjob.GetJob(rank)
	testing("basedtest 5")

	if(job && !job.override_latejoin_spawn(character))
		testing("basedtest 6")
		SSjob.SendToLateJoin(character)
		testing("basedtest 7")
//		if(!arrivals_docked)
		var/atom/movable/screen/splash/Spl = new(character.client, TRUE)
		Spl.Fade(TRUE)
//			character.playsound_local(get_turf(character), 'sound/blank.ogg', 25)


	SSticker.minds += character.mind

	var/mob/living/carbon/human/humanc
	if(ishuman(character))
		humanc = character	//Let's retypecast the var to be human,
/*
	if(humanc)	//These procs all expect humans
		GLOB.data_core.manifest_inject(humanc)
		if(SSshuttle.arrivals)
			SSshuttle.arrivals.QueueAnnounce(humanc, rank)
		else
			AnnounceArrival(humanc, rank)
		AddEmploymentContract(humanc)
		if(GLOB.highlander)
			to_chat(humanc, span_danger("<i>THERE CAN BE ONLY ONE!!!</i>"))
			humanc.make_scottish()

		if(GLOB.summon_guns_triggered)
			give_guns(humanc)
		if(GLOB.summon_magic_triggered)
			give_magic(humanc)
		if(GLOB.curse_of_madness_triggered)
			give_madness(humanc, GLOB.curse_of_madness_triggered)
*/
	GLOB.joined_player_list += character.ckey
/*
	if(CONFIG_GET(flag/allow_latejoin_antagonists) && humanc)	//Borgs aren't allowed to be antags. Will need to be tweaked if we get true latejoin ais.
		if(SSshuttle.emergency)
			switch(SSshuttle.emergency.mode)
				if(SHUTTLE_RECALL, SHUTTLE_IDLE)
					SSticker.mode.make_antag_chance(humanc)
				if(SHUTTLE_CALL)
					if(SSshuttle.emergency.timeLeft(1) > initial(SSshuttle.emergencyCallTime)*0.5)
						SSticker.mode.make_antag_chance(humanc)

	if(humanc && CONFIG_GET(flag/roundstart_traits))
		SSquirks.AssignQuirks(humanc, humanc.client, TRUE)*/
	if(humanc)
		var/fakekey = character.ckey
		if(character.ckey in GLOB.anonymize)
			fakekey = get_fake_key(character.ckey)
		GLOB.character_list[character.mobid] = "[fakekey] was [character.real_name] ([rank])<BR>"
		GLOB.character_ckey_list[character.real_name] = character.ckey
		log_character("[character.ckey] ([fakekey]) - [character.real_name] - [rank]")
	if(GLOB.respawncounts[character.ckey])
		var/AN = GLOB.respawncounts[character.ckey]
		AN++
		GLOB.respawncounts[character.ckey] = AN
	else
		GLOB.respawncounts[character.ckey] = 1
//	add_roundplayed(character.ckey)
	if(humanc)
		SSrole_class_handler.setup_class_handler(humanc)
		try_apply_character_post_equipment(humanc)
	log_manifest(character.mind.key,character.mind,character,latejoin = TRUE)
	if(character.client)
		character.client.update_ooc_verb_visibility()

/mob/dead/new_player/proc/LateChoices()
	var/list/dat = list("<div class='latejoin-folio'><div class='latejoin-header'><div class='latejoin-title'><h1>Choose Class</h1><span>Round duration: [DisplayTimeText(world.time - SSticker.round_start_time, 1)]</span></div><div class='latejoin-searchbar'><label for='latejoin-search'>Find</label><input id='latejoin-search' type='text' placeholder='Class or department...' autocomplete='off'><span>Open / total &middot; ? backgrounds</span></div></div><div class='latejoin-list' id='latejoin-list' tabindex='0' aria-label='Available classes'><div class='latejoin-columns'>")
	var/player_quality = null
	var/displayed_jobs = 0
	for(var/datum/job/prioritized_job in SSjob.prioritized_jobs)
		if(prioritized_job.current_positions >= prioritized_job.total_positions)
			SSjob.prioritized_jobs -= prioritized_job

	var/list/omegalist = list()
	omegalist += list(GLOB.noble_positions)
	omegalist += list(GLOB.courtier_positions)
	omegalist += list(GLOB.garrison_positions)
	omegalist += list(GLOB.church_positions)
	omegalist += list(GLOB.inquisition_positions)
	omegalist += list(GLOB.yeoman_positions)
	omegalist += list(GLOB.peasant_positions)
	omegalist += list(GLOB.wanderer_positions)
	omegalist += list(GLOB.youngfolk_positions)
	omegalist += list(GLOB.tribal_positions)

	for(var/list/category in omegalist)
		if(!SSjob.name_occupations[category[1]])
			testing("HELP NO THING FOUND FOR [category[1]]")
			continue

		var/list/available_jobs = list()
		for(var/job in category)
			var/datum/job/job_datum = SSjob.name_occupations[job]
			if(!job_datum)
				continue
			#ifdef USES_PQ
			if(!isnum(player_quality) && (!isnull(job_datum.min_pq) || !isnull(job_datum.max_pq)))
				player_quality = get_playerquality(ckey)
			#endif
			// Make sure hiv+ jobs always appear on list, even if unavailable
			var/job_availability = IsJobUnavailable(job_datum.title, TRUE, player_quality)
			if(job_availability == JOB_AVAILABLE || job_datum.always_show_on_latechoices)
				available_jobs[job] = job_availability

		if (length(available_jobs))
			var/cat_color = SSjob.name_occupations[category[1]].selection_color //use the color of the first job in the category (the department head) as the category color
			var/cat_name = ""
			switch (SSjob.name_occupations[category[1]].department_flag)
				if (NOBLEMEN)
					cat_name = "Nobles"
				if (COURTIERS)
					cat_name = "Courtiers"
				if (GARRISON)
					cat_name = "Garrison"
				if (CHURCHMEN)
					cat_name = "Churchmen"
				if (YEOMEN)
					cat_name = "Yeomen"
				if (PEASANTS)
					cat_name = "Peasants"
				if (YOUNGFOLK)
					cat_name = "Sidefolk"
				if (WANDERERS)
					cat_name = "Wanderers"
				if (INQUISITION)
					cat_name = "Inquisition"
				if (TRIBAL)
					cat_name = "Tribe"

			dat += "<div class='latejoin-group'><h2 style='border-left-color: [cat_color]'>[cat_name]</h2>"

			if(has_world_trait(/datum/world_trait/skeleton_siege))
				dat += "<div class='latejoin-row' data-search='Skeleton [cat_name]'><a class='latejoin-join' href='byond://?src=[REF(src)];SelectedJob=Skeleton'>Evil Skeleton</a><span class='latejoin-availability'>Siege</span></div>"
				displayed_jobs++
			if(has_world_trait(/datum/world_trait/goblin_siege))
				dat += "<div class='latejoin-row' data-search='Goblin [cat_name]'><a class='latejoin-join' href='byond://?src=[REF(src)];SelectedJob=Goblin'>Goblin</a><span class='latejoin-availability'>Siege</span></div>"
				displayed_jobs++

			if(has_world_trait(/datum/world_trait/skeleton_siege)|| has_world_trait(/datum/world_trait/goblin_siege))
				dat += "</div>"
				break

			for(var/job in available_jobs)
				var/datum/job/job_datum = SSjob.name_occupations[job]
				var/do_elaborate = job_datum.has_limited_subclasses()
				if(job_datum)
					var/used_name = job_datum.display_title || job_datum.title
					if(client.prefs.pronouns == SHE_HER && job_datum.f_title)
						used_name = job_datum.f_title
					var/is_priority = (job_datum in SSjob.prioritized_jobs)
					var/vacancies = job_datum.total_positions == -1 ? "&infin;" : "[max(0, job_datum.total_positions - job_datum.current_positions)] / [job_datum.total_positions]"
					var/availability_text = job_datum.total_positions == -1 ? "Unlimited openings; [job_datum.current_positions] filled" : "[max(0, job_datum.total_positions - job_datum.current_positions)] open of [job_datum.total_positions]; [job_datum.current_positions] filled"
					dat += "<div class='latejoin-row[is_priority ? " latejoin-priority" : ""][job in GLOB.noble_positions ? " latejoin-command" : ""]' data-search='[html_encode("[used_name] [job_datum.title] [cat_name]")]'>"
					if(available_jobs[job] == JOB_AVAILABLE)
						dat += "<a class='latejoin-join' href='byond://?src=[REF(src)];SelectedJob=[url_encode(job_datum.title)]' aria-label='[html_encode("Join as [used_name]; [availability_text]")]'>[html_encode(used_name)][is_priority ? " <span class='latejoin-priority-mark' title='Priority class' aria-label='Priority'>&#9733;</span>" : ""]</a>"
					else
						dat += "<span class='latejoin-unavailable' aria-disabled='true'>[html_encode(used_name)]<small>[available_jobs[job] == JOB_UNAVAILABLE_SLOTFULL ? "Full" : "Restricted for this character"]</small></span>"
					if(do_elaborate)
						dat += "<a class='latejoin-subclasses' href='?src=[REF(job_datum)];jobsubclassinfo=1' title='[html_encode("Background availability for [used_name]")]' aria-label='[html_encode("Background availability for [used_name]")]'>?</a>"
					dat += "<span class='latejoin-availability' title='[html_encode(availability_text)]' aria-label='[html_encode(availability_text)]'>[vacancies]</span></div>"
					displayed_jobs++

			dat += "</div>"
	if(!displayed_jobs)
		dat += "<div class='latejoin-empty'>No classes are currently available to this character.</div>"
	dat += "<div class='latejoin-empty' id='latejoin-empty' style='display:none'>No classes match your search.</div></div></div><div class='latejoin-footer'><span>Select a class name to join. Tab / &uarr;&darr; to navigate.</span><a href='byond://?src=[REF(src)];late_join=1'>Refresh</a></div></div>"
	dat += {"
	<script type='text/javascript'>
	(function() {
		var search = document.getElementById('latejoin-search');
		var list = document.getElementById('latejoin-list');
		var groups = list.querySelectorAll('.latejoin-group');
		search.oninput = function() {
			var query = search.value.toLowerCase();
			var total = 0;
			for(var i = 0; i < groups.length; i++) {
				var group = groups.item(i);
				var rows = group.querySelectorAll('.latejoin-row');
				var matches = 0;
				for(var j = 0; j < rows.length; j++) {
					var row = rows.item(j);
					var visible = row.getAttribute('data-search').toLowerCase().indexOf(query) !== -1;
					row.style.display = visible ? '' : 'none';
					if(visible) { matches++; }
				}
				group.style.display = matches ? '' : 'none';
				total += matches;
			}
			document.getElementById('latejoin-empty').style.display = !total && groups.length ? 'block' : 'none';
			list.scrollTop = 0;
		};
		document.addEventListener('keydown', function(event) {
			if(event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
			if(event.keyCode !== 38 && event.keyCode !== 40) return;
			if(event.target !== search && event.target !== list && !list.contains(event.target)) return;
			var links = list.querySelectorAll('a');
			var visible = \[\];
			var current = -1;
			for(var i = 0; i < links.length; i++) {
				var link = links.item(i);
				if(!link.getClientRects().length) continue;
				if(link === document.activeElement) current = visible.length;
				visible.push(link);
			}
			if(!visible.length) return;
			event.preventDefault();
			var next = current < 0 ? (event.keyCode === 40 ? 0 : visible.length - 1) : Math.max(0, Math.min(visible.length - 1, current + (event.keyCode === 40 ? 1 : -1)));
			visible\[next\].focus();
		});
	})();
	</script>
	"}
	var/datum/browser/popup = new(src, "latechoices", "", 820, 680)
	popup.add_stylesheet("latejoin_choices", 'html/browser/latejoin_choices.css')
	var/list/font_urls = get_asset_datum(/datum/asset/simple/roguefonts).get_url_mappings()
	var/list/common_urls = get_asset_datum(/datum/asset/simple/namespaced/common).get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Keep Rocker'; src: url('[font_urls["newrocker.ttf"]]'); } .latejoin-folio { background-image: url('[common_urls["flowers.png"]]'); }</style>")
	popup.set_content(jointext(dat, ""))
	popup.open(FALSE) // 0 is passed to open so that it doesn't use the onclose() proc

/mob/dead/new_player/proc/create_character(transfer_after)
	spawning = 1
	close_spawn_windows()

	var/mob/living/carbon/human/H = new(loc)

	var/frn = CONFIG_GET(flag/force_random_names)
	if(!frn)
		frn = is_banned_from(ckey, "Appearance")
		if(QDELETED(src))
			return
	if(frn)
		client.prefs.random_character()

	var/is_antag
	if(mind in GLOB.pre_setup_antags)
		is_antag = TRUE
	var/is_gnoll = (mind?.assigned_role == "Gnoll")

	client.prefs.copy_to(H, antagonist = is_antag, skip_normal_prefs = is_gnoll)
	H.dna.update_dna_identity()
	if(mind)
		if(transfer_after)
			mind.late_joiner = TRUE
		mind.active = 0					//we wish to transfer the key manually
		mind.transfer_to(H)					//won't transfer key since the mind is not active

	if(is_gnoll)
		var/gnoll_name = client?.prefs?.gnoll_prefs?.ensure_gnoll_name() || H.real_name
		H.real_name = gnoll_name
		H.name = gnoll_name
		H.dna.real_name = gnoll_name
	else
		H.name = real_name

	. = H
	new_character = .

	H.after_creation()

	if(transfer_after)
		transfer_character()
	GLOB.chosen_names += H.real_name


/mob/proc/after_creation()
	return

/mob/living/carbon/human/after_creation()
	if(dna?.species)
		dna.species.after_creation(src)
	roll_stats()

/mob/dead/new_player/proc/transfer_character()
	. = new_character
	if(.)
		new_character.key = key		//Manually transfer the key to log them in
		new_character.stop_sound_channel(CHANNEL_LOBBYMUSIC)
		var/area/joined_area = get_area(new_character.loc)
		if(joined_area)
			joined_area.on_joining_game(new_character)
		new_character.update_fov_angles()
		new_character = null
		qdel(src)

/mob/dead/new_player/proc/ViewManifest()
	var/dat = "<html><body>"
	dat += "<h4>Crew Manifest</h4>"
	dat += GLOB.data_core.get_manifest(OOC = 1)

	src << browse(dat, "window=manifest;size=387x420;can_close=1")

/mob/dead/new_player/Move()
	return 0


/mob/dead/new_player/proc/close_spawn_windows()

	src << browse(null, "window=latechoices") //closes late choices window
	src << browse(null, "window=playersetup") //closes the player setup window
	src << browse(null, "window=preferences") //closes job selection
	src << browse(null, "window=mob_occupation")
	src << browse(null, "window=latechoices") //closes late job selection
	if(client?.prefs?.migrant)
		client.prefs.migrant.hide_ui() // Closes migrant menu
	src << browse(null, "window=familiar_prefs") // Closes familiar prefs menu

	SStriumphs.remove_triumph_buy_menu(client)

	winshow(src, "preferencess_window", FALSE)
	src << browse(null, "window=preferences_browser")
	src << browse(null, "window=lobby_window")
// Used to make sure that a player has a valid job preference setup, used to knock players out of eligibility for anything if their prefs don't make sense.
// A "valid job preference setup" in this situation means at least having one job set to low, or not having "return to lobby" enabled
// Prevents "antag rolling" by setting antag prefs on, all jobs to never, and "return to lobby if preferences not availible"
// Doing so would previously allow you to roll for antag, then send you back to lobby if you didn't get an antag role
// This also does some admin notification and logging as well, as well as some extra logic to make sure things don't go wrong
/mob/dead/new_player/proc/check_preferences()
	if(!client)
		return FALSE //Not sure how this would get run without the mob having a client, but let's just be safe.
	if(client.prefs.joblessrole != RETURNTOLOBBY)
		return TRUE
	// If they have antags enabled, they're potentially doing this on purpose instead of by accident. Notify admins if so.
	var/has_antags = FALSE
	if(client.prefs.be_special.len > 0)
		has_antags = TRUE
	if(client.prefs.job_preferences.len == 0)
		if(!ineligible_for_roles)
			to_chat(src, span_danger("I need to pick a class to join as."))
		ineligible_for_roles = TRUE
		ready = PLAYER_NOT_READY
		if(has_antags)
			log_admin("[src.ckey] just got booted back to lobby with no jobs, but antags enabled.")
			message_admins("[src.ckey] just got booted back to lobby with no jobs enabled, but antag rolling enabled. Likely antag rolling abuse.")

		return FALSE //This is the only case someone should actually be completely blocked from antag rolling as well
	return TRUE
