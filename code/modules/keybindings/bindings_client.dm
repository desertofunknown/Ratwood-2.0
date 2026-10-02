// Clients aren't datums so we have to define these procs indpendently.
// These verbs are called for all key press and release events
/client/var/list/active_keybindings = list()

/client/proc/release_keybindings(released_key)
	for(var/full_key in active_keybindings.Copy())
		var/list/active = active_keybindings[full_key]
		if(released_key && !(released_key in active["keys"]))
			continue
		active_keybindings -= full_key
		for(var/kb_name in active["bindings"])
			var/datum/keybinding/kb = GLOB.keybindings_by_name[kb_name]
			kb?.up(src)

/client/verb/keyDown(_key as text)
	set instant = TRUE
	set hidden = TRUE

	client_keysend_amount += 1

	var/cache = client_keysend_amount

	if(keysend_tripped && next_keysend_trip_reset <= world.time)
		keysend_tripped = FALSE

	if(next_keysend_reset <= world.time)
		client_keysend_amount = 0
		next_keysend_reset = world.time + (1 SECONDS)

	//The "tripped" system is to confirm that flooding is still happening after one spike
	//not entirely sure how byond commands interact in relation to lag
	//don't want to kick people if a lag spike results in a huge flood of commands being sent
	if(cache >= MAX_KEYPRESS_AUTOKICK)
		if(!keysend_tripped)
			keysend_tripped = TRUE
			next_keysend_trip_reset = world.time + (2 SECONDS)
		else
			log_admin("Client [ckey] was just autokicked for flooding keysends; likely abuse but potentially lagspike.")
			message_admins("Client [ckey] was just autokicked for flooding keysends; likely abuse but potentially lagspike.")
			qdel(src)
			return

	///Check if the key is short enough to even be a real key
	if(LAZYLEN(_key) > MAX_KEYPRESS_COMMANDLENGTH)
		to_chat(src, span_danger("Invalid KeyDown detected! You have been disconnected from the server automatically."))
		log_admin("Client [ckey] just attempted to send an invalid keypress. Keymessage was over [MAX_KEYPRESS_COMMANDLENGTH] characters, autokicking due to likely abuse.")
		message_admins("Client [ckey] just attempted to send an invalid keypress. Keymessage was over [MAX_KEYPRESS_COMMANDLENGTH] characters, autokicking due to likely abuse.")
		qdel(src)
		return

	//Focus Chat failsafe. Overrides movement checks to prevent WASD.
	if(!prefs.hotkeys && length(_key) == 1 && _key != "Alt" && _key != "Ctrl" && _key != "Shift")
		winset(src, null, "input.focus=true ; input.text=[url_encode(_key)]")
		return

	if(length(keys_held) > MAX_HELD_KEYS)
		keys_held.Cut(1,2)

	keys_held[_key] = TRUE
	var/movement = movement_keys[_key]
	if(movement)
		calculate_move_dir()
		if(!movement_locked && !(next_move_dir_sub & movement))
			next_move_dir_add |= movement
		else if(movement_locked && mob)
			SEND_SIGNAL(mob, COMSIG_MOB_MOVEMENT_LOCKED_KEY_PRESSED, camera_relative_dir(movement))

	// Client-level keybindings are ones anyone should be able to do at any time
	// Things like taking screenshots, hitting tab, and adminhelps.
	var/AltMod = keys_held["Alt"] ? "Alt" : ""
	var/CtrlMod = keys_held["Ctrl"] ? "Ctrl" : ""
	var/ShiftMod = keys_held["Shift"] ? "Shift" : ""
	var/full_key
	switch(_key)
		if("Alt", "Ctrl", "Shift")
			full_key = "[AltMod][CtrlMod][ShiftMod]"
		else
			full_key = "[AltMod][CtrlMod][ShiftMod][_key]"
	var/keycount = 0
	var/list/binding_keys = list(_key)
	if(AltMod)
		binding_keys |= "Alt"
	if(CtrlMod)
		binding_keys |= "Ctrl"
	if(ShiftMod)
		binding_keys |= "Shift"
	for(var/kb_name in prefs.key_bindings[full_key])
		keycount++
		var/datum/keybinding/kb = GLOB.keybindings_by_name[kb_name]
		if(kb)
			if(!active_keybindings[full_key])
				active_keybindings[full_key] = list("keys" = binding_keys, "bindings" = list())
			var/list/active = active_keybindings[full_key]
			var/list/bindings = active["bindings"]
			bindings |= kb_name
			if(kb.down(src) && keycount >= MAX_COMMANDS_PER_KEY)
				break

	holder?.key_down(_key, src)
	mob.focus?.key_down(_key, src)
	mob.update_mouse_pointer()

/client/verb/keyUp(_key as text)
	set instant = TRUE
	set hidden = TRUE

	client_keysend_amount += 1

	var/cache = client_keysend_amount

	if(keysend_tripped && next_keysend_trip_reset <= world.time)
		keysend_tripped = FALSE

	if(next_keysend_reset <= world.time)
		client_keysend_amount = 0
		next_keysend_reset = world.time + (1 SECONDS)
	
	//The "tripped" system is to confirm that flooding is still happening after one spike
	//not entirely sure how byond commands interact in relation to lag
	//don't want to kick people if a lag spike results in a huge flood of commands being sent
	if(cache >= MAX_KEYPRESS_AUTOKICK)
		if(!keysend_tripped)
			keysend_tripped = TRUE
			next_keysend_trip_reset = world.time + (2 SECONDS)
		else
			log_admin("Client [ckey] was just autokicked for flooding keyUps; likely abuse but potentially lagspike.")
			message_admins("Client [ckey] was just autokicked for flooding keyUp; likely abuse but potentially lagspike.")
			qdel(src)
			return

	///Check if the key is short enough to even be a real key
	if(LAZYLEN(_key) > MAX_KEYPRESS_COMMANDLENGTH)
		to_chat(src, "<span class='userdanger'>Invalid KeyUp detected! You have been disconnected from the server automatically.</span>")
		log_admin("Client [ckey] just attempted to send an invalid keyUp - [_key]. Keymessage was over [MAX_KEYPRESS_COMMANDLENGTH] characters, autokicking due to likely abuse.")
		message_admins("Client [ckey] just attempted to send an invalid keyUp - [_key]. Keymessage was over [MAX_KEYPRESS_COMMANDLENGTH] characters, autokicking due to likely abuse.")
		qdel(src)
		return

	keys_held -= _key

	var/movement = movement_keys[_key]
	if(movement)
		calculate_move_dir()
		if(!movement_locked && !(next_move_dir_add & movement))
			next_move_dir_sub |= movement

	release_keybindings(_key)
	holder?.key_up(_key, src)
	mob.focus?.key_up(_key, src)
	mob.update_mouse_pointer()

/client/verb/activeInput()
	set hidden = 1
	if(isliving(mob))
		var/mob/living/L = mob
		if(L.stat)
			return
		mob.display_typing_indicator()

/client/verb/disableInput()
	set hidden = 1
