#define TAB_MAIN 1
#define TAB_BANK 2
#define TAB_IMPORT 4
#define TAB_DEBT 5
#define TAB_FISCAL 6
#define TAB_PAYDAY 8
#define TAB_SALTMINE 9

/obj/structure/roguemachine/steward
	name = "nerve master"
	desc = "The stewards most trusted friend."
	icon = 'icons/roguetown/misc/machines.dmi'
	icon_state = "steward_machine"
	density = TRUE
	blade_dulling = DULLING_BASH
	max_integrity = 0
	anchored = TRUE
	layer = BELOW_OBJ_LAYER
	locked = FALSE
	var/keycontrol = "steward"
	var/current_tab = TAB_MAIN
	var/compact = TRUE
	var/total_deposit = 0
	var/list/excluded_jobs = list("Wretch","Vagabond","Adventurer")
	var/list/daily_payments = list() // Associative list: job name -> payment amount
	// Last trade-modal quote keyed by ckey. Read by ui_data to round-trip per-user. (Step 15)
	var/list/last_trade_quote = list()
	// Per-user ledger view state keyed by ckey: list("open", "page", "filter"). Only populated
	// into ui_static_data while a user has the Ledger tab open, so the full ledger never rides
	// the per-tick Market Scroll payload.
	var/list/ledger_view = list()
	// Item 6 decrees: anti-spam gate on Letter of Citizenry printing.
	var/residency_print_cooldown = 0
	COOLDOWN_DECLARE(fulfill_retry_cooldown)

/obj/structure/roguemachine/steward/Initialize(mapload)
	. = ..()
	if(SStreasury.steward_machine == null) //The "only one" mapped in Nerve Master at map start
		SStreasury.steward_machine = src
	setup_default_payments()

//	For competence of life I will allow you,
//	That lack of means enforce you not to evil:
/obj/structure/roguemachine/steward/proc/setup_default_payments()
	daily_payments["Knight Captain"] = 40
	if(SSmapping.current_map.map_name == "Dun World")
		daily_payments["Sergeant"] = 40 //Garrison
	if(SSmapping.current_map.map_name == "Desert Town")
		daily_payments["Slave Master"] = 50
		daily_payments["Cataphract"] = 40
		daily_payments["Janissary Sergeant"] = 40 //Garrison
		daily_payments["Janissary"] = 30
		daily_payments["Azeb Agha"] = 35
		daily_payments["Azeb"] = 20
	else
		daily_payments["Knight"] = 40
		daily_payments["Man at Arms"] = 30
		daily_payments["Warden"] = 20
		daily_payments["Dungeoneer"] = 25
	if(SSmapping.current_map.map_name == "Rockhill")
		daily_payments["Watch Captain"] = 35 //Don't get to live in a fancy keep with servants. More expenses.
		daily_payments["Master Warden"] = 35 //Garrison
		daily_payments["Sergeant"] = 40 //Garrison
		daily_payments["City Guard"] = 30
		daily_payments["Vanguard"] = 10
	daily_payments["Rookie"] = 15//paid more than squires because they don't get to live in a castle with maids cooking them dinner
	daily_payments["Veteran"] = 20
	daily_payments["Squire"] = 10
//courtiers
	daily_payments["Head Physician"] = 40 //Doctors
	daily_payments["Apothecary"] = 15 //paid by the keep to heal people, would make sense.
	daily_payments["Court Magician"] = 40 //University
	if(SSmapping.current_map.map_name == "Desert Town")
		daily_payments["Palace Chaplain"] = 20
		daily_payments["Headslave"] = 20 //Manor-House
	else
		daily_payments["Court Chaplain"] = 30
		daily_payments["Seneschal"] = 40 //Manor-House
		daily_payments["Servant"] = 20
	daily_payments["Archivist"] = 10
	daily_payments["Magicians Associate"] = 10
	daily_payments["Jester"] = 6

	if(SSmapping.current_map.map_name == "Roguetest")
		daily_payments["Shophand"] = 999
	// Item 6 decrees: bump defaults up to any roundstart-active charter's mandated floor.
	enforce_wage_floors()

/proc/has_fiscal_authority(mob/user)
	if(!user)
		return FALSE
	if(user.job == "Steward" || user.job == "Clerk" || user.job == "Grand Duke")
		return TRUE
	if(SSticker.regentmob && user == SSticker.regentmob)
		return TRUE
	return FALSE


/obj/structure/roguemachine/steward/attackby(obj/item/P, mob/user, params)
	if(istype(P, /obj/item/roguekey))
		var/obj/item/roguekey/K = P
		if(K.lockid == keycontrol || istype(K, /obj/item/roguekey/lord)) //Master key
			locked = !locked
			playsound(loc, 'sound/misc/beep.ogg', 100, FALSE, -1)
			(locked) ? (icon_state = "steward_machine_off") : (icon_state = "steward_machine")
			update_icon()
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
				(locked) ? (icon_state = "steward_machine_off") : (icon_state = "steward_machine")
				update_icon()
				return
		to_chat(user, span_warning("Wrong key."))
		return
	if(istype(P, /obj/item/roguecoin/gilbranze))
		return
	if(istype(P, /obj/item/roguecoin/inqcoin))
		return
	if(istype(P, /obj/item/roguecoin))
		record_round_statistic(STATS_MAMMONS_DEPOSITED, P.get_real_price())
		SStreasury.mint(SStreasury.discretionary_fund, P.get_real_price(), "NERVE MASTER deposit")
		qdel(P)
		playsound(src, 'sound/misc/coininsert.ogg', 100, FALSE, -1)
		return
	return ..()


