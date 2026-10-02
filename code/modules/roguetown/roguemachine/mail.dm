/obj/structure/roguemachine/mail
	name = "HERMES"
	desc = "Carrier zads have fallen severely out of fashion ever since the advent of this hydropneumatic mail system. A coin slot activates the mechanism for dispensing parchment(a zenny) and quills(a ziliqua)."
	icon = 'icons/roguetown/misc/machines.dmi'
	icon_state = "mail"
	density = FALSE
	blade_dulling = DULLING_BASH
	pixel_y = 32
	var/coin_loaded = FALSE
	var/inqcoins = 0
	var/inqonly = FALSE // Has the Inquisitor locked Marque-spending for lessers?
	var/keycontrol = "puritan"
	var/cat_current = "1"
	var/list/all_category = list(
		"✤ RELIQUARY ✤",
		"✤ SUPPLIES ✤",
		"✤ ARTICLES ✤",
		"✤ EQUIPMENT ✤",
		"✤ WARDROBE ✤"
	)
	var/list/category = list(
		"✤ SUPPLIES ✤",
		"✤ ARTICLES ✤",
		"✤ EQUIPMENT ✤",
		"✤ WARDROBE ✤"
	)
	var/list/inq_category = list("✤ RELIQUARY ✤")
	var/ournum
	var/mailtag
	var/obfuscated = FALSE

/obj/structure/roguemachine/mail/Initialize(mapload)
	. = ..()
	SSroguemachine.hermailers += src
	ournum = SSroguemachine.register_hermes_number(src)
	name = "[name] #[ournum]"
	update_icon()

/obj/structure/roguemachine/mail/Destroy()
	set_light(0)
	SSroguemachine.hermailers -= src
	SSroguemachine.unregister_hermes_number(src, ournum)
	return ..()

/obj/structure/roguemachine/mail/attack_hand(mob/user)
	if(ishuman(user) && GLOB.carebox.try_retrieve_carebox(user, src))
		return TRUE
	if(SSroguemachine.hermailermaster && ishuman(user))
		var/obj/item/roguemachine/mastermail/M = SSroguemachine.hermailermaster
		var/mob/living/carbon/human/H = user
		var/addl_mail = FALSE
		for(var/obj/item/I in M.contents)
			if(I.mailedto == H.real_name)
				if(!addl_mail)
					I.forceMove(src.loc)
					user.put_in_hands(I)
					addl_mail = TRUE
				else
					say("You have additional mail available.")
					break
		if(!any_additional_mail(M, H.real_name))
			if(!addl_mail && H.has_status_effect(/datum/status_effect/ugotmail)) // we apparently got mail, but never got mail (hint: it was stolen by someone with access to the master mailer)
				to_chat(user, span_notice("I look inside the machine and find no letter, how strange."))
			H.remove_status_effect(/datum/status_effect/ugotmail)
	if(!ishuman(user))
		return
	if (user.mind?.has_bomb) //for TRAIT_EXPLOSIVE_SUPPLY. One bomb per one day.
		var/mob/living/carbon/human/H = user
		H.mind?.has_bomb = FALSE
		var/bomb_type
		var/static/list/bomb_type_list = list(/obj/item/tntstick,
		/obj/item/impact_grenade/explosion,
		/obj/item/impact_grenade/smoke/poison_gas,
		/obj/item/impact_grenade/smoke/fire_gas,
		/obj/item/impact_grenade/smoke/healing_gas,
		)
		var/bonus = 0
		if(H.STALUC > 10)
			bonus = 10 * (H.STALUC - 10)
		if(prob(90 - bonus))
			bomb_type = /obj/item/bomb
		else
			bomb_type = pick(bomb_type_list)
		var/obj/item/S = new bomb_type(get_turf(H))
		H.put_in_hands(S)
		if(HAS_TRAIT(H, TRAIT_BOMBER_EXPERT))	//additional random second bomb.
			bomb_type_list |= /obj/item/bomb
			bomb_type = pick(bomb_type_list)
			var/obj/item/B = new bomb_type(get_turf(H))
			H.put_in_hands(B)
	if(user.mind?.has_drug_delivery) //for TRAIT_DRUG_SUPPLY. One delivery per day.
		var/mob/living/carbon/human/H = user
		H.mind.has_drug_delivery = FALSE
		var/static/list/common_drug_list = list(
			/obj/item/reagent_containers/powder/spice,
			/obj/item/reagent_containers/powder/moondust,
			/obj/item/reagent_containers/powder/starsugar
		)
		var/static/list/rare_drug_list = list(
			/obj/item/reagent_containers/powder/moondust_purest,
			/obj/item/reagent_containers/powder/herozium
		)
		var/drug_type
		if(prob(20))
			drug_type = pick(rare_drug_list)
		else
			drug_type = pick(common_drug_list)
		var/obj/item/D = new drug_type(get_turf(H))
		H.put_in_hands(D)
	if(HAS_TRAIT(user, TRAIT_INQUISITION))
		if(!coin_loaded && !inqcoins)
			to_chat(user, span_notice("It needs a Marque."))
			return
		user.changeNext_move(CLICK_CD_MELEE)
		display_marquette(usr)

/obj/structure/roguemachine/mail/examine(mob/user)
	. = ..()
	. += span_info("Load a coin inside, then right click to send a letter.")
	. += span_info("Left click with a paper to send a prewritten letter for free.")
	if(HAS_TRAIT(user, TRAIT_INQUISITION))
		. += span_info("<br>The MARQUETTE can be accessed via a secret compartment fitted within the HERMES. Load a Marque to access it.")

		. += span_info("You can send arrival slips, accusation slips, fully loaded INDEXERs or confessions here.")
		. += span_info("Properly sign them. Include an INDEXER where needed. Stamp them for two additional Marques.")

