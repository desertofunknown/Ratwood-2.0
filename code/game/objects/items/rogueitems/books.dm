/obj/item/book/rogue
	var/open = FALSE
	icon = 'icons/roguetown/items/books.dmi'
	icon_state = "basic_book_0"
	slot_flags = ITEM_SLOT_HIP
	var/base_icon_state = "basic_book"
	unique = TRUE
	firefuel = 5 MINUTES
	dropshrink = 0.6
	drop_sound = 'sound/foley/dropsound/book_drop.ogg'
	force = 5
	associated_skill = /datum/skill/misc/reading
	grid_width = 32
	grid_height = 32

/obj/item/book/rogue/getonmobprop(tag)
	. = ..()
	if(tag)
		if(open)
			switch(tag)
				if("gen")
					return list("shrink" = 0.4,
	"sx" = -2,
	"sy" = -3,
	"nx" = 10,
	"ny" = -2,
	"wx" = 1,
	"wy" = -3,
	"ex" = 5,
	"ey" = -3,
	"northabove" = 0,
	"southabove" = 1,
	"eastabove" = 1,
	"westabove" = 0,
	"nturn" = 0,
	"sturn" = 0,
	"wturn" = 0,
	"eturn" = 0,
	"nflip" = 0,
	"sflip" = 0,
	"wflip" = 0,
	"eflip" = 0)
				if("onbelt")
					return list("shrink" = 0.3,"sx" = -2,"sy" = -5,"nx" = 4,"ny" = -5,"wx" = 0,"wy" = -5,"ex" = 2,"ey" = -5,"nturn" = 0,"sturn" = 0,"wturn" = 0,"eturn" = 0,"nflip" = 0,"sflip" = 0,"wflip" = 0,"eflip" = 0,"northabove" = 0,"southabove" = 1,"eastabove" = 1,"westabove" = 0)
		else
			switch(tag)
				if("gen")
					return list("shrink" = 0.4,
	"sx" = -2,
	"sy" = -3,
	"nx" = 10,
	"ny" = -2,
	"wx" = 1,
	"wy" = -3,
	"ex" = 5,
	"ey" = -3,
	"northabove" = 0,
	"southabove" = 1,
	"eastabove" = 1,
	"westabove" = 0,
	"nturn" = 0,
	"sturn" = 0,
	"wturn" = 0,
	"eturn" = 0,
	"nflip" = 0,
	"sflip" = 0,
	"wflip" = 0,
	"eflip" = 0)
				if("onbelt")
					return list("shrink" = 0.3,"sx" = -2,"sy" = -5,"nx" = 4,"ny" = -5,"wx" = 0,"wy" = -5,"ex" = 2,"ey" = -5,"nturn" = 0,"sturn" = 0,"wturn" = 0,"eturn" = 0,"nflip" = 0,"sflip" = 0,"wflip" = 0,"eflip" = 0,"northabove" = 0,"southabove" = 1,"eastabove" = 1,"westabove" = 0)


/obj/item/book/rogue/attack_self(mob/user)
	if(!open)
		attack_right(user)
		return
	..()
	user.update_inv_hands()

/obj/item/book/rogue/rmb_self(mob/user)
	attack_right(user)
	return

/obj/item/book/rogue/read(mob/user)
	if(!open)
		to_chat(user, span_info("Open me first."))
		return FALSE
	. = ..()

/obj/item/book/rogue/attackby(obj/item/I, mob/user, params)
	return

/obj/item/book/rogue/attack_right(mob/user)
	if(!open)
		slot_flags &= ~ITEM_SLOT_HIP
		open = TRUE
		playsound(loc, 'sound/items/book_open.ogg', 100, FALSE, -1)
	else
		slot_flags |= ITEM_SLOT_HIP
		open = FALSE
		playsound(loc, 'sound/items/book_close.ogg', 100, FALSE, -1)
	curpage = 1
	update_icon()
	user.update_inv_hands()

/obj/item/book/rogue/update_icon()
	icon_state = "[base_icon_state]_[open]"

