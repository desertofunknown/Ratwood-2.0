GLOBAL_LIST_INIT(colorlist, list(
	"Swan White"="#ffffff",
	"Chalk White" = "#f4ecde",
	"Cream" = "#fffdd0",
	"Light Grey" = "#999999",
	"Dunked in Water" = "#bbbbbb",
	"Mage Grey" = "#6c6c6c",
	"Sow's skin"="#CE929F",
	"Salmon Pink"="#FF91A4",
	"Cherry Blossom"="#FF6699",
	"Knight's Red"="#933030",
	"Royal Red"="#8b2323",
	"Red Ochre" = "#913831",
	"Maroon" = "#550000",
	"Scarlet" = "#bb0a1e",
	"Royal Orange" = "#df8405",
	"Madroot Red"="#AD4545",
	"Marigold Orange"="#E2A844",
	"Chestnut" = "#613613",
	"Dirt" = "#7c6d5c",
	"Peasant Brown" = "#685542",
	"Russet" = "#7f461b",
	"Yellow Weld" = "#f4c430",
	"Yarrow" = "#f0cb76",
	"Yellow Ochre" = "#cb9d06",
	"Mage Yellow" = "#c1b144",
	"Astrata's Yellow"="#ffe333",
	"Pale Gold"="#FFFD8D",
	"Olive" = "#98bf64",
	"Royal Green" = "#264d26",
	"Forest Green" = "#428138",
	"Mage Green" = "#759259",
	"Bog Green"="#375B48",
	"Seafoam Green"="#49938B",
	"Royal Teal" = "#249589",
	"Watchman Blue" = "#557d8f",
	"Cornflower Blue"="#749EE8",
	"Royal Blue" = "#173266",
	"Woad Blue"="#395480",
	"Mage Blue" = "#4756d8",
	"Periwinkle Blue" = "#8f99fb",
	"Lavender"="#865c9c",
	"Royal Purple"="#5E4687",
	"Midnight Violet"="#402c56",
	"Orchil" = "#66023C",
	"Wine Rouge"="#752B55",
	"Royal Magenta" = "#962e5c",
	"Blacksteel Grey"="#404040",
	"Dark Grey" = "#505050",
	"Darkest Night" = "#414143",
))

GLOBAL_LIST_INIT(pridelist, list(
	"RAINBOW" = "#fcfcfc"
))

// DYE BIN

/obj/machinery/gear_painter
	name = "Dye Station"
	desc = "A station to give your apparel a fresh new color! Recommended to use with white items for best results."
	icon = 'icons/roguetown/misc/structure.dmi'
	icon_state = "dyestation"
	density = TRUE
	anchored = TRUE
	var/atom/movable/inserted
	var/activecolor = "#FFFFFF"
	var/activecolor_detail = "#FFFFFF"
	var/activecolor_altdetail = "#FFFFFF"
	var/ducal_scheme = FALSE // Whether primary color is using Ducal Scheme
	var/ducal_scheme_detail = FALSE // Whether detail color is using Ducal Scheme
	var/ducal_scheme_altdetail = FALSE // Whether altdetail color is using Ducal Scheme
	var/barony_scheme = FALSE // Whether primary color is using Barony Scheme
	var/barony_scheme_detail = FALSE // Whether detail color is using Barony Scheme
	var/barony_scheme_altdetail = FALSE // Whether altdetail color is using Barony Scheme
	var/list/allowed_types = list(
			/obj/item/clothing,
			/obj/item/storage,
			/obj/item/bedroll,
			/obj/item/flowercrown,
			/obj/item/legwears,
			/obj/item/undies,
			/obj/item/caparison,
			/obj/item/reagent_containers/glass/bottle/clayvase,
			/obj/item/reagent_containers/glass/bottle/clayfancyvase,
			/obj/item/reagent_containers/glass/cup/claycup,
			/obj/item/reagent_containers/glass/bottle/claybottle,
			/obj/item/roguestatue/clay,
			/obj/item/roguestatue/glass,
			/obj/item/reagent_containers/glass/bottle/blown,
			/obj/item/reagent_containers/glass/bottle/alchemical/blown
			)
	var/list/used_colors

