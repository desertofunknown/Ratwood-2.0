/// Covers the real meal-buff self-removal path, plus the no-alert queue path.
/// No production lifecycle methods are replaced by the meal test.
/datum/unit_test/status_effect_apply_lifetime/Run()
	var/mob/living/carbon/human/H = allocate(/mob/living/carbon/human)
	var/base_con = H.get_stat(STATKEY_CON)
	var/base_wil = H.get_stat(STATKEY_WIL)

	var/datum/status_effect/great_meal = H.apply_status_effect(/datum/status_effect/buff/greatmealbuff)
	TEST_ASSERT(!QDELETED(great_meal), "The real great-meal effect failed to apply.")
	var/great_con = H.get_stat(STATKEY_CON)
	var/great_wil = H.get_stat(STATKEY_WIL)
	TEST_ASSERT(great_meal in SSfastprocess.processing, "The great-meal effect was not scheduled.")
	TEST_ASSERT_NOTNULL(H.alerts["greatmeal"], "The great-meal effect did not create its alert.")

	// on_apply keeps TRUE from its parent, then removes itself because the
	// stronger meal exists. Baseline continues with owner=null and runtimes.
	var/datum/status_effect/rejected_meal = H.apply_status_effect(/datum/status_effect/buff/mealbuff)
	TEST_ASSERT(QDELETED(rejected_meal), "The weaker meal effect should remove itself.")
	TEST_ASSERT_NULL(H.has_status_effect(/datum/status_effect/buff/mealbuff), "A removed meal remains in the ID index.")
	TEST_ASSERT(!(rejected_meal in H.status_effects), "A removed meal remains in the owner's effect list.")
	TEST_ASSERT(!(rejected_meal in SSfastprocess.processing), "A removed meal was re-added to processing.")
	TEST_ASSERT_NULL(H.alerts["meal"], "A removed meal created an alert after deletion.")
	TEST_ASSERT_EQUAL(H.has_status_effect(/datum/status_effect/buff/greatmealbuff), great_meal, "Applying a weaker meal replaced the stronger effect.")
	TEST_ASSERT_EQUAL(H.get_stat(STATKEY_CON), great_con, "The rejected meal changed constitution.")
	TEST_ASSERT_EQUAL(H.get_stat(STATKEY_WIL), great_wil, "The rejected meal changed willpower.")

	H.remove_status_effect(/datum/status_effect/buff/greatmealbuff)
	TEST_ASSERT(!(great_meal in SSfastprocess.processing), "Removing great meal left it scheduled.")
	TEST_ASSERT_EQUAL(H.get_stat(STATKEY_CON), base_con, "Removing great meal did not restore constitution.")
	TEST_ASSERT_EQUAL(H.get_stat(STATKEY_WIL), base_wil, "Removing great meal did not restore willpower.")

	// Preserve ordinary application and refresh behavior.
	var/datum/status_effect/meal = H.apply_status_effect(/datum/status_effect/buff/mealbuff)
	TEST_ASSERT(!QDELETED(meal), "An ordinary meal failed to apply.")
	var/meal_con = H.get_stat(STATKEY_CON)
	var/atom/movable/screen/alert/meal_alert = H.alerts["meal"]
	TEST_ASSERT_NOTNULL(meal_alert, "An ordinary meal did not create an alert.")
	H.apply_status_effect(/datum/status_effect/buff/mealbuff)
	TEST_ASSERT_EQUAL(H.has_status_effect(/datum/status_effect/buff/mealbuff), meal, "Refreshing meal replaced the effect.")
	TEST_ASSERT_EQUAL(H.alerts["meal"], meal_alert, "Refreshing meal replaced the alert.")
	TEST_ASSERT_EQUAL(H.get_stat(STATKEY_CON), meal_con, "Refreshing meal duplicated the stat bonus.")
	TEST_ASSERT(meal in SSfastprocess.processing, "Refreshing meal lost its processing entry.")

	// The reverse order already worked: great meal removes an existing meal.
	great_meal = H.apply_status_effect(/datum/status_effect/buff/greatmealbuff)
	TEST_ASSERT(!QDELETED(great_meal), "Great meal failed to replace the weaker meal.")
	TEST_ASSERT(QDELETED(meal), "Great meal did not remove the weaker meal.")
	TEST_ASSERT_NULL(H.has_status_effect(/datum/status_effect/buff/mealbuff), "The replaced meal remains indexed.")
	TEST_ASSERT_NULL(H.alerts["meal"], "The replaced meal alert remains.")
	TEST_ASSERT(!(meal in SSfastprocess.processing), "The replaced meal remains scheduled.")
	TEST_ASSERT_EQUAL(H.get_stat(STATKEY_CON), great_con, "The reverse meal order changed constitution bonuses.")
	TEST_ASSERT_EQUAL(H.get_stat(STATKEY_WIL), great_wil, "The reverse meal order changed willpower bonuses.")
	H.remove_status_effect(/datum/status_effect/buff/greatmealbuff)
	TEST_ASSERT_EQUAL(H.get_stat(STATKEY_CON), base_con, "Final cleanup did not restore constitution.")
	TEST_ASSERT_EQUAL(H.get_stat(STATKEY_WIL), base_wil, "Final cleanup did not restore willpower.")

/// Isolate deleted-effect resurrection when there is no alert to runtime first.
/datum/status_effect/unit_test_self_removing
	id = "unit_test_self_removing"
	alert_type = null
	needs_processing = TRUE

/datum/status_effect/unit_test_self_removing/on_apply()
	qdel(src)
	return TRUE

/datum/unit_test/status_effect_apply_without_alert
	var/datum/status_effect/effect

/datum/unit_test/status_effect_apply_without_alert/Destroy()
	// The unpatched baseline intentionally exposes requeue-after-deletion.
	// Remove that test-owned entry even when an assertion aborts Run().
	if(effect)
		STOP_PROCESSING(SSfastprocess, effect)
		effect = null
	return ..()

/datum/unit_test/status_effect_apply_without_alert/Run()
	var/mob/living/carbon/human/H = allocate(/mob/living/carbon/human)
	effect = H.apply_status_effect(/datum/status_effect/unit_test_self_removing)
	TEST_ASSERT(QDELETED(effect), "The test effect did not delete itself during application.")
	TEST_ASSERT_NULL(H.has_status_effect(/datum/status_effect/unit_test_self_removing), "A self-deleted effect remains indexed.")
	TEST_ASSERT(!(effect in H.status_effects), "A self-deleted effect remains in the owner's list.")
	TEST_ASSERT(!(effect in SSfastprocess.processing), "Creation resurrected a deleted effect in fast processing.")
	if(effect)
		TEST_ASSERT(!(effect.datum_flags & SSfastprocess.processing_flag), "Creation restored the processing flag after effect deletion.")
