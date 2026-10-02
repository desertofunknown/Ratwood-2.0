/datum/looping_sound/musloop
	mid_sounds = list()
	mid_length = 2400 // Whoever wrote this is giving me an aneurism
	volume = 70
	extra_range = 8
	falloff = 0
	persistent_loop = TRUE
	var/stress2give = /datum/stressevent/music

/datum/looping_sound/musloop/attach_loop_to_all_clients()
	// Nearby listeners join through play() and the sound subsystem's range scan.
	// Registering a silent track globally lets distant devices interfere with it.
	return

/datum/looping_sound/musloop/on_hear_sound(mob/M)
	. = ..()
	if(stress2give)
		if(isliving(M))
			var/mob/living/carbon/L = M
			L.add_stress(stress2give)

/obj/structure/roguemachine/musicbox
	name = "wax music device"
	desc = "A marvelous device invented to record sermons. Aleksandar Gemrald Sparks invented this machine to discover prophecies of Psydon's return but failed. It now brings us strange music from another realm."
	icon = 'icons/roguetown/misc/machines.dmi'
	icon_state = "music0"
	density = TRUE
	anchored = TRUE
	max_integrity = 0
	var/datum/looping_sound/musloop/soundloop
	var/list/init_curfile = list('sound/music/jukeboxes/gen/tavern1.ogg') // A list of songs that curfile is set to on init. MUST BE IN ONE OF THE MUSIC_TAVCAT_'s.
	var/curfile // The current track that is playing right now
	var/playing = FALSE // If music is playing or not. playmusic() deals with this don't mess with it.
	var/curvol = 50 // The current volume at which audio is played. MAPPERS MAY TOUCH THIS.
	var/playuponspawn = FALSE // Does the music box start playing music when it first spawns in? MAPPERS MAY TOUCH THIS.
	var/list/static/songlist_otherworldly = list(
		"Lore" = 'sound/music/jukeboxes/otherworld/ac-ler.ogg',
		"Landmarks of Lullabies" = 'sound/music/jukeboxes/otherworld/ac-lol.ogg',
		"Waters of Sacrifice" = 'sound/music/jukeboxes/otherworld/acn-wos.ogg',
		"Solar Wind" = 'sound/music/jukeboxes/otherworld/av_solar.ogg',
		"Balthasar" = 'sound/music/jukeboxes/otherworld/ac-balthasar.ogg',
		"Dead Windmills" = 'sound/music/jukeboxes/otherworld/dead_windmills.ogg',
		"In Heaven Everythin" = 'sound/music/jukeboxes/otherworld/in_heaven_eif.ogg',
		"Jazznocn" = 'sound/music/jukeboxes/otherworld/jazznocn.ogg',
		"Vivalaluna-Damla" = 'sound/music/jukeboxes/otherworld/vivalaluna-damla.ogg',
		"Shades of Futility" = 'sound/music/jukeboxes/otherworld/fb-sofutile.ogg',
		"Mr Doubt" = 'sound/music/jukeboxes/otherworld/mr_doubt.ogg'
	)
	var/list/static/songlist_generic = list(\
		"Song 1" = 'sound/music/jukeboxes/gen/tavern1.ogg',
		"Song 2" = 'sound/music/jukeboxes/gen/tavern2.ogg',
		"Song 3" = 'sound/music/jukeboxes/gen/tavern3.ogg'
	)
	var/list/static/songlist_oldschool = list(\
		"Autumn Voyage" = 'sound/music/jukeboxes/oldschool/Autumn_Voyage.ogg',
		"Fanfare" = 'sound/music/jukeboxes/oldschool/Fanfare.ogg',
		"Greatness" = 'sound/music/jukeboxes/oldschool/Greatness.ogg',
		"Medieval" = 'sound/music/jukeboxes/oldschool/Medieval.ogg',
		"Sea Shanty2" = 'sound/music/jukeboxes/oldschool/Sea_Shanty2.ogg',
		"Shine" = 'sound/music/jukeboxes/oldschool/Shine.ogg',
		"Spirit" = 'sound/music/jukeboxes/oldschool/Spirit.ogg',
		"Still Night" = 'sound/music/jukeboxes/oldschool/Still_Night.ogg',
		"Venture" = 'sound/music/jukeboxes/oldschool/Venture.ogg',
		"Yesteryear" = 'sound/music/jukeboxes/oldschool/Yesteryear.ogg'
	)

