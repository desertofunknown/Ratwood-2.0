// Exercise inherited soaking decisions without changing real fire or stress state.
/mob/living/carbon/human/consistent/soak_head_test
	var/coldhead_requests = 0
	var/rain_requests = 0
	var/other_stress_requests = 0
	var/extinguish_calls = 0
	var/parasol_queries = 0
	var/noble_parasol_queries = 0
	var/obj/item/clothing/cover_on_extinguish

/mob/living/carbon/human/consistent/soak_head_test/add_stress(event_type)
	switch(event_type)
		if(/datum/stressevent/coldhead)
			coldhead_requests++
		if(/datum/stressevent/parasolrain)
			rain_requests++
		else
			other_stress_requests++

/mob/living/carbon/human/consistent/soak_head_test/extinguish_mob()
	extinguish_calls++
	if(cover_on_extinguish)
		head = cover_on_extinguish

/mob/living/carbon/human/consistent/soak_head_test/is_holding_item_of_type(typepath)
	switch(typepath)
		if(/obj/item/rogueweapon/mace/parasol)
			parasol_queries++
		if(/obj/item/rogueweapon/mace/parasol/noble)
			noble_parasol_queries++
	return ..()

/obj/item/clothing/soak_head_test
	body_parts_covered = HEAD

/datum/unit_test/soak_head_coverage/Run()
	var/mob/living/carbon/human/consistent/soak_head_test/subject = allocate(/mob/living/carbon/human/consistent/soak_head_test)
	TEST_ASSERT(!HAS_TRAIT(subject, TRAIT_NOBLE), "The soaking fixture must start without the noble trait.")
	TEST_ASSERT(subject.dna && !isaxian(subject) && !islamia(subject), "The soaking fixture needs an ordinary human species.")
	var/obj/item/clothing/soak_head_test/cover = allocate(/obj/item/clothing/soak_head_test)
	var/obj/item/clothing/no_cover = allocate(/obj/item/clothing)
	var/obj/item/not_clothing = allocate(/obj/item)
	var/obj/item/rogueweapon/mace/parasol/parasol = allocate(/obj/item/rogueweapon/mace/parasol)
	var/obj/item/rogueweapon/mace/parasol/noble/noble_parasol = allocate(/obj/item/rogueweapon/mace/parasol/noble)
	// Soaking deliberately uses original coverage, not damaged/peeled coverage.
	cover.body_parts_covered_dynamic = NONE
	no_cover.body_parts_covered = CHEST
	no_cover.body_parts_covered_dynamic = HEAD
	not_clothing.body_parts_covered = HEAD

	var/list/locations_to_test = list(NONE, HEAD, CHEST, BELOW_CHEST, HEAD | CHEST, HEAD | BELOW_CHEST, FULL_BODY)
	for(var/locations in locations_to_test)
		check_case(subject, "bare [locations]", locations, expected_coldhead = !!(locations & HEAD), expected_parasol_queries = !!(locations & HEAD))
		check_case(subject, "covered [locations]", locations, equipment = list("head" = cover))
		check_case(subject, "ordinary parasol [locations]", locations, hands = list(parasol, null), expected_parasol_queries = !!(locations & HEAD))
		check_case(subject, "noble parasol [locations]", locations, hands = list(null, noble_parasol), noble = TRUE, expected_rain = 1, expected_parasol_queries = !!(locations & HEAD))
		check_case(subject, "covered noble [locations]", locations, equipment = list("head" = cover), hands = list(noble_parasol, null), noble = TRUE, expected_rain = 1)

	// Every existing slot stays eligible, including belt/back/storage and last slot.
	var/list/covered_slots = list("head", "wear_mask", "wear_wrists", "wear_shirt", "wear_neck", "cloak", "wear_armor", "wear_pants", "backr", "backl", "gloves", "shoes", "belt", "s_store", "glasses", "ears", "wear_ring")
	for(var/slot in covered_slots)
		var/list/equipment = list()
		equipment[slot] = cover
		check_case(subject, "coverage in [slot]", HEAD, equipment = equipment)
		equipment[slot] = no_cover
		check_case(subject, "dynamic-only coverage in [slot]", HEAD, equipment = equipment, expected_coldhead = 1, expected_parasol_queries = 1)

	check_case(subject, "non-clothing does not cover", HEAD, equipment = list("head" = not_clothing), expected_coldhead = 1, expected_parasol_queries = 1)
	check_case(subject, "non-covering head and covered ring", HEAD, equipment = list("head" = no_cover, "wear_ring" = cover))
	check_case(subject, "pockets do not cover", HEAD, equipment = list("l_store" = cover, "r_store" = cover), expected_coldhead = 1, expected_parasol_queries = 1)
	check_case(subject, "noble with ordinary parasol", HEAD, hands = list(parasol, null), noble = TRUE, expected_parasol_queries = 1)
	check_case(subject, "non-noble with fine parasol", HEAD, hands = list(noble_parasol, null), expected_parasol_queries = 1)
	check_case(subject, "noble without parasol", HEAD, noble = TRUE, expected_coldhead = 1, expected_parasol_queries = 1)
	// Parent SoakMob must still run first: its callback may change equipment.
	check_case(subject, "parent adds head covering", HEAD | CHEST, extinguish_cover = cover)

	var/datum/patron/divine/abyssor/abyssor = new
	var/datum/species/akula/akula = new
	var/datum/species/lamia/lamia = new
	allocated += list(abyssor, akula, lamia)
	check_case(subject, "Abyssor exemption", HEAD, test_patron = abyssor)
	check_case(subject, "Abyssor noble still enjoys rain", HEAD, hands = list(noble_parasol, null), noble = TRUE, expected_rain = 1, test_patron = abyssor)
	check_case(subject, "Axian exemption", HEAD, expected_parasol_queries = 1, test_species = akula)
	check_case(subject, "Lamia exemption", HEAD, expected_parasol_queries = 1, test_species = lamia)

	// Re-read the same item after a flag change; no persistent coverage cache.
	cover.body_parts_covered = NONE
	check_case(subject, "head coverage removed", HEAD, equipment = list("head" = cover), expected_coldhead = 1, expected_parasol_queries = 1)
	cover.body_parts_covered = HEAD
	check_case(subject, "head coverage restored", HEAD, equipment = list("head" = cover))

