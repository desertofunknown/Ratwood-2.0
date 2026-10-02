#define SALT_CHANCE_MAX 300
#define SALT_CHANCE_DEFAULT_TOTAL 200
#define SALT_CHANCE_PERCENT(max_salt) (100/max_salt)
#define SALT_CHANCE_INTEREST_RATE (60 MINUTES) // time to reach max interest
#define SALT_CHANCE_INTEREST_DEFAULT (5)
#define SALT_CHANCE_INTEREST_MAX (10) // max interest mul factor

GLOBAL_LIST_EMPTY(saltminestockpilemachines)
GLOBAL_LIST_EMPTY(saltmineticketmachines)

/obj/structure/roguemachine/stockpile_saltcamp
	name = "XYLIX'S PENANCE"
	desc = "Xylix determines if we shall be granted freedom, or ignored for eternity."
	icon = 'icons/roguetown/misc/machines.dmi'
	icon_state = "stockpile_vendor"
	density = FALSE
	blade_dulling = DULLING_BASH
	pixel_y = 32
	obj_flags = INDESTRUCTIBLE

	var/list/salt_accounts = list()
	var/list/salt_accounts_timestamp = list()
	var/list/salt_accounts_interest_max = list()
	var/list/salt_accounts_max = list()
	var/list/salt_ticket_win = list()

	var/salt_spent_on_gambling = 0
	var/gambling_active = FALSE

	var/salt_chance_default = SALT_CHANCE_DEFAULT_TOTAL
	var/interest_rate_default = SALT_CHANCE_INTEREST_DEFAULT

/obj/structure/roguemachine/stockpile_saltcamp/Initialize(mapload)
	. = ..()
	GLOB.saltminestockpilemachines += src

/obj/structure/roguemachine/stockpile_saltcamp/Destroy()
	GLOB.saltminestockpilemachines -= src
	salt_accounts = null
	salt_accounts_timestamp = null
	salt_accounts_interest_max = null
	salt_accounts_max = null
	salt_ticket_win = null
	return ..()

/obj/structure/roguemachine/stockpile_saltcamp/examine(mob/user)
	. = ..()
	if(HAS_TRAIT(user, TRAIT_DUNGEONMASTER_LABOR_CAMP))
		. += span_info("The winning tickets from the machine are [span_boldwarning("highly")] sought after as collector items.")
	else
		. += span_info("Right click to deposit all the salt in front of the machine.")

/obj/structure/roguemachine/stockpile_saltcamp/proc/get_salt_interest(mob/user)
	if(!user || !ishuman(user))
		return 0
	var/mob/living/carbon/human/H = user

	var/target_name = H.real_name
	for(var/X in salt_accounts) // already got an account
		if(X == target_name)
			return CLAMP(world.time - salt_accounts_timestamp[X], 1, SALT_CHANCE_INTEREST_RATE) / SALT_CHANCE_INTEREST_RATE * salt_accounts_interest_max[target_name]

	salt_accounts += target_name // make account
	salt_accounts[target_name] = 0
	salt_accounts_timestamp += target_name
	salt_accounts_timestamp[target_name] = world.time
	salt_accounts_interest_max += target_name
	salt_accounts_interest_max[target_name] = interest_rate_default
	salt_accounts_max += target_name
	salt_accounts_max[target_name] = salt_chance_default
	salt_ticket_win += target_name
	salt_ticket_win[target_name] = 0

	return 0

/obj/structure/roguemachine/stockpile_saltcamp/proc/reset_salt_timestamp(mob/user, didwewinaticket = FALSE)
	if(!user || !ishuman(user))
		return 0
	var/mob/living/carbon/human/H = user

	var/target_name = H.real_name
	for(var/X in salt_accounts) // already got an account
		if(X == target_name)
			salt_accounts_timestamp[target_name] = world.time
			if(didwewinaticket)
				salt_ticket_win[target_name] += 1
			return

	salt_accounts += target_name // make account
	salt_accounts[target_name] = 0
	salt_accounts_timestamp += target_name
	salt_accounts_timestamp[target_name] = world.time
	salt_accounts_interest_max += target_name
	salt_accounts_interest_max[target_name] = SALT_CHANCE_INTEREST_DEFAULT
	salt_accounts_max += target_name
	salt_accounts_max[target_name] = SALT_CHANCE_DEFAULT_TOTAL
	salt_ticket_win += target_name
	salt_ticket_win[target_name] = 0