/obj/structure/roguemachine/musicbox/Initialize(mapload)
	. = ..()
	curfile = pick(init_curfile)
	soundloop = new(src, FALSE)
	if(playuponspawn)
		start_playing()

/obj/structure/roguemachine/musicbox/Destroy()
	. = ..()
	qdel(soundloop) //jesus fuck who is using hard dels in this day and age

/obj/structure/roguemachine/musicbox/update_icon()
	icon_state = "music[playing]"

/obj/structure/roguemachine/musicbox/proc/toggle_music()
	if(!playing)
		start_playing()
	else
		stop_playing()

/obj/structure/roguemachine/musicbox/proc/start_playing()
	playing = TRUE
	soundloop.set_mid_sounds(list(curfile))
	soundloop.volume = curvol
	soundloop.start()
	testing("Music: V[soundloop.volume] C[soundloop.cursound] T[soundloop.thingshearing]")
	update_icon()

/obj/structure/roguemachine/musicbox/proc/stop_playing()
	playing = FALSE
	soundloop.stop()
	update_icon()

/obj/structure/roguemachine/musicbox/attack_hand(mob/living/user)
	. = ..()
	if(.)
		return
	user.changeNext_move(CLICK_CD_INTENTCAP)
	if(interact(user))
		winset(user, "musicbox[REF(src)].browser", "focus=true")

/obj/structure/roguemachine/musicbox/proc/get_song_catalogue()
	return list("Otherworldly" = songlist_otherworldly, "Tavern" = songlist_generic, "Oldschool" = songlist_oldschool)

/obj/structure/roguemachine/musicbox/interact(mob/user)
	if(!isliving(user) || !user.client || !user.canUseTopic(src, BE_CLOSE, NO_DEXTERITY, NO_TK))
		return
	user.set_machine(src)
	var/list/catalogue = get_song_catalogue()
	var/track_name = "No song selected"
	for(var/category in catalogue)
		var/list/songs = catalogue[category]
		for(var/song_name in songs)
			if(songs[song_name] == curfile)
				track_name = song_name
	var/list/contents = list("<main class='musicbox' data-device='[REF(src)]'><header><h1>[html_encode(capitalize(name))]</h1><span class='musicbox-status'>[playing ? "Playing" : "Stopped"]</span></header>")
	contents += "<section class='musicbox-controls' aria-label='Playback'><div class='musicbox-track'>[html_encode(track_name)]</div><div class='musicbox-playback'><a id='music-playback' role='button' href='?src=[REF(src)];music_action=[playing ? "stop" : "play"]'>[playing ? "Stop" : "Play"]</a>"
	contents += "<form action='?' method='get'><input type='hidden' name='src' value='[REF(src)]'><input type='hidden' name='music_action' value='volume'><label for='music-volume'>Volume</label> <input id='music-volume' name='volume' type='number' min='1' max='100' step='1' value='[curvol]'> <button id='music-set-volume' type='submit'>Set</button></form></div></section>"
	contents += "<div class='musicbox-filter'><label for='music-search'>Find a song</label><input id='music-search' type='search' autocomplete='off' placeholder='Song or collection...'></div><div id='music-catalogue' class='musicbox-catalogue' tabindex='0' aria-label='Songs'>"
	for(var/category_index in 1 to length(catalogue))
		var/category = catalogue[category_index]
		var/list/songs = catalogue[category]
		contents += "<section class='musicbox-collection' data-collection='[html_encode(category)]'><h2>[html_encode(category)]</h2>"
		for(var/song_index in 1 to length(songs))
			var/song_name = songs[song_index]
			var/selected = songs[song_name] == curfile
			contents += "<a class='musicbox-song[selected ? " is-selected" : ""]' id='music-song-[category_index]-[song_index]' href='?src=[REF(src)];music_action=song;collection=[category_index];song=[song_index]'[selected ? " aria-current='true'" : ""]><span>[html_encode(song_name)]</span><small>[selected ? (playing ? "Playing" : "Selected") : "Play"]</small></a>"
		contents += "</section>"
	contents += "<p id='music-no-matches' hidden>No songs match this search.</p></div><footer><span>Select a song to play it.</span><a id='music-close' href='?src=[REF(src)];music_action=close'>Close</a></footer></main>"
	var/datum/browser/popup = new(user, "musicbox[REF(src)]", "", 460, 540, src)
	popup.add_stylesheet("musicbox", 'html/browser/musicbox.css')
	popup.add_script("musicbox", 'html/browser/musicbox.js')
	var/list/font_urls = get_asset_datum(/datum/asset/simple/roguefonts).get_url_mappings()
	popup.add_head_content("<title>[html_encode(capitalize(name))]</title><style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Keep Rocker'; src: url('[font_urls["newrocker.ttf"]]'); }</style>")
	popup.set_content(contents.Join())
	popup.open()
	return TRUE

