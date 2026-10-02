//Dead mobs can exist whenever. This is needful

INITIALIZE_IMMEDIATE(/mob/dead)

/mob/dead
	sight = SEE_TURFS | SEE_MOBS | SEE_OBJS | SEE_SELF
	move_resist = INFINITY
	throwforce = 0

/mob/dead/Initialize(mapload)
	SHOULD_CALL_PARENT(FALSE)
	if(flags_1 & INITIALIZED_1)
		stack_trace("Warning: [src]([type]) initialized multiple times!")
	flags_1 |= INITIALIZED_1
	tag = "mob_[next_mob_id++]"
	GLOB.mob_list += src

	prepare_huds()

	if(length(CONFIG_GET(keyed_list/cross_server)))
		verbs += /mob/dead/proc/server_hop
	set_focus(src)
	return INITIALIZE_HINT_NORMAL

/mob/dead/Destroy()
	GLOB.mob_list -= src
	return ..()

/mob/dead/canUseStorage()
	return FALSE

/mob/dead/dust(just_ash, drop_items, force)	//ghosts can't be vaporised.
	return

/mob/dead/gib()		//ghosts can't be gibbed.
	return

/mob/dead/ConveyorMove()	//lol
	return

/mob/dead/forceMove(atom/destination)
	var/turf/old_turf = get_turf(src)
	var/turf/new_turf = get_turf(destination)
	if (old_turf?.z != new_turf?.z)
		onTransitZ(old_turf?.z, new_turf?.z)
	var/oldloc = loc
	loc = destination
	Moved(oldloc, NONE, TRUE)

/mob/dead/new_player/proc/lobby_refresh(actor_list)
	set waitfor = 0
	if(!client)
		return

	if(client.is_new_player())
		return

	var/time_remaining = SSticker.GetTimeLeft()
	if(SSticker.current_state >= GAME_STATE_SETTING_UP)
		client << browse(null, "window=lobby_window")
		return
	if(!lobby_opened)
		open_lobby()
		sleep(0)
		if(!client)
			return
	// A closed lobby stays closed until the player opens it from their character sheet.
	if(!winexists(client, "lobby_window") || winget(client, "lobby_window", "is-visible") == "false")
		return

	// UPDATE TIMER -- Script in html\lobby\lobby.html / .js
	var/timer_text
	if (time_remaining > 0)
		timer_text = "[round(time_remaining/10)]s"
	else if (time_remaining < 0)
		timer_text = "Delayed"
	else
		timer_text = "Soon"
	client << output(timer_text, "lobby_window.browser:update_timer")

	// Update players ready!!
	client << output(
	"[SSticker.totalPlayersReady]",
	"lobby_window.browser:update_ready_count"
	)
	// Ready bonus
	var/bonus_html
	if (ready == PLAYER_READY_TO_PLAY)
		bonus_html = span_good("Ready &mdash; bonus eligible")
	else
		bonus_html = span_highlight("Not ready &mdash; no bonus")
	client << output(url_encode(bonus_html), "lobby_window.browser:update_ready_bonus")
	client << output(url_encode(actor_list), "lobby_window.browser:update_jobs")

/mob/dead/new_player/proc/open_lobby()
	if (!client || client.is_new_player() || SSticker.current_state >= GAME_STATE_SETTING_UP)
		return
	var/datum/asset/simple/roguefonts/fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	fonts.send(src)
	var/list/font_urls = fonts.get_url_mappings()
	var/lobby_html = file2text('html/lobby/lobby.html')
	lobby_html = replacetext(lobby_html, "{{lora_regular}}", font_urls["lora-regular.ttf"])
	lobby_html = replacetext(lobby_html, "{{lora_bold}}", font_urls["lora-bold.ttf"])
	lobby_html = replacetext(lobby_html, "{{pterra}}", font_urls["pterra.ttf"])
	lobby_html = replacetext(lobby_html, "{{newrocker}}", font_urls["newrocker.ttf"])
	lobby_opened = TRUE
	client << browse(
		lobby_html,
		"window=lobby_window;size=330x430"
	)
/mob/dead/proc/server_hop()
	set category = "OOC"
	set name = "Server Hop!"
	set desc= "Jump to the other server"
	set hidden = 1
	if(notransform)
		return
	var/list/csa = CONFIG_GET(keyed_list/cross_server)
	var/pick
	switch(csa.len)
		if(0)
			verbs -= /mob/dead/proc/server_hop
			to_chat(src, span_notice("Server Hop has been disabled."))
		if(1)
			pick = csa[1]
		else
			pick = input(src, "Pick a server to jump to", "Server Hop") as null|anything in csa

	if(!pick)
		return

	var/addr = csa[pick]

	if(alert(src, "Jump to server [pick] ([addr])?", "Server Hop", "Yes", "No") != "Yes")
		return

	var/client/C = client
	to_chat(C, span_notice("Sending you to [pick]."))
	new /atom/movable/screen/splash(C)

	notransform = TRUE
	sleep(29)	//let the animation play
	notransform = FALSE

	if(!C)
		return

	winset(src, null, "command=.options") //other wise the user never knows if byond is downloading resources

	C << link("[addr]?server_hop=[key]")

/mob/dead/proc/update_z(new_z) // 1+ to register, null to unregister
	if (registered_z != new_z)
		if (registered_z)
			SSmobs.dead_players_by_zlevel[registered_z] -= src
		if (client)
			if (new_z)
				SSmobs.dead_players_by_zlevel[new_z] += src
			registered_z = new_z
		else
			registered_z = null

/mob/dead/Login()
	. = ..()
	var/turf/T = get_turf(src)
	if (isturf(T))
		update_z(T.z)

/mob/dead/auto_deadmin_on_login()
	return

/mob/dead/Logout()
	update_z(null)
	return ..()

/mob/dead/onTransitZ(old_z,new_z)
	..()
	update_z(new_z)