/obj/structure/roguemachine/stockpile_saltcamp/proc/get_salt_balance(mob/user)
	if(!user || !ishuman(user))
		return 0
	var/mob/living/carbon/human/H = user

	var/target_name = H.real_name
	for(var/X in salt_accounts) // already got an account
		if(X == target_name)
			var/balance = salt_accounts[X]
			var/interest = CLAMP(world.time - salt_accounts_timestamp[X], 1, SALT_CHANCE_INTEREST_RATE) / SALT_CHANCE_INTEREST_RATE * salt_accounts_interest_max[target_name]
			return balance * (1 + interest)

	salt_accounts += target_name // make account
	salt_accounts[target_name] = 0
	salt_accounts_timestamp += target_name
	salt_accounts_timestamp[target_name] = world.time
	salt_accounts_interest_max += target_name
	salt_accounts_interest_max[target_name] = interest_rate_default
	salt_accounts_max += target_name
	salt_accounts_max[target_name] = salt_chance_default
	salt_ticket_win += target_name
	salt_ticket_win[target_name] = 0

	return salt_accounts[target_name]

/obj/structure/roguemachine/stockpile_saltcamp/proc/get_salt_max(mob/user)
	if(!user || !ishuman(user))
		return 0
	var/mob/living/carbon/human/H = user

	var/target_name = H.real_name
	for(var/X in salt_accounts) // already got an account
		if(X == target_name)
			return salt_accounts_max[target_name]

	salt_accounts += target_name // make account
	salt_accounts[target_name] = 0
	salt_accounts_timestamp += target_name
	salt_accounts_timestamp[target_name] = world.time
	salt_accounts_interest_max += target_name
	salt_accounts_interest_max[target_name] = interest_rate_default
	salt_accounts_max += target_name
	salt_accounts_max[target_name] = salt_chance_default
	salt_ticket_win += target_name
	salt_ticket_win[target_name] = 0

	return salt_accounts_max[target_name]

/obj/structure/roguemachine/stockpile_saltcamp/proc/add_salt_balance(mob/user, amt = 0)
	if(!user || !ishuman(user))
		return
	var/mob/living/carbon/human/H = user

	var/target_name = H.real_name
	for(var/X in salt_accounts) // already got an account
		if(X == target_name)
			salt_accounts[X] += amt
			if(salt_accounts[X] < 0)
				salt_accounts[X] = 0
			return

	salt_accounts += target_name // make account
	salt_accounts[target_name] = amt
	salt_accounts_timestamp += target_name
	salt_accounts_timestamp[target_name] = world.time
	salt_accounts_interest_max += target_name
	salt_accounts_interest_max[target_name] = interest_rate_default
	salt_accounts_max += target_name
	salt_accounts_max[target_name] = salt_chance_default
	salt_ticket_win += target_name
	salt_ticket_win[target_name] = 0

/obj/structure/roguemachine/stockpile_saltcamp/proc/set_salt_balance(mob/user, amt = 0)
	if(!user || !ishuman(user))
		return
	var/mob/living/carbon/human/H = user

	var/target_name = H.real_name
	for(var/X in salt_accounts) // already got an account
		if(X == target_name)
			salt_accounts[X] = amt
			return

	salt_accounts += target_name // make account
	salt_accounts[target_name] = amt
	salt_accounts_timestamp += target_name
	salt_accounts_timestamp[target_name] = world.time
	salt_accounts_interest_max += target_name
	salt_accounts_interest_max[target_name] = interest_rate_default
	salt_accounts_max += target_name
	salt_accounts_max[target_name] = salt_chance_default
	salt_ticket_win += target_name
	salt_ticket_win[target_name] = 0