/obj/structure/roguemachine/steward/Topic(href, href_list)
	. = ..()
	var/realmname = SSmapping.map_adjustment.realm_name
	if(!usr.canUseTopic(src, BE_CLOSE) || locked)
		return
	if(href_list["switchtab"])
		current_tab = text2num(href_list["switchtab"])
	if(href_list["import"])
		// Step 15: crown imports (GLOB.crown_imports) replaced the legacy roguestock imports.
		var/datum/crown_import/D = locate(href_list["import"]) in GLOB.crown_imports
		if(!D)
			return
		var/amt = D.get_import_price()
		if(!SStreasury.burn(SStreasury.discretionary_fund, amt, "Import: [D.name]"))
			say("Insufficient mammon.")
			return
		SStreasury.total_import += amt
		record_treasury_expense(TREASURY_FLOW_IMPORT, treasury_role_of(usr), amt)
		record_round_statistic(STATS_STOCKPILE_IMPORTS_VALUE, amt)
		if(amt >= 100) //Only announce big spending.
			scom_announce("[realmname] imports [D.name] for [amt] mammon.", )
		D.raise_demand()
		addtimer(CALLBACK(src, PROC_REF(do_import), D.type), 10 SECONDS)
	if(href_list["export"])
		var/datum/roguestock/D = locate(href_list["export"]) in SStreasury.stockpile_datums
		if(!D)
			return
		// Trade-good entries must export through the StewardTrade TGUI (manual_export), which
		// enforces and decrements regional demand. This legacy handler has no UI link anymore;
		// without this guard a crafted href could mint at best-region prices with no demand cap.
		if(D.trade_good_id)
			return
		if(!SStreasury.do_export(D))
			say("Insufficient stock.")
			return
	if(href_list["setpurchasefloor"])
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		var/current_floor = SStreasury.stockpile_purchase_floor
		var/new_floor = input(usr, "Set the Crown's Purchase Floor. Below this balance the stockpile refuses purchases - goods stay with the seller. (0-10000m)", src, current_floor) as null|num
		if(isnull(new_floor))
			return
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		new_floor = CLAMP(round(new_floor), 0, 10000)
		SStreasury.stockpile_purchase_floor = new_floor
		say("Crown's Purchase Floor set to [new_floor]m.")
		log_game("PURCHASE FLOOR: [key_name(usr)] set stockpile purchase floor to [new_floor]m")
	if(href_list["clearloandebtor"])
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		var/list/debtors = list()
		for(var/mob/living/carbon/human/H in GLOB.human_list)
			if(HAS_TRAIT(H, TRAIT_DEBTOR))
				debtors["[H.real_name]"] = H
		if(!length(debtors))
			say("No debtors currently marked.")
			return
		var/pick = input(usr, "Clear defaulter mark from which debtor?", src) as null|anything in debtors
		if(!pick)
			return
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		var/mob/living/carbon/human/target = debtors[pick]
		if(!target || !HAS_TRAIT(target, TRAIT_DEBTOR))
			return
		REMOVE_TRAIT(target, TRAIT_DEBTOR, TRAIT_GENERIC)
		var/datum/loan/forgiven = SStreasury.get_loan_for(target)
		var/loan_amt = forgiven ? forgiven.get_remaining_due() : 0
		if(forgiven)
			SStreasury.loans -= forgiven
			qdel(forgiven)
		SStreasury.clear_poll_tax_debt(target)
		say("[target.real_name]'s debtor mark has been cleared; all Crown debts forgiven.")
		log_game("DEBT FORGIVEN: [key_name(usr)] cleared debtor mark on [key_name(target)][loan_amt ? " (wrote off [loan_amt]m loan)" : ""]")
		to_chat(target, span_notice("The Stewardry has cleared the defaulter mark from my name. My debts to the Crown are forgiven."))
	if(href_list["clearpolltax"])
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		var/list/in_arrears = list()
		for(var/mob/living/carbon/human/H in GLOB.human_list)
			if(SStreasury.poll_tax_owed[H] || SStreasury.poll_tax_debt_days[H] || HAS_TRAIT(H, TRAIT_ARREARS))
				in_arrears["[H.real_name]"] = H
		if(!length(in_arrears))
			say("No poll tax arrears on the ledger.")
			return
		var/pick = input(usr, "Clear poll tax arrears for which subject?", src) as null|anything in in_arrears
		if(!pick)
			return
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		var/mob/living/carbon/human/target = in_arrears[pick]
		if(!target)
			return
		var/was_owed = SStreasury.poll_tax_owed[target] || 0
		var/was_overdue = SStreasury.poll_tax_debt_days[target] || 0
		SStreasury.clear_poll_tax_debt(target)
		say("[target.real_name]'s poll tax arrears have been cleared.")
		log_game("POLL TAX CLEARED: [key_name(usr)] cleared [was_owed]m poll tax arrears on [key_name(target)] ([was_overdue] day\s overdue)")
		to_chat(target, span_notice("The Stewardry has cleared my poll tax arrears. The Crown's ledger on my head is wiped clean."))
	// Step 15: stockpile price/limit/withdraw management moved to the StewardTrade TGUI
	// (setprice/setlimit/togglewithdraw Topic handlers removed). Ratwood keeps the passive
	// import rate handler; that system is not covered by the TGUI.
	if(href_list["setrate"])
		var/datum/roguestock/D = locate(href_list["setrate"]) in SStreasury.stockpile_datums
		if(!D)
			return              //Cheaper prices, no taxes, the price? Commitment. You can only change the rates at day. I'd like to make the window shorter,
		if(GLOB.tod == "night") //less chance to micromanage, incentivize doing other things at later hours, make it unable to be changed at dusk too, but this needs testing first
			say("Suppliers will only agree to modifying deals at times when Astrata shines.")
			return
		var/newrate = input(usr, "Set a new rate for remote imports for [D.name]", src, D.passive_generation) as null|num
		if(!isnull(newrate))
			if(!usr.canUseTopic(src, BE_CLOSE) || locked)
				return
			if(findtext(num2text(newrate), "."))
				return
			newrate = CLAMP(newrate, 0, D.generation_max)
			scom_announce("[realmname] will [newrate ? "now import [newrate] [D.name] every 5 hours." : "no longer import [D.name] periodically"]")
			D.passive_generation = newrate
	if(href_list["givemoney"])
		var/X = locate(href_list["givemoney"])
		if(!X)
			return
		for(var/mob/living/A in SStreasury.bank_accounts)
			if(A == X)
				var/newtax = input(usr, "How much to give [X]", src) as null|num
				if(!usr.canUseTopic(src, BE_CLOSE) || locked)
					return
				if(findtext(num2text(newtax), "."))
					return
				if(!newtax)
					return
				if(newtax < 1)
					return
				newtax = min(newtax, 10000)
				SStreasury.give_money_account(newtax, A, "NERVE MASTER")
				break
	if(href_list["fineaccount"])
		var/X = locate(href_list["fineaccount"])
		if(!X)
			return
		if(!has_fiscal_authority(usr))
			say("Only the Steward, Clerk, or Ruler may levy fines.")
			playsound(src, 'sound/misc/machineno.ogg', 100, FALSE, -1)
			return
		for(var/mob/living/A in SStreasury.bank_accounts)
			if(A == X)
				var/max_fine = SStreasury.get_max_fine_for(A)
				if(max_fine <= 0)
					say("[A] cannot be fined by the Crown at this time.")
					playsound(src, 'sound/misc/machineno.ogg', 100, FALSE, -1)
					return
				var/newtax = input(usr, "How much to fine [A]? (Maximum [max_fine]m)", src, max_fine) as null|num
				if(!usr.canUseTopic(src, BE_CLOSE) || locked)
					return
				if(findtext(num2text(newtax), "."))
					return
				if(!newtax)
					return
				if(newtax < 1)
					return
				if(newtax > max_fine)
					newtax = max_fine
					say("The ledger will accept no more than [max_fine]m from [A]. Amount adjusted.")
				SStreasury.give_money_account(-newtax, A, "NERVE MASTER")
				break
	if(href_list["printresidency"])
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		if(world.time < residency_print_cooldown)
			say("The machine is still warming its quill.")
			playsound(src, 'sound/misc/machineno.ogg', 100, FALSE, -1)
			return
		var/mob/living/carbon/human/H = usr
		var/obj/item/citizenry_letter/letter = new(get_turf(src))
		letter.issuer_name = H.real_name
		letter.issuer_year = CALENDAR_EPOCH_YEAR
		residency_print_cooldown = world.time + 1 MINUTES
		playsound(src, 'sound/misc/coindispense.ogg', 60, FALSE, -1)
		say("Letter of Citizenry issued, signed by [H.real_name].")
	if(href_list["payroll"])
		var/list/L = list(GLOB.noble_positions) + list(GLOB.garrison_positions) + list(GLOB.courtier_positions) + list(GLOB.church_positions) + list(GLOB.yeoman_positions) + list(GLOB.peasant_positions) + list(GLOB.youngfolk_positions) + list(GLOB.inquisition_positions)
		var/list/things = list()
		for(var/list/category in L)
			for(var/A in category)
				things += A
		var/job_to_pay = input(usr, "Select a job", src) as null|anything in things
		if(!job_to_pay)
			return
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		var/amount_to_pay = input(usr, "How much to pay every [job_to_pay]", src) as null|num
		if(!amount_to_pay)
			return
		if(amount_to_pay<1)
			return
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		if(findtext(num2text(amount_to_pay), "."))
			return
		amount_to_pay = min(amount_to_pay, 10000)
		for(var/mob/living/carbon/human/H in GLOB.human_list)
			if(H.job == job_to_pay)
				if(SStreasury.give_money_account(amount_to_pay, H, "NERVE MASTER"))
					record_round_statistic(STATS_WAGES_PAID, amount_to_pay)
	if(href_list["setdailypay"])
		var/list/L = list(GLOB.noble_positions) + list(GLOB.garrison_positions) + list(GLOB.courtier_positions) + list(GLOB.church_positions) + list(GLOB.yeoman_positions) + list(GLOB.peasant_positions) + list(GLOB.youngfolk_positions) + list(GLOB.inquisition_positions)
		var/list/things = list()
		for(var/list/category in L)
			for(var/A in category)
				things += A
		var/job_to_pay = input(usr, "Select a job", src) as null|anything in things
		if(!job_to_pay)
			return
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		// Item 6 decrees: active charters (Indenture of War, Covenant of Noc & Pestra) floor
		// certain wages - the Nerve Master refuses to set covered jobs below the floor.
		var/wage_floor = SStreasury.get_wage_floor(job_to_pay)
		var/payprompt = wage_floor > 0 ? "Set daily payment for [job_to_pay] (floor: [wage_floor]m by Charter; 0 not permitted)" : "Set daily payment for [job_to_pay] (0 to remove)"
		var/amount_to_pay = input(usr, payprompt, src, daily_payments[job_to_pay] ? daily_payments[job_to_pay] : wage_floor) as null|num
		if(!usr.canUseTopic(src, BE_CLOSE) || locked)
			return
		if(findtext(num2text(amount_to_pay), "."))
			return
		if(isnull(amount_to_pay))
			return
		amount_to_pay = CLAMP(amount_to_pay, 0, 999)
		if(wage_floor > 0 && amount_to_pay < wage_floor)
			amount_to_pay = wage_floor
			say("By Charter, [job_to_pay]'s wage may not fall below [wage_floor]m. Payment set to the floor.")
		if(amount_to_pay == 0)
			daily_payments -= job_to_pay
			say("Daily payment for [job_to_pay] removed.")
		else
			daily_payments[job_to_pay] = amount_to_pay
			say("Daily payment for [job_to_pay] set to [amount_to_pay]m.")
	if(href_list["removedailypay"])
		var/job_to_remove = href_list["removedailypay"]
		var/removal_floor = SStreasury.get_wage_floor(job_to_remove)
		if(removal_floor > 0)
			daily_payments[job_to_remove] = removal_floor
			say("By Charter, [job_to_remove]'s wage cannot be removed. Payment held at the floor of [removal_floor]m.")
		else
			daily_payments -= job_to_remove
			say("Daily payment for [job_to_remove] removed.")
	if(href_list["togglewages"])
		var/X = locate(href_list["togglewages"])
		if(!X)
			return
		for(var/mob/living/carbon/human/A in SStreasury.bank_accounts)
			if(A == X)
				// Check if user has permission (Steward, Clerk, Grand Duke, or Regent)
				var/is_authorized = FALSE
				if(usr.job == "Steward" || usr.job == "Clerk" || usr.job == "Grand Duke")
					is_authorized = TRUE
				if(SSticker.regentmob && usr == SSticker.regentmob)
					is_authorized = TRUE

				if(!is_authorized)
					say("Only the Steward, Clerk, or Ruler may suspend wages.")
					playsound(src, 'sound/misc/machineno.ogg', 100, FALSE, -1)
					return

				var/datum/fund/account = SStreasury.get_account(A)
				if(!account)
					return
				account.wages_suspended = !account.wages_suspended
				if(!account.wages_suspended)
					REMOVE_TRAIT(A, TRAIT_WAGES_SUSPENDED, TRAIT_GENERIC)
					say("[A.real_name]'s wages have been reinstated.")
					to_chat(A, span_notice("My wages have been reinstated by the Stewardry."))
				else
					ADD_TRAIT(A, TRAIT_WAGES_SUSPENDED, TRAIT_GENERIC)
					say("[A.real_name]'s wages have been suspended.")
					to_chat(A, span_danger("My wages have been suspended by the Stewardry!"))
				break
	if(href_list["compact"])
		compact = !compact
	if(href_list["trade_tgui"])
		open_trade_tgui(usr)
		return

	return attack_hand(usr)

