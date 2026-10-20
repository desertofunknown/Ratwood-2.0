/// Exercise production equipment and overlay selection, without a client.
/// This proves selected resources/states, not final connected-client pixels.
/datum/unit_test/loudmouth_mask_icon/Run()
	var/mob/living/carbon/human/subject = allocate(/mob/living/carbon/human)
	// Base /human DNA is not in clothing's exact-type allowed_race list.
	// Use a real supported body, without relaxing any equipment restriction.
	subject.gender = MALE
	subject.set_species(/datum/species/human/northern)
	TEST_ASSERT_EQUAL(subject.dna?.species?.type, /datum/species/human/northern, "The fixture did not initialize the supported human species.")
	TEST_ASSERT_NOTNULL(subject.get_bodypart(BODY_ZONE_HEAD), "The fixture has no head bodypart.")
	TEST_ASSERT_NULL(subject.head, "The fixture starts with an occupied head slot.")
	TEST_ASSERT_NULL(subject.wear_mask, "The fixture starts with an occupied mask slot.")
	var/obj/item/clothing/head/roguetown/veiled/loudmouth/cover = allocate(/obj/item/clothing/head/roguetown/veiled/loudmouth)
	var/obj/item/clothing/head/roguetown/strawhat/hat = allocate(/obj/item/clothing/head/roguetown/strawhat)
	var/datum/component/adjustable_clothing/adjustment = cover.GetComponent(/datum/component/adjustable_clothing)
	TEST_ASSERT_NOTNULL(adjustment, "Loudmouth headcover has no production adjustment component.")
	TEST_ASSERT_EQUAL(cover.slot_flags, ITEM_SLOT_HEAD|ITEM_SLOT_MASK, "Loudmouth headcover lost a supported slot.")
	TEST_ASSERT(!cover.is_snoutable(), "The existing Loudmouth asset unexpectedly gained a snouted state.")

	// HEAD already chooses the correct sheet before this fix.
	TEST_ASSERT(subject.equip_to_slot_if_possible(cover, SLOT_HEAD, disable_warning = TRUE, bypass_equip_delay_self = TRUE), "Could not equip the head-slot control.")
	subject.update_inv_head()
	if(!check_loudmouth_overlay(subject.overlays_standing[HEAD_LAYER], "loudmouth", HEAD_LAYER, cover.color, "HEAD closed"))
		return
	adjustment.on_attack_right(subject)
	TEST_ASSERT(adjustment.toggled_open, "The production adjustment did not open the headcover.")
	if(!check_loudmouth_overlay(subject.overlays_standing[HEAD_LAYER], "loudmouth_t", HEAD_LAYER, cover.color, "HEAD open"))
		return
	TEST_ASSERT(subject.dropItemToGround(cover), "Could not remove the head-slot control.")

	// A separate non-obscuring head item must keep its own icon/state.
	TEST_ASSERT(subject.equip_to_slot_if_possible(hat, SLOT_HEAD, disable_warning = TRUE, bypass_equip_delay_self = TRUE), "Could not equip the other-hat control.")
	subject.update_inv_head()
	var/mutable_appearance/hat_before = subject.overlays_standing[HEAD_LAYER]
	TEST_ASSERT_NOTNULL(hat_before, "The other-hat control has no head overlay.")
	var/hat_icon = hat_before.icon
	var/hat_state = hat_before.icon_state

	// Baseline reaches the real MASK path but selects a sheet without these states.
	TEST_ASSERT(subject.equip_to_slot_if_possible(cover, SLOT_WEAR_MASK, disable_warning = TRUE, bypass_equip_delay_self = TRUE), "Could not equip the Loudmouth mask-slot case.")
	TEST_ASSERT_EQUAL(subject.wear_mask, cover, "The actual mask inventory slot did not receive the headcover.")
	TEST_ASSERT(!adjustment.toggled_open, "Re-equipping did not restore the normal closed state.")
	subject.update_inv_wear_mask()
	if(!check_loudmouth_overlay(subject.overlays_standing[MASK_LAYER], "loudmouth", MASK_LAYER, cover.color, "MASK closed"))
		return
	adjustment.on_attack_right(subject)
	TEST_ASSERT(adjustment.toggled_open, "The production adjustment did not open the mask-slot headcover.")
	if(!check_loudmouth_overlay(subject.overlays_standing[MASK_LAYER], "loudmouth_t", MASK_LAYER, cover.color, "MASK open"))
		return
	adjustment.on_attack_right(subject)
	TEST_ASSERT(!adjustment.toggled_open, "The production adjustment did not close the mask-slot headcover.")
	if(!check_loudmouth_overlay(subject.overlays_standing[MASK_LAYER], "loudmouth", MASK_LAYER, cover.color, "MASK reclosed"))
		return
	var/mutable_appearance/hat_after = subject.overlays_standing[HEAD_LAYER]
	TEST_ASSERT_NOTNULL(hat_after, "Adjusting the mask removed the other hat's overlay.")
	TEST_ASSERT_EQUAL(hat_after.icon, hat_icon, "Adjusting the mask changed the other hat's resource.")
	TEST_ASSERT_EQUAL(hat_after.icon_state, hat_state, "Adjusting the mask changed the other hat's state.")

	TEST_ASSERT(subject.dropItemToGround(cover), "Could not remove the mask-slot headcover.")
	subject.update_inv_wear_mask()
	TEST_ASSERT_NULL(subject.wear_mask, "Removing the headcover left a mask inventory reference.")
	TEST_ASSERT_NULL(subject.overlays_standing[MASK_LAYER], "Removing the headcover left a mask overlay.")

	// Do not accidentally make ordinary masks use the head-sheet override.
	var/obj/item/clothing/mask/ordinary_mask = allocate(/obj/item/clothing/mask)
	var/mutable_appearance/ordinary_overlay = ordinary_mask.build_worn_icon(default_layer = MASK_LAYER, default_icon_file = 'icons/mob/clothing/mask.dmi')
	TEST_ASSERT_NOTNULL(ordinary_overlay, "The ordinary mask control did not build an appearance.")
	TEST_ASSERT_EQUAL(ordinary_overlay.icon, 'icons/mob/clothing/mask.dmi', "The ordinary mask fallback resource changed.")

/datum/unit_test/loudmouth_mask_icon/proc/check_loudmouth_overlay(mutable_appearance/appearance, expected_state, expected_layer, expected_color, label)
	TEST_ASSERT_NOTNULL(appearance, "[label] did not create an overlay.")
	TEST_ASSERT(appearance.icon == 'icons/roguetown/clothing/onmob/head.dmi', "[label] chose the wrong worn sprite sheet.")
	TEST_ASSERT_EQUAL(appearance.icon_state, expected_state, "[label] changed the expected icon state.")
	TEST_ASSERT_EQUAL(appearance.layer, -expected_layer, "[label] changed the slot overlay layer.")
	TEST_ASSERT_EQUAL(appearance.color, expected_color, "[label] changed the headcover color.")
	var/list/states = icon_states(appearance.icon)
	TEST_ASSERT(expected_state in states, "[label] selected an unavailable base state.")
	TEST_ASSERT("[expected_state]_detail" in states, "[label] selected an unavailable detail state.")
	return TRUE