/obj/structure/roguemachine/mail/attack_right(mob/user)
	. = ..()
	if(.)
		return
	user.changeNext_move(CLICK_CD_INTENTCAP)
	if(!coin_loaded)
		to_chat(user, span_warning("The machine doesn't respond. It needs a coin."))
		return
	if(inqcoins)
		to_chat(user, span_warning("The machine doesn't respond."))
		return
	var/send2place = sanitize(tgui_input_text(user, "Enter the recipient's name or a Hermes #number.", "Address letter", max_length = MAX_MESSAGE_LEN, encode = FALSE))
	if(!send2place || QDELETED(src) || QDELETED(user) || !Adjacent(user) || !coin_loaded || inqcoins)
		return
	var/sentfrom = tgui_input_text(user, "Who is this letter from? Leave blank to send anonymously.", "Sign letter", max_length = MAX_MESSAGE_LEN, encode = FALSE)
	if(isnull(sentfrom) || QDELETED(src) || QDELETED(user) || !Adjacent(user) || !coin_loaded || inqcoins)
		return
	sentfrom = sanitize(sentfrom)
	if(!sentfrom)
		sentfrom = "Anonymous"
	var/sender_ckey = user.ckey
	var/recipient_ckey = null
	if(!findtext(send2place, "#"))
		for(var/mob/living/carbon/human/H in GLOB.human_list)
			if(H.real_name == send2place)
				recipient_ckey = H.ckey
				break
	var/t = stripped_multiline_input(user, "Write your letter to [send2place].", "Compose letter", no_trim = TRUE)
	if(!t || QDELETED(src) || QDELETED(user) || !coin_loaded || inqcoins || !Adjacent(user))
		return
	if(length(t) > 2000)
		to_chat(user, span_warning("Too long. Try again."))
		return
	var/obj/item/paper/P = new
	P.info += t
	P.mailer = sentfrom
	P.mailedto = send2place
	P.update_icon()
	if(findtext(send2place, "#"))
		var/box2find = text2num(copytext(send2place, findtext(send2place, "#")+1))
		var/obj/structure/roguemachine/mail/X = SSroguemachine.get_hermes_by_number(box2find)
		if(X)
			GLOB.fax_panel.register_player_letter(sentfrom, send2place, t)
			P.forceMove(X.loc)
			X.say("New mail!")
			playsound(X, 'sound/misc/hiss.ogg', 100, FALSE, -1)
			visible_message(span_warning("[user] sends something."))
			playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
			coin_loaded = FALSE
			update_icon()
			return
		else
			qdel(P)
			to_chat(user, span_warning("Failed to send it. Bad number?"))
	else
		if(!send2place)
			return
		if(SSroguemachine.hermailermaster)
			var/obj/item/roguemachine/mastermail/X = SSroguemachine.hermailermaster
			if(!recipient_ckey)
				for(var/mob/living/carbon/human/H in GLOB.human_list)
					if(H.real_name == send2place)
						recipient_ckey = H.ckey
						break
			P.mailer = sentfrom
			P.mailedto = send2place
			P.update_icon()
			GLOB.fax_panel.register_player_letter(sentfrom, send2place, t, sender_ckey, recipient_ckey)
			P.forceMove(X.loc)
			var/datum/component/storage/STR = X.GetComponent(/datum/component/storage)
			STR.handle_item_insertion(P, prevent_warning=TRUE)
			X.new_mail=TRUE
			X.update_icon()
			send_ooc_note("New letter from <b>[sentfrom].</b>", name = send2place)
			for(var/mob/living/carbon/human/H in GLOB.human_list)
				if(H.real_name == send2place)
					H.apply_status_effect(/datum/status_effect/ugotmail)
					H.playsound_local(H, 'sound/misc/mail.ogg', 100, FALSE, -1)
		else
			qdel(P)
			to_chat(user, span_warning("The master of mails has perished?"))
			return
		visible_message(span_warning("[user] sends something."))
		playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
		coin_loaded = FALSE
		update_icon()