/obj/structure/roguemachine/stockpile_saltcamp/proc/get_odds_of_winning(mob/user)
	var/balance = get_salt_balance(user)
	var/max_salt = get_salt_max(user)
	if(balance >= max_salt)
		return 100
	
	balance *= SALT_CHANCE_PERCENT(max_salt)
	return balance

/obj/structure/roguemachine/stockpile_saltcamp/proc/get_interest_string(mob/user)
	var/interest = get_salt_interest(user)
	if(interest <= 0)
		return "<font color='#f54646'>0%</font>"
	interest = round(interest/1,0.01)*100
	var/string
	if(interest < 10)
		string = "<font color='#f54646'>"
	else if(interest < 20)
		string = "<font color='#f36c6c'>"	
	else if(interest < 40)
		string = "<font color='#f5b546'>"
	else if(interest < 60)
		string = "<font color='#cff546'>"
	else if(interest < 80)
		string = "<font color='#acf546'>"
	else if(interest < 100)
		string = "<font color='#4ff546'>"
	else
		string = "<font color='#4ff546'>"
	string += "[interest]%</font>"
	return string

/obj/structure/roguemachine/stockpile_saltcamp/proc/get_odds_of_winning_string(mob/user)
	var/balance = get_odds_of_winning(user)
	var/string
	if(balance <= 0)
		return "<font color='#f54646'>[pick("NO CHANCE", "NO SALT, NO CHANCE", "FOOL, MINE SOME SALT!", "GO MINE, YOU DULLARD!")]</font>"
	else if(balance < 10)
		string = "<font color='#f54646'>"
	else if(balance < 20)
		string = "<font color='#f36c6c'>"	
	else if(balance < 40)
		string = "<font color='#f5b546'>"
	else if(balance < 60)
		string = "<font color='#cff546'>"
	else if(balance < 80)
		string = "<font color='#acf546'>"
	else if(balance < 100)
		string = "<font color='#4ff546'>"
	else
		return "<font color='#4ff546'>[pick("WHY ARE YOU STILL HERE?!", "YOU ARE A SHAMEFUL FOOL!", "ARE YOU COMPENSATING?", "PLEASE, GO OUTSIDE!", "DID THEY FORGET YOU!?")]</font>"
	string += "[round(balance,0.5)]%</font>"
	return string

/obj/structure/roguemachine/stockpile_saltcamp/proc/roll_for_ticket(mob/user)
	gambling_active = TRUE
	playsound(src, 'sound/misc/letsgogambling.ogg', 100, FALSE, -1)
	var/oldx = pixel_x
	animate(src, pixel_x = oldx+1, time = 1)
	animate(pixel_x = oldx-1, time = 1)
	animate(pixel_x = oldx, time = 1)
	sleep(50)
	var/prob_of_winning = get_odds_of_winning(user)
	if(prob_of_winning >= 100 || prob(prob_of_winning)) // we won!
		playsound(src, 'sound/misc/machinetalk.ogg', 100, FALSE, -1)
		gambling_active = FALSE
		return TRUE
	playsound(src, 'sound/misc/bug.ogg', 100, FALSE, -1)
	gambling_active = FALSE
	return FALSE