/obj/item/book/rogue/secret/ledger
	name = "catatoma"
	icon_state = "ledger_0"
	base_icon_state = "ledger"
	title = "Catatoma"
	dat = "To create a shipping order, use a papyrus on me."

/obj/item/book/rogue/secret/ledger/attackby(obj/item/I, mob/user, params)
	if(istype(I, /obj/item/paper/scroll/cargo))
		if(!open)
			to_chat(user, span_info("Open me first."))
			return FALSE
		var/obj/item/paper/scroll/cargo/C = I
		if(C.orders.len > 4)
			to_chat(user, span_warning("Too much order."))
			return
		var/picked_cat = input(user, "Categories", "Shipping Ledger") as null|anything in sortList(SSmerchant.supply_cats)
		if(!picked_cat)
			testing("yeye")
			return
		var/list/pax = list()
		for(var/pack in SSmerchant.supply_packs)
			var/datum/supply_pack/PA = SSmerchant.supply_packs[pack]
			if(PA.group == picked_cat)
				pax += PA

		var/datum/supply_pack/picked_pack = input(user, "Shipments", "Shipping Ledger") as null|anything in sortList(pax)
		if(!picked_pack)
			return

		C.orders += picked_pack
		C.rebuild_info()
		return
	if(istype(I, /obj/item/paper/scroll))
		if(!open)
			to_chat(user, span_info("Open me first."))
			return FALSE
		var/obj/item/paper/scroll/P = I
		if(P.info)
			to_chat(user, span_warning("Something is written here already."))
			return
		var/picked_cat = input(user, "Categories", "Shipping Ledger") as null|anything in sortList(SSmerchant.supply_cats)
		if(!picked_cat)
			return
		var/list/pax = list()
		for(var/pack in SSmerchant.supply_packs)
			var/datum/supply_pack/PA = SSmerchant.supply_packs[pack]
			if(PA.group == picked_cat)
				pax += PA
		var/datum/supply_pack/picked_pack = input(user, "Shipments", "Shipping Ledger") as null|anything in sortList(pax)
		if(!picked_pack)
			return
		var/obj/item/paper/scroll/cargo/C = new(user.loc)

		C.orders += picked_pack
		C.rebuild_info()
		user.dropItemToGround(P)
		qdel(P)
		user.put_in_active_hand(C)
	..()

/obj/item/book/rogue/bibble
	name = "The Verses and Acts of the Ten"
	desc = "The collected verses and acts of the DIVINE PANTHEON. Split into three parts.</br>The Unsundered - The Era before the Fall, The Exploits of the Diecian Council </br>The Ruin - The Rise of the Enemy, The Death of the One </br> The Dawn - The Foundation of the Ten, The New Hope"
	icon_state = "bibble_0"
	base_icon_state = "bibble"
	title = "The Verses and Acts of the Ten"
	dat = "gott.json"
	possible_item_intents = list(
		/datum/intent/use,
		/datum/intent/bless,
	)

/obj/item/book/rogue/bibble/read(mob/user)
	if(!open)
		to_chat(user, span_info("Open me first."))
		return FALSE
	if(!user.client || !user.hud_used)
		return
	if(!user.hud_used.reads)
		return
	if(!user.can_read(src))
		return
	if(in_range(user, src) || isobserver(user))
		user.changeNext_move(CLICK_CD_MELEE)
		var/list/choices = list("The Unsundered", "The Ruin", "The Dawn")
		var/section_choice = input(user,"Which section shall I read from?", "DIVINE ENLIGHTENMENT") as anything in choices
		var/chosentxt
		switch(section_choice)
			if("The Unsundered")
				chosentxt = 'strings/visage.txt'
			if("The Ruin")
				chosentxt = 'strings/decanomicon.txt'
			if("The Dawn")
				chosentxt = 'strings/newdawn.txt'
		var/m
		var/list/verses = world.file2list(chosentxt)
		m = pick(verses)
		if(m)
			user.say(m)

