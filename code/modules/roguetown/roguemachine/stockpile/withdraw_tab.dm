//Exploit prevention, predominantly. Still able to be got around, technically, but this is a bit more difficult to do so.
/obj/item
	var/stockpile_withdrawn = FALSE

/datum/withdraw_tab
	var/budget = 0
	var/compact = TRUE
	var/current_category = "Raw Materials"
	var/list/categories = list("Raw Materials", "Refined", "Alchemy", "Fruit", "Vegetable", "Animal", "Seafood")
	var/obj/structure/roguemachine/parent_structure = null

/datum/withdraw_tab/New(obj/structure/roguemachine/structure_param)
	. = ..()
	parent_structure = structure_param

/datum/withdraw_tab/proc/insert_coins(obj/item/roguecoin/C)
	budget += C.get_real_price()
	qdel(C)
	parent_structure.update_icon()
	playsound(parent_structure.loc, 'sound/misc/coininsert.ogg', 100, TRUE, -1)

/datum/withdraw_tab/proc/get_direct_import_quote(datum/roguestock/D)
	if(!D || !D.trade_good_id)
		return null
	var/list/best = SSeconomy.get_best_import_region(D.trade_good_id)
	if(!best || !best["region_id"])
		return null
	var/datum/economic_region/region = GLOB.economic_regions[best["region_id"]]
	if(!region)
		return null
	var/daily_pace = region.produces[D.trade_good_id] || 0
	var/produces_today = region.produces_today[D.trade_good_id] || 0
	if(daily_pace <= 0 || produces_today <= 0)
		return null
	var/starting_index = max(0, daily_pace - produces_today)
	var/unit_cost = SSeconomy.compute_import_unit_price(D.trade_good_id, region, starting_index + 1)
	var/margin = (SStreasury.royal_custom_active && SStreasury.royal_custom_unlocked) ? SStreasury.royal_custom_margin : ROYAL_CUSTOM_DEFAULT_MARGIN
	var/price = max(1, round(unit_cost * (100 + margin) / 100))
	return list("region" = region, "unit_cost" = unit_cost, "price" = price)

/datum/withdraw_tab/proc/direct_import_price(datum/roguestock/D)
	var/list/quote = get_direct_import_quote(D)
	return quote ? quote["price"] : 0

/// Both stock interfaces share live rows; event metadata is indexed once per refresh.
/datum/withdraw_tab/proc/get_stock_rows(include_export_prices = FALSE)
	var/list/event_labels = list()
	var/list/shortages = list()
	for(var/datum/economic_event/event as anything in GLOB.active_economic_events)
		var/label
		switch(event.event_type)
			if(ECON_EVENT_SHORTAGE)
				label = "SHORTAGE"
			if(ECON_EVENT_OVERSUPPLY)
				label = "GLUT"
			else
				continue
		var/list/shortage
		if(event.event_type == ECON_EVENT_SHORTAGE)
			var/list/good_names = list()
			for(var/good_id in event.affected_goods)
				var/datum/trade_good/good = GLOB.trade_goods[good_id]
				good_names += (good && good.name) ? good.name : good_id
			shortage = list("progress" = event.saturation_progress, "target" = event.saturation_target, "affected" = good_names.Join(", "))
		for(var/good_id in event.affected_goods)
			if(!event_labels[good_id])
				event_labels[good_id] = label
			// A preceding glut sets the label, but does not hide a later shortage's progress.
			if(shortage && !shortages[good_id])
				shortages[good_id] = shortage
	var/list/rows = list()
	for(var/datum/roguestock/stockpile/stock in SStreasury.stockpile_datums)
		stock.refresh_auto_price()
		var/list/shortage = stock.trade_good_id ? shortages[stock.trade_good_id] : null
		var/export_unit_price = 0
		if(include_export_prices && stock.importexport_amt > 0)
			export_unit_price = round(stock.get_export_price() / stock.importexport_amt)
		rows += list(list(
			"ref" = REF(stock),
			"name" = stock.name,
			"desc" = stock.desc,
			"category" = stock.category,
			"amount" = stock.stockpile_amount,
			"limit" = stock.stockpile_limit,
			"withdraw_price" = stock.withdraw_price,
			"deposit_price" = stock.payout_price,
			"export_price" = export_unit_price,
			"import_price" = direct_import_price(stock),
			"withdraw_disabled" = stock.withdraw_disabled ? TRUE : FALSE,
			"accept_enabled" = stock.accept_toggle_enabled ? TRUE : FALSE,
			"event_tag" = stock.trade_good_id ? (event_labels[stock.trade_good_id] || "") : "",
			"shortage_progress" = shortage ? shortage["progress"] : 0,
			"shortage_target" = shortage ? shortage["target"] : 0,
			"shortage_affected" = shortage ? shortage["affected"] : "",
		))
	return rows

