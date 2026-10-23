/*
 * Native definitions for the reviewed direct-import quote reuse.
 * Checkpoint validation is COMPILE ONLY: these tests have NOT been executed.
 * This is not transaction, settlement, gameplay, or live-server coverage.
 *
 * Exercise the real selector, pricer, quote, and display-price caller. Only
 * ephemeral datums and temporary registry references / Royal Custom scalars
 * are used; neither subsystem is replaced. The tested procs do not sleep.
 * No manual_import(), do_direct_import(), mint(), mobs, items, saves, or DB.
 */

// Keep the real stock constructor without its irrelevant random-demand draw.
// This is not a /stockpile subtype, so treasury stock initialization ignores it.
/datum/roguestock/direct_import_quote_fixture
	stable_price = TRUE

/datum/unit_test/direct_import_quote
	var/list/saved_trade_goods
	var/list/saved_regions
	var/datum/controller/subsystem/treasury/saved_treasury
	var/saved_active
	var/saved_unlocked
	var/saved_margin
	var/state_saved = FALSE
	var/datum/trade_good/good
	var/datum/economic_region/first_region
	var/datum/economic_region/second_region
	var/datum/roguestock/stock
	var/datum/withdraw_tab/tab

/datum/unit_test/direct_import_quote/Run()
	TEST_ASSERT_NOTNULL(SSeconomy, "The native fixture requires the initialized economy subsystem.")
	TEST_ASSERT_NOTNULL(SStreasury, "The native fixture requires the initialized treasury subsystem.")
	// Capture before allocation. Preserve original list identities, not copies.
	saved_trade_goods = GLOB.trade_goods
	saved_regions = GLOB.economic_regions
	saved_treasury = SStreasury
	saved_active = saved_treasury.royal_custom_active
	saved_unlocked = saved_treasury.royal_custom_unlocked
	saved_margin = saved_treasury.royal_custom_margin
	state_saved = TRUE
	var/exception/caught_error
	try
		// Assertions return from this helper, never past the restoration below.
		run_cases()
	catch(var/exception/error)
		caught_error = error
	restore_state()
	if(caught_error)
		return Fail("Direct-import fixture runtime: [caught_error] at [caught_error.file]:[caught_error.line]")
	TEST_ASSERT_EQUAL(GLOB.trade_goods, saved_trade_goods, "Restore the original goods registry identity.")
	TEST_ASSERT_EQUAL(GLOB.economic_regions, saved_regions, "Restore the original region registry identity.")
	TEST_ASSERT_EQUAL(saved_treasury.royal_custom_active, saved_active, "Restore Royal Custom activity.")
	TEST_ASSERT_EQUAL(saved_treasury.royal_custom_unlocked, saved_unlocked, "Restore Royal Custom unlock state.")
	TEST_ASSERT_EQUAL(saved_treasury.royal_custom_margin, saved_margin, "Restore the original duty margin.")

/datum/unit_test/direct_import_quote/proc/restore_state()
	if(!state_saved)
		return
	GLOB.trade_goods = saved_trade_goods
	GLOB.economic_regions = saved_regions
	saved_treasury.royal_custom_active = saved_active
	saved_treasury.royal_custom_unlocked = saved_unlocked
	saved_treasury.royal_custom_margin = saved_margin
	state_saved = FALSE

/datum/unit_test/direct_import_quote/Destroy()
	// Idempotent fallback before the framework deletes allocated fixture datums.
	restore_state()
	saved_trade_goods = null
	saved_regions = null
	saved_treasury = null
	good = null
	first_region = null
	second_region = null
	stock = null
	tab = null
	return ..()