/obj/machinery/gear_painter/Initialize(mapload)
	. = ..()
	used_colors = GLOB.colorlist

/obj/machinery/gear_painter/Destroy()
	if(inserted)
		inserted.forceMove(drop_location())
	return ..()

/obj/machinery/gear_painter/attackby(obj/item/I, mob/living/user)
	if(istype(I, /obj/item/book/rogue/swatchbook))
		var/obj/item/book/rogue/swatchbook/S = I
		if(!S.open)
			to_chat(user, span_info("The swatchbook expressly forbids the use of its cover color!"))
			return ..()
		if(S.swatchbookcolor == "#000000")
			to_chat(user, span_info("You haven't picked out a color!"))
			return ..()
		else
			to_chat(user, span_info("You mix the swatch's color in the dye bin."))
			activecolor = "[S.swatchbookcolor]"
			activecolor_detail = "[S.swatchbookcolor]"
			activecolor_altdetail = "[S.swatchbookcolor]"
			interact(user)
			return ..()
	if(inserted)
		to_chat(user, span_warning("Something is already inside!"))
		return ..()
	if(!is_type_in_list(I, allowed_types))
		to_chat(user, span_warning("[I] cannot be dyed!"))
		return ..()
	if(!user.transferItemToLoc(I, src))
		to_chat(user, span_warning("[I] is stuck to your hand!"))
		return ..()

	user.visible_message(span_notice("[user] inserts [I] into [src]'s receptable."))

	inserted = I
	interact(user)

/obj/machinery/gear_painter/AllowDrop()
	return FALSE

/obj/machinery/gear_painter/attack_hand(mob/living/user)
	interact(user)