/obj/structure/roguemachine/steward/proc/quote_trade(mob/user, side, region_id, good_id, quantity)
	. = list(
		"ok" = FALSE,
		"reason" = "",
		"side" = side,
		"region_id" = region_id,
		"good_id" = good_id,
	)
	if(!user_can_act(user))
		.["reason"] = "out of reach"
		return
	var/is_alderman_acting = alderman_has_access(user)
	if(locked && !is_alderman_acting)
		.["reason"] = "machine locked"
		return
	var/datum/economic_region/region = GLOB.economic_regions[region_id]
	var/datum/trade_good/tg = GLOB.trade_goods[good_id]
	if(!region || !tg)
		.["reason"] = "unknown region or good"
		return
	quantity = clamp(round(quantity), 1, TRADE_MAX_BULK_UNITS)
	var/daily_pace
	var/used_today
	if(side == "import")
		daily_pace = region.produces[good_id] || 0
		used_today = daily_pace - (region.produces_today[good_id] || 0)
	else
		daily_pace = region.demands[good_id] || 0
		used_today = daily_pace - (region.demands_today[good_id] || 0)
	if(daily_pace <= 0)
		.["reason"] = side == "import" ? "region does not produce this" : "region does not demand this"
		return
	var/starting_index = max(0, used_today)
	// Base portion = units priced inside daily capacity (overshoot = 0).
	// Escalation portion = units priced past capacity.
	var/base_unit_price = side == "import" \
		? SSeconomy.compute_import_unit_price(good_id, region, 1) \
		: SSeconomy.compute_export_unit_price(good_id, region, 1)
	var/base_subtotal = 0
	var/escalation_subtotal = 0
	for(var/i in 1 to quantity)
		var/idx = starting_index + i
		var/unit
		if(side == "import")
			unit = SSeconomy.compute_import_unit_price(good_id, region, idx)
		else
			unit = SSeconomy.compute_export_unit_price(good_id, region, idx)
		if(idx <= daily_pace)
			base_subtotal += unit
		else
			// Per overshoot unit: import surcharge (unit > base) or export shortfall (unit < base).
			// Server ships escalation_subtotal as a positive magnitude; the client adds + or −
			// based on side. total uses the signed delta directly.
			escalation_subtotal += abs(unit - base_unit_price)
			base_subtotal += base_unit_price
	var/total
	if(side == "import")
		total = base_subtotal + escalation_subtotal
	else
		total = base_subtotal - escalation_subtotal
	var/balance = SStreasury.discretionary_fund.balance
	var/can_afford = side == "import" ? (balance >= total) : TRUE
	var/warrant_remaining = -1
	var/warrant_ok = TRUE
	if(is_alderman_acting && SScity_assembly?.current_warrant)
		warrant_remaining = SScity_assembly.current_warrant.trade_remaining
		warrant_ok = SScity_assembly.can_consume_trade(total)
	var/datum/roguestock/stockpile_entry = SSeconomy.find_stockpile_by_trade_good(good_id)
	var/stockpile_amount = stockpile_entry?.stockpile_amount || 0
	. = list(
		"ok" = TRUE,
		"reason" = "",
		"side" = side,
		"region_id" = region_id,
		"good_id" = good_id,
		"region_name" = region.name,
		"good_name" = tg.name,
		"quantity" = quantity,
		"max_units" = TRADE_MAX_BULK_UNITS,
		"daily_pace" = daily_pace,
		"batch_capacity" = region.get_batch_capacity(good_id, side == "import"),
		"capacity_today" = region.get_day_capacity(good_id, side == "import"),
		"capacity_total" = region.get_day_capacity_total(good_id, side == "import"),
		"base_unit_price" = base_unit_price,
		"base_subtotal" = base_subtotal,
		"escalation_subtotal" = escalation_subtotal,
		"total" = total,
		"balance" = balance,
		"balance_after" = side == "import" ? balance - total : balance + total,
		"is_blockaded" = region.is_region_blockaded ? 1 : 0,
		"is_alderman_acting" = is_alderman_acting ? 1 : 0,
		"warrant_remaining" = warrant_remaining,
		"warrant_ok" = warrant_ok ? 1 : 0,
		"can_afford" = can_afford ? 1 : 0,
		"stockpile_amount" = stockpile_amount,
		"stockpile_after" = side == "import" ? stockpile_amount + quantity : max(0, stockpile_amount - quantity),
	)