/datum/unit_test/soak_head_coverage/proc/check_case(mob/living/carbon/human/consistent/soak_head_test/subject, label, locations, list/equipment, list/hands, noble = FALSE, expected_coldhead = 0, expected_rain = 0, expected_parasol_queries = 0, datum/patron/test_patron, datum/species/test_species, obj/item/clothing/extinguish_cover)
	var/list/slot_names = list("head", "wear_mask", "wear_wrists", "wear_shirt", "wear_neck", "cloak", "wear_armor", "wear_pants", "backr", "backl", "gloves", "shoes", "belt", "s_store", "glasses", "ears", "wear_ring", "l_store", "r_store")
	var/list/original_equipment = list()
	for(var/slot in slot_names)
		original_equipment[slot] = subject.vars[slot]
		subject.vars[slot] = equipment ? equipment[slot] : null
	var/list/original_hands = subject.held_items
	var/datum/patron/original_patron = subject.patron
	var/datum/species/original_species = subject.dna.species
	subject.held_items = hands ? hands : list()
	subject.patron = test_patron
	if(test_species)
		subject.dna.species = test_species
	if(noble)
		ADD_TRAIT(subject, TRAIT_NOBLE, TRAIT_SOURCE_UNIT_TESTS)
	subject.coldhead_requests = 0
	subject.rain_requests = 0
	subject.other_stress_requests = 0
	subject.extinguish_calls = 0
	subject.parasol_queries = 0
	subject.noble_parasol_queries = 0
	subject.cover_on_extinguish = extinguish_cover

	var/result
	var/exception/failure
	try
		result = subject.SoakMob(locations)
	catch(var/exception/error)
		failure = error

	// Restore every query-only reference before assertions, yielding, or cleanup.
	for(var/slot in slot_names)
		subject.vars[slot] = original_equipment[slot]
	subject.held_items = original_hands
	subject.patron = original_patron
	subject.dna.species = original_species
	subject.cover_on_extinguish = null
	if(noble)
		REMOVE_TRAIT(subject, TRAIT_NOBLE, TRAIT_SOURCE_UNIT_TESTS)
	if(failure)
		throw failure

	TEST_ASSERT_NULL(result, "[label]: soaking changed the inherited return value.")
	TEST_ASSERT_EQUAL(subject.coldhead_requests, expected_coldhead, "[label]: cold-head stress eligibility changed.")
	TEST_ASSERT_EQUAL(subject.rain_requests, expected_rain, "[label]: noble rain stress eligibility changed.")
	TEST_ASSERT_EQUAL(subject.other_stress_requests, 0, "[label]: unexpected stress event.")
	TEST_ASSERT_EQUAL(subject.extinguish_calls, !!(locations & CHEST), "[label]: parent extinguishing changed.")
	TEST_ASSERT_EQUAL(subject.parasol_queries, expected_parasol_queries, "[label]: ordinary parasol short-circuit changed.")
	TEST_ASSERT_EQUAL(subject.noble_parasol_queries, !!noble, "[label]: noble parasol short-circuit changed.")
