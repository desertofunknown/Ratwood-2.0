/datum/unit_test/acorn_coffee_reaction/Run()
	var/datum/chemical_reaction/alch/acoffee/reaction = new
	allocated += reaction
	var/datum/reagents/holder = allocate(/datum/reagents, 100, NO_REACT)
	holder.add_reagent(/datum/reagent/water, 2)
	holder.add_reagent(/datum/reagent/consumable/Acoffee, 12)
	holder.add_reagent(/datum/reagent/consumable/milk, 3)

	// The holder supplies a reagent datum and numeric batch multiplier, not a
	// user and container. Cleanup must preserve the coffee and unrelated reagents.
	reaction.on_reaction(holder, 2)
	TEST_ASSERT_EQUAL(holder.get_reagent_amount(/datum/reagent/water), 0, "Acorn coffee left excess water in its reagent holder.")
	TEST_ASSERT_EQUAL(holder.get_reagent_amount(/datum/reagent/consumable/Acoffee), 12, "Acorn coffee cleanup removed the brewed coffee.")
	TEST_ASSERT_EQUAL(holder.get_reagent_amount(/datum/reagent/consumable/milk), 3, "Acorn coffee cleanup removed an unrelated reagent.")
	TEST_ASSERT_EQUAL(holder.total_volume, 15, "Acorn coffee cleanup did not update the holder volume.")

	reaction.on_reaction(holder, 2)
	TEST_ASSERT_EQUAL(holder.total_volume, 15, "Repeated acorn coffee cleanup changed the remaining reagents.")
	reaction.on_reaction(null, 2)

	// Exercise the production dispatcher with enough ingredients for two batches.
	var/datum/reagents/brewing_holder = allocate(/datum/reagents, 100, NO_REACT)
	brewing_holder.add_reagent(/datum/reagent/consumable/acorn_powder, 2, reagtemp = 400)
	brewing_holder.add_reagent(/datum/reagent/water, 12, reagtemp = 400)
	brewing_holder.add_reagent(/datum/reagent/consumable/milk, 3, reagtemp = 400)
	brewing_holder.flags &= ~NO_REACT
	brewing_holder.handle_reactions()
	TEST_ASSERT_EQUAL(brewing_holder.get_reagent_amount(/datum/reagent/consumable/acorn_powder), 0, "Brewing did not consume the acorn powder.")
	TEST_ASSERT_EQUAL(brewing_holder.get_reagent_amount(/datum/reagent/water), 0, "The production dispatcher did not remove excess brewing water.")
	TEST_ASSERT_EQUAL(brewing_holder.get_reagent_amount(/datum/reagent/consumable/Acoffee), 12, "Two batches did not produce the expected coffee volume.")
	TEST_ASSERT_EQUAL(brewing_holder.get_reagent_amount(/datum/reagent/consumable/milk), 3, "Brewing removed an unrelated reagent.")
	TEST_ASSERT_EQUAL(brewing_holder.total_volume, 15, "Brewing left an incorrect total volume.")
