/*
/mob/living
	var/tmp/image/move_indicator

/turf/MouseEntered(location,control,params)
	if(istype(usr, /mob/living))
		var/mob/living/p = usr
		if(!p.move_indicator)
			p.move_indicator = image('icons/mouseover.dmi',src,"mouseover",ABOVE_HUD_LAYER,null)
			p.move_indicator.pixel_x = -1
			p.move_indicator.pixel_y = -1
			p <<  p.move_indicator
		else
			world << "[src.x] [src.y]" //outputs the turf's x/y
			p.move_indicator.loc = src //set to turf I entered before this /turf
			world << "[p.move_indicator.x] [p.move_indicator.y]" //outputs the turf's x/y, they match
*/

/atom
	/// This means that the mouse over text will not be displayed when the mouse is over this atom
	var/nomouseover = FALSE

/atom/MouseEntered(location,control,params)
	. = ..()
	if(!nomouseover && name && ismob(usr))
		handle_mouseover(location, control, params)

/atom/MouseExited(params)
	. = ..()
	if(!nomouseover && ismob(usr))
		handle_mouseexit(params)

/atom/proc/handle_mouseover(location, control, params)
	var/mob/p = usr
	if(QDELETED(src))
		return FALSE
	if(!p)
		return FALSE
	if(p.client)
		var/atom/AT = get_turf(p.client.eye)
		if(!p.client.mouseovertext)
			p.client.genmouseobj()
			return FALSE
		if(!p.x || !p.y)
			return FALSE
		var/offset_x = 8 - (AT.x - x) - (p.client.pixel_x / world.icon_size)
		var/offset_y = 8 - (AT.y - y) - (p.client.pixel_y / world.icon_size)
		var/list/PM = list("screen-loc" = "[offset_x]:0,[offset_y]:0")
		p.client.mouseovertext.maptext_width = 96
		p.client.mouseovertext.maptext_height = 32
		p.client.mouseovertext.maptext = {"<span style='font-size:8pt;font-family:"Pterra";color:#ddd7df;text-shadow:0 0 10px #fff, 0 0 20px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073;' class='center maptext '>[name]"}
		if(!isturf(loc))
			PM = params2list(params)
			p.client.mouseovertext.movethis(PM, TRUE)
		else
			p.client.mouseovertext.movethis(PM)
		p.client.screen |= p.client.mouseovertext
	return TRUE

/obj/structure/soul/handle_mouseover(location, control, params)
	return TRUE