/obj/structure/roguemachine/mail/attackby(obj/item/P, mob/user, params)
	if(istype(P, /obj/item/merctoken))
		if(ishuman(user))
			var/mob/living/carbon/human/H = user
			if(H.mind.assigned_role != "Mercenary")
				to_chat(H, "<span class='warning'>This is of no use to me - I may give this to a mercenary so they may send it themselves.</span>")
				return
			if(H.mind.assigned_role == "Mercenary")
				if(H.tokenclaimed == TRUE)
					to_chat(H, "<span class='warning'>I have already received my commendation. There's always next week to look forward to!</span>")
					return
			var/obj/item/merctoken/C = P
			if(C.signed == 1)
				qdel(C)
				visible_message("<span class='warning'>[H] sends something.</span>")
				playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
				sleep(20)
				playsound(loc, 'sound/misc/triumph.ogg', 100, FALSE, -1)
				playsound(src.loc, 'sound/misc/hiss.ogg', 100, FALSE, -1)
				H.visible_message("<span class='warning'>A trinket comes tumbling down from the machine. Proof of your distinction.</span>")
				H.adjust_triumphs(3)
				H.tokenclaimed = TRUE
				switch(H.merctype)
					if(0)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal(src.loc)
					if(1)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/atgervi(src.loc)
					if(2)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/blackoak(src.loc)
					if(3)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/condottiero(src.loc)
					if(4)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/desertrider(src.loc)
					if(5)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/forlorn(src.loc)
					if(6)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/freifechter(src.loc)
					if(7)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/grenzelhoft(src.loc)
					if(8)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/grudgebearer(src.loc)
					if(9)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal(src.loc) // NOT CURRENTLY IMPLEMENTED
					if(10)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/routier(src.loc)
					if(11)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/steppesman(src.loc)
					if(12)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/underdweller(src.loc)
					if(13)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/vaquero(src.loc)
					if(14)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/warscholar(src.loc)
					if(15)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/anthrax(src.loc)
					if(16)
						new /obj/item/clothing/neck/roguetown/luckcharm/mercmedal/oathmarked(src.loc)
			if(C.signed == 0)
				to_chat(H, "<span class='warning'>I cannot send an unsigned token.</span>")
				return
	if(HAS_TRAIT(user, TRAIT_INQUISITION))
		if(istype(P, /obj/item/roguekey))
			var/obj/item/roguekey/K = P
			if(K.lockid == keycontrol) // Inquisitor's Key
				playsound(loc, 'sound/misc/beep.ogg', 100, FALSE, -1)
				for(var/obj/structure/roguemachine/mail/everyhermes in SSroguemachine.hermailers)
					everyhermes.inqlock()
				to_chat(user, span_warning("I [inqonly ? "enable" : "disable"] the Puritan's Lock."))
				return display_marquette(user)
			to_chat(user, span_warning("Wrong key."))
			return
		if(istype(P, /obj/item/storage/keyring))
			var/obj/item/storage/keyring/K = P
			if(!K.contents.len)
				return
			var/list/keysy = K.contents.Copy()
			for(var/obj/item/roguekey/KE in keysy)
				if(KE.lockid == keycontrol)
					playsound(loc, 'sound/misc/beep.ogg', 100, FALSE, -1)
					for(var/obj/structure/roguemachine/mail/everyhermes in SSroguemachine.hermailers)
						everyhermes.inqlock()
					to_chat(user, span_warning("I [inqonly ? "enable" : "disable"] the Puritan's Lock."))
					return display_marquette(user)

	if(istype(P, /obj/item/inqarticles/bmirror))
		if((HAS_TRAIT(user, TRAIT_INQUISITION) || HAS_TRAIT(user, TRAIT_PURITAN)))
			var/obj/item/inqarticles/bmirror/I = P
			if(I.broken && !I.bloody)
				visible_message(span_warning("[user] sends something."))
				budget2change(2, user, "MARQUE")
				qdel(I)
				record_round_statistic(STATS_MARQUES_MADE, 2)
				playsound(loc, 'sound/misc/otavanlament.ogg', 100, FALSE, -1)
				playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
			else
				if(!I.broken)
					to_chat(user, (span_warning("It isn't broken.")))
				if(I.broken)
					to_chat(user, (span_warning("Clean it first.")))

	if(istype(P, /obj/item/paper/inqslip/confession))
		if((HAS_TRAIT(user, TRAIT_INQUISITION) || HAS_TRAIT(user, TRAIT_PURITAN)))
			var/obj/item/paper/inqslip/confession/I = P
			if(I.signee && I.signed)
				var/no
				var/accused
				var/stopfarming
				var/bonuses = 2
				var/cursedblood
				var/indexed
				var/selfreport
				var/correct
				if(HAS_TRAIT(I.signee, TRAIT_INQUISITION))
					selfreport = TRUE
				if(HAS_TRAIT(I.signee, TRAIT_CABAL) || HAS_TRAIT(I.signee, TRAIT_HORDE) || HAS_TRAIT(I.signee, TRAIT_DEPRAVED) || HAS_TRAIT(I.signee, TRAIT_COMMIE))
					correct = TRUE
				if(I.signee.name in GLOB.excommunicated_players)
					correct = TRUE
				if(I.paired)
					if(HAS_TRAIT(I.paired.subject, TRAIT_INQUISITION))
						selfreport = TRUE
						indexed = TRUE
					if(I.paired.subject && I.paired.full && !selfreport)
						if(I.paired.cursedblood)
							if(HAS_TRAIT(I.paired.subject.mind, TRAIT_CBLOOD))
								stopfarming = TRUE
							else
								ADD_TRAIT(I.paired.subject.mind, TRAIT_CBLOOD, "mail")
								cursedblood = TRUE
								if(GLOB.cursedsamples.len)
									GLOB.cursedsamples += ", [I.paired.subject.mind]"
								else
									GLOB.cursedsamples += "[I.paired.subject.mind]"
						if(GLOB.indexed)
							if(HAS_TRAIT(I.paired.subject.mind, TRAIT_INDEXED))
								indexed = TRUE
							if(!indexed)
								ADD_TRAIT(I.paired.subject.mind, TRAIT_INDEXED, "mail")
								if(GLOB.indexed.len)
									GLOB.indexed += ", [I.signee]"
								else
									GLOB.indexed += "[I.signee]"
				if(GLOB.accused && !selfreport)
					if(HAS_TRAIT(I.signee.mind, TRAIT_ACCUSED))
						accused = TRUE
				if(GLOB.confessors && !selfreport)
					if(HAS_TRAIT(I.signee.mind, TRAIT_CONFESSED))
						no = TRUE
					if(!no)
						ADD_TRAIT(I.signee.mind, TRAIT_CONFESSED, "mail")
						if(GLOB.confessors.len)
							GLOB.confessors += ", [I.signee]"
						else
							GLOB.confessors += "[I.signee]"
				if(no | selfreport)
					if(I.paired)
						qdel(I.paired)
					qdel(I)
					visible_message(span_warning("[user] sends something."))
					playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
					if(no)
						to_chat(user, span_notice("They've already confessed."))
					else if(stopfarming)
						to_chat(user, span_notice("We already have a sample of their accursed blood."))
					if(selfreport)
						to_chat(user, span_notice("Why was that confession signed by an inquisition member? What?"))
					if(indexed)
						visible_message(span_warning("[user] recieves something."))
						var/obj/item/inqarticles/indexer/replacement = new /obj/item/inqarticles/indexer/
						user.put_in_hands(replacement)
					return
				else
					if(!correct)
						if(cursedblood)
							bonuses = bonuses + bonuses * I.paired.cursedblood
							if(I.waxed)
								bonuses += 2
							budget2change(bonuses, user, "MARQUE")
							record_round_statistic(STATS_MARQUES_MADE, bonuses)
						if(I.paired && !indexed && !correct && !cursedblood)
							if(I.waxed)
								bonuses += 2
						budget2change(bonuses, user, "MARQUE")
						record_round_statistic(STATS_MARQUES_MADE, bonuses)
					else
						if(I.paired && !indexed && !cursedblood)
							I.marquevalue += bonuses
						if(cursedblood)
							bonuses = bonuses + bonuses * I.paired.cursedblood
							I.marquevalue += bonuses
						if(accused)
							I.marquevalue -= 4
						budget2change(I.marquevalue, user, "MARQUE")
						record_round_statistic(STATS_MARQUES_MADE, I.marquevalue)
					if(I.paired)
						qdel(I.paired)
					qdel(I)
					visible_message(span_warning("[user] sends something."))
					playsound(loc, 'sound/misc/otavanlament.ogg', 100, FALSE, -1)
					playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
			return

	if(istype(P, /obj/item/inqarticles/indexer))
		if((HAS_TRAIT(user, TRAIT_INQUISITION) || HAS_TRAIT(user, TRAIT_PURITAN)))
			to_chat(user, span_warning("It needs to be paired with a slip or confession."))
			return

	if(istype(P, /obj/item/paper/inqslip/arrival))
		if(!(HAS_TRAIT(user, TRAIT_INQUISITION) || HAS_TRAIT(user, TRAIT_PURITAN)))
			to_chat(user, span_warning("Only the Inquisition can submit arrival slips."))
			return
		var/obj/item/paper/inqslip/arrival/I = P
		if(I.signee && I.signed)
			message_admins("INQ ARRIVAL: [user.real_name] ([user.ckey]) has just arrived as a [user.job], earning [I.marquevalue] Marques.")
			log_game("INQ ARRIVAL: [user.real_name] ([user.ckey]) has just arrived as a [user.job], earning [I.marquevalue] Marques.")
			budget2change(I.marquevalue, user, "MARQUE")
			record_round_statistic(STATS_MARQUES_MADE, I.marquevalue)
			qdel(I)
			visible_message(span_warning("[user] sends something."))
			playsound(loc, 'sound/misc/otavasent.ogg', 100, FALSE, -1)
			playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
		return

	if(istype(P, /obj/item/paper/inqslip/accusation))
		if(!(HAS_TRAIT(user, TRAIT_INQUISITION) || HAS_TRAIT(user, TRAIT_PURITAN)))
			to_chat(user, span_warning("Only the Inquisition can submit accusation slips."))
			return
		var/obj/item/paper/inqslip/accusation/I = P
		if(I.paired)
			if(I.signee && I.paired.full && I.paired.subject)
				var/no
				var/specialno
				var/stopfarming
				var/indexed
				var/bonuses = 2
				var/correct
				var/cursedblood
				var/selfreport
				if(HAS_TRAIT(I.paired.subject, TRAIT_INQUISITION))
					selfreport = TRUE
				if(HAS_TRAIT(I.paired.subject, TRAIT_CABAL) || HAS_TRAIT(I.paired.subject, TRAIT_HORDE) || HAS_TRAIT(I.paired.subject, TRAIT_DEPRAVED) || HAS_TRAIT(I.paired.subject, TRAIT_COMMIE))
					correct = TRUE
				if(I.paired.subject.name in GLOB.excommunicated_players)
					correct = TRUE
				if(GLOB.indexed && !selfreport)
					if(HAS_TRAIT(I.paired.subject.mind, TRAIT_INDEXED))
						indexed = TRUE
					if(!indexed && !selfreport)
						ADD_TRAIT(I.paired.subject.mind, TRAIT_INDEXED, "mail")
						if(GLOB.indexed.len)
							GLOB.indexed += ", [I.paired.subject]"
						else
							GLOB.indexed += "[I.paired.subject]"
				if(I.paired.cursedblood)
					if(HAS_TRAIT(I.paired.subject.mind, TRAIT_CBLOOD))
						stopfarming = TRUE
					if(!stopfarming)
						cursedblood = TRUE
						ADD_TRAIT(I.paired.subject.mind, TRAIT_CBLOOD, "mail")
						if(GLOB.cursedsamples.len)
							GLOB.cursedsamples += ", [I.paired.subject.mind]"
						else
							GLOB.cursedsamples += "[I.paired.subject.mind]"
				if(GLOB.accused && !selfreport)
					if(HAS_TRAIT(I.paired.subject.mind, TRAIT_ACCUSED))
						no = TRUE
					if(!no)
						ADD_TRAIT(I.paired.subject.mind, TRAIT_ACCUSED, "mail")
						if(GLOB.accused.len)
							GLOB.accused += ", [I.paired.subject]"
						else
							GLOB.accused += "[I.paired.subject]"
				if(GLOB.confessors && !selfreport)
					if(HAS_TRAIT(I.paired.subject.mind, TRAIT_CONFESSED))
						no = TRUE
						specialno = TRUE
				if(cursedblood)
					bonuses = bonuses + bonuses * I.paired.cursedblood
					if(I.waxed)
						bonuses += 2
					budget2change(bonuses, user, "MARQUE")
					record_round_statistic(STATS_MARQUES_MADE, bonuses)
				if(no || selfreport || stopfarming)
					qdel(I.paired)
					qdel(I)
					visible_message(span_warning("[user] sends something."))
					playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
					if(!cursedblood)
						visible_message(span_warning("[user] recieves something."))
						var/obj/item/inqarticles/indexer/replacement = new /obj/item/inqarticles/indexer/
						user.put_in_hands(replacement)
						if(specialno)
							to_chat(user, span_notice("They've confessed."))
						else if(selfreport)
							to_chat(user, span_notice("Why are we accusing our own? What have we come to?"))
						else if(stopfarming)
							to_chat(user, span_notice("We've already collected a sample of their accursed blood."))
						else
							to_chat(user, span_notice("They've already been accused."))
					return
				else
					if(!indexed && !correct && !cursedblood)
						(I.marquevalue -= 4) += bonuses
						budget2change(I.marquevalue, user, "MARQUE")
						record_round_statistic(STATS_MARQUES_MADE, I.marquevalue)
					if(correct)
						if(!indexed)
							I.marquevalue += bonuses
						budget2change(I.marquevalue, user, "MARQUE")
						record_round_statistic(STATS_MARQUES_MADE, I.marquevalue)
					qdel(I.paired)
					qdel(I)
					visible_message(span_warning("[user] sends something."))
					playsound(loc, 'sound/misc/otavanlament.ogg', 100, FALSE, -1)
					playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
					return
			else
				if(!I.paired.full)
					to_chat(user, span_warning("[I.paired] needs to be full of the accused's blood."))
					return
				to_chat(user, span_warning("[I] is missing a signature."))
				return
		else
			to_chat(user, span_warning("[I] is missing an INDEXER."))
			return

	if(istype(P, /obj/item/paper) || istype(P, /obj/item/smallDelivery))
		if(inqcoins)
			to_chat(user, span_warning("The machine doesn't respond."))
			return
		if(tgui_alert(user, "Send this letter or parcel?", "Hermes", list("Send", "Cancel")) == "Send")
			if(QDELETED(src) || QDELETED(user) || QDELETED(P) || !Adjacent(user) || !user.is_holding(P) || inqcoins)
				return
			var/send2place = sanitize(tgui_input_text(user, "Enter the recipient's name or a Hermes #number.", "Address mail", max_length = MAX_MESSAGE_LEN, encode = FALSE))
			if(!send2place || QDELETED(src) || QDELETED(user) || QDELETED(P) || !Adjacent(user) || !user.is_holding(P) || inqcoins)
				return
			var/sentfrom = tgui_input_text(user, "Who is this from? Leave blank to send anonymously.", "Sign mail", max_length = MAX_MESSAGE_LEN, encode = FALSE)
			if(isnull(sentfrom) || QDELETED(src) || QDELETED(user) || QDELETED(P) || !Adjacent(user) || !user.is_holding(P) || inqcoins)
				return
			sentfrom = sanitize(sentfrom)
			if(!sentfrom)
				sentfrom = "Anonymous"
			var/sender_ckey = user.ckey
			var/recipient_ckey = null
			if(!findtext(send2place, "#"))
				for(var/mob/living/carbon/human/H in GLOB.human_list)
					if(H.real_name == send2place)
						recipient_ckey = H.ckey
						break
			if(findtext(send2place, "#"))
				var/box2find = text2num(copytext(send2place, findtext(send2place, "#")+1))
				var/obj/structure/roguemachine/mail/X = SSroguemachine.get_hermes_by_number(box2find)
				if(X)
					P.mailer = sentfrom
					P.mailedto = send2place
					P.update_icon()
					var/letter_text = ""
					var/obj/item/paper/letter_paper = null
					var/obj/item/smallDelivery/letter_package = null
					if(istype(P, /obj/item/paper))
						letter_paper = P
						letter_text = letter_paper.info
					else if(istype(P, /obj/item/smallDelivery))
						letter_package = P
						if(letter_package.note)
							letter_text = letter_package.note.info
					GLOB.fax_panel.register_player_letter(sentfrom, send2place, letter_text, sender_ckey, recipient_ckey)
					P.forceMove(X.loc)
					X.say("New mail!")
					playsound(X, 'sound/misc/hiss.ogg', 100, FALSE, -1)
					visible_message(span_warning("[user] sends something."))
					playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
					return
				else
					to_chat(user, span_warning("Cannot send it. Bad number?"))
			else
				if(!send2place)
					return
				var/mob/living/carbon/human/mailrecipient = null
				for(var/mob/living/carbon/human/H in GLOB.human_list)
					if(H.real_name == send2place)
						mailrecipient = H
						recipient_ckey = H.ckey
						break
				if(!mailrecipient && tgui_alert(user, "Could not find recipient [send2place]. Send the mail anyway?", "Unknown recipient", list("Send", "Cancel")) != "Send")
					return
				if(QDELETED(src) || QDELETED(user) || QDELETED(P) || !Adjacent(user) || !user.is_holding(P) || inqcoins)
					return
				var/findmaster
				if(SSroguemachine.hermailermaster)
					var/obj/item/roguemachine/mastermail/X = SSroguemachine.hermailermaster
					findmaster = TRUE
					P.mailer = sentfrom
					P.mailedto = send2place
					P.update_icon()
					var/letter_text = ""
					var/obj/item/paper/letter_paper = null
					var/obj/item/smallDelivery/letter_package = null
					if(istype(P, /obj/item/paper))
						letter_paper = P
						letter_text = letter_paper.info
					else if(istype(P, /obj/item/smallDelivery))
						letter_package = P
						if(letter_package.note)
							letter_text = letter_package.note.info
					GLOB.fax_panel.register_player_letter(sentfrom, send2place, letter_text, sender_ckey, recipient_ckey)
					P.forceMove(X.loc)
					var/datum/component/storage/STR = X.GetComponent(/datum/component/storage)
					STR.handle_item_insertion(P, prevent_warning=TRUE)
					X.new_mail=TRUE
					X.update_icon()
					playsound(src.loc, 'sound/misc/hiss.ogg', 100, FALSE, -1)
				if(!findmaster)
					to_chat(user, span_warning("The master of mails has perished?"))
				else
					visible_message(span_warning("[user] sends something."))
					playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
					send_ooc_note("New letter from <b>[sentfrom].</b>", name = send2place)
					if(mailrecipient)
						mailrecipient.apply_status_effect(/datum/status_effect/ugotmail)
						mailrecipient.playsound_local(mailrecipient, 'sound/misc/mail.ogg', 100, FALSE, -1)
					return

	if(istype(P, /obj/item/roguecoin/gilbranze))
		return

	if(istype(P, /obj/item/roguecoin/inqcoin))
		if(HAS_TRAIT(user, TRAIT_INQUISITION))
			if(coin_loaded && !inqcoins)
				return
			var/obj/item/roguecoin/M = P
			coin_loaded = TRUE
			inqcoins += M.quantity
			update_icon()
			qdel(M)
			playsound(src, 'sound/misc/coininsert.ogg', 100, FALSE, -1)
			return display_marquette(usr)
		else
			return

	if(istype(P, /obj/item/roguecoin))
		var/obj/item/roguecoin/C = P
		switch(C.get_real_price())
			if(1)
				qdel(C)
				var/obj/item/paper/papier = new
				user.put_in_hands(papier)
			if(5)
				qdel(C)
				var/obj/item/natural/feather/quill = new
				user.put_in_hands(quill)
			else
				to_chat(user, span_warning("Not a valid denomination! Insert 1 mammon for paper, 5 mammon for a quill."))
				return
		playsound(src, 'sound/misc/coininsert.ogg', 100, FALSE, -1)
		return
	..()