/obj/structure/roguemachine/stockpile_saltcamp/Topic(href, href_list)
	if(!usr.canUseTopic(src, BE_CLOSE))
		return
	if(gambling_active)
		return
	switch(href_list["task"])
		if("refresh")
			return attack_hand(usr)
		if("roll")
			var/current_balance = get_salt_balance(usr)
			if(current_balance <= 0)
				src.say(pick("Eager fool; you need salt to gamble for freedom.", "You are missing your salt.", "A criminal without salt is no criminal at all.", "To play the game, you must first salt the ground."))
				return
			close_ui(usr)
			src.say("Bow to Xylix and shall luck bless you.")
			if(!roll_for_ticket(usr)) // if we lost the game (like you just did lol), add to spent counter and reset account back to zero
				salt_spent_on_gambling += current_balance
				set_salt_balance(usr, 0)
				src.say(pick("Better luck next tyme, criminal.", "You've lost! May your tears aid your rock culling.", "Such folly, better luck next tyme!", "Ha-ha! You salt drinker, never had a chance to win!"))
				return
			set_salt_balance(usr, 0)
			src.say("Oh lookie here, we have ourselves a winner!!")
			playsound(src, 'sound/misc/triumph_win_twnn.ogg', 100, FALSE, -1)
			var/obj/item/detroyt_toll/ive_got_a_golden_ticket = new /obj/item/detroyt_toll(get_turf(src))
			if(!ive_got_a_golden_ticket) // something something went very very wrong... refund player
				set_salt_balance(usr, current_balance)
				return
			reset_salt_timestamp(usr, TRUE) // reset their interest progress
			ive_got_a_golden_ticket.sellprice = round(rand(current_balance, current_balance*3), 1) // set the value between salt spent on gambling for ticket, and three times
			if(!usr.put_in_hands(ive_got_a_golden_ticket))
				ive_got_a_golden_ticket.forceMove(get_turf(src))

/obj/structure/roguemachine/stockpile_saltcamp/proc/close_ui(mob/living/user)
	if(!user?.mind?.current)
		return
	user.mind.current << browse(null, "window=saltcamp")

/obj/structure/roguemachine/stockpile_saltcamp/attack_hand(mob/living/user, menu_name)
	. = ..()
	if(.)
		return
	if(gambling_active)
		return
	user.changeNext_move(CLICK_CD_INTENTCAP)
	playsound(loc, 'sound/misc/keyboard_enter.ogg', 100, FALSE, -1)

	var/balance = get_salt_balance(user)
	var/deposited_salt = salt_accounts[user.real_name] || 0
	var/max_salt = get_salt_max(user)
	var/odds = get_odds_of_winning(user)
	var/contents = "<div class='service-ledger'><div class='service-header'><h1>[html_encode(name)]</h1><a href='?src=[REF(src)];task=refresh'>Refresh</a></div>"
	contents += "<div class='service-summary'>FEED THE MACHINE - WIN YOUR FREEDOM<br>DEPOSIT SALT TO INCREASE LUCK</div>"
	contents += "<div class='service-section'><table class='service-table'><tbody>"
	contents += "<tr><th scope='row'>Salt deposited</th><td class='service-number'>[deposited_salt]</td></tr>"
	contents += "<tr><th scope='row'>Current interest</th><td class='service-number'>[get_interest_string(user)]</td></tr>"
	contents += "<tr><th scope='row'>Salt with interest</th><td class='service-number'>[round(balance, 0.1)] / [max_salt]</td></tr>"
	contents += "<tr><th scope='row'>Current odds</th><td class='service-number'>[round(odds, 0.5)]%</td></tr></tbody></table>"
	if(odds <= 0 || odds >= 100)
		contents += "<p>[get_odds_of_winning_string(user)]</p>"
	contents += "</div><div class='service-actions'>"
	if(balance > 0)
		contents += "<a href='?src=[REF(src)];task=roll'>Roll for freedom</a>"
	else
		contents += "<span class='service-disabled'>Roll for freedom</span>"
	contents += "<p class='service-warning'>A roll spends your entire salt balance, whether you win or lose.</p><p class='service-muted'>Right click the machine to deposit all salt in front of it.</p></div></div>"

	var/datum/browser/popup = new(user, "saltcamp", "", 500, 500)
	popup.add_stylesheet("service_ledger", 'html/browser/service_ledger.css')
	var/datum/asset/simple/roguefonts/fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = fonts.get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Service Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Service Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Service Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Service Rocker'; src: url('[font_urls["newrocker.ttf"]]'); }</style>")
	popup.set_content(contents)
	popup.open()