/obj/machinery/gear_painter/interact(mob/user)
	if(!is_operational())
		return ..()
	user.set_machine(src)
	var/datum/browser/menu = new(user, "colormate", "", 760, 700, src)
	menu.add_stylesheet("dye_station", 'html/browser/dye_station.css')
	var/datum/asset/simple/roguefonts/dye_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = dye_fonts.get_url_mappings()
	menu.add_head_content("<style>@font-face { font-family: 'Dye Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Dye Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Dye Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>")
	var/list/dat = list("<div class='dye-station'><div class='dye-heading'><div class='dye-eyebrow'>The tailor's workbench</div><h1>Dye station</h1><p>Choose a dye, inspect the preview, then apply it to a layer.</p></div>")
	if(!inserted)
		dat += "<div class='dye-empty'><h2>No item inserted</h2><p>Use clothing, a bag or another dyeable item on the station to begin.</p><p>White items show the chosen dye most clearly.</p></div></div>"
		menu.set_content(dat.Join())
		menu.open()
		return

	var/obj/item/inserted_item = inserted
	var/obj/item/preview_item = inserted_item
	dat += "<div class='dye-scroll'><div class='dye-item-heading'><h2>[html_encode(inserted_item.name)]</h2><span>Chosen dyes shown below</span></div><div class='dye-previews'>"
	//Create preview icon - extracts only SOUTH direction.
	var/icon/preview_icon = new /icon()
	preview_icon.Insert(new /icon(preview_item.icon, preview_item.icon_state), "", SOUTH, 0)
	preview_icon.Blend(activecolor, ICON_MULTIPLY)

	//Apply detail overlay if it exists.
	if(preview_item.detail_tag && preview_item.detail_color)
		var/icon/detail_overlay = new /icon()
		detail_overlay.Insert(new /icon(preview_item.icon, "[preview_item.icon_state][preview_item.detail_tag]"), "", SOUTH, 0)
		detail_overlay.Blend(activecolor_detail, ICON_MULTIPLY)
		preview_icon.Blend(detail_overlay, ICON_OVERLAY)

	//Apply altdetail overlay if it exists.
	if(preview_item.altdetail_tag && preview_item.altdetail_color)
		var/icon/altdetail_overlay = new /icon()
		altdetail_overlay.Insert(new /icon(preview_item.icon, "[preview_item.icon_state][preview_item.altdetail_tag]"), "", SOUTH, 0)
		altdetail_overlay.Blend(activecolor_altdetail, ICON_MULTIPLY)
		preview_icon.Blend(altdetail_overlay, ICON_OVERLAY)

	//Show offmob item icon.
	dat += "<div class='dye-preview-tile'><span>Item</span><img src='data:image/png;base64,[icon2base64(preview_icon)]' alt='Chosen dye preview'></div>"

	//Show onmob icon.
	if(istype(preview_item, /obj/item/clothing))
		var/obj/item/clothing/clothing_item = preview_item
		var/mob_icon_to_use = clothing_item.mob_overlay_icon

		if(mob_icon_to_use)
			var/worn_state = clothing_item.icon_state
			var/icon/worn_preview = new /icon()
			worn_preview.Insert(new /icon(mob_icon_to_use, worn_state), "", SOUTH, 0)
			worn_preview.Blend(activecolor, ICON_MULTIPLY)

			//Apply detail overlay if it exists.
			if(preview_item.detail_tag && preview_item.detail_color)
				var/icon/detail_overlay = new /icon()
				detail_overlay.Insert(new /icon(mob_icon_to_use, "[worn_state][preview_item.detail_tag]"), "", SOUTH, 0)
				detail_overlay.Blend(activecolor_detail, ICON_MULTIPLY)
				worn_preview.Blend(detail_overlay, ICON_OVERLAY)

			//Apply altdetail overlay if it exists.
			if(preview_item.altdetail_tag && preview_item.altdetail_color)
				var/icon/altdetail_overlay = new /icon()
				altdetail_overlay.Insert(new /icon(mob_icon_to_use, "[worn_state][preview_item.altdetail_tag]"), "", SOUTH, 0)
				altdetail_overlay.Blend(activecolor_altdetail, ICON_MULTIPLY)
				worn_preview.Blend(altdetail_overlay, ICON_OVERLAY)

			//Add sleeved parts if they exist (for cloaks).
			var/list/sleeve_states = clothing_item.sleeved ? icon_states(clothing_item.sleeved) : null
			if(sleeve_states && (worn_state in sleeve_states))
				// check if r_ and l_ prefixed states exist before trying to use them
				if("r_[worn_state]" in sleeve_states)
					var/icon/r_sleeve = new /icon()
					r_sleeve.Insert(new /icon(clothing_item.sleeved, "r_[worn_state]"), "", SOUTH, 0)
					r_sleeve.Blend(activecolor, ICON_MULTIPLY)
					worn_preview.Blend(r_sleeve, ICON_OVERLAY)

				if("l_[worn_state]" in sleeve_states)
					var/icon/l_sleeve = new /icon()
					l_sleeve.Insert(new /icon(clothing_item.sleeved, "l_[worn_state]"), "", SOUTH, 0)
					l_sleeve.Blend(activecolor, ICON_MULTIPLY)
					worn_preview.Blend(l_sleeve, ICON_OVERLAY)

				//Add sleeved detail if it exists.
				if(preview_item.detail_tag && preview_item.detail_color && clothing_item.sleeved_detail)
					if("r_[worn_state][preview_item.detail_tag]" in sleeve_states)
						var/icon/r_detail = new /icon()
						r_detail.Insert(new /icon(clothing_item.sleeved, "r_[worn_state][preview_item.detail_tag]"), "", SOUTH, 0)
						r_detail.Blend(activecolor_detail, ICON_MULTIPLY)
						worn_preview.Blend(r_detail, ICON_OVERLAY)

					if("l_[worn_state][preview_item.detail_tag]" in sleeve_states)
						var/icon/l_detail = new /icon()
						l_detail.Insert(new /icon(clothing_item.sleeved, "l_[worn_state][preview_item.detail_tag]"), "", SOUTH, 0)
						l_detail.Blend(activecolor_detail, ICON_MULTIPLY)
						worn_preview.Blend(l_detail, ICON_OVERLAY)

			dat += "<div class='dye-preview-tile'><span>Worn layer</span><img src='data:image/png;base64,[icon2base64(worn_preview)]' alt='Chosen dye preview'></div>"
	dat += "</div><p class='dye-note'>The item and worn previews show your chosen dyes. Apply each layer to keep its colour.</p><div class='dye-layers'>"
	dat += dye_layer_html("Primary", activecolor, "select", "paint_primary", "clear_primary", ducal_scheme ? "Ducal scheme" : barony_scheme ? "Barony scheme" : "")
	if(inserted_item.detail_color)
		dat += dye_layer_html("Detail", activecolor_detail, "select_detail", "paint_detail", "clear_detail", ducal_scheme_detail ? "Ducal scheme" : barony_scheme_detail ? "Barony scheme" : "")
	if(inserted_item.altdetail_color)
		dat += dye_layer_html("Accent", activecolor_altdetail, "select_altdetail", "paint_altdetail", "clear_altdetail", ducal_scheme_altdetail ? "Ducal scheme" : barony_scheme_altdetail ? "Barony scheme" : "")
	dat += "</div>"
	if(!inserted_item.detail_color && !inserted_item.altdetail_color)
		dat += "<p class='dye-note'>Applying the primary dye will also return this item.</p>"

	if(istype(inserted_item, /obj/item/clothing))
		var/obj/item/clothing/clothing_check = inserted_item
		if(clothing_check.armor_class == ARMOR_CLASS_HEAVY && ishuman(user))
			var/mob/living/carbon/human/H = user
			var/obj/item/bodypart/taur/taur = H.get_taur_tail()
			if(taur?.taur_clothing_category)
				dat += "<section class='dye-barding'><h2>Taur barding tassets</h2><p class='dye-note'>Tasset 1 shares the detail dye; tasset 2 shares the accent dye.</p><div class='dye-previews'>"
				var/icon/tasset1_preview = new /icon()
				tasset1_preview.Insert(new /icon('icons/roguetown/clothing/special/onmob/taur_clothing.dmi', "plate-tasset1_[taur.taur_clothing_category]"), "", SOUTH, 0)
				if(taur.tasset1_color)
					tasset1_preview.Blend(taur.tasset1_color, ICON_MULTIPLY)
				dat += "<div class='dye-preview-tile'><span>Current tasset 1</span><img src='data:image/png;base64,[icon2base64(tasset1_preview)]' alt='Current tasset 1'></div>"
				var/icon/tasset2_preview = new /icon()
				tasset2_preview.Insert(new /icon('icons/roguetown/clothing/special/onmob/taur_clothing.dmi', "plate-tasset2_[taur.taur_clothing_category]"), "", SOUTH, 0)
				if(taur.tasset2_color)
					tasset2_preview.Blend(taur.tasset2_color, ICON_MULTIPLY)
				dat += "<div class='dye-preview-tile'><span>Current tasset 2</span><img src='data:image/png;base64,[icon2base64(tasset2_preview)]' alt='Current tasset 2'></div></div>"
				dat += dye_layer_html("Tasset 1", activecolor_detail, "select_tasset1", "paint_tasset1", "clear_tasset1")
				dat += dye_layer_html("Tasset 2", activecolor_altdetail, "select_tasset2", "paint_tasset2", "clear_tasset2")
				dat += "</section>"

	dat += "</div><div class='dye-footer'><span>Applied dyes stay on the item.</span><a href='?src=[REF(src)];eject=1'>Return item</a></div></div>"
	menu.set_content(dat.Join())
	menu.open()

