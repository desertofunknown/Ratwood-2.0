

/*
 * Book
 */
/obj/item/book
	name = "book"
	icon = 'icons/obj/library.dmi'
	icon_state ="book"
	desc = ""
	throw_speed = 1
	throw_range = 5
	w_class = WEIGHT_CLASS_NORMAL		 //upped to three because books are, y'know, pretty big. (and you could hide them inside eachother recursively forever)
	attack_verb = list("bashed", "whacked", "educated")
	resistance_flags = FLAMMABLE
	drop_sound = 'sound/blank.ogg'
	pickup_sound =  'sound/blank.ogg'
	var/dat				//Actual page content
	var/due_date = 0	//Game time in 1/10th seconds
	var/author			//Who wrote the thing, can be changed by pen or PC. It is not automatically assigned
	var/unique = 0		//0 - Normal book, 1 - Should not be treated as normal book, unable to be copied, unable to be modified
	var/title			//The real name of the book.
	var/window_size = null // Specific window size for the book, i.e: "1920x1080", Size x Width

	var/list/pages = list()
	var/bookfile
	var/curpage = 1
	var/textper = 100
	var/our_font = "Rosemary Roman"
	var/override_find_book = FALSE
	grid_width = 32
	grid_height = 64

//Destroyer of knowledge - for storytellers
/obj/item/book/fire_act()
	record_round_statistic(STATS_BOOKS_BURNED)
	..()


/obj/item/book/attack_self(mob/user)
	if(!user.can_read(src))
		return
	if(!user.client || !user.hud_used)
		return
	if(!user.hud_used.reads)
		return
	read(user)


/obj/item/book/examine(mob/user)
	. = ..()
	. += "<a href='?src=[REF(src)];read=1'>Read</a>"

/obj/item/book/Topic(href, href_list)
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

	if(href_list["turnpage"])
		if(pages.len >= curpage+2)
			curpage += 2
		else
			curpage = 1
		playsound(loc, 'sound/items/book_page.ogg', 100, TRUE, -1)
		read(usr)

/obj/item/book/proc/read(mob/user)
	if(!user.client || !user.hud_used)
		return
	if(!user.hud_used.reads)
		return
	if(!user.can_read(src))
		user.adjust_experience(/datum/skill/misc/reading, 4, FALSE)
		return
	if(in_range(user, src) || isobserver(user))
		if(!pages.len)
			if(!override_find_book)
				pages = SSlibrarian.get_book(bookfile)
		if(!pages.len)
			to_chat(user, span_warning("This book is completely blank."))
		if(curpage > pages.len)
			curpage = 1
		var/display_title = title ? title : name
		var/list/content = list("<div class='book-reader'><div class='book-reader-heading'><div><div class='book-reader-eyebrow'>From the shelves of the realm</div><h1>[html_encode(display_title)]</h1></div><a class='book-reader-close' href='?src=[REF(src)];close=1'>Close</a></div><div class='book-reader-paper' tabindex='0' role='region' aria-label='Book contents' style=\"background-image:url('book.png')\"><div class='book-reader-column'>")
		for(var/A in pages)
			var/page_html = istype(src, /obj/item/book/rogue/playerbook) ? sanitize_document_html(A) : A
			if(!findtext(page_html, "<"))
				content += "<div class='book-reader-prose'>[page_html]</div>"
			else
				content += page_html
			content += "<br>"
		if(!length(pages))
			content += "<p class='book-reader-empty'>These pages have yet to be written.</p>"
		content += "</div></div><div class='book-reader-footer'>Tab to the page, then use the arrow keys or Page Up / Page Down to scroll.</div></div>"
		user << browse_rsc('html/book.png')
		var/datum/browser/noclose/popup = new(user, "reading", null, 900, 700, src)
		popup.set_window_options("can_close=1;can_minimize=0;can_maximize=0;can_resize=1;titlebar=1;border=0;")
		popup.add_stylesheet("book_reader", 'html/browser/book_reader.css')
		var/list/font_urls = get_asset_datum(/datum/asset/simple/roguefonts).get_url_mappings()
		popup.add_head_content("<title>[html_encode(display_title)]</title><style>@font-face { font-family: 'Reader Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Reader Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Reader Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>")
		popup.set_content(content.Join())
		popup.open(FALSE)
		onclose(user, "reading", src)
	else
		return span_warning("You're too far away to read it.")