/obj/structure/roguemachine/steward/proc/handle_trade_import(mob/user, region_id, good_id, quantity)
	if(!user_can_act(user))
		return
	var/is_alderman_acting = alderman_has_access(user)
	if(locked && !is_alderman_acting)
		return
	var/datum/economic_region/region = GLOB.economic_regions[region_id]
	var/datum/trade_good/tg = GLOB.trade_goods[good_id]
	if(!region || !tg)
		return
	quantity = clamp(round(quantity), 1, TRADE_MAX_BULK_UNITS)
	if(quantity < 1)
		return
	var/daily_pace = region.produces[good_id] || 0
	if(daily_pace <= 0)
		to_chat(user, span_warning("[region.name] does not produce [tg.name]."))
		return
	var/produces_today = region.produces_today[good_id] || 0
	var/starting_index = max(0, daily_pace - produces_today)
	var/total = 0
	for(var/i in 1 to quantity)
		total += SSeconomy.compute_import_unit_price(good_id, region, starting_index + i)
	if(is_alderman_acting && !SScity_assembly.can_consume_trade(total))
		to_chat(user, span_warning("Your warrant cannot cover this trade. Remaining: [SScity_assembly.current_warrant.trade_remaining]m."))
		return
	var/spent = SSeconomy.manual_import(user, region_id, good_id, quantity)
	if(spent > 0)
		if(is_alderman_acting)
			SScity_assembly.consume_trade(spent, user, "import [quantity] [tg.name] from [region.name]")
		say("[SSmapping.map_adjustment.realm_name] imports [quantity] [tg.name] from [region.name] for [spent] mammon.")
		playsound(src, 'sound/misc/coininsert.ogg', 100, FALSE, -1)
	SStgui.update_uis(src)

/obj/structure/roguemachine/steward/proc/handle_trade_export(mob/user, region_id, good_id, quantity)
	if(!user_can_act(user))
		return
	var/is_alderman_acting = alderman_has_access(user)
	if(locked && !is_alderman_acting)
		return
	var/datum/economic_region/region = GLOB.economic_regions[region_id]
	var/datum/trade_good/tg = GLOB.trade_goods[good_id]
	if(!region || !tg)
		return
	quantity = clamp(round(quantity), 1, TRADE_MAX_BULK_UNITS)
	if(quantity < 1)
		return
	var/daily_pace = region.demands[good_id] || 0
	if(daily_pace <= 0)
		to_chat(user, span_warning("[region.name] does not demand [tg.name]."))
		return
	var/datum/roguestock/entry = SSeconomy.find_stockpile_by_trade_good(good_id)
	if(!entry || entry.stockpile_amount < quantity)
		to_chat(user, span_warning("Insufficient [tg.name] in stockpile: have [entry?.stockpile_amount || 0], need [quantity]."))
		return
	var/demands_today = region.demands_today[good_id] || 0
	var/starting_index = max(0, daily_pace - demands_today)
	var/total = 0
	for(var/i in 1 to quantity)
		total += SSeconomy.compute_export_unit_price(good_id, region, starting_index + i)
	if(is_alderman_acting && !SScity_assembly.can_consume_trade(total))
		to_chat(user, span_warning("Your warrant cannot cover this trade. Remaining: [SScity_assembly.current_warrant.trade_remaining]m."))
		return
	var/gained = SSeconomy.manual_export(user, region_id, good_id, quantity)
	if(gained > 0)
		if(is_alderman_acting)
			SScity_assembly.consume_trade(gained, user, "export [quantity] [tg.name] to [region.name]")
		say("[SSmapping.map_adjustment.realm_name] exports [quantity] [tg.name] to [region.name] for [gained] mammon.")
		playsound(src, 'sound/misc/coindispense.ogg', 60, FALSE, -1)
	SStgui.update_uis(src)

/obj/structure/roguemachine/steward/proc/handle_trade_region_import(mob/user, region_id)
	if(!user_can_act(user))
		return
	if(locked && !alderman_has_access(user))
		return
	var/datum/economic_region/region = GLOB.economic_regions[region_id]
	if(!region)
		return
	var/list/options = list()
	for(var/good_id in region.produces)
		var/datum/trade_good/tg = GLOB.trade_goods[good_id]
		if(!tg || !tg.importable)
			continue
		options["[tg.name]"] = good_id
	if(!length(options))
		to_chat(user, span_warning("[region.name] has no importable goods."))
		return
	var/pick_name = input(user, "Import what from [region.name]?", src) as null|anything in options
	if(!pick_name)
		return
	var/good_id = options[pick_name]
	var/datum/trade_good/tg = GLOB.trade_goods[good_id]
	var/quantity = input(user, "How many [tg.name] to import from [region.name]? (max [TRADE_MAX_BULK_UNITS])", src, 1) as null|num
	if(!quantity || quantity < 1)
		return
	handle_trade_import(user, region_id, good_id, quantity)