/obj/machinery/gear_painter/proc/dye_layer_html(label, dye_color, select_action, paint_action, clear_action, scheme = "")
	var/colour = html_encode(dye_color)
	return "<div class='dye-layer'><div class='dye-swatch' style='background-color:[colour]'></div><div class='dye-layer-label'><h3>[label]</h3><span>[colour][scheme ? " &middot; [scheme]" : ""]</span></div><div class='dye-actions'><a href='?src=[REF(src)];[select_action]=1'>Choose dye</a><a class='dye-apply' href='?src=[REF(src)];[paint_action]=1'>Apply</a><a href='?src=[REF(src)];[clear_action]=1'>Clear</a></div></div>"

/obj/machinery/gear_painter/proc/choose_dye(mob/user, current_colour, title, primary = FALSE, allow_schemes = TRUE)
	var/input_type = "Color Preset"
	var/is_dyer = HAS_TRAIT(user, TRAIT_DYES)
	if(is_dyer)
		var/list/options = list("Color Wheel", "Color Preset")
		if(allow_schemes)
			options += "Scheme"
		input_type = tgui_alert(user, "How would you like to choose the dye?", title, options)
		if(!input_type)
			return
	if(input_type == "Color Wheel")
		var/picked = color_pick_sanitized(user, "Choose your dye:", title, current_colour, 0.2, 1)
		if(!picked)
			return
		picked = sanitize_hexcolor(picked, 6, TRUE)
		if(picked == "#000000")
			picked = "#FFFFFF"
		return list("colour" = picked, "ducal" = FALSE, "barony" = FALSE)

	var/scheme
	if(input_type == "Scheme")
		scheme = tgui_alert(user, "Choose the colours to follow.", title, list("Ducal", "Barony"))
		if(!scheme)
			return
	else
		var/list/presets = is_dyer ? used_colors : GLOB.colorlist
		if(!is_dyer && allow_schemes)
			presets = presets.Copy()
			presets["Ducal Scheme"] = "#DUCAL"
			presets["Barony Scheme"] = "#BARONY"
		var/choice = tgui_input_list(user, "Choose your dye:", title, presets)
		if(!choice)
			return
		if(choice == "Ducal Scheme")
			scheme = "Ducal"
		else if(choice == "Barony Scheme")
			scheme = "Barony"
		else
			return list("colour" = presets[choice], "ducal" = FALSE, "barony" = FALSE)
	if(scheme == "Barony")
		return list("colour" = primary ? (GLOB.baronprimary || "#685542") : (GLOB.baronsecondary || "#505050"), "ducal" = FALSE, "barony" = TRUE)
	return list("colour" = primary ? (GLOB.lordprimary || "#264d26") : (GLOB.lordsecondary || "#2b292e"), "ducal" = TRUE, "barony" = FALSE)