/obj/structure/roguemachine/mail/r
	pixel_y = 0
	pixel_x = 32

/obj/structure/roguemachine/mail/l
	pixel_y = 0
	pixel_x = -32

/obj/structure/roguemachine/mail/update_icon()
	cut_overlays()
	if(coin_loaded)
		if(inqcoins > 0)
			add_overlay(mutable_appearance(icon, "mail-i"))
			set_light(1, 1, 1, l_color = "#ffffff")
		else
			add_overlay(mutable_appearance(icon, "mail-f"))
			set_light(1, 1, 1, l_color = "#1b7bf1")
	else
		add_overlay(mutable_appearance(icon, "mail-s"))
		set_light(1, 1, 1, l_color = "#ff0d0d")

/obj/structure/roguemachine/mail/examine(mob/user)
	. = ..()
	. += "<a href='?src=[REF(src)];directory=1'>Directory:</a> [mailtag]"

/obj/structure/roguemachine/mail/proc/view_directory(mob/user)
	var/list/contents = list("<div class='comms-folio'><div class='comms-heading'><div class='comms-eyebrow'>Postal directory</div><h1>Hermes register</h1><p>Find a destination for your correspondence.</p></div><div class='comms-search'><label for='directory-search'>Find a destination</label><input id='directory-search' type='text' placeholder='Search by number or place...' oninput='filterCommsDirectory(this.value)'></div><div class='comms-body' tabindex='0' role='region' aria-label='Mail destinations'><table class='comms-directory'><thead><tr><th scope='col' class='comms-number'>Number</th><th scope='col'>Destination</th></tr></thead><tbody id='directory-entries'>")
	var/station_count = 0
	for(var/obj/structure/roguemachine/mail/X in SSroguemachine.hermailers)
		if(X.obfuscated)
			continue
		station_count++
		var/destination = X.mailtag ? X.mailtag : capitalize(get_area_name(X))
		contents += "<tr><td class='comms-number'>#[X.ournum]</td><td>[html_encode(destination)]</td></tr>"
	contents += "</tbody></table><div id='directory-no-matches' class='comms-empty'[station_count ? " style='display:none'" : ""]>[station_count ? "No destinations match your search." : "No destinations are registered."]</div></div><div class='comms-footer'>[station_count] listed destination[station_count == 1 ? "" : "s"].</div></div>"

	var/datum/browser/popup = new(user, "hermes_directory", "", 560, 640)
	popup.add_stylesheet("communications", 'html/browser/communications.css')
	popup.add_script("communications_directory", 'html/browser/communications_directory.js')
	var/datum/asset/simple/roguefonts/fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = fonts.get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Comms Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Comms Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>")
	popup.set_content(contents.Join())
	popup.open(FALSE)