/datum/unit_test/direct_import_quote/proc/run_cases()
	// Base good/region constructors and their inherited Destroy do not register
	// themselves. The stock has no trade_good_id until after construction.
	good = allocate(/datum/trade_good)
	good.id = "unit_test_direct_import_good"
	good.base_price = 11
	good.global_price_mod = 1
	first_region = allocate(/datum/economic_region)
	first_region.region_id = "unit_test_direct_import_first"
	first_region.produces = list(good.id = 4)
	first_region.produces_today = list(good.id = 4)
	second_region = allocate(/datum/economic_region)
	second_region.region_id = "unit_test_direct_import_second"
	second_region.produces = list(good.id = 4)
	second_region.produces_today = list(good.id = 4)
	stock = allocate(/datum/roguestock/direct_import_quote_fixture)
	stock.trade_good_id = good.id
	// allocate() replaces a null first argument with a turf; keep the parent null.
	tab = new /datum/withdraw_tab(null)
	allocated += tab
	GLOB.trade_goods = list(good.id = good)
	GLOB.economic_regions = list(first_region.region_id = first_region)
	saved_treasury.royal_custom_active = FALSE
	saved_treasury.royal_custom_unlocked = FALSE
	saved_treasury.royal_custom_margin = 75

	// Literal expected results, not a second implementation of the formulas.
	// Columns: base price, global modifier, unit cost, default-margin price.
	for(var/list/pricing_case as anything in list(
		list(11, 1, 11, 16),
		list(17.5, 1.25, 21, 31),
		list(11, 0.5, 5, 7),
		list(0.5, 1, 1, 1),
		list(0, 1, 1, 1),
	))
		good.base_price = pricing_case[1]
		good.global_price_mod = pricing_case[2]
		if(!check_quote("price [pricing_case[1]] / modifier [pricing_case[2]]", first_region, 1, pricing_case[3], pricing_case[4]))
			return
	good.base_price = 11
	good.global_price_mod = 1
	first_region.produces_today[good.id] = 1
	if(!check_quote("last available unit", first_region, 4, 11, 16))
		return
	first_region.produces_today[good.id] = 8
	if(!check_quote("supply above daily pace", first_region, 1, 11, 16))
		return
	first_region.produces_today[good.id] = 4

	// A charter uses the configured margin only when both flags are true.
	// Columns: active, unlocked, configured margin, expected display price.
	for(var/list/margin_case as anything in list(
		list(FALSE, FALSE, 75, 16),
		list(FALSE, TRUE, 75, 16),
		list(TRUE, FALSE, 75, 16),
		list(TRUE, TRUE, 75, 19),
		list(TRUE, TRUE, 0, 11),
		list(TRUE, TRUE, 12.5, 12),
	))
		saved_treasury.royal_custom_active = margin_case[1]
		saved_treasury.royal_custom_unlocked = margin_case[2]
		saved_treasury.royal_custom_margin = margin_case[3]
		if(!check_quote("margin flags [margin_case[1]] / [margin_case[2]], margin [margin_case[3]]", first_region, 1, 11, margin_case[4]))
			return
	saved_treasury.royal_custom_active = FALSE
	saved_treasury.royal_custom_unlocked = FALSE

	GLOB.economic_regions[second_region.region_id] = second_region
	if(!check_quote("equal price retains first region", first_region, 1, 11, 16))
		return
	GLOB.economic_regions = list(second_region.region_id = second_region, first_region.region_id = first_region)
	if(!check_quote("reversed equal-price order", second_region, 1, 11, 16))
		return
	GLOB.economic_regions = list(first_region.region_id = first_region, second_region.region_id = second_region)
	first_region.produces_today[good.id] = 0
	if(!check_quote("later region is cheaper", second_region, 1, 11, 16))
		return
	first_region.produces_today[good.id] = 4
	first_region.is_region_blockaded = TRUE
	if(!check_quote("prefer open producer", second_region, 1, 11, 16))
		return
	second_region.is_region_blockaded = TRUE
	if(!check_quote("all blockaded fallback retains first tie", first_region, 1, 22, 33, TRUE))
		return
	// The open producer is more expensive but exhausted. Preserve the selector's
	// nominal-blockaded metadata and the quote's refusal, not a new fallback.
	second_region.is_region_blockaded = FALSE
	second_region.produces[good.id] = 1
	second_region.produces_today[good.id] = -2
	if(!check_quote("open exhausted choice with blockaded nominal", second_region, 4, 44, null, FALSE, first_region, 22))
		return

	GLOB.economic_regions = list(first_region.region_id = first_region)
	first_region.is_region_blockaded = FALSE
	first_region.produces_today[good.id] = 0
	if(!check_quote("zero remaining supply rejects quote", first_region, 5, 13, null))
		return
	first_region.produces_today[good.id] = -1
	if(!check_quote("negative remaining supply rejects quote", first_region, 6, 16, null))
		return
	first_region.produces_today[good.id] = 4
	first_region.produces[good.id] = 0
	if(!check_unavailable("zero daily production"))
		return
	first_region.produces[good.id] = 4
	good.importable = FALSE
	if(!check_unavailable("non-importable good"))
		return
	good.importable = TRUE
	GLOB.trade_goods = list()
	if(!check_unavailable("missing trade good"))
		return
	GLOB.trade_goods = list(good.id = good)
	GLOB.economic_regions = list()
	if(!check_unavailable("no producing regions"))
		return
	stock.trade_good_id = null
	TEST_ASSERT_NULL(tab.get_direct_import_quote(stock), "A stock without a trade good cannot be quoted.")
	TEST_ASSERT_EQUAL(tab.direct_import_price(stock), 0, "A stock without a trade good has no display price.")
	TEST_ASSERT_NULL(tab.get_direct_import_quote(null), "A missing stock cannot be quoted.")
	TEST_ASSERT_EQUAL(tab.direct_import_price(null), 0, "A missing stock has no display price.")