/obj/machinery/gear_painter/Topic(href, href_list)
	. = ..()
	if(.)
		return

	add_fingerprint(usr)

	if(href_list["close"])
		usr << browse(null, "window=colormate")
		return

	if(href_list["select"])
		var/list/choice = choose_dye(usr, activecolor, "Primary dye", primary = TRUE)
		if(!choice)
			return
		activecolor = choice["colour"]
		ducal_scheme = choice["ducal"]
		barony_scheme = choice["barony"]
		interact(usr)

	if(href_list["select_detail"])
		var/list/choice = choose_dye(usr, activecolor_detail, "Detail dye")
		if(!choice)
			return
		activecolor_detail = choice["colour"]
		ducal_scheme_detail = choice["ducal"]
		barony_scheme_detail = choice["barony"]
		interact(usr)

	if(href_list["select_altdetail"])
		var/list/choice = choose_dye(usr, activecolor_altdetail, "Accent dye")
		if(!choice)
			return
		activecolor_altdetail = choice["colour"]
		ducal_scheme_altdetail = choice["ducal"]
		barony_scheme_altdetail = choice["barony"]
		interact(usr)

	if(href_list["paint_primary"])
		if(!inserted)
			return
		var/obj/item/inserted_item = inserted

		// Apply primary color only
		if(ducal_scheme)
			inserted_item.ducal_primary = TRUE
			inserted_item.barony_primary = FALSE
			inserted.add_atom_colour(activecolor, FIXED_COLOUR_PRIORITY)
			if(!(inserted in GLOB.lordcolor))
				GLOB.lordcolor += inserted
			if(!inserted_item.barony_detail && !inserted_item.barony_altdetail && (inserted in GLOB.baronycolor))
				GLOB.baronycolor -= inserted
		else if(barony_scheme)
			inserted_item.barony_primary = TRUE
			inserted_item.ducal_primary = FALSE
			inserted.add_atom_colour(activecolor, FIXED_COLOUR_PRIORITY)
			if(!(inserted in GLOB.baronycolor))
				GLOB.baronycolor += inserted
			if(!inserted_item.ducal_detail && !inserted_item.ducal_altdetail && (inserted in GLOB.lordcolor))
				GLOB.lordcolor -= inserted
		else
			inserted_item.ducal_primary = FALSE
			inserted_item.barony_primary = FALSE
			inserted.add_atom_colour(activecolor, FIXED_COLOUR_PRIORITY)
			if(!inserted_item.ducal_detail && !inserted_item.ducal_altdetail && (inserted in GLOB.lordcolor))
				GLOB.lordcolor -= inserted
			if(!inserted_item.barony_detail && !inserted_item.barony_altdetail && (inserted in GLOB.baronycolor))
				GLOB.baronycolor -= inserted
		
		inserted_item.update_icon()
		playsound(src, "bubbles", 50, 1)

		// If there's only a single dye slot, eject the item automatically
		if(!inserted_item.detail_color && !inserted_item.altdetail_color)
			inserted.forceMove(drop_location())
			inserted = null

		interact(usr)

	if(href_list["paint_detail"])
		if(!inserted)
			return
		var/obj/item/inserted_item = inserted

		// Apply detail color only
		if(inserted_item.detail_color)
			inserted_item.detail_color = activecolor_detail
			if(ducal_scheme_detail)
				inserted_item.ducal_detail = TRUE
				inserted_item.barony_detail = FALSE
				if(!(inserted_item in GLOB.lordcolor))
					GLOB.lordcolor += inserted_item
				if(!inserted_item.barony_primary && !inserted_item.barony_altdetail && (inserted_item in GLOB.baronycolor))
					GLOB.baronycolor -= inserted_item
			else if(barony_scheme_detail)
				inserted_item.barony_detail = TRUE
				inserted_item.ducal_detail = FALSE
				if(!(inserted_item in GLOB.baronycolor))
					GLOB.baronycolor += inserted_item
				if(!inserted_item.ducal_primary && !inserted_item.ducal_altdetail && (inserted_item in GLOB.lordcolor))
					GLOB.lordcolor -= inserted_item
			else
				inserted_item.ducal_detail = FALSE
				inserted_item.barony_detail = FALSE
				if(!inserted_item.ducal_primary && !inserted_item.ducal_altdetail && (inserted_item in GLOB.lordcolor))
					GLOB.lordcolor -= inserted_item
				if(!inserted_item.barony_primary && !inserted_item.barony_altdetail && (inserted_item in GLOB.baronycolor))
					GLOB.baronycolor -= inserted_item
		
		inserted_item.update_icon()
		playsound(src, "bubbles", 50, 1)
		interact(usr)

	if(href_list["paint_altdetail"])
		if(!inserted)
			return
		var/obj/item/inserted_item = inserted

		// Apply altdetail color only
		if(inserted_item.altdetail_color)
			inserted_item.altdetail_color = activecolor_altdetail
			if(ducal_scheme_altdetail)
				inserted_item.ducal_altdetail = TRUE
				inserted_item.barony_altdetail = FALSE
				if(!(inserted_item in GLOB.lordcolor))
					GLOB.lordcolor += inserted_item
				if(!inserted_item.barony_primary && !inserted_item.barony_detail && (inserted_item in GLOB.baronycolor))
					GLOB.baronycolor -= inserted_item
			else if(barony_scheme_altdetail)
				inserted_item.barony_altdetail = TRUE
				inserted_item.ducal_altdetail = FALSE
				if(!(inserted_item in GLOB.baronycolor))
					GLOB.baronycolor += inserted_item
				if(!inserted_item.ducal_primary && !inserted_item.ducal_detail && (inserted_item in GLOB.lordcolor))
					GLOB.lordcolor -= inserted_item
			else
				inserted_item.ducal_altdetail = FALSE
				inserted_item.barony_altdetail = FALSE
				if(!inserted_item.ducal_primary && !inserted_item.ducal_detail && (inserted_item in GLOB.lordcolor))
					GLOB.lordcolor -= inserted_item
				if(!inserted_item.barony_primary && !inserted_item.barony_detail && (inserted_item in GLOB.baronycolor))
					GLOB.baronycolor -= inserted_item
		
		inserted_item.update_icon()
		playsound(src, "bubbles", 50, 1)
		interact(usr)

	if(href_list["clear_primary"])
		if(!inserted)
			return
		var/obj/item/inserted_item = inserted
		// Remove primary color
		inserted.remove_atom_colour(FIXED_COLOUR_PRIORITY)
		inserted_item.ducal_primary = FALSE
		inserted_item.barony_primary = FALSE
		if(!inserted_item.ducal_detail && !inserted_item.ducal_altdetail && (inserted in GLOB.lordcolor))
			GLOB.lordcolor -= inserted
		if(!inserted_item.barony_detail && !inserted_item.barony_altdetail && (inserted in GLOB.baronycolor))
			GLOB.baronycolor -= inserted
		inserted_item.update_icon()
		playsound(src, "bubbles", 50, 1)
		interact(usr)

	if(href_list["clear_detail"])
		if(!inserted)
			return
		var/obj/item/inserted_item = inserted
		// Clear detail color
		if(inserted_item.detail_color)
			inserted_item.detail_color = "#FFFFFF"
			inserted_item.ducal_detail = FALSE
			inserted_item.barony_detail = FALSE
			if(!inserted_item.ducal_primary && !inserted_item.ducal_altdetail && (inserted_item in GLOB.lordcolor))
				GLOB.lordcolor -= inserted_item
			if(!inserted_item.barony_primary && !inserted_item.barony_altdetail && (inserted_item in GLOB.baronycolor))
				GLOB.baronycolor -= inserted_item
		inserted_item.update_icon()
		playsound(src, "bubbles", 50, 1)
		interact(usr)

	if(href_list["clear_altdetail"])
		if(!inserted)
			return
		var/obj/item/inserted_item = inserted
		// Clear altdetail color
		if(inserted_item.altdetail_color)
			inserted_item.altdetail_color = "#FFFFFF"
			inserted_item.ducal_altdetail = FALSE
			inserted_item.barony_altdetail = FALSE
			if(!inserted_item.ducal_primary && !inserted_item.ducal_detail && (inserted_item in GLOB.lordcolor))
				GLOB.lordcolor -= inserted_item
			if(!inserted_item.barony_primary && !inserted_item.barony_detail && (inserted_item in GLOB.baronycolor))
				GLOB.baronycolor -= inserted_item
		inserted_item.update_icon()
		playsound(src, "bubbles", 50, 1)
		interact(usr)

	if(href_list["clear"])
		if(!inserted)
			return
		var/obj/item/inserted_item = inserted
		// Remove primary color
		inserted.remove_atom_colour(FIXED_COLOUR_PRIORITY)
		// Clear detail color if available
		if(inserted_item.detail_color)
			inserted_item.detail_color = "#FFFFFF"
		// Clear altdetail color if available
		if(inserted_item.altdetail_color)
			inserted_item.altdetail_color = "#FFFFFF"
		inserted_item.update_icon()
		playsound(src, "bubbles", 50, 1)
		// Always eject after clearing
		inserted.forceMove(drop_location())
		inserted = null
		interact(usr)

	if(href_list["eject"])
		if(!inserted)
			return
		inserted.forceMove(drop_location())
		inserted = null
		interact(usr)

	if(href_list["select_tasset1"] || href_list["select_tasset2"])
		if(!inserted || !ishuman(usr))
			return
		var/obj/item/clothing/armor_item = inserted
		if(!istype(armor_item) || armor_item.armor_class != ARMOR_CLASS_HEAVY)
			return
		var/which = href_list["select_tasset1"] ? "tasset1" : "tasset2"
		var/current_colour = which == "tasset1" ? activecolor_detail : activecolor_altdetail
		var/list/choice = choose_dye(usr, current_colour, "[which == "tasset1" ? "Tasset 1" : "Tasset 2"] dye", allow_schemes = FALSE)
		if(!choice)
			return
		if(which == "tasset1")
			activecolor_detail = choice["colour"]
		else
			activecolor_altdetail = choice["colour"]
		interact(usr)

	if(href_list["paint_tasset1"] || href_list["paint_tasset2"])
		if(!inserted || !ishuman(usr))
			return
		var/obj/item/clothing/armor_item = inserted
		if(!istype(armor_item) || armor_item.armor_class != ARMOR_CLASS_HEAVY)
			return
		var/mob/living/carbon/human/H = usr
		var/obj/item/bodypart/taur/taur = H.get_taur_tail()
		if(!taur?.taur_clothing_category)
			return
		if(href_list["paint_tasset1"])
			taur.tasset1_color = activecolor_detail
		else
			taur.tasset2_color = activecolor_altdetail
		playsound(src, "bubbles", 50, 1)
		H.update_inv_armor()
		H.update_inv_shirt()
		interact(usr)

	if(href_list["clear_tasset1"] || href_list["clear_tasset2"])
		if(!inserted || !ishuman(usr))
			return
		var/obj/item/clothing/armor_item = inserted
		if(!istype(armor_item) || armor_item.armor_class != ARMOR_CLASS_HEAVY)
			return
		var/mob/living/carbon/human/H = usr
		var/obj/item/bodypart/taur/taur = H.get_taur_tail()
		if(!taur?.taur_clothing_category)
			return
		if(href_list["clear_tasset1"])
			taur.tasset1_color = null
		else
			taur.tasset2_color = null
		playsound(src, "bubbles", 50, 1)
		H.update_inv_armor()
		H.update_inv_shirt()
		interact(usr)