/obj/structure/roguemachine/steward/proc/handle_trade_region_export(mob/user, region_id)
	if(!user_can_act(user))
		return
	if(locked && !alderman_has_access(user))
		return
	var/datum/economic_region/region = GLOB.economic_regions[region_id]
	if(!region)
		return
	var/list/options = list()
	for(var/good_id in region.demands)
		var/datum/trade_good/tg = GLOB.trade_goods[good_id]
		if(!tg)
			continue
		options["[tg.name]"] = good_id
	if(!length(options))
		to_chat(user, span_warning("[region.name] has no demanded goods."))
		return
	var/pick_name = input(user, "Export what to [region.name]?", src) as null|anything in options
	if(!pick_name)
		return
	var/good_id = options[pick_name]
	var/datum/trade_good/tg = GLOB.trade_goods[good_id]
	var/quantity = input(user, "How many [tg.name] to export to [region.name]? (max [TRADE_MAX_BULK_UNITS])", src, 1) as null|num
	if(!quantity || quantity < 1)
		return
	handle_trade_export(user, region_id, good_id, quantity)

/obj/structure/roguemachine/steward/proc/do_import(datum/crown_import/D, number)
	if(!D)
		return
	D = new D
	if(number > D.import_amt)
		return

	if(!number)
		number = 1
	var/area/A = GLOB.areas_by_type[/area/rogue/indoors/town/warehouse]
	if(!A)
		return
	var/obj/item/I = new D.item_type()
	var/list/turfs = list()
	for(var/turf/T in A)
		turfs += T
	var/turf/T = pick(turfs)
	I.forceMove(T)
	playsound(T, 'sound/misc/hiss.ogg', 100, FALSE, -1)
	number += 1

	addtimer(CALLBACK(src, PROC_REF(do_import), D.type, number), 3 SECONDS)