/obj/item/roguemachine/mastermail
	name = "MASTER OF MAILS"
	icon = 'icons/roguetown/misc/machines.dmi'
	icon_state = "mailspecial"
	pixel_y = 32
	max_integrity = 0
	density = FALSE
	blade_dulling = DULLING_BASH
	anchored = TRUE
	w_class = WEIGHT_CLASS_GIGANTIC
	var/new_mail

/obj/item/roguemachine/mastermail/update_icon()
	cut_overlays()
	if(new_mail)
		icon_state = "mailspecial-get"
	else
		icon_state = "mailspecial"
	set_light(1, 1, 1, l_color = "#ff0d0d")

/obj/item/roguemachine/mastermail/ComponentInitialize()
	. = ..()
	AddComponent(/datum/component/storage/concrete/roguetown/mailmaster)

/obj/item/roguemachine/mastermail/attack_hand(mob/user)
	var/datum/component/storage/CP = GetComponent(/datum/component/storage)
	if(CP)
		if(new_mail)
			new_mail = FALSE
			update_icon()
		CP.rmb_show(user)
		return TRUE

/obj/item/roguemachine/mastermail/Initialize(mapload)
	. = ..()
	SSroguemachine.hermailermaster = src
	update_icon()

/obj/item/roguemachine/mastermail/attackby(obj/item/P, mob/user, params)
	if(istype(P, /obj/item/paper))
		var/obj/item/paper/PA = P
		if(!PA.mailer && !PA.mailedto && PA.cached_mailer && PA.cached_mailedto)
			PA.mailer = PA.cached_mailer
			PA.mailedto = PA.cached_mailedto
			PA.cached_mailer = null
			PA.cached_mailedto = null
			PA.update_icon()
			to_chat(user, span_warning("I carefully re-seal the letter and place it back in the machine, no one will know."))
		if(PA.mailer && PA.mailedto)
			for(var/mob/living/carbon/human/H in GLOB.human_list)
				if(H.real_name == PA.mailedto && !H.has_status_effect(/datum/status_effect/ugotmail)) // quietly readd the status if they tried to check their mail while the letter was being spied on
					H.apply_status_effect(/datum/status_effect/ugotmail)
		P.forceMove(loc)
		var/datum/component/storage/STR = GetComponent(/datum/component/storage)
		STR.handle_item_insertion(P, prevent_warning=TRUE)
	..()