/obj/structure/roguemachine/stockpile_saltcamp/proc/attemptsell(obj/item/reagent_containers/powder/salt/I, mob/H, message = TRUE, sound = TRUE)
	if(!istype(I))
		return FALSE
	qdel(I)
	add_salt_balance(H, 1)
	if(sound == TRUE)
		playsound(loc, 'sound/misc/hiss.ogg', 100, FALSE, -1)
	if(message == TRUE)
		say("Salt has been deposited. Your chances are now [round(get_odds_of_winning(H),0.5)]% of winning.")
	return TRUE

/obj/structure/roguemachine/stockpile_saltcamp/attackby(obj/item/P, mob/user, params)
	if(gambling_active)
		return FALSE
	if(ishuman(user))
		if(istype(P, /obj/item/reagent_containers/powder/salt))
			attemptsell(P, user, TRUE, TRUE)
			return FALSE
	. = ..()

/obj/structure/roguemachine/stockpile_saltcamp/attack_right(mob/user)
	if(gambling_active)
		return
	if(ishuman(user))
		var/found_salt = FALSE
		for(var/obj/I in get_turf(src))
			found_salt |= attemptsell(I, user, FALSE, FALSE)
		if(found_salt)
			say("Salt has been deposited. Your chances are now [round(get_odds_of_winning(user),0.5)]% of winnings.")
		playsound(loc, 'sound/misc/hiss.ogg', 100, FALSE, -1)
		playsound(loc, 'sound/misc/disposalflush.ogg', 100, FALSE, -1)

/obj/structure/roguemachine/ticket_manager
	name = "Ticket Manager Deluxe"
	desc = "This machine controls the punishment for victims of the salt mines."
	icon = 'icons/roguetown/misc/machines.dmi'
	icon_state = "submit"
	density = FALSE
	blade_dulling = DULLING_BASH
	pixel_y = 32
	obj_flags = INDESTRUCTIBLE
	var/out_of_service = FALSE
	var/datum/weakref/stockpile_ref = null

/obj/structure/roguemachine/ticket_manager/proc/does_name_exist(obj/structure/roguemachine/stockpile_saltcamp/stockpile, name_to_check)
	return name_to_check in stockpile.salt_accounts

/obj/structure/roguemachine/ticket_manager/proc/can_finish_edit(mob/user, obj/structure/roguemachine/stockpile_saltcamp/stockpile, account_name)
	if(QDELETED(src) || QDELETED(user) || QDELETED(stockpile) || out_of_service)
		return FALSE
	if(!user.canUseTopic(src, BE_CLOSE) || stockpile_ref?.resolve() != stockpile)
		return FALSE
	if(!isnull(account_name) && !does_name_exist(stockpile, account_name))
		return FALSE
	return TRUE