/obj/item/book/rogue/bibble/attack(atom/M, mob/user)
	if(user.mind?.assigned_role == "Bishop" && user.used_intent?.type == /datum/intent/bless && isliving(M))
		if(!user.can_read(src))
			to_chat(user, span_warning("I don't understand these scribbly black lines."))
			return
		var/mob/living/to_bless = M
		to_bless.apply_status_effect(/datum/status_effect/buff/blessed)
		to_bless.add_stress(/datum/stressevent/blessed)
		user.visible_message(span_notice("[user] blesses [M]."))
		playsound(user, 'sound/magic/bless.ogg', 100, FALSE)
		return

/obj/item/book/rogue/bibble/afterattack(atom/target, mob/user, proximity_flag, click_parameters)
	. = ..()
	if(user.mind?.assigned_role == "Bishop" && isitem(target) && user.used_intent?.type == /datum/intent/bless)
		var/datum/component/silverbless/CP = target.GetComponent(/datum/component/silverbless)
		if(!CP)
			to_chat(user, span_info("\The [target] can not be blessed."))
			return
		else if(!CP.is_blessed && (CP.silver_type & SILVER_TENNITE))
			playsound(user, 'sound/magic/censercharging.ogg', 100)
			user.visible_message(span_info("[user] holds \the [src] over \the [target]..."))
			if(do_after(user, 5 SECONDS, target = target))
				CP.try_bless(BLESSING_TENNITE)
				new /obj/effect/temp_visual/censer_dust(get_turf(target))
			return
		else
			to_chat(user, span_info("It has already been blessed."))
			return

/obj/item/book/rogue/bibble/psy
	name = "Tome of Psydon"
	desc = "'And HE WEEPS. Not for you, not for me, but for it all.' </br>A leatherbound tome, chronicling the beliefs held by the Orthodoxy; the largest Psydonic denomination in the world. The 'Harlaus Press', a recent invention by Otava's clergymen, has ensured that no corner of Psydonia would remain unlit by His teachings. Inside are three separate testaments, each marked with a velvet strap.. </br>PSALMS - TESTAMENTS OF CLERICAL WISDOM, COMMANDING INTERPRETATION. </br>GENESIS - TESTAMENTS OF PSYDONIA'S CREATION, FOR WHAT ONCE WAS. </br>INVOCATIONS - TESTAMENTS OF WILL, TO EXORCISE AND CHANT."
	icon_state = "psyble_0"
	base_icon_state = "psyble"
	title = "psyble"
	dat = "gott.json"
	var/sect = "sect1"

/obj/item/book/rogue/bibble/psy/attack(mob/living/M, mob/user)
	return

/obj/item/book/rogue/bibble/psy/read(mob/living/carbon/human/user)
	if(!open)
		to_chat(user, span_info("Open it first."))
		return FALSE
	if(!user.client || !user.hud_used)
		return
	if(!user.hud_used.reads)
		return
	if(!user.can_read(src))
		return
	if(in_range(user, src) || isobserver(user))
		user.changeNext_move(CLICK_CD_MELEE)
		var/m
		if(sect)
			var/list/verses = world.file2list("strings/psy[sect].txt")
			m = pick(verses)
			if(m)
				if(prob(1) && sect == "sect1")
					user.playsound_local(user, 'sound/misc/psydong.ogg', 100, FALSE)
					user.say("PSY 23:4... And so, ZEZUS wept; for he had been struck down by the silvered javelin of JVDAS, PSYDON's most devout.")
					user.psydo_nyte()
				else
					user.say(m)

/obj/item/book/rogue/bibble/psy/MiddleClick(mob/user, params)
	. = ..()
	var/sects = list("PSALMS", "GENESIS", "INVOCATIONS")
	var/sect_choice = input(user, "SELECT YOUR TESTAMENT", "OF PSYDONIA") as anything in sects
	switch(sect_choice)
		if("PSALMS")
			sect = "sect1"
		if("GENESIS")
			sect = "sect2"
		if("INVOCATIONS")
			sect = "sect3"