/obj/item/roguemachine/mastermail/Destroy()
	set_light(0)
	if(SSroguemachine.hermailermaster == src)
		SSroguemachine.hermailermaster = null
	SSroguemachine.hermailers -= src
	var/datum/component/storage/STR = GetComponent(/datum/component/storage)
	if(STR)
		var/list/things = STR.contents()
		for(var/obj/item/I in things)
			STR.remove_from_storage(I, get_turf(src))
	return ..()

/obj/structure/roguemachine/mail/proc/any_additional_mail(obj/item/roguemachine/mastermail/M, name)
	for(var/obj/item/I in M.contents)
		if(I.mailedto == name)
			return TRUE
	return FALSE


/*
	INQUISITION INTERACTIONS - START
*/

/obj/structure/roguemachine/mail/proc/inqlock()
	inqonly = !inqonly

/obj/structure/roguemachine/mail/proc/can_view_inq_pack(mob/user, datum/inqports/pack)
	if(!pack || !(pack.category in category))
		return FALSE
	if(istype(pack, /datum/inqports/equipment/garrote) && !HAS_TRAIT(user, TRAIT_BLACKBAGGER))
		return FALSE
	return TRUE

/obj/structure/roguemachine/mail/proc/can_purchase_inq_pack(mob/user, datum/inqports/pack)
	if(!ishuman(user) || !can_view_inq_pack(user, pack) || (inqonly && !HAS_TRAIT(user, TRAIT_PURITAN)))
		return FALSE
	return pack.marquescost >= 0 && inqcoins >= pack.marquescost && (!pack.maximum || pack.remaining > 0)