/datum/unit_test/direct_import_quote/proc/check_quote(label, datum/economic_region/expected_region, unit_index, expected_cost, expected_price, expected_blockaded = FALSE, datum/economic_region/fallback_region = null, fallback_price = null)
	var/list/best = SSeconomy.get_best_import_region(good.id)
	TEST_ASSERT_NOTNULL(best, "[label]: the real selector should find a producer.")
	TEST_ASSERT_EQUAL(best["region_id"], expected_region.region_id, "[label]: region selection.")
	TEST_ASSERT_EQUAL(best["unit_price"], expected_cost, "[label]: selector unit price.")
	TEST_ASSERT_EQUAL(best["is_blockaded"], expected_blockaded, "[label]: blockade state.")
	TEST_ASSERT_EQUAL(best["fallback_region_id"], fallback_region ? fallback_region.region_id : null, "[label]: nominal fallback region.")
	TEST_ASSERT_EQUAL(best["fallback_price"], fallback_price, "[label]: nominal fallback price.")
	TEST_ASSERT_EQUAL(SSeconomy.compute_import_unit_price(good.id, expected_region, unit_index), best["unit_price"], "[label]: actual pricer equals selector.")
	var/list/quote = tab.get_direct_import_quote(stock)
	if(isnull(expected_price))
		TEST_ASSERT_NULL(quote, "[label]: exhausted selected producer must not produce a quote.")
		TEST_ASSERT_EQUAL(tab.direct_import_price(stock), 0, "[label]: unavailable quote has no display price.")
		return TRUE
	TEST_ASSERT_NOTNULL(quote, "[label]: the selected available producer should be quoted.")
	TEST_ASSERT_EQUAL(quote["region"], expected_region, "[label]: quote retains actual selected datum identity.")
	TEST_ASSERT_EQUAL(quote["unit_cost"], best["unit_price"], "[label]: quote reuses actual selector price.")
	TEST_ASSERT_EQUAL(quote["price"], expected_price, "[label]: final quoted price.")
	TEST_ASSERT_EQUAL(tab.direct_import_price(stock), quote["price"], "[label]: display caller equals quote.")
	return TRUE

/datum/unit_test/direct_import_quote/proc/check_unavailable(label)
	TEST_ASSERT_NULL(SSeconomy.get_best_import_region(good.id), "[label]: no selectable producer.")
	TEST_ASSERT_NULL(tab.get_direct_import_quote(stock), "[label]: no quote.")
	TEST_ASSERT_EQUAL(tab.direct_import_price(stock), 0, "[label]: no display price.")
	return TRUE
