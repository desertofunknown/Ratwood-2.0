#define TAB_ROUSMAIN 1
#define TAB_SCOMLOG 2
#define TAB_MANAGESCOMS 3

/obj/structure/roguemachine/crier
	name = "rous master"
	desc = "The crier's most trusted friend."
	icon = 'icons/roguetown/misc/structure.dmi'
	icon_state = "crier_machine"
	density = TRUE
	blade_dulling = DULLING_BASH
	max_integrity = 0
	anchored = TRUE
	layer = BELOW_OBJ_LAYER
	var/current_tab = TAB_ROUSMAIN
	locked = FALSE
	var/keycontrol = "crier"
	var/total_payments = 0 // Central storage of all broadcaster payments.

/obj/structure/roguemachine/crier/attackby(obj/item/P, mob/user, params)
	if(istype(P, /obj/item/roguekey))
		var/obj/item/roguekey/K = P
		if(K.lockid == keycontrol || istype(K, /obj/item/roguekey/lord))
			locked = !locked
			playsound(loc, 'sound/misc/beep.ogg', 100, FALSE, -1)
			return
		else
			to_chat(user, span_warning("Wrong key."))
			return
	if(istype(P, /obj/item/storage/keyring))
		var/obj/item/storage/keyring/K = P
		if(!K.contents.len)
			return
		var/list/keysy = K.contents.Copy()
		for(var/obj/item/roguekey/KE in keysy)
			if(KE.lockid == keycontrol)
				locked = !locked
				playsound(loc, 'sound/misc/beep.ogg', 100, FALSE, -1)
				return
		to_chat(user, span_warning("Wrong key."))
		return

/obj/structure/roguemachine/crier/Topic(href, href_list)
	. = ..()
	if(!usr.canUseTopic(src, BE_CLOSE) || locked)
		return
	if(href_list["switchtab"])
		current_tab = text2num(href_list["switchtab"])
	if(href_list["togglehorn"])
		var/obj/structure/broadcast_horn/paid/H = locate(href_list["togglehorn"])
		if(H && (H in SSroguemachine.broadcaster_machines))
			H.is_locked = !H.is_locked
			to_chat(usr, span_notice("You [H.is_locked ? "lock" : "unlock"] [H]."))
	if(href_list["withdraw"])
		if(total_payments <= 0)
			to_chat(usr, span_warning("No mammon to withdraw."))
			return

		var/amount = total_payments
		total_payments = 0

		while(amount >= 5)
			new /obj/item/roguecoin/silver(get_turf(src))
			amount -= 5
		while(amount >= 1)
			new /obj/item/roguecoin/copper(get_turf(src))
			amount -= 1
		to_chat(usr, span_notice("You withdraw the broadcaster payments."))

	return attack_hand(usr)

/obj/structure/roguemachine/crier/attack_hand(mob/living/user)
	. = ..()
	if(.)
		return
	if(locked)
		to_chat(user, span_warning("It's locked. Of course."))
		return
	user.changeNext_move(CLICK_CD_INTENTCAP)
	playsound(loc, 'sound/misc/keyboard_enter.ogg', 100, FALSE, -1)
	var/canread = user.can_read(src, TRUE)
	var/list/contents = list("<div class='crier-folio'><div class='crier-heading'><div class='crier-edition'>The crier's ledger</div><h1>Rous Master</h1><p>Broadcasts, streetpipes &amp; collected mammon</p></div><div class='crier-tabs'>")
	contents += "<a class='[current_tab == TAB_ROUSMAIN ? "crier-selected" : ""]' href='?src=\ref[src];switchtab=[TAB_ROUSMAIN]'[current_tab == TAB_ROUSMAIN ? " aria-current='page'" : ""]>Overview</a>"
	contents += "<a class='[current_tab == TAB_SCOMLOG ? "crier-selected" : ""]' href='?src=\ref[src];switchtab=[TAB_SCOMLOG]'[current_tab == TAB_SCOMLOG ? " aria-current='page'" : ""]>Broadcast Log</a>"
	contents += "<a class='[current_tab == TAB_MANAGESCOMS ? "crier-selected" : ""]' href='?src=\ref[src];switchtab=[TAB_MANAGESCOMS]'[current_tab == TAB_MANAGESCOMS ? " aria-current='page'" : ""]>Broadcasters</a></div><div class='crier-content' tabindex='0' role='region' aria-label='Crier ledger'>"
	switch(current_tab)
		if(TAB_ROUSMAIN)
			contents += "<h2>Collected payments</h2><div class='crier-payments'><span>Total stored mammon</span><strong>[total_payments]</strong>"
			if(total_payments > 0)
				contents += "<a class='crier-button' href='?src=\ref[src];withdraw=1'>Withdraw All</a>"
			else
				contents += "<span class='crier-empty-payment'>No mammon to withdraw.</span>"
			contents += "</div><div class='crier-note'>Payments collected by the broadcasters are stored here.</div>"

		if(TAB_SCOMLOG)
			contents += "<div class='crier-section-heading'><h2>Broadcast Log</h2><span>Most recent first</span></div>"
			if(!length(GLOB.broadcast_list))
				contents += "<div class='crier-empty'>No broadcasts logged yet.</div>"
			else
				// Show most recent first, preserving the recorded message markup.
				for(var/i = length(GLOB.broadcast_list), i > 0, i--)
					var/entry = GLOB.broadcast_list[i]
					var/msg = entry["message"]
					var/tag = entry["tag"]
					var/time = entry["timestamp"]
					contents += "<div class='crier-broadcast'><div class='crier-broadcast-meta'>[tag ? " ( [tag] )" : ""] broadcasted at [time]:</div><div class='crier-message'>[msg]</div></div>"

		if(TAB_MANAGESCOMS)
			contents += "<h2>Manage Broadcasters</h2>"
			if(!length(SSroguemachine.broadcaster_machines))
				contents += "<div class='crier-empty'>No broadcasters found.</div>"
			else
				for(var/obj/structure/broadcast_horn/paid/H in SSroguemachine.broadcaster_machines)
					var/locked_text = H.is_locked ? "Locked" : "Unlocked"
					contents += "<div class='crier-broadcaster'><div class='crier-broadcaster-name'>Streetpipe [H.broadcaster_tag ? " ( [H.broadcaster_tag] )" : ""]<span class='crier-status'>[locked_text]</span></div>"
					contents += "<a class='crier-button' href='?src=\ref[src];togglehorn=\ref[H]'>[H.is_locked ? "Unlock" : "Lock"]</a></div>"
	contents += "</div></div>"
	if(!canread)
		contents = list("<div class='crier-unreadable'>[html_encode(stars(contents.Join()))]</div>")
	var/datum/browser/popup = new(user, "crier_control", "", 680, 680)
	popup.add_stylesheet("crier", 'html/browser/crier.css')
	var/datum/asset/simple/roguefonts/crier_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = crier_fonts.get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Crier Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Crier Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Crier Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>")
	popup.set_content(contents.Join())
	popup.open()

#undef TAB_ROUSMAIN
#undef TAB_SCOMLOG
#undef TAB_MANAGESCOMS