/datum/status_effect/buff/blessed
	id = "blessed"
	alert_type = /atom/movable/screen/alert/status_effect/buff/blessed
	effectedstats = list(STATKEY_LCK = 1)
	duration = 20 MINUTES

/atom/movable/screen/alert/status_effect/buff/blessed
	name = "Blessed"
	desc = ""
	icon_state = "buff"


/obj/item/book/rogue/law
	name = "Tome of Justice"
	desc = "Issued by the Crown of the Kingdom of Ferentia to serve as the legal framework for the realm."
	icon_state ="lawtome_0"
	base_icon_state = "lawtome"
	bookfile = "law_2.json"

/obj/item/book/rogue/cooking
	name = "Tastes Fit For The Lord"
	desc = ""
	icon_state ="book_0"
	base_icon_state = "book"
	bookfile = "cooking.json"

		//no more theif stole the books
/obj/item/book/rogue/knowledge1
	name = "Book of Knowledge"
	desc = ""
	icon_state ="book5_0"
	base_icon_state = "book5"
	bookfile = "knowledge.json"


/obj/item/book/rogue/secret/xylix
	name = "Book of Gold"
	desc = "<font color='red'><blink>An ominous book with untold powers.</blink></font>"
	icon_state ="xylix_0"
	base_icon_state = "xylix"
	bookfile = "xylix.json"

/obj/item/book/rogue/xylix/attack_self(mob/user)
	if(!open)
		attack_right(user)
		return
	..()
	user.update_inv_hands()
	to_chat(user, span_notice("You feel laughter echo in your head."))

/obj/item/book/rogue/secret/thefireisgone
	name = "THE FIRE IS GONE"
	desc = "{<font color='red'><blink>AN ANCIENT TOME WRITTEN BY THE GODS' GREATEST FOOL</blink></font>}"
	icon_state ="book6_0"
	base_icon_state = "book6"
	bookfile = "thefireisgone.json"

//player made books
/obj/item/book/rogue/tales1
	name = "Assorted Tales From Yester Yils"
	desc = "By Alamere J Wevensworth"
	icon_state ="book_0"
	base_icon_state = "book"
	bookfile = "tales1.json"

/obj/item/book/rogue/festus
	name = "Book of Festus"
	desc = "Unknown Author"
	icon_state ="book2_0"
	base_icon_state = "book2"
	bookfile = "tales2.json"


/obj/item/book/rogue/tales3
	name = "Myths & Legends of the Peaks & Beyond Volume I"
	desc = "Arbalius The Younger"
	icon_state ="book3_0"
	base_icon_state = "book3"
	bookfile = "tales3.json"

/obj/item/book/rogue/bookofpriests
	name = "Holy Book of Saphria"
	desc = ""
	icon_state ="knowledge_0"
	base_icon_state = "knowledge"
	bookfile = "holyguide.json"

/obj/item/book/rogue/robber
	name = "Reading for Robbers"
	desc = "By Flavius of Dendor"
	icon_state ="basic_book_0"
	base_icon_state = "basic_book"
	bookfile = "tales4.json"

/obj/item/book/rogue/cardgame
	name = "Graystone's Torment Basic Rules"
	desc = "By Johnus of Doe"
	icon_state ="basic_book_0"
	base_icon_state = "basic_book"
	bookfile = "tales5.json"

/obj/item/book/rogue/blackmountain
	name = "Zabrekalrek, The Black Mountain Saga: Part One"
	desc = "Written by Gorrek Tale-Writer, translated by Hargrid Men-Speaker."
	icon_state ="book6_0"
	base_icon_state = "book6"
	bookfile = "tales6.json"

/obj/item/book/rogue/beardling
	name = "Rock and Stone - ABC & Tales for Beardlings"
	desc = "Distributed by the Dwarven Federation"
	icon_state ="book8_0"
	base_icon_state = "book8"
	bookfile = "tales7.json"

/obj/item/book/rogue/abyssor
	name = "A Tale of Those Who Live At Sea"
	desc = "By Bellum Aegir"
	icon_state ="book2_0"
	base_icon_state = "book2"
	bookfile = "tales8.json"