// PAINTBRUSH

/obj/item/dye_brush
	icon = 'icons/roguetown/items/misc.dmi'
	name = "dye brush"
	desc = "A sizeable brush made of the finest mane-hairs. Thick dye adheres to it well."
	icon_state = "dbrush"
	w_class = WEIGHT_CLASS_SMALL
	dropshrink = 0.7
	grid_width = 32
	grid_height = 32

	var/dye = null

/obj/item/dye_brush/update_icon()
	if(dye)
		var/mutable_appearance/M = mutable_appearance('icons/roguetown/items/misc.dmi', "dbrush_colour")
		M.color = dye
		M.alpha = 150
		add_overlay(M)
	else
		cut_overlays()

/obj/item/dye_brush/examine(mob/user)
	. = ..()

	if(dye)
		. += span_notice("It is currently lathering <font color=[dye]>paint</font>.")
	else
		. += span_notice("Use in active hand to pick a paint.")

/obj/item/dye_brush/attack_self(mob/user)
	..()

	var/hexdye
	if(dye)
		to_chat(user, span_warning("[src] is already carrying <font color=[dye]>dye</font>. I need to wash it."))
		return

	hexdye = sanitize_hexcolor(color_pick_sanitized(usr, "Choose your dye:", "Dyes", null), 6, TRUE)
	if (hexdye == "#000000")
		return
	dye = hexdye
	update_icon()