/obj/structure/roguemachine/ticket_manager/Topic(href, href_list)
	if(!usr.canUseTopic(src, BE_CLOSE))
		return
	var/obj/structure/roguemachine/stockpile_saltcamp/stockpile = null
	if(!out_of_service)
		if(stockpile_ref)
			stockpile = stockpile_ref.resolve()
			if(QDELETED(stockpile) || !istype(stockpile)) // machine doesn't exist
				out_of_service = TRUE
		else
			stockpile = locate(/obj/structure/roguemachine/stockpile_saltcamp) in GLOB.saltminestockpilemachines // we're assuming there is only ever one of these machines in the world
			if(stockpile)
				stockpile_ref = WEAKREF(stockpile)
			else
				out_of_service = TRUE
	if(out_of_service || !stockpile) // aka there isn't any other machine in this world
		say("Sorry, machine out of service!")
		return
	switch(href_list["task"])
		if("withdraw")
			var/amount = round(stockpile.salt_spent_on_gambling, 1)
			if(amount > 0)
				budget2change(amount, usr)
				stockpile.salt_spent_on_gambling = 0
		if("set_salt")
			var/name = href_list["name"]
			if(!does_name_exist(stockpile, name)) // sanity check name argument
				return
			var/new_max = tgui_input_number(usr, "Set the maximum salt needed to assure a 100% win", name, stockpile.salt_accounts_max[name], SALT_CHANCE_MAX, 10, round_value = FALSE)
			if(!isnum(new_max) || !can_finish_edit(usr, stockpile, name))
				return
			new_max = round(new_max, 1)
			if(new_max < 10)
				to_chat(usr, span_danger("You cannot set to a value lower than 10!"))
				return
			if(new_max > SALT_CHANCE_MAX)
				to_chat(usr, span_danger("You cannot set to a value higher than [SALT_CHANCE_MAX]!"))
				return
			stockpile.salt_accounts_max[name] = new_max
		if("set_salt_default")
			var/new_max = tgui_input_number(usr, "Set the default maximum salt needed to assure a 100% win", name, stockpile.salt_chance_default, SALT_CHANCE_MAX, 10, round_value = FALSE)
			if(!isnum(new_max) || !can_finish_edit(usr, stockpile))
				return
			new_max = round(new_max, 1)
			if(new_max < 10)
				to_chat(usr, span_danger("You cannot set to a value lower than 10!"))
				return
			if(new_max > SALT_CHANCE_MAX)
				to_chat(usr, span_danger("You cannot set to a value higher than [SALT_CHANCE_MAX]!"))
				return
			stockpile.salt_chance_default = new_max
		if("set_interest")
			var/name = href_list["name"]
			if(!does_name_exist(stockpile, name)) // sanity check name argument
				return
			var/new_max = tgui_input_number(usr, "Set the maximum interest rate percentage (1 hour for max interest)", name, stockpile.salt_accounts_interest_max[name] * 100, SALT_CHANCE_INTEREST_MAX * 100, 0, round_value = FALSE)
			if(!isnum(new_max) || !can_finish_edit(usr, stockpile, name))
				return
			new_max = round(new_max, 1)
			if(new_max < 0)
				to_chat(usr, span_danger("You cannot set to a value lower than 0%!"))
				return
			if(new_max > SALT_CHANCE_INTEREST_MAX * 100)
				to_chat(usr, span_danger("You cannot set to a value higher than [SALT_CHANCE_INTEREST_MAX * 100]%!"))
				return
			stockpile.salt_accounts_interest_max[name] = new_max / 100
		if("set_interest_default")
			var/new_max = tgui_input_number(usr, "Set the default maximum interest rate percentage (1 hour for max interest)", name, stockpile.interest_rate_default * 100, SALT_CHANCE_INTEREST_MAX * 100, 0, round_value = FALSE)
			if(!isnum(new_max) || !can_finish_edit(usr, stockpile))
				return
			new_max = round(new_max, 1)
			if(new_max < 0)
				to_chat(usr, span_danger("You cannot set to a value lower than 0%!"))
				return
			if(new_max > SALT_CHANCE_INTEREST_MAX * 100)
				to_chat(usr, span_danger("You cannot set to a value higher than [SALT_CHANCE_INTEREST_MAX * 100]%!"))
				return
			stockpile.interest_rate_default = new_max / 100
		if("reset_interest")
			var/name = href_list["name"]
			if(!does_name_exist(stockpile, name)) // sanity check name argument
				return
			var/answer = tgui_alert(usr, "Reset [name]'s interest progression to 0%?", "Please answer in [DisplayTimeText(100)]", list("Yes", "Cancel"), 100)
			if(answer != "Yes" || !can_finish_edit(usr, stockpile, name))
				return
			stockpile.salt_accounts_timestamp[name] = world.time
	return attack_hand(usr)