/obj/structure/roguemachine/mail/proc/decreaseremaining(datum/inqports/PA)
	PA.remaining -= 1
	PA.name = "[initial(PA.name)] ([PA.remaining]/[PA.maximum]) - ᛉ [PA.marquescost] ᛉ"
	if(!PA.remaining)
		PA.name = "[initial(PA.name)] (OUT OF STOCK) - ᛉ [PA.marquescost] ᛉ"
	return

/obj/structure/roguemachine/mail/proc/display_marquette(mob/user)
	var/datum/browser/popup = new(user, "inquisition_marquette", "", 740, 720)
	if(inqcoins == 0)
		popup.close()
		return
	var/list/contents = list("<div class='merchant-folio marquette'><div class='merchant-heading'><div class='merchant-edition'>L'Inquisition d'Otava</div><h1>Marquette</h1><p>Pour l'éradication de l'hérésie, tant que Psydon endure.</p></div><div class='merchant-container'><div class='merchant-container-details'><strong>Puritan's lock: [inqonly ? "OUI" : "NON"]</strong><span>[inqonly ? "Purchases are restricted to the Puritan." : "Purchases are open to the Inquisition."]</span></div>")
	if(HAS_TRAIT(user, TRAIT_PURITAN))
		contents += "<a href='?src=[REF(src)];locktoggle=1'>[inqonly ? "Unlock purchases" : "Lock purchases"]</a>"
	contents += "</div><div class='merchant-stock' tabindex='0' role='region' aria-label='Marquette catalogue'><div class='marquette-categories'>"
	for(var/available_category in category)
		contents += "<a href='?src=[REF(src)];changecat=[url_encode(available_category)]' class='[available_category == cat_current ? "marquette-selected" : ""]'[available_category == cat_current ? " aria-current='page'" : ""]>[html_encode(available_category)]</a>"
	contents += "</div>"
	if(cat_current == "1")
		contents += "<div class='marquette-empty'>Choose a category to browse the Marquette.</div>"
	else
		contents += "<div class='marquette-catalogue-heading'><h2>[html_encode(cat_current)]</h2><a href='?src=[REF(src)];changecat=1'>All categories</a></div>"
		var/list/items = list()
		for(var/pack in GLOB.inqsupplies)
			var/datum/inqports/PA = GLOB.inqsupplies[pack]
			if(can_view_inq_pack(user, PA) && PA.category == cat_current && PA.name)
				items += PA
		if(length(items))
			contents += "<div class='marquette-search'><label for='marquette-search'>Find goods</label><input id='marquette-search' type='text' placeholder='Search this category...' oninput='filterMarquetteGoods(this.value)'></div><table class='merchant-table marquette-goods'><thead><tr><th scope='col'>Goods</th><th scope='col' class='merchant-quantity'>Stock</th><th scope='col' class='merchant-price'>Marques</th><th scope='col' class='merchant-action'>Action</th></tr></thead><tbody id='marquette-goods'>"
			for(var/pack in sortNames(items, order=0))
				var/datum/inqports/PA = pack
				contents += "<tr><td class='marquette-product'>[html_encode(initial(PA.name))]</td><td class='merchant-quantity'>[PA.maximum ? "[PA.remaining] / [PA.maximum]" : "&mdash;"]</td><td class='merchant-price'>[PA.marquescost]</td><td class='merchant-action'>"
				if(can_purchase_inq_pack(user, PA))
					contents += "<a href='?src=[REF(src)];buy=[url_encode("[PA.type]")]'>Buy</a>"
				else
					var/reason = "Unavailable"
					if(inqonly && !HAS_TRAIT(user, TRAIT_PURITAN))
						reason = "Puritan's lock"
					else if(PA.maximum && PA.remaining <= 0)
						reason = "Out of stock"
					else if(inqcoins < PA.marquescost)
						reason = "Need [PA.marquescost - inqcoins] more"
					contents += "<span class='marquette-unavailable' aria-disabled='true'>[reason]</span>"
				contents += "</td></tr>"
			contents += "</tbody></table><div id='marquette-no-matches' class='marquette-empty' style='display:none'>No goods match your search.</div>"
		else
			contents += "<div class='marquette-empty'>No goods are available in this category.</div>"
	contents += "</div><div class='merchant-footer'><div class='merchant-balance'><span>Marques loaded</span><strong>[inqcoins]</strong></div><a href='?src=[REF(src)];eject=1'>Return marques</a></div></div>"
	popup.add_stylesheet("merchant", 'html/browser/merchant.css')
	popup.add_stylesheet("marquette", 'html/browser/marquette.css')
	var/datum/asset/simple/roguefonts/fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = fonts.get_url_mappings()
	var/head = "<style>@font-face { font-family: 'Merchant Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Merchant Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Merchant Pterra'; src: url('[font_urls["pterra.ttf"]]'); }</style>"
	head += {"<script type='text/javascript'>
function filterMarquetteGoods(value) {
	var query = value.toLowerCase();
	var rows = document.getElementById('marquette-goods').getElementsByTagName('tr');
	var visible = 0;
	for (var i = 0; i < rows.length; i++) {
		var row = rows.item(i);
		var name = row.getElementsByTagName('td').item(0);
		var matches = (name.textContent || name.innerText || '').toLowerCase().indexOf(query) !== -1;
		row.style.display = matches ? '' : 'none';
		if (matches) visible++;
	}
	document.getElementById('marquette-no-matches').style.display = visible ? 'none' : 'block';
}
</script>"}
	popup.add_head_content(head)
	popup.set_content(contents.Join())
	popup.open()

/obj/structure/roguemachine/mail/Topic(href, href_list)
	..()
	if(!usr.canUseTopic(src, BE_CLOSE))
		return
	if(href_list["directory"])
		view_directory(usr)
		return
	if(href_list["eject"])
		if(inqcoins <= 0)
			return
		coin_loaded = FALSE
		update_icon()
		budget2change(inqcoins, usr, "MARQUE")
		inqcoins = 0

	if(href_list["changecat"])
		var/requested_category = href_list["changecat"]
		if(requested_category == "1" || requested_category in category)
			cat_current = requested_category

	if(href_list["locktoggle"])
		if(!HAS_TRAIT(usr, TRAIT_PURITAN))
			return
		playsound(loc, 'sound/misc/beep.ogg', 100, FALSE, -1)
		var/new_lock = !inqonly
		for(var/obj/structure/roguemachine/mail/everyhermes in SSroguemachine.hermailers)
			everyhermes.inqonly = new_lock

	if(href_list["buy"])
		var/path = text2path(href_list["buy"])
		var/datum/inqports/PA = GLOB.inqsupplies[path]
		if(!can_purchase_inq_pack(usr, PA))
			return
		var/area/A = GLOB.areas_by_type[/area/rogue/indoors/inq/import]
		if(!A)
			to_chat(usr, span_warning("The delivery route is unavailable."))
			return
		var/list/turfs = list()
		for(var/turf/destination in A)
			if(!destination.density)
				turfs += destination
		if(!length(turfs))
			to_chat(usr, span_warning("The delivery route is unavailable."))
			return
		var/turf/T = pick(turfs)
		var/pathi = islist(PA.item_type) ? pick(PA.item_type) : PA.item_type
		if(!ispath(pathi, /obj))
			return

		inqcoins -= PA.marquescost
		if(PA.maximum)
			decreaseremaining(PA)
		visible_message(span_warning("[usr] sends something."))
		if(!inqcoins)
			coin_loaded = FALSE
			update_icon()
		playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
		playsound(T, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)
		new pathi(get_turf(T))

	return display_marquette(usr)

/*
	INQUISITION INTERACTIONS - END
*/