/obj/item/book/rogue/necra
	name = "Burial Rites for Necra"
	desc = "By Hunlaf, Gravedigger. Revised by Lenore, Priest of Necra."
	icon_state ="book6_0"
	base_icon_state = "book6"
	bookfile = "tales9.json"

/obj/item/book/rogue/noc
	name = "Dreamseeker"
	desc = "By Hunlaf, Gravedigger. Revised by Lenore, Priest of Necra."
	icon_state ="book6_0"
	base_icon_state = "book6"
	bookfile = "tales10.json"

/obj/item/book/rogue/fishing
	name = "Fontaine's Advanced Guide to Fishery"
	desc = "By Ford Fontaine"
	icon_state ="book2_0"
	base_icon_state = "book2"
	bookfile = "tales11.json"

/obj/item/book/rogue/sword
	name = "The Six Follies: How To Survive by the Sword"
	desc = "By Theodore Spillguts"
	icon_state ="book5_0"
	base_icon_state = "book5"
	bookfile = "tales12.json"

/obj/item/book/rogue/arcyne
	name = "Latent Magicks, where does Arcyne Power come from?"
	desc = "By Kildren Birchwood, scholar of Magicks"
	icon_state ="book4_0"
	base_icon_state = "book4"
	bookfile = "tales13.json"

/obj/item/book/rogue/nitebeast
	name = "Legend of the Nitebeast"
	desc = "By Paquetto the Scholar"
	icon_state ="book8_0"
	base_icon_state = "book8"
	bookfile = "tales14.json"

/obj/item/book/rogue/naledi1
	name = "The Path of the War Scholar Volume 1"
	desc = "By Jatholemew von Rittensquatter, Esq"
	icon_state = "knowledge_0"
	base_icon_state = "knowledge"
	bookfile = "naledi1.json"

/obj/item/book/rogue/naledi2
	name = "The Path of the War Scholar Volume 3"
	desc = "By Jatholemew von Rittensquatter, Esq"
	icon_state = "book8_0"
	base_icon_state = "book8"
	bookfile = "naledi2.json"

/obj/item/book/rogue/naledi3
	name = "The Path of the War Scholar Volume 7"
	desc = "By Jatholemew von Rittensquatter, Esq"
	icon_state = "book7_0"
	base_icon_state = "book7"
	bookfile = "naledi3.json"

/obj/item/book/rogue/naledi4
	name = "The Path of the War Scholar Volume 20"
	desc = "By Jatholemew von Rittensquatter, Esq"
	icon_state = "book6_0"
	base_icon_state = "book6"
	bookfile = "naledi4.json"


/obj/item/book/rogue/playerbook
	var/player_book_text
	var/player_book_title
	var/player_book_author
	var/player_book_icon
	var/player_book_author_ckey
	var/is_in_round_player_generated
	name = "unknown title"
	desc = "Penned by an unknown author."
	icon_state = "basic_book_0"
	base_icon_state = "basic_book"
	override_find_book = TRUE

/obj/item/book/rogue/playerbook/Initialize(mapload, list/book_details, text)
	. = ..()
	is_in_round_player_generated = !!book_details
	if(is_in_round_player_generated)
		player_book_text = text
		player_book_title = book_details["title"]
		player_book_author = book_details["author"]
		player_book_icon = book_details["cover"]
		player_book_author_ckey = book_details["author_ckey"]
		name = player_book_title
		desc = "By [player_book_author]"
		icon_state = "[player_book_icon]_0"
		base_icon_state = player_book_icon
		pages = list("<h2>Title: [html_encode(player_book_title)]</h2><p>Author: [html_encode(player_book_author)]</p>[player_book_text]")
	else
		pick_random_book()