/obj/structure/roguemachine/ticket_manager/attack_hand(mob/living/user, menu_name)
	. = ..()
	if(.)
		return
	var/obj/structure/roguemachine/stockpile_saltcamp/stockpile = null
	if(!out_of_service)
		if(stockpile_ref)
			stockpile = stockpile_ref.resolve()
			if(QDELETED(stockpile) || !istype(stockpile)) // machine doesn't exist
				out_of_service = TRUE
		else
			stockpile = locate(/obj/structure/roguemachine/stockpile_saltcamp) in GLOB.saltminestockpilemachines // we're assuming there is only ever one of these machines in the world
			if(stockpile)
				stockpile_ref = WEAKREF(stockpile)
			else
				out_of_service = TRUE
	if(out_of_service || !stockpile) // aka there isn't any other machine in this world
		say("Sorry, machine out of service!")
		return
	user.changeNext_move(CLICK_CD_INTENTCAP)
	playsound(loc, 'sound/misc/keyboard_enter.ogg', 100, FALSE, -1)

	var/gambled_salt = round(stockpile.salt_spent_on_gambling, 1)
	var/total_accounts = length(stockpile.salt_accounts)
	var/contents = "<div class='service-ledger'><div class='service-header'><h1>SALT MANAGER DELUXE</h1><a href='?src=[REF(src)];task=refresh'>Refresh</a></div>"
	contents += "<p class='service-muted'>Where tears become fears</p><div class='service-summary'>Salt gambled away: <b>[gambled_salt]</b> "
	if(gambled_salt > 0)
		contents += "<a href='?src=[REF(src)];task=withdraw'>Withdraw as coins</a>"
	contents += "</div><div class='service-section'><h2>New prisoner defaults</h2><table class='service-table'><tbody>"
	contents += "<tr><th scope='row'>Salt for a certain win</th><td class='service-number'><a href='?src=[REF(src)];task=set_salt_default'>[stockpile.salt_chance_default]</a></td></tr>"
	contents += "<tr><th scope='row'>Maximum interest</th><td class='service-number'><a href='?src=[REF(src)];task=set_interest_default'>[stockpile.interest_rate_default * 100]%</a></td></tr></tbody></table>"
	contents += "<p class='service-muted'>Interest reaches its maximum after one hour. These defaults apply to new accounts.</p></div>"
	contents += "<div class='service-section'><h2>Prisoner accounts</h2>"
	var/visible_accounts = 0
	if(total_accounts > 0)
		contents += "<table class='service-table'><thead><tr><th scope='col'>Prisoner</th><th scope='col'>Salt mined / required</th><th scope='col'>Maximum interest</th></tr></thead><tbody>"
		for(var/i = 1; i <= total_accounts; i++)
			var/name = stockpile.salt_accounts[i]
			var/salt = stockpile.salt_accounts[name]
			var/salt_max = stockpile.salt_accounts_max[name]
			var/interest = stockpile.salt_accounts_interest_max[name] * 100
			if(salt == 0 && stockpile.salt_ticket_win[name] > 0) // don't show ticket winners who have left the mines
				continue
			visible_accounts++
			var/account_url = url_encode(name)
			var/account_label = replacetext(html_encode(name), "'", "&#39;")
			contents += "<tr><td>[account_label]</td>"
			contents += "<td>[salt] / <a aria-label='Set salt required for [account_label]' href='?src=[REF(src)];task=set_salt;name=[account_url]'>[salt_max]</a></td>"
			contents += "<td><a aria-label='Set maximum interest for [account_label]' href='?src=[REF(src)];task=set_interest;name=[account_url]'>[interest]%</a> "
			contents += "<a aria-label='Reset interest progress for [account_label]' href='?src=[REF(src)];task=reset_interest;name=[account_url]'>Reset progress</a></td></tr>"
		contents += "</tbody></table>"
	if(!visible_accounts)
		contents += "<p class='service-empty'>No current prisoner accounts.</p>"
	contents += "</div></div>"

	var/datum/browser/popup = new(user, "saltmanager", "", 800, 500)
	popup.add_stylesheet("service_ledger", 'html/browser/service_ledger.css')
	var/datum/asset/simple/roguefonts/fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = fonts.get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Service Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Service Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Service Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Service Rocker'; src: url('[font_urls["newrocker.ttf"]]'); }</style>")
	popup.set_content(contents)
	popup.open()

