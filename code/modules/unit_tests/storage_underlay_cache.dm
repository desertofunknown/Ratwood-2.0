/// Counts generation while retaining the real icon-building and HUD code.
/datum/component/storage/concrete/underlay_cache_test
	var/generation_calls = 0

/datum/component/storage/concrete/underlay_cache_test/generate_bound_underlay(grid_width = world.icon_size, grid_height = world.icon_size, enchanted = FALSE)
	generation_calls++
	return ..()

/datum/unit_test/storage_underlay_cache
	var/datum/component/storage/concrete/underlay_cache_test/storage
	var/datum/component/storage/concrete/underlay_cache_test/other_storage
	var/list/saved_cache
	var/list/items

/datum/unit_test/storage_underlay_cache/Destroy()
	if(storage && !isnull(saved_cache))
		storage.underlay_appearances_by_size = saved_cache
	saved_cache = null
	storage = null
	other_storage = null
	items = null
	return ..()

/datum/unit_test/storage_underlay_cache/proc/add_item(atom/host, item_name, width, height, coordinates)
	var/obj/item/item = allocate(/obj/item)
	item.name = item_name
	item.grid_width = width
	item.grid_height = height
	item.forceMove(host)
	storage.grid_add_item(item, coordinates)
	items += item
	return item

/datum/unit_test/storage_underlay_cache/Run()
	var/obj/host = allocate(/obj)
	var/obj/other_host = allocate(/obj)
	storage = host.AddComponent(/datum/component/storage/concrete/underlay_cache_test)
	other_storage = other_host.AddComponent(/datum/component/storage/concrete/underlay_cache_test)
	TEST_ASSERT_NOTNULL(storage, "The test storage component failed to initialize.")
	TEST_ASSERT_NOTNULL(other_storage, "The second storage component failed to initialize.")
	storage.grid = TRUE
	other_storage.grid = TRUE
	items = list()
	add_item(host, "first sample", 32, 32, "0,0")
	add_item(host, "second sample", 32, 32, "1,0")
	add_item(host, "wide sample", 64, 32, "0,1")
	add_item(host, "first sample", 32, 32, "2,0")

	// No yielding while the shared cache is isolated. Destroy restores it
	// after a failed assertion or an exception caught by the test runner.
	saved_cache = storage.underlay_appearances_by_size
	storage.underlay_appearances_by_size = list()
	check_layout(FALSE)
	check_layout(TRUE)
	check_variants()

	storage.underlay_appearances_by_size = saved_cache
	saved_cache = null

/datum/unit_test/storage_underlay_cache/proc/check_layout(numerical)
	storage.underlay_appearances_by_size.Cut()
	storage.generation_calls = 0
	storage.display_numerical_stacking = numerical
	for(var/obj/item/item as anything in items)
		item.underlays = null
	storage.orient2hud()
	var/first_generation_calls = storage.generation_calls
	var/mutable_appearance/cached_square = storage.get_bound_underlay(32, 32)
	var/mutable_appearance/cached_wide = storage.get_bound_underlay(64, 32)
	var/list/first_positions = new /list(length(items))
	var/list/first_maptexts = new /list(length(items))
	var/list/first_underlay_counts = new /list(length(items))
	for(var/index in 1 to length(items))
		var/obj/item/item = items[index]
		first_positions[index] = item.screen_loc
		first_maptexts[index] = item.maptext
		first_underlay_counts[index] = length(item.underlays)
	storage.orient2hud()
	var/second_generation_calls = storage.generation_calls
	var/list/second_underlay_counts = list()
	for(var/obj/item/item as anything in items)
		second_underlay_counts += length(item.underlays)
	log_for_test("Storage underlay observations: [json_encode(list("numerical" = numerical, "first_generation_calls" = first_generation_calls, "second_generation_calls" = second_generation_calls, "first_underlay_counts" = first_underlay_counts, "second_underlay_counts" = second_underlay_counts, "screen_locations" = first_positions, "maptexts" = first_maptexts))]", "notice", __FILE__, __LINE__)

	TEST_ASSERT_EQUAL(first_generation_calls, 2, "A cold draw should generate one appearance per distinct size, numerical=[numerical].")
	TEST_ASSERT_EQUAL(second_generation_calls, 2, "Repeated drawing regenerated a cached appearance, numerical=[numerical].")
	TEST_ASSERT_NOTNULL(cached_square, "The ordinary square appearance was not cached.")
	TEST_ASSERT_NOTNULL(cached_wide, "The ordinary wide appearance was not cached.")
	TEST_ASSERT_NOTEQUAL(cached_square, cached_wide, "Different sizes shared an appearance.")
	TEST_ASSERT_EQUAL(storage.get_bound_underlay(32, 32), cached_square, "Redrawing replaced the square cache entry.")
	TEST_ASSERT_EQUAL(storage.get_bound_underlay(64, 32), cached_wide, "Redrawing replaced the wide cache entry.")
	TEST_ASSERT_EQUAL(other_storage.get_bound_underlay(32, 32), cached_square, "Another storage component could not reuse the cache.")
	for(var/index in 1 to length(items))
		var/obj/item/item = items[index]
		TEST_ASSERT_EQUAL(item.screen_loc, first_positions[index], "A repeated redraw changed item placement.")
		TEST_ASSERT_EQUAL(item.maptext, first_maptexts[index], "A repeated redraw changed stack text.")
	var/obj/item/first = items[1]
	var/obj/item/second = items[2]
	var/obj/item/wide = items[3]
	var/mutable_appearance/first_underlay = first.underlays[length(first.underlays)]
	var/mutable_appearance/second_underlay = second.underlays[length(second.underlays)]
	var/mutable_appearance/wide_underlay = wide.underlays[length(wide.underlays)]
	check_appearance(first_underlay, cached_square)
	check_appearance(second_underlay, cached_square)
	check_appearance(wide_underlay, cached_wide)
	TEST_ASSERT_EQUAL(first.maptext, numerical ? "<font color='white'>2</font>" : "", "Stacking text changed.")

	// The generator remains the visual reference; caching must not change
	// its pixels, flags, or transform.
	var/mutable_appearance/fresh_square = storage.generate_bound_underlay(32, 32)
	var/mutable_appearance/fresh_wide = storage.generate_bound_underlay(64, 32)
	check_appearance(cached_square, fresh_square)
	check_appearance(cached_wide, fresh_wide)
	check_appearance(first_underlay, fresh_square)

	// Rotation introduces a distinct size, then reuses the original size.
	var/before_rotation = storage.generation_calls
	wide.inventory_flip(null, TRUE)
	storage.update_item(wide)
	storage.orient2hud()
	TEST_ASSERT_EQUAL(storage.generation_calls, before_rotation + 1, "Rotation should generate only the new height/width pair.")
	wide.inventory_flip(null, TRUE)
	storage.update_item(wide)
	storage.orient2hud()
	TEST_ASSERT_EQUAL(storage.generation_calls, before_rotation + 1, "Rotating back should reuse the existing size.")
	TEST_ASSERT_EQUAL(storage.get_bound_underlay(32, 32), fresh_square, "Other-size updates mutated the square cache entry.")
	check_appearance(fresh_square, cached_square)