/obj/item/book/rogue/playerbook/proc/pick_random_book()
	var/list/player_book_titles = SSlibrarian.pull_player_book_titles()
	var/list/chosen_book = SSlibrarian.file2playerbook(pick(player_book_titles))

	player_book_title = chosen_book["book_title"]
	player_book_author = chosen_book["author"]
	player_book_author_ckey = chosen_book["author_ckey"]
	player_book_icon = chosen_book["icon"]
	player_book_text = chosen_book["text"]

	name = "[player_book_title]"
	desc = "By [player_book_author]"
	icon_state = "[player_book_icon]_0"
	base_icon_state = "[player_book_icon]"
	pages = list("<h2>Title: [html_encode(player_book_title)]</h2><p>Author: [html_encode(player_book_author)]</p>[player_book_text]")


/obj/item/manuscript
	name = "2 page manuscript"
	desc = "A 2 page written piece aspiring to one dae become a book."
	icon = 'icons/roguetown/items/misc.dmi'
	icon_state = "manuscript"
	dir = 2
	resistance_flags = FLAMMABLE
	grid_width = 32
	grid_height = 64
	dropshrink = 0.8
	var/number_of_pages = 2
	var/list/page_texts = list()
	var/static/list/book_icons = list(
		"Sickly green with embossed bronze" = "book8",
		"Red with embossed toper" = "book7",
		"Purple with embossed obsidian" = "book6",
		"Brown with embossed obsidian" = "book5",
		"Yellow without embossed material" = "book4",
		"Blue without embossed material" = "book3",
		"Red without embossed material" = "book2",
		"Black without embossed material" = "book",
		"Green without embossed material" = "basic_book")

/obj/item/manuscript/proc/prompt_book_details(mob/living/user)
	var/book_title = "Unknown"
	var/book_author = ""
	var/cover_label = "Green without embossed material"
	while(!QDELETED(src) && !QDELETED(user) && user.client)
		var/title_input = tgui_input_text(user, "Give your book a title (up to 42 characters).", "Book title", book_title, max_length = MAX_NAME_LEN, encode = FALSE)
		if(isnull(title_input) || QDELETED(src) || QDELETED(user) || !user.client)
			return
		book_title = capitalize(trim(STRIP_HTML_SIMPLE(title_input, PREVENT_CHARACTER_TRIM_LOSS(MAX_NAME_LEN))))
		if(!length(book_title))
			to_chat(user, span_notice("The book needs a title."))
			continue
		var/author_input = tgui_input_text(user, "What author should appear on the book? Leave blank for no author.", "Book author", book_author, max_length = MAX_NAME_LEN, encode = FALSE)
		if(isnull(author_input) || QDELETED(src) || QDELETED(user) || !user.client)
			return
		book_author = trim(STRIP_HTML_SIMPLE(author_input, PREVENT_CHARACTER_TRIM_LOSS(MAX_NAME_LEN)))
		cover_label = tgui_input_list(user, "Choose a cover for your book.", "Book cover", book_icons, cover_label)
		if(!cover_label || QDELETED(src) || QDELETED(user) || !user.client || !book_icons[cover_label])
			return
		var/choice = tgui_alert(user, "Title: [book_title]\nAuthor: [length(book_author) ? book_author : "None"]\nCover: [cover_label]\n\nBinding uses the manuscript and one book crafting kit.", "Bind your book", list("Confirm", "Revise", "Cancel"))
		if(QDELETED(src) || QDELETED(user) || !user.client)
			return
		if(choice == "Confirm")
			return list("title" = book_title, "author" = book_author, "cover" = book_icons[cover_label], "author_ckey" = user.ckey)
		if(choice != "Revise")
			return

/obj/item/manuscript/examine()
	. = ..()
	. += span_info("It has [number_of_pages] pages. Use paper to add more. Finish the book with a book crafting kit.")

