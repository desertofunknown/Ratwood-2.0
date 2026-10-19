/// Count actual inventory scans without replacing the production visibility logic.
/mob/living/carbon/human/pronoun_obscurity_test
	var/obscurity_scans = 0

/mob/living/carbon/human/pronoun_obscurity_test/check_obscured_slots(transparent_protection)
	obscurity_scans++
	return ..()

// Baseline intentionally fails an early scan-count assertion. Clear query-only
// equipment refs even on that exit before normal human cleanup runs.
/mob/living/carbon/human/pronoun_obscurity_test/Destroy()
	wear_mask = null
	head = null
	wear_shirt = null
	belt = null
	backr = null
	return ..()

/datum/unit_test/pronoun_obscurity/Run()
	var/mob/living/carbon/human/pronoun_obscurity_test/subject = allocate(/mob/living/carbon/human/pronoun_obscurity_test)
	// A plain mob supplies the unchanged parent pronoun behavior, including
	// existing custom-pronoun quirks. The test independently supplies the
	// temporary gender that the old human visibility condition would select.
	var/mob/reference = allocate(/mob)
	var/obj/item/clothing/mask/mask = allocate(/obj/item/clothing/mask)
	var/obj/item/clothing/head/hat = allocate(/obj/item/clothing/head)
	var/obj/item/clothing/shirt = allocate(/obj/item/clothing)
	mask.flags_inv = HIDEFACE
	hat.flags_inv = HIDEFACE
	var/list/helpers = list("p_they", "p_their", "p_them", "p_have", "p_are", "p_were", "p_do", "p_s", "p_es")
	var/list/genders = list(MALE, FEMALE, NEUTER, PLURAL)
	var/list/pronoun_options = list(null, HE_HIM, HE_HIM_F, SHE_HER, SHE_HER_M, THEY_THEM, THEY_THEM_F, IT_ITS)
	var/list/overrides = list(null, MALE, FEMALE, NEUTER, PLURAL)

	// Bits: mask hides face, hat hides face, shirt hides the pants slot.
	// Reuse the same subject across scenarios to detect stale cached state.
	for(var/scenario in 0 to 12)
		// Yield only between scenarios, after removing artificial worn refs.
		subject.wear_mask = null
		subject.head = null
		subject.wear_shirt = null
		subject.belt = null
		subject.backr = null
		CHECK_TICK
		mask.flags_inv = HIDEFACE
		hat.flags_inv = HIDEFACE
		shirt.transparent_protection = NONE
		subject.belt = null
		subject.backr = null
		subject.wear_mask = (scenario & 1) ? mask : null
		subject.head = (scenario & 2) ? hat : null
		subject.wear_shirt = shirt
		shirt.flags_inv = (scenario & 4) ? HIDEJUMPSUIT : NONE
		var/face_hidden = !!(scenario & 3)
		var/gender_hidden = face_hidden && (scenario & 4)
		// Additional inventory edges beyond the eight basic flag combinations.
		switch(scenario)
			if(8) // A non-hiding mask must not suppress a hiding head item.
				subject.wear_mask = mask
				mask.flags_inv = NONE
				subject.head = hat
				shirt.flags_inv = HIDEJUMPSUIT
				face_hidden = TRUE
				gender_hidden = TRUE
			if(9, 10) // Preserve belt and back slot inclusion in the scan.
				subject.wear_mask = mask
				subject.wear_shirt = null
				shirt.flags_inv = HIDEJUMPSUIT
				if(scenario == 9)
					subject.belt = shirt
				else
					subject.backr = shirt
				face_hidden = TRUE
				gender_hidden = TRUE
			if(11) // Default scans must not include transparent protection.
				subject.wear_mask = mask
				shirt.flags_inv = NONE
				shirt.transparent_protection = HIDEJUMPSUIT
				face_hidden = TRUE
				gender_hidden = FALSE
			if(12) // A single item can hide both the face and the pants slot.
				subject.wear_mask = mask
				mask.flags_inv = HIDEFACE | HIDEJUMPSUIT
				shirt.flags_inv = NONE
				face_hidden = TRUE
				gender_hidden = TRUE
		for(var/body_gender in genders)
			subject.gender = body_gender
			reference.gender = body_gender
			for(var/pronoun_index in 1 to pronoun_options.len)
				subject.pronouns = pronoun_options[pronoun_index]
				reference.pronouns = pronoun_options[pronoun_index]
				for(var/override_index in 1 to overrides.len)
					var/temp_gender = overrides[override_index]
					var/reference_gender = gender_hidden ? PLURAL : temp_gender
					for(var/helper_index in 1 to helpers.len)
						var/helper = helpers[helper_index]
						var/has_capitalization = helper_index <= 3
						for(var/capitalized in 0 to has_capitalization)
							subject.obscurity_scans = 0
							var/actual
							var/expected
							if(has_capitalization)
								actual = call(subject, helper)(capitalized, temp_gender)
								expected = call(reference, helper)(capitalized, reference_gender)
							else
								actual = call(subject, helper)(temp_gender)
								expected = call(reference, helper)(reference_gender)
							TEST_ASSERT_EQUAL(actual, expected, "[helper], visibility [scenario], gender [body_gender], pronouns [pronoun_index], override [override_index], capitalization [capitalized] changed output.")
							TEST_ASSERT_EQUAL(subject.obscurity_scans, face_hidden, "[helper] should scan once only when a face-hiding item is present.")

	// Existing but non-hiding headgear must also take the zero-scan path.
	subject.wear_mask = mask
	subject.head = hat
	mask.flags_inv = NONE
	hat.flags_inv = NONE
	for(var/helper in helpers)
		subject.obscurity_scans = 0
		call(subject, helper)()
		TEST_ASSERT_EQUAL(subject.obscurity_scans, 0, "[helper] scanned despite both face-hiding flags being cleared.")
	// Equipment was assigned only for queries; leave no artificial worn refs.
	subject.wear_mask = null
	subject.head = null
	subject.wear_shirt = null
	subject.belt = null
	subject.backr = null