/datum/unit_test/storage_underlay_cache/proc/check_variants()
	storage.underlay_appearances_by_size.Cut()
	var/mutable_appearance/plain = storage.generate_bound_underlay(32, 32)
	var/mutable_appearance/enchanted = storage.generate_bound_underlay(32, 32, TRUE)
	TEST_ASSERT_NOTEQUAL(plain, enchanted, "Plain and enchanted appearances shared an entry.")
	TEST_ASSERT_EQUAL(storage.get_bound_underlay(32, 32), plain, "Omitted enchantment should select the plain appearance.")
	TEST_ASSERT_EQUAL(storage.get_bound_underlay(32, 32, FALSE), plain, "FALSE should select the plain appearance.")
	TEST_ASSERT_EQUAL(storage.get_bound_underlay(32, 32, null), plain, "Null should select the plain appearance.")
	TEST_ASSERT_EQUAL(storage.get_bound_underlay(32, 32, TRUE), enchanted, "TRUE should select the enchanted appearance.")
	TEST_ASSERT_EQUAL(storage.get_bound_underlay(32, 32, 2), enchanted, "Truthy enchantment should use the same visual variant.")
	TEST_ASSERT_EQUAL(length(storage.underlay_appearances_by_size), 2, "Boolean-equivalent variants created extra cache entries.")

/datum/unit_test/storage_underlay_cache/proc/check_appearance(mutable_appearance/actual, mutable_appearance/expected)
	TEST_ASSERT_NOTNULL(actual, "The displayed appearance is missing.")
	TEST_ASSERT_NOTNULL(expected, "The reference appearance is missing.")
	TEST_ASSERT_EQUAL(actual.appearance_flags, expected.appearance_flags, "Appearance flags changed.")
	var/matrix/actual_transform = actual.transform
	var/matrix/expected_transform = expected.transform
	TEST_ASSERT_EQUAL(actual_transform.a, expected_transform.a, "Underlay transform a changed.")
	TEST_ASSERT_EQUAL(actual_transform.b, expected_transform.b, "Underlay transform b changed.")
	TEST_ASSERT_EQUAL(actual_transform.c, expected_transform.c, "Underlay transform c changed.")
	TEST_ASSERT_EQUAL(actual_transform.d, expected_transform.d, "Underlay transform d changed.")
	TEST_ASSERT_EQUAL(actual_transform.e, expected_transform.e, "Underlay transform e changed.")
	TEST_ASSERT_EQUAL(actual_transform.f, expected_transform.f, "Underlay transform f changed.")
	var/icon/actual_icon = icon(actual.icon)
	var/icon/expected_icon = icon(expected.icon)
	TEST_ASSERT_EQUAL(actual_icon.Width(), expected_icon.Width(), "Underlay width changed.")
	TEST_ASSERT_EQUAL(actual_icon.Height(), expected_icon.Height(), "Underlay height changed.")
	for(var/x in 1 to actual_icon.Width())
		for(var/y in 1 to actual_icon.Height())
			TEST_ASSERT_EQUAL(actual_icon.GetPixel(x, y), expected_icon.GetPixel(x, y), "Underlay pixel [x],[y] changed.")