/obj/item/manuscript/attackby(obj/item/I, mob/living/user)
	if(istype(I, /obj/item/book_crafting_kit))
		if(!user.is_holding(I) || !user.canUseTopic(src, BE_CLOSE, TRUE) || length(page_texts) < 2)
			return
		var/list/bound_pages = page_texts.Copy()
		var/list/book_details = prompt_book_details(user)
		if(!book_details || QDELETED(src) || QDELETED(I) || QDELETED(user) || !user.client)
			return
		if(!user.is_holding(I) || !user.canUseTopic(src, BE_CLOSE, TRUE))
			return
		if(!compare_list(bound_pages, page_texts))
			to_chat(user, span_notice("The manuscript's pages changed while you were choosing. Start binding again to use the current pages."))
			return
		var/list/compiled_text = list()
		for(var/page in bound_pages)
			compiled_text += "<p>[page]</p>"
		var/obj/item/book/rogue/playerbook/PB = new /obj/item/book/rogue/playerbook(get_turf(src), book_details, compiled_text.Join())
		qdel(I)
		qdel(src)
		PB.add_fingerprint(user)
		user.put_in_hands(PB)
		message_admins("[PB.player_book_author_ckey]([user.real_name]) has generated the player book: [PB.player_book_title]")
		return TRUE

	if(!istype(I, /obj/item/paper))
		return
	var/obj/item/paper/P = I
	if(!(P.info))
		to_chat(user, "the paper needs to contain text to be added to a manuscript!")
		return
	if(length(page_texts) >= 8)
		to_chat(user, "The manuscript pile cannot surpass 8 pages!")
		return

	page_texts += P.info
	number_of_pages = length(page_texts)
	name = "[number_of_pages] page manuscript"
	desc = "A [number_of_pages] page written piece aspiring to one dae become a book."
	qdel(P)

	update_icon()
	return ..()

/obj/item/manuscript/examine(mob/user)
	. = ..()
	. += "<a href='?src=[REF(src)];read=1'>Read</a>"

/obj/item/manuscript/Topic(href, href_list)
	..()

	if(!usr)
		return

	if(href_list["close"])
		var/mob/user = usr
		if(user?.client && user.hud_used)
			if(user.hud_used.reads)
				user.hud_used.reads.destroy_read()
			user << browse(null, "window=reading")

	var/literate = usr.is_literate()
	if(!usr.canUseTopic(src, BE_CLOSE, literate))
		return

	if(href_list["read"])
		read(usr)

/obj/item/manuscript/attack_self(mob/user)
	read(user)

/obj/item/manuscript/proc/read(mob/user)
	if(!user.client || !user.hud_used)
		return
	if(!user.hud_used.reads)
		return
	if(!user.can_read(src))
		return
	if(in_range(user, src) || isobserver(user))
		var/list/content = list("<div class='book-reader'><div class='book-reader-heading'><div><div class='book-reader-eyebrow'>Work in progress</div><h1>[html_encode(name)]</h1></div><a class='book-reader-close' href='?src=[REF(src)];close=1'>Close</a></div><div class='book-reader-paper' tabindex='0' role='region' aria-label='Manuscript contents' style=\"background-image:url('book.png')\"><div class='book-reader-column'>")
		for(var/page_number in 1 to length(page_texts))
			content += "<section class='book-reader-sheet'><div class='book-reader-sheet-label'>Sheet [page_number] of [length(page_texts)]</div>[sanitize_document_html(page_texts[page_number])]</section>"
		content += "</div></div><div class='book-reader-footer'>Tab to the page to scroll. Add written paper or use a book crafting kit to bind these sheets.</div></div>"
		user << browse_rsc('html/book.png')
		var/datum/browser/noclose/popup = new(user, "reading", null, 900, 700, src)
		popup.set_window_options("can_close=1;can_minimize=0;can_maximize=0;can_resize=1;titlebar=1;border=0;")
		popup.add_stylesheet("book_reader", 'html/browser/book_reader.css')
		var/list/font_urls = get_asset_datum(/datum/asset/simple/roguefonts).get_url_mappings()
		popup.add_head_content("<title>Manuscript</title><style>@font-face { font-family: 'Reader Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Reader Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Reader Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>")
		popup.set_content(content.Join())
		popup.open(FALSE)
		onclose(user, "reading", src)
	else
		return span_warning("I'm too far away to read it.")