/obj/item/dye_brush/attack_turf(turf/T, mob/living/user)
	if(!iswallturf(T))
		return
	if(!dye)
		to_chat(user, span_warning("[src] has no dye!"))
		return
	if(T.color)
		to_chat(user, span_warning("[T] is already painted by a <font color=[T.color]>dye</font>!"))
		return

	if(!do_after(user, 6 SECONDS, TRUE, T))
		return
	user.visible_message(span_notice("[user] finishes <font color=[dye]>painting</font> [T]."), \
		span_notice("I finish <font color=[dye]>painting</font> [T].")
	)
	playsound(loc,"sound/foley/scrubbing[pick(1,2)].ogg", 60, TRUE)
	T.color = dye

	..()

/obj/item/dye_brush/attack_obj(obj/O, mob/living/user)
	if(!isstructure(O))
		return
	if(!dye)
		to_chat(user, span_warning("[src] has no dye!"))
		return
	if(O.color)
		to_chat(user, span_warning("[O] is already painted by a <font color=[O.color]>dye</font>!"))
		return

	if(!do_after(user, 3 SECONDS, TRUE, O))
		return
	user.visible_message(span_notice("[user] finishes <font color=[dye]>painting</font> [O]."), \
		span_notice("I finish <font color=[dye]>painting</font> [O].")
	)
	playsound(loc,"sound/foley/scrubbing[pick(1,2)].ogg", 60, TRUE)
	O.color = dye

	..()

/obj/item/dye_brush/wash_act(clean)
	if(!dye)
		return
	dye = null
	update_icon()