/obj/structure/handle_mouseover(location, control, params)
	var/mob/p = usr
	if(p.client)
		var/atom/AT = get_turf(p.client.eye)
		if(!p.client.mouseovertext)
			p.client.genmouseobj()
			return FALSE
		if(!p.x || !p.y)
			return FALSE
		var/offset_x = 8 - (AT.x - x) - (p.client.pixel_x / world.icon_size)
		var/offset_y = 8 - (AT.y - y) - (p.client.pixel_y / world.icon_size)
		var/list/PM = list("screen-loc" = "[offset_x]:0,[offset_y]:0")
		p.client.mouseovertext.maptext_width = 96
		p.client.mouseovertext.maptext_height = 32
		//if((((rotation_structure && rotation_network) || istype(src, /obj/structure/water_pipe)) || accepts_water_input) && HAS_TRAIT(p, TRAIT_ENGINEERING_GOGGLES))	
		if(((rotation_structure && rotation_network)) && (HAS_TRAIT(p, TRAIT_ENGINEERING_GOGGLES))) //changing this to just look at rotations and removing the trait, users just need over 3 engineering.
			var/rotation_chat = return_rotation_chat(p.client.mouseovertext)
			p.client.mouseovertext.maptext = {"[rotation_chat]
			<span style='font-size:8pt;font-family:"Pterra";color:#ddd7df;text-shadow:0 0 1px #fff, 0 0 2px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073;' class='center maptext '>[name]"}
		else
			p.client.mouseovertext.maptext = {"<span style='font-size:8pt;font-family:"Pterra";color:#ddd7df;text-shadow:0 0 10px #fff, 0 0 20px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073;' class='center maptext '>[name]"}
		if(!isturf(loc))
			PM = params2list(params)
			p.client.mouseovertext.movethis(PM, TRUE)
		else
			p.client.mouseovertext.movethis(PM)

/atom/proc/return_rotation_chat(atom/movable/screen/movable/mouseover/mouseover)
	return

/atom/proc/handle_mouseexit(params)
	var/mob/p = usr
	if(p.client)
		if(!p.client.mouseovertext)
			p.client.genmouseobj()
			return FALSE
		p.client.mouseovertext.placement_generation++
		p.client.mouseovertext.screen_loc = null
	return TRUE

/*
/turf/MouseEntered(location,control,params)
	. = ..()
	if(!density)
		return
	if(istype(usr, /mob) && !nomouseover)
		var/list/PM = params2list(params)
		var/mob/p = usr
		if(p.boxaim && p.client)
			p.client.mouseoverbox.movethis(PM)

/turf/MouseExited(params)
	. = ..()
	if(!density)
		return
	if(!nomouseover)
		var/mob/living/p = usr
		if(p.boxaim && p.client)
			p.client.mouseoverbox.screen_loc = null
*/

/turf/handle_mouseover(location,control,params)
	var/mob/p = usr
	if(QDELETED(src))
		return FALSE
	if(p.client)
		var/atom/AT = get_turf(p.client.eye)
		if(!p.client.mouseovertext)
			p.client.genmouseobj()
			return FALSE
		if(!p.x || !p.y)
			return FALSE
		var/offset_x = 8 - (AT.x - x) - (p.client.pixel_x / world.icon_size)
		var/offset_y = 8 - (AT.y - y) - (p.client.pixel_y / world.icon_size)
		if(offset_x < 1 || offset_x > 15 || offset_y < 1 || offset_x > 15)
			return FALSE
		var/list/PM = list("screen-loc" = "[offset_x]:0,[offset_y]:0")
		p.client.mouseovertext.maptext_width = 96
		p.client.mouseovertext.maptext_height = 32
		p.client.mouseovertext.maptext = {"<span style='font-size:8pt;font-family:"Pterra";color:#607d65;text-shadow:0 0 10px #fff, 0 0 20px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073;' class='center maptext '>[name]"}
		p.client.mouseovertext.movethis(PM)
		p.client.screen |= p.client.mouseovertext
	return TRUE

/turf/open
	nomouseover = TRUE

/turf/open/handle_mouseover(location, control, params)
	var/mob/p = usr
	if(QDELETED(src))
		return FALSE
	if(p.client)
		var/atom/AT = get_turf(p.client.eye)
		if(!p.client.mouseovertext)
			p.client.genmouseobj()
			return FALSE
		if(!p.x || !p.y)
			return FALSE
		var/offset_x = 8 - (AT.x - x) - (p.client.pixel_x / world.icon_size)
		var/offset_y = 8 - (AT.y - y) - (p.client.pixel_y / world.icon_size)
		var/list/PM = list("screen-loc" = "[offset_x]:0,[offset_y]:0")
		p.client.mouseovertext.maptext_width = 96
		p.client.mouseovertext.maptext_height = 32
		p.client.mouseovertext.maptext = {"<span style='font-size:8pt;font-family:"Pterra";color:#6b3f3f;text-shadow:0 0 10px #fff, 0 0 20px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073;' class='center maptext '>[name]"}
		p.client.mouseovertext.movethis(PM)
		p.client.screen |= p.client.mouseovertext
	return TRUE

/mob/handle_mouseover(location,control,params)
	var/mob/p = usr
	if(QDELETED(src))
		return FALSE
	if(p.client)
		var/atom/AT = get_turf(p.client.eye)
		if(!p.client.mouseovertext)
			p.client.genmouseobj()
			return FALSE
		if(isliving(p))
			var/mob/living/L = p
			if(!L.can_see_cone(src))
				return FALSE
		if(alpha == 0)
			return FALSE
		if(!p.x || !p.y)
			return FALSE
		var/offset_x = 8 - (AT.x - x) - (p.client.pixel_x / world.icon_size)
		var/offset_y = 8 - (AT.y - y) - (p.client.pixel_y / world.icon_size)
		var/list/PM = list("screen-loc" = "[offset_x]:0,[offset_y]:0")
		var/list/mouseover_data = get_mouseover_data(p)
		if(!mouseover_data)
			return FALSE
		p.client.mouseovertext.maptext_width = 96
		p.client.mouseovertext.maptext_height = mouseover_data["height"]
		p.client.mouseovertext.maptext = mouseover_data["text"]
		p.client.mouseovertext.movethis(PM, y_shift = mouseover_data["y_shift"])
		p.client.screen |= p.client.mouseovertext
	return TRUE

/mob/proc/get_mouseover_data(mob/viewer)
	return list(
		"height" = 32,
		"text" = {"<span style='font-size:8pt;font-family:"Pterra";color:#c1aaaa;text-shadow:0 0 10px #fff, 0 0 20px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073;' class='center maptext '>[name]"},
	)

/mob/living/carbon/human/get_mouseover_data(mob/viewer)
	var/mousecolor = "#c1aaaa"
	if(voice_color && name == real_name)
		mousecolor = "#[voice_color]"

	if(viewer?.client?.prefs?.show_mouseover_role && get_face_name(""))
		var/role_text = get_mouseover_role_title()
		if(role_text)
			return list(
				"height" = 44,
				"y_shift" = 3,
				"text" = "<span style='font-size:8pt;font-family:\"Pterra\";color:[mousecolor];text-shadow:0 0 10px #fff,0 0 20px #fff,0 0 30px #e60073,0 0 40px #e60073,0 0 50px #e60073,0 0 60px #e60073,0 0 70px #e60073;display:block;text-align:center;' class='center maptext '>[name]</span><span style='font-size:6pt;font-family:\"Pterra\";color:#c1aaaa;text-shadow:0 0 10px #000,0 0 10px #000,0 0 10px #000;display:block;text-align:center;'>[role_text]</span>",
			)

	var/list/mouseover_data = ..()
	mouseover_data["text"] = replacetext(mouseover_data["text"], "color:#c1aaaa", "color:[mousecolor]")
	return mouseover_data

/mob/proc/get_mouseover_role_title()
	var/used_title = get_role_title()
	return used_title || mind?.assigned_role || job

/mob/living/carbon/human/get_mouseover_role_title()
	if(!migrant_type && job)
		var/datum/job/J = SSjob.GetJob(job)
		if(!J || J.wanderer_examine)
			return "Wanderer"
		if(J.lowlife_examine)
			return "Lowlife"
	return ..()

/atom/movable/screen
	nomouseover = TRUE

/atom/movable/screen/movable/mouseover
	name = ""
	icon = 'icons/mouseover.dmi'
	icon_state = "mouseover"
	mouse_opacity = MOUSE_OPACITY_TRANSPARENT
	layer = ABOVE_HUD_LAYER+3
	plane = HUD_PLANE + 1
	var/placement_generation = 0

/atom/movable/screen/movable/mouseover/maptext
	name = ""
	icon = null
	icon_state = null
	maptext = "MOUSEOVER"
	maptext_width = 96
	maptext_height = 32
	appearance_flags = APPEARANCE_UI | TILE_BOUND
	alpha = 150

/atom/movable/screen/movable/mouseover/proc/movethis(list/PM, hudobj = FALSE, y_shift = 0)
	set waitfor = FALSE
	if(locked)
		return

	var/generation = ++placement_generation
	screen_loc = null
	var/client/viewer = usr?.client
	if(!viewer || !PM?["screen-loc"])
		return

	// Mouse event coordinates are numeric, including the negative HUD columns.
	var/list/coordinates = splittext(PM["screen-loc"], ",")
	if(length(coordinates) != 2)
		return
	var/list/horizontal = splittext(coordinates[1], ":")
	var/list/vertical = splittext(coordinates[2], ":")
	var/tile_x = text2num(horizontal[1])
	var/tile_y = text2num(vertical[1])
	if(isnull(tile_x) || isnull(tile_y))
		return
	var/pixel_offset_x = length(horizontal) > 1 ? text2num(horizontal[2]) : 0
	var/pixel_offset_y = !hudobj && length(vertical) > 1 ? text2num(vertical[2]) : 0
	var/anchor_x = (tile_x - 1) * world.icon_size + pixel_offset_x
	var/anchor_y = (tile_y - 1) * world.icon_size + pixel_offset_y
	var/text_width = maptext_width
	var/text_height = maptext_height

	var/mob/viewing_mob = viewer.mob
	var/viewing_hud_version = viewing_mob?.hud_used?.hud_version
	var/view_size = viewer.view
	var/list/view_tiles = getviewsize(view_size)
	var/left = 0
	var/bottom = 0
	var/right = view_tiles[1] * world.icon_size
	var/top = view_tiles[2] * world.icon_size
	var/list/hud_screen = viewer.screen
	// Normal and ghost HUDs share the five-column left border. Reduced HUDs
	// retain only their hands and status indicators; no HUD has no such border.
	for(var/atom/movable/screen/hud_element in hud_screen)
		switch(hud_element.screen_loc)
			if(ui_backhudl)
				left = min(left, -5 * world.icon_size)
				var/list/background_size = get_icon_dimensions(hud_element.icon)
				right = max(right, -5 * world.icon_size + background_size["width"])
				top = max(top, background_size["height"])
			if(rogueui_lefthand, rogueui_targetdoll)
				left = min(left, -3 * world.icon_size)
			if(rogueui_righthand)
				left = min(left, -2 * world.icon_size)
			if(rogueui_fat, rogueui_temperature)
				left = min(left, -world.icon_size)
			else
				if(hud_element.screen_loc == ui_hand_position(1))
					left = min(left, -3 * world.icon_size)
				else if(hud_element.screen_loc == ui_hand_position(2))
					left = min(left, -2 * world.icon_size)

	// view-size includes the HUD border and zoom. Letterboxing is not usable
	// space; an oversized zoom crops the native view equally on either side.
	var/list/map_sizes = params2list(winget(viewer, "mapwindow.map", "size;view-size"))
	if(QDELETED(src) || !viewer || viewer.mouseovertext != src || generation != placement_generation || viewer.mob != viewing_mob || viewer.view != view_size || viewing_mob?.hud_used?.hud_version != viewing_hud_version)
		return
	var/list/control_size = splittext(map_sizes["size"] || "", "x")
	var/list/scaled_size = splittext(map_sizes["view-size"] || "", "x")
	if(length(control_size) != 2 || length(scaled_size) != 2)
		return
	var/control_width = text2num(control_size[1])
	var/control_height = text2num(control_size[2])
	var/scaled_width = text2num(scaled_size[1])
	var/scaled_height = text2num(scaled_size[2])
	if(control_width <= 0 || control_height <= 0 || scaled_width <= 0 || scaled_height <= 0)
		return
	var/crop_x = (right - left) * max(0, 1 - control_width / scaled_width) / 2
	var/crop_y = (top - bottom) * max(0, 1 - control_height / scaled_height) / 2
	left += crop_x
	right -= crop_x
	bottom += crop_y
	top -= crop_y
	left = CEILING(left, 1)
	right = FLOOR(right, 1)
	bottom = CEILING(bottom, 1)
	top = FLOOR(top, 1)
	if(right <= left || top <= bottom)
		return
	maptext_width = min(text_width, right - left)
	maptext_height = min(text_height, top - bottom)
	maptext_x = round(clamp(anchor_x + (hudobj ? -48 : -32), left, right - maptext_width))
	maptext_y = round(clamp(anchor_y + 28 + y_shift, bottom, top - maptext_height))
	// Keep the anchor inside the map so the tooltip cannot create its own HUD border.
	screen_loc = "1,1"
	moved = screen_loc

/client/proc/genmouseobj()
	mouseovertext = new /atom/movable/screen/movable/mouseover/maptext
	mouseoverbox = new /atom/movable/screen/movable/mouseover
	//var/datum/asset/stuff = get_asset_datum(/datum/asset/simple/roguefonts)
	//stuff.send(src)