/obj/structure/roguemachine/ticket_master
	name = "Ticket Slide"
	desc = "Only ticket winners may get to ride the sorrid slide to freedom. Looks like it will strip whoever passes through."
	icon = 'icons/roguetown/misc/machines.dmi'
	icon_state = "headeater"
	density = FALSE
	blade_dulling = DULLING_BASH
	pixel_y = 32
	obj_flags = INDESTRUCTIBLE
	var/out_of_service = FALSE
	var/obj/structure/roguemachine/ticket_master/slide_other_end = null
	var/gid

/obj/structure/roguemachine/ticket_master/Initialize(mapload)
	. = ..()
	GLOB.saltmineticketmachines += src

/obj/structure/roguemachine/ticket_master/Destroy()
	GLOB.saltmineticketmachines -= src
	if(!out_of_service && slide_other_end)
		slide_other_end.slide_other_end = null
		slide_other_end.out_of_service = TRUE
	slide_other_end = null
	return ..()

/obj/structure/roguemachine/ticket_master/attack_hand(mob/living/user, menu_name)
	. = ..()
	if(.)
		return
	if(out_of_service) // aka the mapper forgot to link the other machine
		say("Sorry, slide out of service!")
	else
		say("You must first earn your freedom with the ticket.")

/obj/structure/roguemachine/ticket_master/attackby(obj/item/P, mob/user, params)
	if(!out_of_service && !slide_other_end)
		for(var/obj/structure/roguemachine/ticket_master/O in GLOB.saltmineticketmachines)
			if(O.gid == gid && src != O)
				slide_other_end = O
				O.slide_other_end = src
		if(!slide_other_end)
			out_of_service = TRUE
	if(out_of_service) // aka the mapper forgot to link the other machine
		say("Sorry, slide out of service!")
		return ..()
	if(ishuman(user))
		var/mob/living/carbon/human/winner = user
		if(istype(P, /obj/item/detroyt_toll))
			if(winner.buckled) // don't stay remote-buckled
				winner.buckled.unbuckle_mob(winner, TRUE)
			var/turf/T = get_turf(slide_other_end)
			if(T)
				playsound(src, 'sound/misc/disposalflush.ogg', 50, FALSE, -1)
				playsound(slide_other_end, 'sound/misc/disposalflush.ogg', 50, FALSE, -1)
				for(var/obj/item/W in winner)
					if(W == P) // don't drop ticket
						continue
					if(istype(W, /obj/item/undies)) // let them keep their modesty
						continue
					if(HAS_TRAIT(W, TRAIT_NO_SELF_UNEQUIP) || HAS_TRAIT(W, TRAIT_NODROP) || HAS_TRAIT(W, CURSED_ITEM_TRAIT))
						continue
					winner.dropItemToGround(W)
				winner.regenerate_icons()
				if(do_teleport(winner, T, channel = TELEPORT_CHANNEL_FREE, forced = TRUE))
					winner.Paralyze(5 SECONDS, ignore_canstun = TRUE)
					to_chat(winner, span_danger("You are instantly sucked into the slide!"))
				else
					to_chat(winner, span_danger("Something stops you from being pulled into the slide!"))
		else
			say("You must first earn your freedom with the ticket.")
		return FALSE
	. = ..()

#undef SALT_CHANCE_MAX
#undef SALT_CHANCE_DEFAULT_TOTAL
#undef SALT_CHANCE_PERCENT
#undef SALT_CHANCE_INTEREST_RATE
#undef SALT_CHANCE_INTEREST_DEFAULT
#undef SALT_CHANCE_INTEREST_MAX