/datum/withdraw_tab/proc/do_withdraw(datum/roguestock/D, mob/user)
	if(!D || !parent_structure)
		return FALSE
	if(get_dist(parent_structure, user) > 1)
		return FALSE
	D.refresh_auto_price()
	var/total_price = D.withdraw_price
	if(D.withdraw_disabled && !has_fiscal_authority(user))
		parent_structure.say("Not available.")
		return FALSE
	if(D.stockpile_amount <= 0)
		parent_structure.say("Insufficient stock.")
		return FALSE
	var/food_stipend = ishuman(user) && HAS_TRAIT(user, TRAIT_ROYAL_SUBSIDY)
	if(!food_stipend && total_price > budget)
		parent_structure.say("Insufficient mammon.")
		return FALSE
	D.stockpile_amount--
	SStreasury.dirty_market_view()
	if(!food_stipend)
		budget -= total_price
		SStreasury.mint(SStreasury.discretionary_fund, total_price, "Stockpile Withdraw")
		record_round_statistic(STATS_STOCKPILE_REVENUE, total_price)
	else
		var/actor_suffix = user ? " by [user.real_name]" : ""
		SStreasury.log_fund_entry(new /datum/treasury_entry(null, SStreasury.discretionary_fund, SStreasury.discretionary_fund, 0, "Subsidy Withdraw: [D.name][actor_suffix]"))
	var/obj/item/I = new D.item_type(parent_structure.loc)
	I.stockpile_withdrawn = TRUE
	if(ishuman(user) && is_community_contribution_eligible(user))
		var/mob/living/carbon/human/HC = user
		HC.mind?.sleep_adv?.remove_community_contribution(1)
	if(food_stipend)
		to_chat(user, span_info("[parent_structure] chitters and squeaks into the treasury ratlines."))
	if(!user.put_in_hands(I))
		I.forceMove(get_turf(user))
	playsound(parent_structure.loc, 'sound/misc/hiss.ogg', 100, FALSE, -1)
	return TRUE

/datum/withdraw_tab/proc/do_direct_import(datum/roguestock/D, mob/user)
	if(!D || !ishuman(user) || !parent_structure)
		return FALSE
	if(D.withdraw_disabled && !has_fiscal_authority(user))
		parent_structure.say("Not available.")
		return FALSE
	if(!D.trade_good_id)
		parent_structure.say("Not available.")
		return FALSE
	var/list/quote = get_direct_import_quote(D)
	if(!quote)
		parent_structure.say("No region currently supplies [D.name].")
		return FALSE
	var/datum/economic_region/region = quote["region"]
	var/unit_cost = quote["unit_cost"]
	var/price = quote["price"]
	var/surcharge = max(0, price - unit_cost)
	var/food_stipend = HAS_TRAIT(user, TRAIT_ROYAL_SUBSIDY)
	var/using_stipend = food_stipend && price > budget
	if(using_stipend)
		if(SStreasury.discretionary_fund.balance < unit_cost)
			parent_structure.say("The Crown's Purse cannot front the import cost.")
			return FALSE
	else
		if(price > budget)
			parent_structure.say("Insufficient mammon in the coinpouch.")
			return FALSE
		if(SStreasury.discretionary_fund.balance < unit_cost)
			parent_structure.say("The Crown's Purse cannot front the import cost.")
			return FALSE
	var/spent = SSeconomy.manual_import(user, region.region_id, D.trade_good_id, 1, using_stipend)
	if(!spent)
		return FALSE
	if(!using_stipend)
		budget -= price
	D.stockpile_amount = max(0, D.stockpile_amount - 1)
	SStreasury.dirty_market_view()
	var/chartered = SStreasury.royal_custom_active && SStreasury.royal_custom_unlocked
	if(!using_stipend)
		SStreasury.mint(SStreasury.discretionary_fund, unit_cost, "Direct import reimbursement: [D.name] from [region.name]")
	record_round_statistic(STATS_STOCKPILE_DIRECT_IMPORTS, price)
	record_material_flow(MATERIAL_FLOW_IN, MATERIAL_SOURCE_LOCAL_IMPORT, D.item_type, 1, price)
	if(!using_stipend && chartered && surcharge > 0)
		SStreasury.mint(SStreasury.discretionary_fund, surcharge, "Royal Custom: direct import of [D.name]")
		record_round_statistic(STATS_STOCKPILE_REVENUE, surcharge)
	var/obj/item/I = new D.item_type(parent_structure.loc)
	if(!user.put_in_hands(I))
		I.forceMove(get_turf(user))
	playsound(parent_structure.loc, 'sound/misc/hiss.ogg', 100, FALSE, -1)
	if(using_stipend)
		var/waived = max(0, surcharge)
		to_chat(user, span_info("[parent_structure] chitters and squeaks into the treasury ratlines."))
		if(waived > 0)
			to_chat(user, span_notice("[D.name] imported from [region.name] for [unit_cost]m ([waived]m waived by the Crown's private transportation lines)."))
		else
			to_chat(user, span_notice("[D.name] imported from [region.name] for [unit_cost]m."))
	else
		var/flavor = chartered ? "Royal Custom duty paid to the Crown." : "Import surcharge consumed by transport."
		to_chat(user, span_notice("[D.name] imported from [region.name] for [price]m. [flavor]"))
	return TRUE


/proc/stock_announce(message)
	for(var/obj/structure/roguemachine/stockpile/S in SSroguemachine.stock_machines)
		S.say(message, spans = list("info"))
