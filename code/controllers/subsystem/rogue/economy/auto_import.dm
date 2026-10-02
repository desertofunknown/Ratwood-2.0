/datum/controller/subsystem/treasury
	/// Non-essential goods the Steward has placed on standing import. good_id -> TRUE.
	/// Essentials bypass this - they are governed by auto_import_disabled instead.
	var/list/auto_import_standing = list()
	/// Per-essential opt-out. good_id -> TRUE means "this essential will NOT auto-import."
	var/list/auto_import_disabled = list()
	/// Cumulative mammon spent by auto-import today. Reset at daily tick.
	var/auto_import_daily_spent = 0
	/// Last AUTO_IMPORT_HISTORY_DAYS days of spend. Each entry: list(day, spent, lines).
	var/list/auto_import_daily_history = list()
	/// Steward-settable purse floor for auto-import. Auto-import skips a good if
	/// spending on it would drop the Crown's Purse below this.
	var/auto_import_purse_floor = AUTO_IMPORT_PURSE_FLOOR_DEFAULT
	/// Day auto-import bookkeeping was last rolled over for. -1 = never rolled yet.
	var/auto_import_current_day = -1
	/// Lines accumulated across all of today's 6-minute auto-import ticks, flushed to history on rollover.
	var/list/auto_import_today_lines = list()

/datum/controller/subsystem/treasury/proc/is_auto_import_active(good_id)
	if(!good_id)
		return FALSE
	if(good_id in AUTO_IMPORT_ESSENTIALS)
		return !auto_import_disabled[good_id]
	return !!auto_import_standing[good_id]

/datum/controller/subsystem/treasury/proc/set_auto_import(good_id, active)
	if(!good_id)
		return
	if(good_id in AUTO_IMPORT_ESSENTIALS)
		if(active)
			auto_import_disabled -= good_id
		else
			auto_import_disabled[good_id] = TRUE
		return
	// Non-essentials must be importable to be placed on standing import. Adding an
	// un-importable good would just flood the history with skip lines.
	if(active)
		var/datum/trade_good/tg = GLOB.trade_goods[good_id]
		if(!tg || !tg.importable)
			return
		auto_import_standing[good_id] = TRUE
	else
		auto_import_standing -= good_id

/datum/controller/subsystem/treasury/proc/kill_switch_auto_import()
	for(var/good_id in AUTO_IMPORT_ESSENTIALS)
		auto_import_disabled[good_id] = TRUE
	auto_import_standing.Cut()

/datum/controller/subsystem/treasury/proc/set_auto_import_purse_floor(amount)
	auto_import_purse_floor = CLAMP(round(amount), 0, 99999)

/// Called every TREASURY_TICK_AMOUNT (6 minutes) from fire(), alongside auto_export().
/// Rolls the daily spend/history bucket over on day change, then always attempts a batch
/// top-up pass this tick.
/datum/controller/subsystem/treasury/proc/run_auto_import_tick()
	if(auto_import_current_day != GLOB.dayspassed)
		if(auto_import_current_day != -1)
			auto_import_daily_history += list(list(
				"day" = auto_import_current_day,
				"spent" = auto_import_daily_spent,
				"lines" = auto_import_today_lines,
			))
			if(length(auto_import_daily_history) > AUTO_IMPORT_HISTORY_DAYS)
				auto_import_daily_history.Cut(1, length(auto_import_daily_history) - AUTO_IMPORT_HISTORY_DAYS + 1)
		auto_import_current_day = GLOB.dayspassed
		auto_import_daily_spent = 0
		auto_import_today_lines = list()

	dirty_auto_import_view()

	for(var/good_id in AUTO_IMPORT_ESSENTIALS)
		if(auto_import_disabled[good_id])
			continue
		process_auto_import_for_good(good_id, auto_import_today_lines)

	for(var/good_id in auto_import_standing)
		if(good_id in AUTO_IMPORT_ESSENTIALS)
			continue
		process_auto_import_for_good(good_id, auto_import_today_lines)

	dirty_auto_import_view()

/datum/controller/subsystem/treasury/proc/process_auto_import_for_good(good_id, list/today_lines)
	var/datum/trade_good/tg = GLOB.trade_goods[good_id]
	if(!tg || !tg.importable)
		return
	var/datum/roguestock/stockpile_entry = SSeconomy.find_stockpile_by_trade_good(good_id)
	if(!stockpile_entry)
		return

	if(stockpile_entry.stockpile_amount >= AUTO_IMPORT_FLOOR)
		today_lines += "[tg.name]: stockpile [stockpile_entry.stockpile_amount] >= floor [AUTO_IMPORT_FLOOR], no import needed."
		return

	var/price_cap = tg.base_price * AUTO_IMPORT_MAX_PRICE_MULT
	var/available = discretionary_fund.balance - auto_import_purse_floor
	var/datum/economic_region/region
	var/total_cost = INFINITY
	var/has_producer = FALSE
	var/has_price_eligible = FALSE
	for(var/region_id in GLOB.economic_regions)
		var/datum/economic_region/candidate = GLOB.economic_regions[region_id]
		var/daily_pace = candidate.produces[good_id] || 0
		if(daily_pace <= 0)
			continue
		has_producer = TRUE
		var/produces_today = candidate.produces_today[good_id] || 0
		var/starting_index = max(0, daily_pace - produces_today)
		var/batch_cost = 0
		var/max_unit_price = 0
		for(var/i in 1 to AUTO_IMPORT_BATCH)
			var/unit_price = SSeconomy.compute_import_unit_price(good_id, candidate, starting_index + i)
			batch_cost += unit_price
			max_unit_price = max(max_unit_price, unit_price)
		if(max_unit_price > price_cap)
			continue
		has_price_eligible = TRUE
		if(batch_cost > available)
			continue
		// Prefer open trade routes, retaining the existing blockaded fallback.
		if(region)
			if(!region.is_region_blockaded && candidate.is_region_blockaded)
				continue
			if(region.is_region_blockaded == candidate.is_region_blockaded && batch_cost >= total_cost)
				continue
		region = candidate
		total_cost = batch_cost

	if(!region)
		if(!has_producer)
			today_lines += "[tg.name]: no producing region available."
		else if(!has_price_eligible)
			today_lines += "[tg.name]: skipped (every batch exceeds [AUTO_IMPORT_MAX_PRICE_MULT]x base price [tg.base_price]m per unit)."
		else
			today_lines += "[tg.name]: skipped (purse floor [auto_import_purse_floor]m would be breached)."
		return

	var/spent = SSeconomy.manual_import(null, region.region_id, good_id, AUTO_IMPORT_BATCH)
	if(!spent)
		today_lines += "[tg.name]: import failed (treasury or region state changed mid-tick)."
		return

	auto_import_daily_spent += spent
	today_lines += "[tg.name]: +[AUTO_IMPORT_BATCH] from [region.name] ([spent]m)."