/obj/structure/roguemachine/steward/attack_hand(mob/living/user)
	. = ..()
	if(.)
		return
	if(locked && alderman_has_access(user))
		open_trade_tgui(user)
		return
	if(locked)
		to_chat(user, span_warning("It's locked. Of course."))
		return
	user.changeNext_move(CLICK_CD_INTENTCAP)
	playsound(loc, 'sound/misc/keyboard_enter.ogg', 100, FALSE, -1)
	var/canread = user.can_read(src, TRUE)
	var/contents = "<div class='service-ledger'><div class='service-header'><h1>Nerve Master</h1><span>Treasury: [SStreasury.discretionary_fund.balance]m</span></div>"
	var/list/tabs = list("Main" = TAB_MAIN, "Bank" = TAB_BANK, "Imports" = TAB_IMPORT, "Daily Payments" = TAB_PAYDAY, "Fiscal Ledger" = TAB_FISCAL, "Debts & Arrears" = TAB_DEBT, "Salt Mine Report" = TAB_SALTMINE)
	contents += "<nav class='service-nav' aria-label='Nerve Master sections'>"
	for(var/tab_name in tabs)
		var/tab_id = tabs[tab_name]
		contents += "<a href='?src=\ref[src];switchtab=[tab_id]'[current_tab == tab_id ? " aria-current='page'" : ""]>[html_encode(tab_name)]</a>"
	contents += "</nav><div class='service-section'>"
	switch(current_tab)
		if(TAB_MAIN)
			contents += "<h2>Stewardry</h2><div class='service-actions'><a href='?src=\ref[src];trade_tgui=1'>Trade &amp; Stockpile</a>"
			contents += "<a href='?src=\ref[src];printresidency=1'>Print Letter of Citizenry</a>"
			contents += "<a href='?src=\ref[src];setpurchasefloor=1'>Purchase Floor: [SStreasury.stockpile_purchase_floor]m</a></div>"
		if(TAB_BANK)
			contents += "<h2>Bank</h2><div class='service-actions'><a href='?src=\ref[src];compact=1' aria-pressed='[compact ? "true" : "false"]'>Compact: [compact ? "Enabled" : "Disabled"]</a><a href='?src=\ref[src];payroll=1'>Pay by Class</a></div>"
			// Keep debtors and accounts in arrears ahead of the remaining accounts.
			var/list/priority_accounts = list()
			var/list/normal_accounts = list()
			for(var/mob/living/carbon/human/A in SStreasury.bank_accounts)
				var/owed = SStreasury.poll_tax_owed[A] || 0
				if(HAS_TRAIT(A, TRAIT_DEBTOR) || owed > 0)
					priority_accounts += A
				else
					normal_accounts += A
			var/show_fiscal_actions = has_fiscal_authority(user)
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Account</th><th scope='col' class='service-number'>Balance</th><th scope='col'>Actions</th></tr></thead><tbody>"
			for(var/mob/living/carbon/human/A in priority_accounts + normal_accounts)
				var/balance = SStreasury.get_balance(A)
				var/max_fine = SStreasury.get_max_fine_for(A)
				var/datum/fund/A_account = SStreasury.bank_accounts[A]
				var/A_suspended = A_account?.wages_suspended ? TRUE : FALSE
				var/wage_label = A_suspended ? (compact ? "Unsuspend" : "Unsuspend Wages") : (compact ? "Suspend" : "Suspend Wages")
				var/fine_label = compact ? "Fine" : "Fine Account"
				fine_label += max_fine > 0 ? " (Max [max_fine]m)" : " (exempt)"
				var/poll_owed = SStreasury.poll_tax_owed[A] || 0
				var/overdue_days = SStreasury.poll_tax_debt_days[A] || 0
				contents += "<tr><td>[html_encode(A.real_name)]<div class='service-muted'>[html_encode(job_filter(A.advjob, A.job, compact))]</div>"
				if(HAS_TRAIT(A, TRAIT_DEBTOR))
					contents += "<div class='service-warning'>Debtor[poll_owed > 0 ? ", owes [poll_owed]m" : ""]</div>"
				else if(poll_owed > 0)
					contents += "<div class='service-warning'>Arrears: [poll_owed]m, [overdue_days] day[overdue_days == 1 ? "" : "s"]</div>"
				contents += "</td><td class='service-number'>[balance]m</td><td class='service-actions'><a href='?src=\ref[src];givemoney=\ref[A]'>[compact ? "Pay" : "Give Money"]</a>"
				if(show_fiscal_actions)
					contents += "<a href='?src=\ref[src];fineaccount=\ref[A]'>[html_encode(fine_label)]</a><a href='?src=\ref[src];togglewages=\ref[A]'>[html_encode(wage_label)]</a>"
				contents += "</td></tr>"
			if(!length(priority_accounts) && !length(normal_accounts))
				contents += "<tr><td colspan='3' class='service-empty'>No bank accounts.</td></tr>"
			contents += "</tbody></table></div>"
		if(TAB_IMPORT)
			contents += "<h2>Imports</h2><div class='service-actions'><a href='?src=\ref[src];compact=1' aria-pressed='[compact ? "true" : "false"]'>Compact: [compact ? "Enabled" : "Disabled"]</a></div>"
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Goods</th><th scope='col' class='service-number'>Cost</th><th scope='col'>Order</th></tr></thead><tbody>"
			for(var/datum/crown_import/A in GLOB.crown_imports)
				contents += "<tr><td>[html_encode(A.name)]"
				if(!compact)
					contents += "<div class='service-muted'>[html_encode(A.desc)]</div>"
				if(A.is_blockaded())
					contents += "<div class='service-warning'>[compact ? "Blockaded" : "Blockaded - 2x cost"]</div>"
				contents += "</td><td class='service-number'>[A.get_import_price()]m</td><td class='service-actions'><a href='?src=\ref[src];import=\ref[A]'>Import [A.import_amt]</a></td></tr>"
			if(!length(GLOB.crown_imports))
				contents += "<tr><td colspan='3' class='service-empty'>No imports available.</td></tr>"
			contents += "</tbody></table></div>"
		if(TAB_DEBT)
			contents += "<h2>Debts &amp; Arrears</h2>"
			var/crown_loans = 0
			var/crown_loan_content = ""
			for(var/datum/loan/L in SStreasury.loans)
				if(L.source_fund != SStreasury.discretionary_fund)
					continue
				crown_loans++
				crown_loan_content += "<tr><td[L.defaulted ? " class='service-warning'" : ""]>[html_encode(L.format())]</td></tr>"
			contents += "<h3>Active Crown Loans ([crown_loans])</h3>"
			if(crown_loans)
				contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Loan</th></tr></thead><tbody>[crown_loan_content]</tbody></table></div>"
			else
				contents += "<p class='service-empty'>No active loans.</p>"
			var/list/debt_rows = list()
			for(var/mob/living/carbon/human/A in SStreasury.bank_accounts)
				var/poll_owed = SStreasury.poll_tax_owed[A] || 0
				if(poll_owed > 0 || HAS_TRAIT(A, TRAIT_DEBTOR))
					debt_rows += A
			contents += "<h3>Poll Tax Debtors / Arrears ([length(debt_rows)])</h3>"
			if(length(debt_rows))
				contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Account</th><th scope='col'>Obligation</th><th scope='col' class='service-number'>Balance</th></tr></thead><tbody>"
				for(var/mob/living/carbon/human/A in debt_rows)
					var/poll_owed = SStreasury.poll_tax_owed[A] || 0
					var/overdue_days = SStreasury.poll_tax_debt_days[A] || 0
					var/balance = SStreasury.get_balance(A)
					contents += "<tr><td>[html_encode(A.real_name)]</td><td class='service-warning'>"
					if(HAS_TRAIT(A, TRAIT_DEBTOR_CROWN))
						contents += "Debtor[poll_owed > 0 ? ", owes [poll_owed]m" : ""]"
					else
						contents += "Arrears: [poll_owed]m, [overdue_days] day[overdue_days == 1 ? "" : "s"]"
					contents += "</td><td class='service-number'>[balance]m</td></tr>"
				contents += "</tbody></table></div>"
			else
				contents += "<p class='service-empty'>No poll tax arrears.</p>"
			contents += "<div class='service-actions'><a href='?src=\ref[src];clearloandebtor=1'>Clear Defaulter Mark</a></div><p class='service-muted'>Forgives outstanding loans entirely and lifts the defaulter mark.</p>"
			contents += "<div class='service-actions'><a href='?src=\ref[src];clearpolltax=1'>Clear Poll Tax Obligation</a></div><p class='service-muted'>Wipes a subject's poll tax arrears.</p>"
		if(TAB_FISCAL)
			var/list/snap = SStreasury.compute_fiscal_snapshot()
			var/list/charters = SStreasury.compute_charter_states()
			contents += "<h2>Fiscal Ledger</h2><p class='service-summary'>Day [GLOB.dayspassed]</p>"

			// Balances (two-column)
			contents += "<h3>Balances</h3>"
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th></tr></thead><tbody>"
			contents += "<tr><td>Crown's Purse</td><td class='service-number'>[snap["discretionary"]]m</td>"
			contents += "<td>Burgher Pledge</td><td class='service-number'>[snap["burgher_pledge"]]m</td></tr>"
			contents += "<tr><td>Total Bank Coin</td><td class='service-number'>[snap["total_bank"]]m</td>"
			contents += "<td>Held Accounts</td><td class='service-number'>[snap["held_accounts"]]</td></tr>"
			contents += "<tr><td>Average Balance</td><td class='service-number'>[snap["avg_balance"]]m</td>"
			contents += "<td>Under 50m</td><td class='service-number'>[snap["under_50m"]]</td></tr>"
			contents += "</tbody></table></div>"

			// Revenue (two-column) - only mammon that lands in Crown's Purse
			contents += "<h3>Crown Revenue This Week</h3>"
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th></tr></thead><tbody>"
			contents += "<tr><td>Rural Tax</td><td class='service-number'>[SStreasury.total_rural_tax]m</td>"
			contents += "<td>Fines</td><td class='service-number'>[GLOB.azure_round_stats[STATS_FINES_INCOME]]m</td></tr>"
			contents += "<tr><td>Poll Tax</td><td class='service-number'>[GLOB.azure_round_stats[STATS_POLL_TAX_COLLECTED]]m</td>"
			contents += "<td>Deposit Tax</td><td class='service-number'>[SStreasury.total_deposit_tax]m</td></tr>"
			contents += "<tr><td>Contract Levy</td><td class='service-number'>[GLOB.azure_round_stats[STATS_REVENUE_CONTRACT_LEVY]]m</td>"
			contents += "<td>Headeater Levy</td><td class='service-number'>[GLOB.azure_round_stats[STATS_REVENUE_HEADEATER_LEVY]]m</td></tr>"
			contents += "<tr><td>Import Tariff</td><td class='service-number'>[GLOB.azure_round_stats[STATS_REVENUE_IMPORT_TARIFF]]m</td>"
			contents += "<td>Export Duty</td><td class='service-number'>[GLOB.azure_round_stats[STATS_REVENUE_EXPORT_DUTY]]m</td></tr>"
			contents += "<tr><td>Recovered Spoils</td><td class='service-number'>[GLOB.azure_round_stats[STATS_REVENUE_RECOVERED_SPOILS] || 0]m</td>"
			contents += "<td></td><td></td></tr>"
			contents += "</tbody></table></div>"

			// Forgone revenue
			var/exempt_contract = GLOB.azure_round_stats[STATS_EXEMPTED_CONTRACT_LEVY]
			var/exempt_headeater = GLOB.azure_round_stats[STATS_EXEMPTED_HEADEATER_LEVY]
			var/exempt_import = GLOB.azure_round_stats[STATS_EXEMPTED_IMPORT_TARIFF]
			var/exempt_export = GLOB.azure_round_stats[STATS_EXEMPTED_EXPORT_DUTY]
			var/exempt_fine = GLOB.azure_round_stats[STATS_EXEMPTED_FINE]
			var/exempt_poll = GLOB.azure_round_stats[STATS_EXEMPTED_POLL_TAX]
			var/exempt_total = exempt_contract + exempt_headeater + exempt_import + exempt_export + exempt_fine + exempt_poll
			contents += "<h3>Forgone Revenue (tax exempted)</h3>"
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th></tr></thead><tbody>"
			contents += "<tr><td>Contract Levy</td><td class='service-number'>[exempt_contract]m</td>"
			contents += "<td>Headeater Levy</td><td class='service-number'>[exempt_headeater]m</td></tr>"
			contents += "<tr><td>Import Tariff</td><td class='service-number'>[exempt_import]m</td>"
			contents += "<td>Export Duty</td><td class='service-number'>[exempt_export]m</td></tr>"
			contents += "<tr><td>Fines Waived</td><td class='service-number'>[exempt_fine]m</td>"
			contents += "<td>Poll Tax</td><td class='service-number'>[exempt_poll]m</td></tr>"
			contents += "<tr><td><b>Total Forgone</b></td><td class='service-number'><b>[exempt_total]m</b></td>"
			contents += "<td></td><td></td></tr>"
			contents += "</tbody></table></div>"
			contents += "<p class='service-muted'>Charter exemptions, levy-exempt stamps, and rate-cap gaps. Mammon the Crown would have collected had no exemption applied.</p>"

			// Trade
			contents += "<h3>Trade</h3>"
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th></tr></thead><tbody>"
			contents += "<tr><td>Stockpile Exports</td><td class='service-number'>[SStreasury.total_export]m</td>"
			contents += "<td>Stockpile Imports</td><td class='service-number'>-[SStreasury.total_import]m</td></tr>"
			var/trade_bal = SStreasury.total_export - SStreasury.total_import
			contents += "<tr><td>Trade Balance</td><td class='service-number'>[trade_bal]m</td>"
			contents += "<td>Economic Output</td><td class='service-number'>[SStreasury.economic_output]m</td></tr>"
			contents += "</tbody></table></div>"

			// Expenses
			contents += "<h3>Expenses This Week</h3>"
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th></tr></thead><tbody>"
			contents += "<tr><td>Wages Paid</td><td class='service-number'>-[GLOB.azure_round_stats[STATS_WAGES_PAID]]m</td>"
			contents += "<td>Treasury Transfers</td><td class='service-number'>-[GLOB.azure_round_stats[STATS_DIRECT_TREASURY_TRANSFERS]]m</td></tr>"
			contents += "<tr><td>Stockpile Imports <span class='service-muted'><i>(see Trade)</i></span></td><td class='service-number'>-[SStreasury.total_import]m</td>"
			contents += "<td></td><td></td></tr>"
			contents += "</tbody></table></div>"

			// Tax Rates (two columns: rate name | percentage)
			contents += "<h3>Tax Rates</h3>"
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th></tr></thead><tbody>"
			var/list/rate_entries = list()
			for(var/cat in SStreasury.tax_rates)
				if(cat == TAX_CATEGORY_FINE)
					continue
				rate_entries += "<td>[html_encode(SStreasury.get_tax_category_pretty_name(cat))]</td><td class='service-number'>[round(SStreasury.tax_rates[cat] * 100)]%</td>"
			for(var/i = 1, i <= length(rate_entries), i += 2)
				contents += "<tr>"
				contents += rate_entries[i]
				if(i + 1 <= length(rate_entries))
					contents += rate_entries[i + 1]
				else
					contents += "<td></td><td></td>"
				contents += "</tr>"
			contents += "</tbody></table></div>"

			// Poll Tax Rates (two columns: category | m/day)
			contents += "<h3>Poll Tax Rates (daily)</h3>"
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th></tr></thead><tbody>"
			var/datum/decree/golden = SStreasury.get_decree(DECREE_GOLDEN_BULL)
			var/golden_active = golden?.active
			var/datum/decree/covenant = SStreasury.get_decree(DECREE_NOC_PESTRA_COVENANT)
			var/covenant_active = covenant?.active
			var/datum/decree/merc_charter = SStreasury.get_decree(DECREE_GUILD_CHARTER_OF_ARMS)
			var/merc_charter_active = merc_charter?.active
			var/list/poll_entries = list()
			for(var/pcat in SStreasury.poll_tax_rates)
				var/rate = SStreasury.poll_tax_rates[pcat]
				var/pretty = SStreasury.get_poll_tax_category_pretty_name(pcat)
				var/rate_display = "[rate]m"
				if(pcat == POLL_TAX_CAT_BURGHER && golden_active && rate > GOLDEN_BULL_POLL_CAP)
					rate_display = "[GOLDEN_BULL_POLL_CAP]m (raw [rate]m, capped)"
				else if(pcat == POLL_TAX_CAT_MERCENARY && merc_charter_active && rate > GUILD_CHARTER_OF_ARMS_POLL_CAP)
					rate_display = "[GUILD_CHARTER_OF_ARMS_POLL_CAP]m (raw [rate]m, capped)"
				poll_entries += "<td>[html_encode(pretty)]</td><td class='service-number'>[rate_display]</td>"
			for(var/i = 1, i <= length(poll_entries), i += 2)
				contents += "<tr>"
				contents += poll_entries[i]
				if(i + 1 <= length(poll_entries))
					contents += poll_entries[i + 1]
				else
					contents += "<td></td><td></td>"
				contents += "</tr>"
			contents += "</tbody></table></div>"
			if(covenant_active)
				contents += "<i class='service-warning'>Covenant of Noc &amp; Pestra in force: University and Apothecary pay no more than [NOC_PESTRA_POLL_CAP]m/day regardless of category rate.</i><br>"

			// Charters (two-column)
			contents += "<h3>Charters</h3>"
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th></tr></thead><tbody>"
			var/list/charter_rows = list()
			for(var/entry in charters)
				var/cooldown_left = entry["cooldown_remaining"]
				var/cd_text = cooldown_left > 0 ? " <i>(cd: [round(cooldown_left / 600, 0.1)]m)</i>" : ""
				var/status_text = entry["active"] ? "ACTIVE" : "SUSPENDED"
				charter_rows += "<td>[html_encode(entry["name"])]</td><td class='service-number'>[status_text][cd_text]</td>"
			for(var/i = 1, i <= length(charter_rows), i += 2)
				contents += "<tr>"
				contents += charter_rows[i]
				if(i + 1 <= length(charter_rows))
					contents += charter_rows[i + 1]
				else
					contents += "<td></td><td></td>"
				contents += "</tr>"
			contents += "</tbody></table></div>"

			// Debt and loans
			contents += "<h3>Debt &amp; Loans</h3>"
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th><th scope='col'>Entry</th><th scope='col' class='service-number'>Value</th></tr></thead><tbody>"
			contents += "<tr><td>Accounts in Arrears</td><td class='service-number'>[snap["in_arrears"]]</td>"
			contents += "<td>Accounts in Advance</td><td class='service-number'>[snap["in_advance"]]</td></tr>"
			contents += "<tr><td>Default Debtors</td><td class='service-number'>[snap["debtor_count"]]</td>"
			contents += "<td>Loans Outstanding</td><td class='service-number'>[snap["loans_outstanding"]] ([snap["loan_exposure"]]m)</td></tr>"
			contents += "</tbody></table></div>"

			// Contracts (three-column: Issued / Taken / Completed, by issuing authority)
			contents += "<h3>Contracts This Week</h3>"
			contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Authority</th><th scope='col' class='service-number'>Issued</th><th scope='col' class='service-number'>Taken</th><th scope='col' class='service-number'>Completed</th></tr></thead><tbody>"
			contents += "<tr><td>Guild</td>"
			contents += "<td class='service-number'>[GLOB.azure_round_stats[STATS_CONTRACTS_GENERATED_POOL]]</td>"
			contents += "<td class='service-number'>[GLOB.azure_round_stats[STATS_CONTRACTS_TAKEN_POOL]]</td>"
			contents += "<td class='service-number'>[GLOB.azure_round_stats[STATS_CONTRACTS_COMPLETED_POOL]]</td></tr>"
			contents += "<tr><td>Tavern</td>"
			contents += "<td class='service-number'>[GLOB.azure_round_stats[STATS_CONTRACTS_GENERATED_RUMOR]]</td>"
			contents += "<td class='service-number'>[GLOB.azure_round_stats[STATS_CONTRACTS_TAKEN_RUMOR]]</td>"
			contents += "<td class='service-number'>[GLOB.azure_round_stats[STATS_CONTRACTS_COMPLETED_RUMOR]]</td></tr>"
			contents += "<tr><td>Crown</td>"
			contents += "<td class='service-number'>[GLOB.azure_round_stats[STATS_CONTRACTS_GENERATED_DEFENSE]]</td>"
			contents += "<td class='service-number'>[GLOB.azure_round_stats[STATS_CONTRACTS_TAKEN_DEFENSE]]</td>"
			contents += "<td class='service-number'>[GLOB.azure_round_stats[STATS_CONTRACTS_COMPLETED_DEFENSE]]</td></tr>"
			contents += "<tr><td><b>Total</b></td>"
			contents += "<td class='service-number'><b>[GLOB.azure_round_stats[STATS_CONTRACTS_GENERATED]]</b></td>"
			contents += "<td class='service-number'><b>[GLOB.azure_round_stats[STATS_CONTRACTS_TAKEN]]</b></td>"
			contents += "<td class='service-number'><b>[GLOB.azure_round_stats[STATS_CONTRACTS_COMPLETED]]</b></td></tr>"
			contents += "</tbody></table></div>"
		if(TAB_PAYDAY)
			contents += "<h2>Daily Payments</h2><div class='service-actions'><a href='?src=\ref[src];setdailypay=1'>Add/Modify Job Payment</a></div>"
			if(daily_payments.len)
				var/list/paid_counts = list()
				for(var/mob/living/owner as anything in SStreasury.bank_accounts)
					if(!owner || !daily_payments[owner.job])
						continue
					var/datum/fund/account = SStreasury.bank_accounts[owner]
					if(!account || account.wages_suspended)
						continue
					paid_counts[owner.job] = (paid_counts[owner.job] || 0) + 1
				contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Job</th><th scope='col' class='service-number'>Daily Pay</th><th scope='col' class='service-number'>Paid Accounts</th><th scope='col' class='service-number'>Daily Total</th><th scope='col'>Action</th></tr></thead><tbody>"
				for(var/job_name in daily_payments)
					var/amt = daily_payments[job_name]
					var/count = paid_counts[job_name] || 0
					contents += "<tr><td>[html_encode(job_name)]</td><td class='service-number'>[amt]m</td><td class='service-number'>[count]</td><td class='service-number'>[amt * count]m</td><td class='service-actions'><a href='?src=\ref[src];removedailypay=[url_encode(job_name)]'>Remove</a></td></tr>"
				contents += "</tbody></table></div>"
			else
				contents += "<p class='service-empty'>No daily payments configured.</p>"
		if(TAB_SALTMINE)
			var/obj/structure/roguemachine/stockpile_saltcamp/stockpile = null
			stockpile = locate(/obj/structure/roguemachine/stockpile_saltcamp) in GLOB.saltminestockpilemachines // There is only one salt mine stockpile.
			contents += "<h2>Die Troyt Salt Mine Report</h2>"
			if(!isnull(stockpile))
				var/gambled_salt = round(stockpile.salt_spent_on_gambling, 1)
				var/total_accounts = length(stockpile.salt_accounts)
				contents += "<p class='service-summary'>Total Salt Gambled: [gambled_salt] piles of salt</p>"
				contents += "<div class='service-scroll' tabindex='0' aria-label='Ledger entries'><table class='service-table'><thead><tr><th scope='col'>Prisoner Name</th><th scope='col' class='service-number'>Salt Mined</th><th scope='col' class='service-number'>Maximum Interest</th></tr></thead><tbody>"
				var/visible_accounts = 0
				for(var/i = 1; i <= total_accounts; i++)
					var/name = stockpile.salt_accounts[i]
					var/salt = stockpile.salt_accounts[name]
					var/salt_max = stockpile.salt_accounts_max[name]
					var/interest = stockpile.salt_accounts_interest_max[name] * 100
					if(salt == 0 && stockpile.salt_ticket_win[name] > 0) // Hide ticket winners who have left the mines.
						continue
					visible_accounts++
					contents += "<tr><td>[html_encode(name)]</td><td class='service-number'>[salt] salt / [salt_max] max</td><td class='service-number'>[interest]%</td></tr>"
				if(!visible_accounts)
					contents += "<tr><td colspan='3' class='service-empty'>No current prisoner accounts.</td></tr>"
				contents += "</tbody></table></div>"
			else
				contents += "<p class='service-empty'>Salt mine report unavailable.</p>"
	contents += "</div></div>"
	if(!canread)
		contents = stars(contents)
	var/datum/browser/popup = new(user, "VENDORTHING", "", 700, 800)
	popup.add_stylesheet("service_ledger", 'html/browser/service_ledger.css')
	var/datum/asset/simple/roguefonts/service_fonts = get_asset_datum(/datum/asset/simple/roguefonts)
	var/list/font_urls = service_fonts.get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Service Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Service Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Service Lora'; font-style: italic; src: url('[font_urls["lora-italic.ttf"]]'); } @font-face { font-family: 'Service Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Service Rocker'; src: url('[font_urls["newrocker.ttf"]]'); }</style>")
	popup.set_content(contents)
	popup.open()

/obj/structure/roguemachine/steward/proc/job_filter(advj, j, compact = FALSE)
	if(advj in excluded_jobs)
		return "Adventurer"
	if(j in excluded_jobs)
		return "Adventurer"
	if(compact && j)
		return j
	else if(!compact && advj && j)
		return "[j] ([advj])"
	else if(j)
		return j
	else if(advj)
		return advj

#undef TAB_MAIN
#undef TAB_BANK
#undef TAB_IMPORT
#undef TAB_DEBT
#undef TAB_PAYDAY
#undef TAB_SALTMINE
#undef TAB_FISCAL
// Item 6 (decrees): bump configured wages up to any active charter's mandated floor, and
// ensure floored jobs missing from the payments list get an entry at the floor.
/obj/structure/roguemachine/steward/proc/enforce_wage_floors()
	for(var/job in daily_payments)
		var/floor = SStreasury.get_wage_floor(job)
		if(floor > 0 && (daily_payments[job] || 0) < floor)
			daily_payments[job] = floor
	for(var/job in SStreasury.enumerate_wage_floored_jobs())
		if(isnull(daily_payments[job]))
			daily_payments[job] = SStreasury.get_wage_floor(job)