/obj/structure/roguemachine/musicbox/Topic(href, list/href_list)
	. = ..()
	var/mob/user = usr
	if(!user?.client)
		return
	var/action = href_list["music_action"]
	if(href_list["close"] || action == "close")
		user << browse(null, "window=musicbox[REF(src)]")
		if(user.machine == src)
			user.unset_machine()
		return
	if(user.machine != src || !isliving(user) || !user.canUseTopic(src, BE_CLOSE, NO_DEXTERITY, NO_TK))
		return
	switch(action)
		if("play")
			if(playing || !curfile)
				return
			start_playing()
		if("stop")
			if(!playing)
				return
			stop_playing()
		if("song")
			var/list/catalogue = get_song_catalogue()
			var/category_index = text2num(href_list["collection"])
			if(!ISINTEGER(category_index) || category_index < 1 || category_index > length(catalogue))
				return
			var/list/songs = catalogue[catalogue[category_index]]
			var/song_index = text2num(href_list["song"])
			if(!ISINTEGER(song_index) || song_index < 1 || song_index > length(songs))
				return
			curfile = songs[songs[song_index]]
			stop_playing()
			start_playing()
		if("volume")
			var/new_volume = text2num(href_list["volume"])
			if(!isnum(new_volume))
				return
			new_volume = clamp(round(new_volume), 1, 100)
			if(new_volume == curvol)
				return
			curvol = new_volume
			soundloop.volume = curvol
			if(playing)
				stop_playing()
				start_playing()
		else
			return
	user.visible_message(span_info("[user] presses a button on \the [src]."), span_info("I press a button on \the [src]."))
	playsound(loc, pick('sound/misc/keyboard_select (1).ogg', 'sound/misc/keyboard_select (2).ogg', 'sound/misc/keyboard_select (3).ogg', 'sound/misc/keyboard_select (4).ogg'), 100, FALSE, -1)
	updateDialog()

/obj/structure/roguemachine/musicbox/tavern
	init_curfile = list(
		'sound/music/jukeboxes/gen/tavern1.ogg',
		'sound/music/jukeboxes/gen/tavern2.ogg',
		'sound/music/jukeboxes/gen/tavern3.ogg',
		'sound/music/jukeboxes/otherworld/ac-lol.ogg',
		'sound/music/jukeboxes/otherworld/ac-balthasar.ogg',
		'sound/music/jukeboxes/otherworld/vivalaluna-damla.ogg',
	)
	curvol = 65
	playuponspawn = TRUE
/* The fuck is this
/obj/structure/roguemachine/musicbox/Initialize(mapload)
	. = ..()
	soundloop.extra_range = 12
	soundloop.falloff = 6
*/