/obj/item/manuscript/update_icon()
	. = ..()
	switch(number_of_pages)
		if(2)
			dir = SOUTH
		if(3)
			dir = NORTH
		if(4)
			dir = EAST
		if(5)
			dir = WEST
		if(6)
			dir = SOUTHEAST
		if(7)
			dir = SOUTHWEST
		if(8)
			dir = NORTHWEST

/obj/item/manuscript/fire_act(added, maxstacks)
	..()
	if(!(resistance_flags & FIRE_PROOF))
		add_overlay("paper_onfire_overlay")

/obj/item/manuscript/attack_hand(mob/user)
	if(istype(user, /mob/living) && src.loc == user)
		var/mob/living/L = user
		var/last_page = length(page_texts)
		if(last_page < 2)
			return
		var/obj/item/paper/P = new /obj/item/paper(get_turf(src.loc))
		P.icon_state = "paperwrite"
		P.info = page_texts[last_page]
		page_texts.Cut(last_page, last_page + 1)
		number_of_pages = length(page_texts)
		if(number_of_pages == 1)
			var/obj/item/paper/P_two = new /obj/item/paper(get_turf(src.loc))
			P_two.icon_state = "paperwrite"
			P_two.info = page_texts[1]
			qdel(src)
			L.put_in_hands(P)
			L.put_in_hands(P_two)
			return
		else
			update_icon()
			name = "[number_of_pages] page manuscript"
			desc = "A [number_of_pages] page written piece aspiring to one dae become a book."
			L.put_in_hands(P)
			return

	. = ..()

/obj/item/book_crafting_kit
	name = "book crafting kit"
	desc = "Apply on a written manuscript to create a book."
	icon = 'icons/roguetown/items/misc.dmi'
	icon_state = "book_crafting_kit"
	dropshrink = 0.7

/obj/item/book/rogue/swatchbook
	name = "Tailor's Swatchbook"
	desc = "Allows you to pick out an exact hue and shade from the Tailors Guild's inordinately exhaustive all-encompassing selection of known colors. Once selected, use with a dyeing bin to apply the exact swatch."
	icon_state = "swatchbook_0"
	base_icon_state = "swatchbook"
	title = "swatchbook"
	var/swatchbookcolor = "#000000"

/obj/item/book/rogue/swatchbook/read(mob/user)
	if(istype(user, /mob/living) && src.loc == user)
		if(!user.client || !user.hud_used)
			return
		else
			var/hexcolor = "#FFFFFF"
			hexcolor = sanitize_hexcolor(color_pick_sanitized(usr, "Choose your dye:", "Dyes", null, 0.2, 1), 6, TRUE)
			if(hexcolor == "#000000")
				swatchbookcolor = "#FFFFFF"
			else
				swatchbookcolor = hexcolor
			updateUsrDialog()
	else
		return

/obj/item/book/rogue/bibble/zizo
	name = "Lexicon of Her Truth"
	desc = "By learning Her teachings, we will one day walk in Her footsteps. A volume forbidden to be read by the Holy See, containing a retelling of the mortal lyfe and ascension of ZIZO, the Lady of Ambition - or at least the version recounted by the cultists of her 'Salvation'."
	icon = 'icons/roguetown/items/bookszizo.dmi'
	icon_state = "zizoble_0"
	base_icon_state = "zizoble"
	title = "Lexicon of Her Truth"
	dat = "gott.json"

/obj/item/book/rogue/bibble/zizo/attack(mob/living/M, mob/user)
	return

/obj/item/book/rogue/bibble/zizo/MiddleClick(mob/user, params)
	return

/obj/item/book/rogue/bibble/zizo/read(mob/living/carbon/human/user)
	if(!open)
		to_chat(user, span_info("Open it first."))
		return FALSE
	if(!user.client || !user.hud_used)
		return
	if(!user.hud_used.reads)
		return
	if(!user.can_read(src))
		return
	if(in_range(user, src) || isobserver(user))
		user.changeNext_move(CLICK_CD_MELEE)
		var/m
		var/list/verses = world.file2list("strings/zizobibble.txt")
		m = pick(verses)
		user.say(m)
