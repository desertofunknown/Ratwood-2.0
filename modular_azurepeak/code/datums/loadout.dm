GLOBAL_LIST_INIT(loadout_items, init_subtypes(/datum/loadout_item))

/datum/loadout_item/field_atlas
	name = "Field Atlas"
	category = "Books and writing"
	path = /obj/item/field_map
	triumph_cost = 1
	keep_loadout_stats = TRUE

/datum/loadout_item/prospecting_kit
	name = "Prospector's Kit"
	category = "Weapons and tools"
	path = /obj/item/prospecting_kit
	triumph_cost = 2
	keep_loadout_stats = TRUE

/datum/loadout_item
	var/name = "Parent loadout datum"
	var/category = "Miscellaneous"
	var/desc
	var/path
	var/donoritem			//autoset on new if null
	var/list/ckeywhitelist
	var/triumph_cost
	var/keep_loadout_stats = FALSE	// If TRUE, item keeps default values (not nerfed)

/datum/loadout_item/New()
	if(isnull(donoritem))
		if(ckeywhitelist)
			donoritem = TRUE
	if (triumph_cost)
		desc += "Costs [triumph_cost] Points."

/datum/loadout_item/proc/donator_ckey_check(key)
	if(ckeywhitelist && ckeywhitelist.Find(key))
		return TRUE
	return

/datum/loadout_item/proc/nobility_check(client/C)
	// Override this in subtypes that require nobility
	return TRUE

/datum/loadout_item/proc/available_to(client/player)
	return player && nobility_check(player) && (!donoritem || donator_ckey_check(player.key))

// A character owns the selection and its customization after spawning.
/datum/loadout_entry
	var/slot
	var/item_path
	var/display_name
	var/custom_name
	var/custom_desc
	var/custom_color
	var/keep_stats = FALSE

/datum/loadout_entry/New(datum/preferences/prefs, datum/loadout_item/selection, selected_slot)
	. = ..()
	slot = selected_slot
	item_path = selection.path
	custom_name = prefs.vars["loadout_[slot]_name"]
	custom_desc = prefs.vars["loadout_[slot]_desc"]
	custom_color = prefs.vars["loadout_[slot]_hex"]
	display_name = custom_name ? custom_name : selection.name
	keep_stats = selection.keep_loadout_stats

/datum/loadout_entry/proc/create_item(atom/location, mob/user)
	var/obj/item/item = new item_path(location)
	if(custom_color)
		item.add_atom_colour(custom_color, FIXED_COLOUR_PRIORITY)
		item.update_icon()
	if(custom_name)
		item.original_name = item.name
		item.name = sanitize(custom_name)
		log_game("[key_name(user)] received loadout item with custom name: '[custom_name]' (original: '[item.original_name]')")
	if(custom_desc)
		item.desc = html_encode(custom_desc)
	if(!keep_stats)
		item.loadout_item = TRUE
		item.desc += " The overall look and feel of the item suggests this may be a mere reproduction."
		item.sellprice = 0
		item.smeltresult = /obj/item/ash
		if(istype(item, /obj/item/clothing))
			var/obj/item/clothing/clothing = item
			if(clothing.armor && (clothing.armor.blunt > 0 || clothing.armor.slash > 0 || clothing.armor.stab > 0 || clothing.armor.piercing > 0 || clothing.armor.fire > 0 || clothing.armor.acid > 0))
				clothing.prevent_crits = null
				if(clothing.armor_class != ARMOR_CLASS_NONE)
					clothing.armor_class = ARMOR_CLASS_LIGHT
				var/list/base_armor = ARMOR_MIND_PROTECTION
				var/scale = 1 + rand(-10, 10) / 100
				clothing.armor = getArmor(round(base_armor["blunt"] * scale), round(base_armor["slash"] * scale), round(base_armor["stab"] * scale), round(base_armor["piercing"] * scale), round(base_armor["fire"] * scale), round(base_armor["acid"] * scale), 0)
				var/variance = round(ARMOR_INT_CHEST_LIGHT_BASE * 0.1)
				clothing.max_integrity = ARMOR_INT_CHEST_LIGHT_BASE + rand(-variance, variance)
		if(item.force > 0)
			item.force = round(item.force * 0.7)
		if(item.wdefense > 0)
			item.wdefense = round(item.wdefense * 0.5)
		item.obj_integrity = item.max_integrity
	return item

/datum/loadout_entry/proc/equip_slots()
	var/obj/item/item_type = item_path
	var/flags = initial(item_type.slot_flags)
	var/list/candidates = list(SLOT_PANTS, SLOT_SHIRT, SLOT_ARMOR, SLOT_CLOAK, SLOT_BELT, SLOT_WEAR_MASK, SLOT_HEAD, SLOT_NECK, SLOT_GLOVES, SLOT_RING, SLOT_WRISTS, SLOT_SHOES)
	if(ispath(item_path, /obj/item/clothing) || ispath(item_path, /obj/item/storage))
		candidates += list(SLOT_BACK_L, SLOT_BACK_R, SLOT_BELT_L, SLOT_BELT_R)
	. = list()
	for(var/candidate in candidates)
		if(flags & slotdefine2slotbit(candidate))
			. += candidate

/datum/loadout_entry/proc/equip_over_role(mob/living/carbon/human/character, obj/item/item, target_slot, list/equipped_loadout)
	var/list/conflict_slots = list(target_slot)
	// Layered clothing can conflict across slots as well as within its own slot.
	if(target_slot in list(SLOT_SHIRT, SLOT_ARMOR, SLOT_CLOAK))
		for(var/other_slot in list(SLOT_SHIRT, SLOT_ARMOR, SLOT_CLOAK))
			if(other_slot == target_slot)
				continue
			var/obj/item/other = character.get_item_by_slot(other_slot)
			if(!other)
				continue
			if((item.blocking_behavior & BULKYBLOCKS) || (other.blocking_behavior & BULKYBLOCKS) || istype(other, item.type) || (target_slot != SLOT_CLOAK && other_slot != SLOT_CLOAK && item.blocksound && item.blocksound == other.blocksound))
				conflict_slots |= other_slot
	if(target_slot == SLOT_CLOAK && (item.slot_flags & ITEM_SLOT_BACK_R) && (character.backr?.slot_flags & ITEM_SLOT_CLOAK))
		conflict_slots |= SLOT_BACK_R
	if(target_slot == SLOT_BACK_R && (item.slot_flags & ITEM_SLOT_CLOAK) && (character.cloak?.slot_flags & ITEM_SLOT_BACK_R))
		conflict_slots |= SLOT_CLOAK
	var/list/displaced = list()
	var/list/dependent = list()
	for(var/slot in conflict_slots)
		var/obj/item/old_item = character.get_item_by_slot(slot)
		if(!old_item)
			continue
		if((old_item in equipped_loadout) || (old_item.item_flags & DROPDEL) || HAS_TRAIT(old_item, TRAIT_NODROP) || HAS_TRAIT(old_item, TRAIT_NO_SELF_UNEQUIP))
			return FALSE
		displaced["[slot]"] = old_item
		if(slot == SLOT_BELT)
			for(var/belt_slot in list(SLOT_BELT_L, SLOT_BELT_R))
				var/obj/item/attachment = character.get_item_by_slot(belt_slot)
				if(attachment)
					if(attachment.item_flags & DROPDEL)
						return FALSE
					dependent["[belt_slot]"] = attachment
		if(slot == SLOT_ARMOR && character.s_store)
			if(character.s_store.item_flags & DROPDEL)
				return FALSE
			dependent["[SLOT_S_STORE]"] = character.s_store
	var/can_replace = TRUE
	for(var/slot in displaced)
		if(!character.doUnEquip(displaced[slot], FALSE, get_turf(character), FALSE, invdrop = FALSE, silent = TRUE))
			can_replace = FALSE
			break
	var/equipped = can_replace && character.equip_to_slot_if_possible(item, target_slot, disable_warning = TRUE, bypass_equip_delay_self = TRUE, initial = TRUE)
	if(!equipped)
		for(var/slot in displaced)
			var/obj/item/old_item = displaced[slot]
			if(old_item.loc != character)
				// Restore the exact already-worn outfit when the replacement fails.
				character.equip_to_slot(old_item, text2num(slot), initial = TRUE)
	for(var/slot in dependent)
		var/obj/item/attachment = dependent[slot]
		if(text2num(slot) == SLOT_S_STORE && !character.wear_armor)
			character.dropItemToGround(attachment, TRUE, silent = TRUE)
			continue
		if(attachment.loc != character)
			character.equip_to_slot_if_possible(attachment, text2num(slot), disable_warning = TRUE, bypass_equip_delay_self = TRUE, initial = TRUE)
	return equipped

//Miscellaneous

/datum/loadout_item/card_deck
	name = "Card Deck"
	path = /obj/item/toy/cards/deck

/datum/loadout_item/farkle_dice
	name = "Farkle Dice Container"
	path = /obj/item/storage/pill_bottle/dice/farkle
	category = "Belts and storage"

/datum/loadout_item/gaming_dice
	name = "Gaming Dice Container"
	path = /obj/item/storage/pill_bottle/dice
	category = "Belts and storage"

/datum/loadout_item/dwarven_dice
	name = "Dwarven Dice Container"
	path = /obj/item/storage/pill_bottle/dice/dwarven
	category = "Belts and storage"

/datum/loadout_item/bakers_dozen_dice
	name = "Baker's Dozen Dice Container"
	path = /obj/item/storage/pill_bottle/dice/bakers_dozen
	category = "Belts and storage"

/datum/loadout_item/threes_away_dice
	name = "Three's Away Dice Container"
	path = /obj/item/storage/pill_bottle/dice/threes_away
	category = "Belts and storage"

/datum/loadout_item/dice_war_dice
	name = "Dice War Container"
	path = /obj/item/storage/pill_bottle/dice/dice_war
	category = "Belts and storage"

/datum/loadout_item/liars_dice
	name = "Liar's Dice Container"
	path = /obj/item/storage/pill_bottle/dice/liars_dice
	category = "Belts and storage"

/datum/loadout_item/dice_poker
	name = "Dice Poker Container"
	path = /obj/item/storage/pill_bottle/dice/dice_poker
	category = "Belts and storage"

/datum/loadout_item/tarot_deck
	name = "Tarot Deck"
	path = /obj/item/toy/cards/deck/tarot

/datum/loadout_item/tarot_deck_majorarcana
	name = "Tarot Deck (Major Arcana)"
	path = /obj/item/toy/cards/deck/tarot/majorarcana

/datum/loadout_item/custom_book
	name = "Custom Book"
	path = /obj/item/paper/scroll/custom
	category = "Books and writing"

/datum/loadout_item/hand_mirror
	name = "Hand Mirror"
	path = /obj/item/handmirror

//TOOLS

/datum/loadout_item/bauernwehr
	name = "Bauernwehr"
	path = /obj/item/rogueweapon/huntingknife/throwingknife/bauernwehr
	category = "Weapons and tools"
	triumph_cost = 3

/datum/loadout_item/broom
	name = "broom"
	path = /obj/item/broom
	triumph_cost = 1

/datum/loadout_item/soap
	name = "soap"
	path = /obj/item/soap
	triumph_cost = 3

/datum/loadout_item/candle
	name = "candle"
	path = /obj/item/candle/yellow
	triumph_cost = 1

/datum/loadout_item/keyring
	name = "keyring"
	path = /obj/item/storage/keyring
	category = "Belts and storage"
	triumph_cost = 3

/datum/loadout_item/wooden_bowl
	name = "bowl"
	path = /obj/item/reagent_containers/glass/bowl
	category = "Food and cookware"
	triumph_cost = 1

/datum/loadout_item/wooden_cup
	name = "cup"
	path = /obj/item/reagent_containers/glass/cup/wooden
	category = "Food and cookware"
	triumph_cost = 1

/datum/loadout_item/bottle
	name = "bottle"
	path = /obj/item/reagent_containers/glass/bottle/rogue
	category = "Food and cookware"
	triumph_cost = 1

/datum/loadout_item/waterskin
	name = "Waterskin"
	path = /obj/item/reagent_containers/glass/bottle/waterskin
	category = "Food and cookware"
	triumph_cost = 2

/datum/loadout_item/flint
	name = "Flint"
	path = /obj/item/flint
	triumph_cost = 2

/datum/loadout_item/aaneedle
	name = "Thorn Needle"
	path = /obj/item/needle/thorn
	triumph_cost = 2

/datum/loadout_item/bandage_roll
	name = "Roll of Bandages"
	path = /obj/item/natural/bundle/cloth/bandage/full
	triumph_cost = 3

/datum/loadout_item/sack
	name = "Sack"
	path = /obj/item/storage/roguebag
	category = "Belts and storage"
	triumph_cost = 2

/datum/loadout_item/mallet
	name = "Wooden Mallet"
	path = /obj/item/rogueweapon/hammer/wood
	category = "Weapons and tools"
	triumph_cost = 3

//ANCIENT TOOLS (Ancient Alloy)

/datum/loadout_item/ancient_hammer
	name = "Ancient Hammer"
	path = /obj/item/rogueweapon/hammer/ancient/decrepit
	category = "Weapons and tools"
	triumph_cost = 3

/datum/loadout_item/ancient_tongs
	name = "Ancient Tongs"
	path = /obj/item/rogueweapon/tongs/ancient/decrepit
	category = "Weapons and tools"
	triumph_cost = 3

/datum/loadout_item/ancient_pick
	name = "Ancient Pick"
	path = /obj/item/rogueweapon/pick/decrepit
	category = "Weapons and tools"
	triumph_cost = 3

/datum/loadout_item/ancient_shovel
	name = "Ancient Shovel"
	path = /obj/item/rogueweapon/shovel/decrepit
	category = "Weapons and tools"
	triumph_cost = 3

/datum/loadout_item/ancient_hoe
	name = "Ancient Hoe"
	path = /obj/item/rogueweapon/hoe/decrepit
	category = "Weapons and tools"
	triumph_cost = 3

/datum/loadout_item/ancient_sickle
	name = "Ancient Sickle"
	path = /obj/item/rogueweapon/sickle/decrepit
	category = "Weapons and tools"
	triumph_cost = 3

/datum/loadout_item/ancient_thresher
	name = "Ancient Thresher"
	path = /obj/item/rogueweapon/thresher/decrepit
	category = "Weapons and tools"
	triumph_cost = 3

/datum/loadout_item/ancient_pitchfork
	name = "Ancient Pitchfork"
	path = /obj/item/rogueweapon/pitchfork/decrepit
	category = "Weapons and tools"
	triumph_cost = 3

//COOKWARE
/datum/loadout_item/ancient_pan
	name = "Ancient Pan"
	path = /obj/item/cooking/pan/decrepit
	triumph_cost = 2

/datum/loadout_item/ancient_pot
	name = "Ancient Pot"
	path = /obj/item/reagent_containers/glass/bucket/pot/decrepit
	category = "Food and cookware"
	triumph_cost = 2

/datum/loadout_item/ancient_platter
	name = "Ancient Platter"
	path = /obj/item/cooking/platter/decrepit
	triumph_cost = 2

/datum/loadout_item/ancient_bowl
	name = "Ancient Bowl"
	path = /obj/item/reagent_containers/glass/bowl/decrepit
	category = "Food and cookware"
	triumph_cost = 2

/datum/loadout_item/ancient_mug
	name = "Ancient Mug"
	path = /obj/item/reagent_containers/glass/cup/decrepitmug
	category = "Food and cookware"
	triumph_cost = 2

/datum/loadout_item/ancient_goblet
	name = "Ancient Goblet"
	path = /obj/item/reagent_containers/glass/cup/decrepitgob
	category = "Food and cookware"
	triumph_cost = 2

/datum/loadout_item/ancient_spoon
	name = "Ancient Spoon"
	path = /obj/item/kitchen/spoon/decrepit
	triumph_cost = 2

/datum/loadout_item/ancient_fork
	name = "Ancient Fork"
	path = /obj/item/kitchen/fork/decrepit
	triumph_cost = 2

// TENT KITS

/datum/loadout_item/small_tent
    name = "Small Tent"
    path = /obj/item/tent_kit
    triumph_cost = 4

/datum/loadout_item/ger_kit
    name = "Ger Tent"
    path = /obj/item/tent_kit/ger
    triumph_cost = 6

/datum/loadout_item/yurt_tent
     name = "Yurt Tent"
     path = /obj/item/tent_kit/yurt
     triumph_cost = 8

//HATS
/datum/loadout_item/shalal
	name = "Keffiyeh"
	path = /obj/item/clothing/head/roguetown/roguehood/shalal
	category = "Headwear"

/datum/loadout_item/tricorn
	name = "Tricorn Hat"
	path = /obj/item/clothing/head/roguetown/helmet/tricorn
	category = "Headwear"

/datum/loadout_item/maidband
	name = "Maid's Headband"
	path = /obj/item/clothing/head/roguetown/maidband
	category = "Headwear"

/datum/loadout_item/nurseveil
	name = "Nurse's Veil"
	path = /obj/item/clothing/head/roguetown/veiled
	category = "Headwear"

/datum/loadout_item/archercap
	name = "Archer's cap"
	path = /obj/item/clothing/head/roguetown/archercap
	category = "Headwear"

/datum/loadout_item/articap
	name = "Artificer's Cap"
	path = /obj/item/clothing/head/roguetown/articap
	category = "Headwear"

/datum/loadout_item/strawhat
	name = "Straw Hat"
	path = /obj/item/clothing/head/roguetown/strawhat
	category = "Headwear"

/datum/loadout_item/witchhat
	name = "Witch Hat"
	path = /obj/item/clothing/head/roguetown/witchhat
	category = "Headwear"

/datum/loadout_item/witchhat/old
	name = "Witch Hat (Old)"
	path = /obj/item/clothing/head/roguetown/witchhat/old
	category = "Headwear"

/datum/loadout_item/bardhat
	name = "Bard Hat"
	path = /obj/item/clothing/head/roguetown/bardhat
	category = "Headwear"

/datum/loadout_item/duelhat
	name = "Duelist Hat"
	path = /obj/item/clothing/head/roguetown/duelisthat
	category = "Headwear"

/datum/loadout_item/fancyhat
	name = "Fancy Hat"
	path = /obj/item/clothing/head/roguetown/fancyhat
	category = "Headwear"

/datum/loadout_item/furhat
	name = "Fur Hat"
	path = /obj/item/clothing/head/roguetown/hatfur
	category = "Headwear"

/datum/loadout_item/bluehat
	name = "Blue Hat"
	path = /obj/item/clothing/head/roguetown/hatblu
	category = "Headwear"

/datum/loadout_item/smokingcap
	name = "Smoking Cap"
	path = /obj/item/clothing/head/roguetown/smokingcap
	category = "Headwear"

/datum/loadout_item/headband
	name = "Headband"
	path = /obj/item/clothing/head/roguetown/headband
	category = "Headwear"

/datum/loadout_item/buckled_hat
	name = "Buckled Hat"
	path = /obj/item/clothing/head/roguetown/puritan
	category = "Headwear"

/datum/loadout_item/folded_hat
	name = "Folded Hat"
	path = /obj/item/clothing/head/roguetown/bucklehat
	category = "Headwear"

/datum/loadout_item/duelist_hat
	name = "Duelist's Hat"
	path = /obj/item/clothing/head/roguetown/duelhat
	category = "Headwear"

/datum/loadout_item/hood
	name = "Hood"
	path = /obj/item/clothing/head/roguetown/roguehood
	category = "Headwear"

/datum/loadout_item/necromhood
    name = "Necromancer Hood"
    path = /obj/item/clothing/head/roguetown/necromhood

/datum/loadout_item/hijab
	name = "Hijab"
	path = /obj/item/clothing/head/roguetown/roguehood/shalal/hijab
	category = "Headwear"

/datum/loadout_item/heavyhood
	name = "Heavy Hood"
	path = /obj/item/clothing/head/roguetown/roguehood/shalal/heavyhood
	category = "Headwear"

/datum/loadout_item/nunveil
	name = "Nun Veil"
	path = /obj/item/clothing/head/roguetown/nun
	category = "Headwear"

/datum/loadout_item/papakha
	name = "Papakha"
	path = /obj/item/clothing/head/roguetown/papakha
	category = "Headwear"

/datum/loadout_item/rosa_crown
	name = "Rosa Crown"
	path = /obj/item/flowercrown/rosa

/datum/loadout_item/thorn_rosa_crown
	name = "Rosa Crown with Thorns"
	path = /obj/item/flowercrown/rosa/thorns

/datum/loadout_item/dyeable_crown
	name = "Gray Flower Crown"
	path = /obj/item/flowercrown/rosa/dyecrown

/datum/loadout_item/salvia_crown
	name = "Salvia Crown"
	path = /obj/item/flowercrown/salvia

/datum/loadout_item/matricaria_crown
	name = "Matricaria Crown"
	path = /obj/item/flowercrown/matricaria

/datum/loadout_item/calendula_crown
	name = "Calendula Crown"
	path = /obj/item/flowercrown/calendula

/datum/loadout_item/manabloom_crown
	name = "Manabloom Crown"
	path = /obj/item/flowercrown/manabloom

/datum/loadout_item/tri_grenzelhoft_hat_capless
	name = "Capless Grenzelhoft Hat"
	path = /obj/item/clothing/head/roguetown/caplessgrenzelhofthat
	category = "Headwear"

/datum/loadout_item/loadoutpapakha
	name = "Soft-sided papakha"
	path = /obj/item/clothing/head/roguetown/loadoutpapakha
	category = "Headwear"

//CLOAKS
/datum/loadout_item/tabard
	name = "Tabard"
	path = /obj/item/clothing/cloak/tabard
	category = "Cloaks"

/datum/loadout_item/tabard/astrata
	name = "Astrata Tabard"
	path = /obj/item/clothing/cloak/templar/astrata
	category = "Cloaks"

/datum/loadout_item/tabard/noc
	name = "Noc Tabard"
	path = /obj/item/clothing/cloak/templar/noc
	category = "Cloaks"

/datum/loadout_item/tabard/dendor
	name = "Dendor Tabard"
	path = /obj/item/clothing/cloak/templar/dendor
	category = "Cloaks"

/datum/loadout_item/tabard/malum
	name = "Malum Tabard"
	path = /obj/item/clothing/cloak/templar/malum
	category = "Cloaks"

/datum/loadout_item/tabard/eora
	name = "Eora Tabard"
	path = /obj/item/clothing/cloak/templar/eora
	category = "Cloaks"

/datum/loadout_item/tabard/pestra
	name = "Pestra Tabard"
	path = /obj/item/clothing/cloak/templar/pestra
	category = "Cloaks"

/datum/loadout_item/tabard/ravox
	name = "Ravox Tabard"
	path = /obj/item/clothing/cloak/cleric/ravox
	category = "Cloaks"

/datum/loadout_item/tabard/abyssor
	name = "Abyssor Tabard"
	path = /obj/item/clothing/cloak/templar/abyssor
	category = "Cloaks"

/datum/loadout_item/tabard/necra
	name = "Abyssor Tabard"
	path = /obj/item/clothing/cloak/templar/necra
	category = "Cloaks"

/datum/loadout_item/tabard/psydon
	name = "Psydon Tabard"
	path = /obj/item/clothing/cloak/templar/psydon
	category = "Cloaks"

/datum/loadout_item/surcoat
	name = "Surcoat"
	path = /obj/item/clothing/cloak/stabard
	category = "Cloaks"

/datum/loadout_item/jupon
	name = "Jupon"
	path = /obj/item/clothing/cloak/stabard/surcoat
	category = "Cloaks"

/datum/loadout_item/cape
	name = "Cape"
	path = /obj/item/clothing/cloak/cape
	category = "Cloaks"

/datum/loadout_item/halfcloak
	name = "Halfcloak"
	path = /obj/item/clothing/cloak/half
	category = "Cloaks"

/datum/loadout_item/duelcape
	name = "Duelist Cape"
	path = /obj/item/clothing/cloak/duelistcape
	category = "Cloaks"

/datum/loadout_item/ridercloak
	name = "Rider Cloak"
	path = /obj/item/clothing/cloak/half/rider
	category = "Cloaks"

/datum/loadout_item/raincloak
	name = "Rain Cloak"
	path = /obj/item/clothing/cloak/raincloak
	category = "Cloaks"

/datum/loadout_item/furcloak
	name = "Fur Cloak"
	path = /obj/item/clothing/cloak/raincloak/furcloak
	category = "Cloaks"

/datum/loadout_item/direcloak
	name = "direbear cloak"
	path = /obj/item/clothing/cloak/darkcloak/bear
	category = "Cloaks"

/datum/loadout_item/lightdirecloak
	name = "light direbear cloak"
	path = /obj/item/clothing/cloak/darkcloak/bear/light
	category = "Cloaks"

/datum/loadout_item/volfmantle
	name = "Volf Mantle"
	path = /obj/item/clothing/cloak/volfmantle
	category = "Cloaks"

/datum/loadout_item/eastcloak2
	name = "Leather Cloak"
	path = /obj/item/clothing/cloak/eastcloak2
	category = "Cloaks"

/datum/loadout_item/thief_cloak
	name = "Rapscallion's Shawl"
	path = /obj/item/clothing/cloak/thief_cloak
	category = "Cloaks"

/datum/loadout_item/wicker_cloak
	name = "Wicker Cloak"
	path = /obj/item/clothing/cloak/wickercloak
	category = "Cloaks"
/datum/loadout_item/tabardscarlet
	name = "Tabard, Scarlet"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/tabardscarlet
	category = "Shirts and robes"

/datum/loadout_item/shroudscarlet
	name = "Tabard's Shroud, Scarlet"
	path = /obj/item/clothing/head/roguetown/roguehood/shroudscarlet
	category = "Headwear"

/datum/loadout_item/tabardblack
	name = "Tabard, Black"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/tabardblack
	category = "Shirts and robes"

/datum/loadout_item/shroudblack
	name = "Tabard's Shroud, Black"
	path = /obj/item/clothing/head/roguetown/roguehood/shroudblack
	category = "Headwear"

/datum/loadout_item/tabardwhite
	name = "Tabard, White"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/tabardwhite
	category = "Shirts and robes"

/datum/loadout_item/shroudwhite
	name = "Tabard's Shroud, White"
	path = /obj/item/clothing/head/roguetown/roguehood/shroudwhite
	category = "Headwear"

/datum/loadout_item/poncho
	name = "Poncho"
	path = /obj/item/clothing/cloak/poncho
	category = "Cloaks"

/datum/loadout_item/guardhood
	name = "Guard's Hood"
	path = /obj/item/clothing/cloak/stabard/guardhood
	category = "Cloaks"

//SHOES
/datum/loadout_item/darkboots
	name = "Dark Boots"
	path = /obj/item/clothing/shoes/roguetown/boots
	category = "Footwear"

/datum/loadout_item/babouche
	name = "Babouche"
	path = /obj/item/clothing/shoes/roguetown/shalal
	category = "Footwear"

/datum/loadout_item/nobleboots
	name = "Noble Boots"
	path = /obj/item/clothing/shoes/roguetown/boots/nobleboot
	category = "Footwear"

/datum/loadout_item/sandals
	name = "Sandals"
	path = /obj/item/clothing/shoes/roguetown/sandals
	category = "Footwear"

/datum/loadout_item/toga_sandals
	name = "Fancy Sandals"
	path = /obj/item/clothing/shoes/roguetown/sandals/toga_sandals
	category = "Footwear"

/datum/loadout_item/shortboots
	name = "Short Boots"
	path = /obj/item/clothing/shoes/roguetown/shortboots
	category = "Footwear"

/datum/loadout_item/gladsandals
	name = "Gladiatorial Sandals"
	path = /obj/item/clothing/shoes/roguetown/gladiator
	category = "Footwear"

/datum/loadout_item/ridingboots
	name = "Riding Boots"
	path = /obj/item/clothing/shoes/roguetown/ridingboots
	category = "Footwear"

/datum/loadout_item/ankletscloth
	name = "Cloth Anklets"
	path = /obj/item/clothing/shoes/roguetown/boots/clothlinedanklets
	category = "Footwear"

/datum/loadout_item/ankletsfur
	name = "Fur Anklets"
	path = /obj/item/clothing/shoes/roguetown/boots/furlinedanklets
	category = "Footwear"

/datum/loadout_item/exoticanklets
	name = "Exotic Anklets"
	path = /obj/item/clothing/shoes/roguetown/anklets
	category = "Footwear"

/datum/loadout_item/rumaclanshoes
	name = "Raised Sandals"
	path = /obj/item/clothing/shoes/roguetown/armor/rumaclan
	category = "Footwear"

/datum/loadout_item/simpleshoes
	name = "Simple Shoes"
	path = /obj/item/clothing/shoes/roguetown/simpleshoes
	category = "Footwear"

/datum/loadout_item/paddedfootwraps
	name = "Padded Footwraps"
	path = /obj/item/clothing/shoes/roguetown/boots/footwraps/padded
	category = "Footwear"
	triumph_cost = 2

/datum/loadout_item/heleatherfootwraps
	name = "Hardened Leather Footwraps"
	path = /obj/item/clothing/shoes/roguetown/boots/footwraps/hleather
	category = "Footwear"
	triumph_cost = 2

//SHIRTS
/datum/loadout_item/longcoat
	name = "Longcoat"
	path = /obj/item/clothing/suit/roguetown/armor/longcoat
	category = "Armor"

/datum/loadout_item/robe
	name = "Robe"
	path = /obj/item/clothing/suit/roguetown/shirt/robe
	category = "Shirts and robes"

/datum/loadout_item/Necromrobe
    name = "Necromancer Robes"
    path = /obj/item/clothing/suit/roguetown/shirt/robe/necromancer

/datum/loadout_item/guilder_jacket
	name = "Guilder Jacket"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/merchant
	category = "Shirts and robes"

/datum/loadout_item/phys_robe
	name = "Physicker's Robe"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/phys
	category = "Shirts and robes"

/datum/loadout_item/feld_robe
	name = "Feldsher's Robe"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/feld
	category = "Shirts and robes"

/datum/loadout_item/formalsilks
	name = "Formal Silks"
	path = /obj/item/clothing/suit/roguetown/shirt/undershirt/puritan
	category = "Shirts and robes"

/datum/loadout_item/longshirt
	name = "Shirt"
	path = /obj/item/clothing/suit/roguetown/shirt/undershirt/black
	category = "Shirts and robes"

/datum/loadout_item/shortshirt
	name = "Short-sleeved Shirt"
	path = /obj/item/clothing/suit/roguetown/shirt/shortshirt
	category = "Shirts and robes"

/datum/loadout_item/sailorshirt
	name = "Striped Shirt"
	path = /obj/item/clothing/suit/roguetown/shirt/undershirt/sailor
	category = "Shirts and robes"

/datum/loadout_item/sailorshirt_colorable
	name = "Striped Shirt (Colorable)"
	path = /obj/item/clothing/suit/roguetown/shirt/undershirt/sailor/colored
	category = "Shirts and robes"

/datum/loadout_item/sailorjacket
	name = "Leather Jacket"
	path = /obj/item/clothing/suit/roguetown/armor/leather/vest/sailor
	category = "Armor"

/datum/loadout_item/artijacket
	name = "Artificer Jacket"
	path = /obj/item/clothing/suit/roguetown/armor/leather/jacket/artijacket
	category = "Armor"

/datum/loadout_item/priestrobe
	name = "Undervestments"
	path = /obj/item/clothing/suit/roguetown/shirt/undershirt/priest
	category = "Shirts and robes"

/datum/loadout_item/exoticsilkbra
	name = "Exotic Silk Bra"
	path = /obj/item/clothing/suit/roguetown/shirt/exoticsilkbra
	category = "Shirts and robes"

/datum/loadout_item/greenbra
	name = "Green Exotic Silk Bra"
	path = /obj/item/clothing/suit/roguetown/shirt/exoticsilkbra/green
	category = "Shirts and robes"

/datum/loadout_item/redbra
	name = "Red Exotic Silk Bra"
	path = /obj/item/clothing/suit/roguetown/shirt/exoticsilkbra/red
	category = "Shirts and robes"

/datum/loadout_item/bottomtunic
	name = "Low-cut Tunic"
	path = /obj/item/clothing/suit/roguetown/shirt/undershirt/lowcut
	category = "Shirts and robes"

/datum/loadout_item/tribalrag
	name = "Tribal Rag"
	path = /obj/item/clothing/suit/roguetown/shirt/tribalrag
	category = "Shirts and robes"

/datum/loadout_item/tunic
	name = "Tunic"
	path = /obj/item/clothing/suit/roguetown/shirt/tunic
	category = "Shirts and robes"

/datum/loadout_item/stripedtunic
	name = "Striped Tunic"
	path = /obj/item/clothing/suit/roguetown/armor/workervest
	category = "Armor"

/datum/loadout_item/formalshirt
	name = "Formal Shirt"
	path = /obj/item/clothing/suit/roguetown/shirt/undershirt/formal
	category = "Shirts and robes"

/datum/loadout_item/servantdress
	name = "Dress, Servant"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/maid/servant
	category = "Shirts and robes"

/datum/loadout_item/maiddress
	name = "Dress, Maid"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/maid
	category = "Shirts and robes"

/datum/loadout_item/dress
	name = "Dress"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/gen
	category = "Shirts and robes"

/datum/loadout_item/dress/bardress
	name = "Dress, Barmaid"
	path = /obj/item/clothing/suit/roguetown/shirt/dress
	category = "Shirts and robes"

/datum/loadout_item/dress/chemise
	name = "Chemise"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/silkdress
	category = "Shirts and robes"

/datum/loadout_item/dress/sexydress
	name = "Dress, Sheer"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/gen/sexy
	category = "Shirts and robes"

/datum/loadout_item/dress/straplessdress
	name = "Dress, Strapless"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/gen/strapless
	category = "Shirts and robes"

/datum/loadout_item/dress/straplessdress/alt
	name = "Dress, Strapless (Alt)"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/gen/strapless/alt
	category = "Shirts and robes"

/datum/loadout_item/dress/silkydress
	name = "Dress, Silky"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/silkydress
	category = "Shirts and robes"

/datum/loadout_item/dress/nobledress
	name = "Dress, Noble"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/noble
	category = "Shirts and robes"

/datum/loadout_item/dress/velvetdress
	name = "Dress, Velvet"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/velvet
	category = "Shirts and robes"

/datum/loadout_item/dress/winterdress_light
	name = "Dress, Cold"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/winterdress_light
	category = "Shirts and robes"

/datum/loadout_item/gown
	name = "Gown, Spring"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/gown
	category = "Shirts and robes"

/datum/loadout_item/gown/summer
	name = "Gown, Summer"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/gown/summergown
	category = "Shirts and robes"

/datum/loadout_item/gown/fall
	name = "Gown, Fall"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/gown/fallgown
	category = "Shirts and robes"

/datum/loadout_item/gown/winter
	name = "Gown, Winter"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/gown/wintergown
	category = "Shirts and robes"

/datum/loadout_item/gown/silkydress
	name = "Silky Dress"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/silkydress
	category = "Shirts and robes"

/datum/loadout_item/noblecoat
	name = "Fancy Coat"
	path = /obj/item/clothing/suit/roguetown/shirt/tunic/noblecoat
	category = "Shirts and robes"

/datum/loadout_item/leathervest
	name = "Leather Vest"
	path = /obj/item/clothing/suit/roguetown/armor/leather/vest
	category = "Armor"

/datum/loadout_item/nun_habit
	name = "Nun Habit"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/nun
	category = "Shirts and robes"

/datum/loadout_item/eastshirt1
	name = "Black Foreign Shirt"
	path = /obj/item/clothing/suit/roguetown/shirt/undershirt/eastshirt1
	category = "Shirts and robes"

/datum/loadout_item/eastshirt2
	name = "White Foreign Shirt"
	path = /obj/item/clothing/suit/roguetown/shirt/undershirt/eastshirt2
	category = "Shirts and robes"
//PANTS
/datum/loadout_item/loincloth
	name = "Loincloth"
	path = /obj/item/clothing/under/roguetown/loincloth
	category = "Pants"

/datum/loadout_item/tights
	name = "Cloth Tights"
	path = /obj/item/clothing/under/roguetown/tights/black
	category = "Pants"

/datum/loadout_item/leathertights
	name = "Leather Tights"
	path = /obj/item/clothing/under/roguetown/trou/leathertights
	category = "Pants"

/datum/loadout_item/formalshorts
	name = "Formal Shorts"
	path = /obj/item/clothing/under/roguetown/trou/formal/shorts
	category = "Pants"

/datum/loadout_item/formaltrousers
	name = "Formal Trousers"
	path = /obj/item/clothing/under/roguetown/trou/formal
	category = "Pants"

/datum/loadout_item/trou
	name = "Work Trousers"
	path = /obj/item/clothing/under/roguetown/trou
	category = "Pants"

/datum/loadout_item/leathertrou
	name = "Leather Trousers"
	path = /obj/item/clothing/under/roguetown/trou/leather
	category = "Pants"

/datum/loadout_item/leathershorts
	name = "Leather Shorts"
	path = /obj/item/clothing/under/roguetown/heavy_leather_pants/shorts
	category = "Pants"

/datum/loadout_item/sailorpants
	name = "Seafaring Pants"
	path = /obj/item/clothing/under/roguetown/tights/sailor
	category = "Pants"

/datum/loadout_item/skirt
	name = "Skirt"
	path = /obj/item/clothing/under/roguetown/skirt
	category = "Pants"

/datum/loadout_item/sirwal
	name = "Sirwal"
	path = /obj/item/clothing/under/roguetown/sirwal
	category = "Pants"

/datum/loadout_item/thong
	name = "Thong"
	path = /obj/item/clothing/under/roguetown/thong
	category = "Pants"

//ACCESSORIES
/datum/loadout_item/wrappings
	name = "Handwraps"
	path = /obj/item/clothing/wrists/roguetown/wrappings
	category = "Jewelry and neckwear"


/datum/loadout_item/bronze_duelist_goggles
	name = "Bronze Duelist Goggles"
	path = /obj/item/clothing/mask/rogue/spectacles/duelist/bronze
	category = "Masks"

/datum/loadout_item/golden_spectacles
	name = "Golden Spectacles"
	path = /obj/item/clothing/mask/rogue/spectacles/golden
	category = "Masks"

/datum/loadout_item/fingerless_leather_gloves
	name = "Fingerless Leather Gloves"
	path = /obj/item/clothing/gloves/roguetown/fingerless_leather
	category = "Gloves"

/datum/loadout_item/allwrappings
	name = "Cloth Wrappings"
	path = /obj/item/clothing/wrists/roguetown/allwrappings
	category = "Jewelry and neckwear"

/datum/loadout_item/spectacles
	name = "Spectacles"
	path = /obj/item/clothing/mask/rogue/spectacles
	category = "Masks"

/datum/loadout_item/gloves
	name = "Leather Gloves"
	path = /obj/item/clothing/gloves/roguetown/leather
	category = "Gloves"

/datum/loadout_item/fingerless
	name = "Fingerless Gloves"
	path = /obj/item/clothing/gloves/roguetown/fingerless
	category = "Gloves"

/datum/loadout_item/bandages
	name = "Bandages, Gloves"
	path = /obj/item/clothing/gloves/roguetown/bandages
	category = "Gloves"

/datum/loadout_item/exoticsilkbelt
	name = "Exotic Silk Belt"
	path = /obj/item/storage/belt/rogue/leather/exoticsilkbelt
	category = "Belts and storage"

/datum/loadout_item/greenskirt
	name = "Green Exotic Silk Belt"
	path = /obj/item/storage/belt/rogue/leather/exoticsilkbelt/skirtgreen
	category = "Belts and storage"

/datum/loadout_item/redskirt
	name = "Red Exotic Silk Belt"
	path = /obj/item/storage/belt/rogue/leather/exoticsilkbelt/skirtred
	category = "Belts and storage"

/datum/loadout_item/butlersuspenders
	name = "Suspenders"
	path = /obj/item/storage/belt/rogue/leather/suspenders/butler
	category = "Belts and storage"

/datum/loadout_item/butlersuspenders_colorable
	name = "Suspenders (Colorable)"
	path = /obj/item/storage/belt/rogue/leather/suspenders/butler/colored
	category = "Belts and storage"

/datum/loadout_item/ragmask
	name = "Rag Mask"
	path = /obj/item/clothing/mask/rogue/ragmask
	category = "Masks"

/datum/loadout_item/halfmask
	name = "Halfmask"
	path = /obj/item/clothing/mask/rogue/shepherd
	category = "Masks"

/datum/loadout_item/golden_half_mask
	name = "Golden Half-Mask"
	path = /obj/item/clothing/mask/rogue/lordmask
	category = "Masks"

/datum/loadout_item/exoticsilkmask
	name = "Exotic Silk Mask"
	path = /obj/item/clothing/mask/rogue/exoticsilkmask
	category = "Masks"

/datum/loadout_item/maskgreen
	name = "Green Exotic Silk Mask"
	path = /obj/item/clothing/mask/rogue/exoticsilkmask/green
	category = "Masks"

/datum/loadout_item/maskred
	name = "Red Exotic Silk Mask"
	path = /obj/item/clothing/mask/rogue/exoticsilkmask/red
	category = "Masks"

/datum/loadout_item/duelmask
	name = "Duelist's Mask"
	path = /obj/item/clothing/mask/rogue/duelmask
	category = "Masks"

/datum/loadout_item/pipe
	name = "Pipe"
	path = /obj/item/clothing/mask/cigarette/pipe
	category = "Masks"

/datum/loadout_item/pipewestman
	name = "Westman Pipe"
	path = /obj/item/clothing/mask/cigarette/pipe/westman
	category = "Masks"

/datum/loadout_item/feather
	name = "Feather"
	path = /obj/item/natural/feather

/datum/loadout_item/cursed_collar
	name = "Cursed Collar"
	path = /obj/item/clothing/neck/roguetown/cursed_collar
	category = "Jewelry and neckwear"

/datum/loadout_item/chastity_belt
	name = "Chastity Belt"
	path = /obj/item/chastity
	triumph_cost = 1

/datum/loadout_item/chastity_cage
	name = "Chastity Cage"
	path = /obj/item/chastity/chastity_cage
	triumph_cost = 1

/datum/loadout_item/chastity_cage_anal
	name = "Chastity Cage with Anal Shield"
	path = /obj/item/chastity/chastity_cage/anal
	triumph_cost = 1

/datum/loadout_item/chastity_cage_spiked
	name = "Spiked Chastity Cage"
	path = /obj/item/chastity/chastity_cage/spiked
	triumph_cost = 1

/datum/loadout_item/chastity_cage_spiked_anal
	name = "Spiked Chastity Cage with Anal Shield"
	path = /obj/item/chastity/chastity_cage/spiked_anal
	triumph_cost = 1

/datum/loadout_item/chastity_cage_flat
	name = "Flat Chastity Cage"
	path = /obj/item/chastity/chastity_cage/flat
	triumph_cost = 1

/datum/loadout_item/chastity_cage_flat_anal
	name = "Flat Chastity Cage with Anal Shield"
	path = /obj/item/chastity/chastity_cage/flat/anal
	triumph_cost = 1

/datum/loadout_item/chastity_cage_flat_spiked
	name = "Spiked Flat Chastity Cage"
	path = /obj/item/chastity/chastity_cage/flat/spiked
	triumph_cost = 1

/datum/loadout_item/chastity_cage_flat_spiked_anal
	name = "Spiked Flat Chastity Cage with Anal Shield"
	path = /obj/item/chastity/chastity_cage/flat/spiked_anal
	triumph_cost = 1

/datum/loadout_item/chastity_insertable
	name = "Chastity Insertable"
	path = /obj/item/chastity/chastity_belt
	triumph_cost = 1

/datum/loadout_item/chastity_insertable_anal
	name = "Chastity Insertable with Anal Shield"
	path = /obj/item/chastity/chastity_belt/anal
	triumph_cost = 1

/datum/loadout_item/chastity_insertable_spiked
	name = "Spiked Chastity Insertable"
	path = /obj/item/chastity/chastity_belt/spiked
	triumph_cost = 1

/datum/loadout_item/chastity_insertable_spiked_anal
	name = "Spiked Chastity Insertable with Anal Shield"
	path = /obj/item/chastity/chastity_belt/spiked_anal
	triumph_cost = 1

/datum/loadout_item/chastity_combination
	name = "Combination Chastity Device"
	path = /obj/item/chastity/intersex
	triumph_cost = 1

/datum/loadout_item/chastity_combination_spiked
	name = "Spiked Combination Chastity Device"
	path = /obj/item/chastity/intersex/spiked
	triumph_cost = 1

/datum/loadout_item/chastity_cursed
	name = "Cursed Chastity Device"
	path = /obj/item/chastity/cursed
	triumph_cost = 4

/datum/loadout_item/wooddildo
	name = "Wooden Dildo"
	path = /obj/item/dildo/wood

/datum/loadout_item/irondildo
	name = "Iron Dildo"
	path = /obj/item/dildo/iron
	
/datum/loadout_item/copperdildo
	name = "Copper Dildo"
	path = /obj/item/dildo/copper

/datum/loadout_item/cloth_blindfold
	name = "Blindfold"
	path = /obj/item/clothing/mask/rogue/blindfold
	category = "Masks"

/datum/loadout_item/fake_blindfold
	name = "Fake Blindfold"
	path = /obj/item/clothing/mask/rogue/blindfold/fake
	category = "Masks"

/datum/loadout_item/bases
	name = "Cloth military skirt"
	path = /obj/item/storage/belt/rogue/leather/battleskirt
	category = "Belts and storage"

/datum/loadout_item/fauldedbelt
	name = "Belt with faulds"
	path = /obj/item/storage/belt/rogue/leather/battleskirt/faulds
	category = "Belts and storage"

/datum/loadout_item/breechskirt
	name = "Belt with Breechcloth"
	path = /obj/item/storage/belt/rogue/leather/battleskirt/breechcloth
	category = "Belts and storage"

/datum/loadout_item/tri_cloth_belt
	name = "Cloth Belt"
	path = /obj/item/storage/belt/rogue/leather/cloth
	category = "Belts and storage"

/datum/loadout_item/tri_kazengun_scabbard
	name = "Kazengun Cerimonial Scabbard"
	path = /obj/item/rogueweapon/scabbard/sword/kazengun/noparry/loadout
	category = "Weapons and tools"
	triumph_cost = 3

/datum/loadout_item/tri_kazengun_scabbard/nobility_check(client/C)
	var/datum/preferences/P = C.prefs
	if(!P)
		return FALSE
	// Check if user has the Nobility quirk
	if(P.has_quirk(/datum/quirk/noble))
		return TRUE
	// Check if user has high priority for any noble, courtier, or yeoman job
	for(var/job_title in GLOB.noble_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.courtier_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.yeoman_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	return FALSE

/datum/loadout_item/tri_shalal_belt
	name = "Shalal Belt"
	path = /obj/item/storage/belt/rogue/leather/shalal
	category = "Belts and storage"

// BELTS
/datum/loadout_item/leather
	name = "Leather Belt"
	path = /obj/item/storage/belt/rogue/leather
	category = "Belts and storage"

/datum/loadout_item/leather_black
	name = "Black Leather Belt"
	path = /obj/item/storage/belt/rogue/leather/black
	category = "Belts and storage"

/datum/loadout_item/doublebelt
	name = "Paired slim belts"
	path = /obj/item/storage/belt/rogue/leather/double
	category = "Belts and storage"

/datum/loadout_item/belt_cloth
	name = "Cloth Sash"
	path = /obj/item/storage/belt/rogue/leather/sash
	category = "Belts and storage"

/datum/loadout_item/belt_rope
	name = "Rope Belt"
	path = /obj/item/storage/belt/rogue/leather/rope
	category = "Belts and storage"

// Religious Amulets.

/datum/loadout_item/psicross
	name = "Psydonian Cross"
	path = /obj/item/clothing/neck/roguetown/psicross
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross_reform
	name = "Reformist Psycross"
	path = /obj/item/clothing/neck/roguetown/psicross/reform
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/astrata
	name = "Amulet of Astrata"
	path = /obj/item/clothing/neck/roguetown/psicross/astrata
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/noc
	name = "Amulet of Noc"
	path = /obj/item/clothing/neck/roguetown/psicross/noc
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/abyssor
	name = "Amulet of Abyssor"
	path = /obj/item/clothing/neck/roguetown/psicross/abyssor
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/xylix
	name = "Amulet of Xylix"
	path = /obj/item/clothing/neck/roguetown/psicross/xylix
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/dendor
	name = "Amulet of Dendor"
	path = /obj/item/clothing/neck/roguetown/psicross/dendor
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/necra
	name = "Amulet of Necra"
	path = /obj/item/clothing/neck/roguetown/psicross/necra
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/pestra
	name = "Amulet of Pestra"
	path = /obj/item/clothing/neck/roguetown/psicross/pestra
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/ravox
	name = "Amulet of Ravox"
	path = /obj/item/clothing/neck/roguetown/psicross/ravox
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/malum
	name = "Amulet of Malum"
	path = /obj/item/clothing/neck/roguetown/psicross/malum
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/eora
	name = "Amulet of Eora"
	path = /obj/item/clothing/neck/roguetown/psicross/eora
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/zizo
	name = "Ancient Zcross"
	path = /obj/item/clothing/neck/roguetown/psicross/inhumen/ancient
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/matthios
	name = "Amulet of Matthios"
	path = /obj/item/clothing/neck/roguetown/psicross/inhumen/matthios
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/graggar
	name = "Amulet of Graggar"
	path = /obj/item/clothing/neck/roguetown/psicross/inhumen/graggar
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/baotha
	name = "Amulet of Baotha"
	path = /obj/item/clothing/neck/roguetown/psicross/inhumen/baotha
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/ten
	name = "Amulet of Ten"
	path = /obj/item/clothing/neck/roguetown/psicross/ten
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/gronngraggar
	name = "Amulet of the Moose"
	path = /obj/item/clothing/neck/roguetown/psicross/inhumen/graggar/gronn
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/gronnmatthios
	name = "Amulet of the Bear"
	path = /obj/item/clothing/neck/roguetown/psicross/inhumen/matthios/gronn
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/gronnzizo
	name = "Amulet of the Wolf"
	path = /obj/item/clothing/neck/roguetown/psicross/inhumen/gronn
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/gronnmbaotha
	name = "Amulet of the Leopard"
	path = /obj/item/clothing/neck/roguetown/psicross/inhumen/baotha/gronn
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/gronnabyssor
	name = "Amulet of the Kraken"
	path = /obj/item/clothing/neck/roguetown/psicross/abyssor/gronn
	category = "Jewelry and neckwear"

/datum/loadout_item/psicross/gronndendor
	name = "Amulet of the Volfskinned Man"
	path = /obj/item/clothing/neck/roguetown/psicross/dendor/gronn
	category = "Jewelry and neckwear"

/datum/loadout_item/wedding_band
	name = "silver wedding band"
	path = /obj/item/clothing/ring/band
	category = "Jewelry and neckwear"

/datum/loadout_item/chaperon
	name = "Chaperon (Normal)"
	path = /obj/item/clothing/head/roguetown/chaperon
	category = "Headwear"

/datum/loadout_item/chaperon/alt
	name = "Chaperon (Alt)"
	path = /obj/item/clothing/head/roguetown/chaperon/greyscale
	category = "Headwear"

/datum/loadout_item/chaperon/burgher
	name = "Noble's Chaperon"
	path = /obj/item/clothing/head/roguetown/chaperon/noble
	category = "Headwear"

/datum/loadout_item/jesterhat
	name = "Jester's Hat"
	path = /obj/item/clothing/head/roguetown/jester
	category = "Headwear"

/datum/loadout_item/jestertunick
	name = "Jester's Tunick"
	path = /obj/item/clothing/suit/roguetown/shirt/jester
	category = "Shirts and robes"

/datum/loadout_item/jestershoes
	name = "Jester's Shoes"
	path = /obj/item/clothing/shoes/roguetown/jester
	category = "Footwear"

/datum/loadout_item/jestermask
	name = "Jester's Mask"
	path = /obj/item/clothing/mask/rogue/xylixmask
	category = "Masks"

/datum/loadout_item/cotehardie
	name = "Fitted Coat"
	path = /obj/item/clothing/cloak/cotehardie
	category = "Cloaks"

/datum/loadout_item/zcross_iron
	name = "Zizo Cross"
	path = /obj/item/clothing/neck/roguetown/psicross/inhumen
	category = "Jewelry and neckwear"

// NECKLACES & AMULETS
/datum/loadout_item/skull_amulet
	name = "Skull Amulet"
	path = /obj/item/clothing/neck/roguetown/skullamulet
	category = "Jewelry and neckwear"

/datum/loadout_item/collar_feldcollar
	name = "Feldcollar"
	path = /obj/item/clothing/neck/roguetown/collar/feldcollar
	category = "Jewelry and neckwear"

/datum/loadout_item/collar_surgcollar
	name = "Surgcollar"
	path = /obj/item/clothing/neck/roguetown/collar/surgcollar
	category = "Jewelry and neckwear"

/datum/loadout_item/scarf
	name = "Scarf"
	path = /obj/item/clothing/head/roguetown/scarf
	category = "Headwear"

// MASKS
/datum/loadout_item/skullmask
	name = "Skull Mask"
	path = /obj/item/clothing/mask/rogue/skullmask
	category = "Masks"

/datum/loadout_item/physician_mask
	name = "Physician Mask"
	path = /obj/item/clothing/mask/rogue/physician
	category = "Masks"

/datum/loadout_item/kitsune_mask
	name = "Old Kitsune Mask"
	path = /obj/item/clothing/mask/rogue/facemask/yoruku_kitsune
	category = "Masks"

/datum/loadout_item/oni_mask
	name = "Old Oni Mask"
	path = /obj/item/clothing/mask/rogue/facemask/yoruku_oni
	category = "Masks"

/datum/loadout_item/naledi_lordmask
	name = "Old Naledi Mask"
	path = /obj/item/clothing/mask/rogue/lordmask/naledi
	category = "Masks"

// CLOAKS
/datum/loadout_item/darkcloak
	name = "Dark Cloak"
	path = /obj/item/clothing/cloak/darkcloak
	category = "Cloaks"

/datum/loadout_item/apron
	name = "Apron"
	path = /obj/item/clothing/cloak/apron
	category = "Cloaks"

/datum/loadout_item/apron_blacksmith
	name = "Blacksmith Apron"
	path = /obj/item/clothing/cloak/apron/blacksmith
	category = "Cloaks"

/datum/loadout_item/apron_waist
	name = "Waist Apron"
	path = /obj/item/clothing/cloak/apron/waist
	category = "Cloaks"

/datum/loadout_item/apron_cook
	name = "Cook's Apron"
	path = /obj/item/clothing/cloak/apron/cook
	category = "Cloaks"

/datum/loadout_item/black_cloak
	name = "Fur Overcloak"
	path = /obj/item/clothing/cloak/black_cloak
	category = "Cloaks"

/datum/loadout_item/tribal_cloak
	name = "Tribal Cloak"
	path = /obj/item/clothing/cloak/tribal
	category = "Cloaks"

/datum/loadout_item/maidapron
	name = "Maid's Apron"
	path = /obj/item/clothing/cloak/apron/maid
	category = "Cloaks"

/datum/loadout_item/battlenun_cloak
	name = "Nun Cloak"
	path = /obj/item/clothing/cloak/battlenun
	category = "Cloaks"

/datum/loadout_item/hierophant_cloak
	name = "Hierophant Cloak"
	path = /obj/item/clothing/cloak/hierophant
	category = "Cloaks"

/datum/loadout_item/forrester_snow
	name = "Snow Forrester Cloak"
	path = /obj/item/clothing/cloak/forrestercloak/snow
	category = "Cloaks"

/datum/loadout_item/eastcloak1
	name = "Eastern Cloak"
	path = /obj/item/clothing/cloak/eastcloak1
	category = "Cloaks"

/datum/loadout_item/kazengun_cloak
	name = "Jinbaori"
	path = /obj/item/clothing/cloak/kazengun
	category = "Cloaks"

// SHOES
/datum/loadout_item/sandals
	name = "Sandals"
	path = /obj/item/clothing/shoes/roguetown/sandals
	category = "Footwear"

// NECK/GORGETS
/datum/loadout_item/forlorn_collar
	name = "Old Forlorn Collar"
	path = /obj/item/clothing/neck/roguetown/gorget/forlorncollar
	category = "Jewelry and neckwear"

// EASTERN CLOTHING
/datum/loadout_item/captain_robe
	name = "Eastern Flowery Robe"
	path = /obj/item/clothing/suit/roguetown/armor/basiceast/captainrobe
	category = "Armor"

/datum/loadout_item/decorative_captain_robe
	name = "Decorative Flowery Robe"
	path = /obj/item/clothing/suit/roguetown/armor/basiceast/captainrobe/decorative
	category = "Armor"

/datum/loadout_item/mentor_suit
	name = "Eastern Mentor Suit"
	path = /obj/item/clothing/suit/roguetown/armor/basiceast/mentorsuit
	category = "Armor"

/datum/loadout_item/decorative_mentor_suit
	name = "Decorative Mentor Robe"
	path = /obj/item/clothing/suit/roguetown/armor/basiceast/mentorsuit/decorative
	category = "Armor"

/datum/loadout_item/crafteast
	name = "Eastern Craft Robe"
	path = /obj/item/clothing/suit/roguetown/armor/basiceast/crafteast
	category = "Armor"

/datum/loadout_item/dopoeast
	name = "Eastern dopo Robe"
	path = /obj/item/clothing/suit/roguetown/armor/basiceast
	category = "Armor"

// HEADWEAR
/datum/loadout_item/nochood
	name = "Noc Hood"
	path = /obj/item/clothing/head/roguetown/nochood
	category = "Headwear"

/datum/loadout_item/dendormask
	name = "Briar Mask"
	path = /obj/item/clothing/head/roguetown/dendormask
	category = "Headwear"

/datum/loadout_item/necrahood
	name = "Necra Hood"
	path = /obj/item/clothing/head/roguetown/necrahood
	category = "Headwear"

/datum/loadout_item/physhood
	name = "Pestra Hood"
	path = /obj/item/clothing/head/roguetown/roguehood/phys
	category = "Headwear"

// ROBES - ASTRATA

/datum/loadout_item/eoramask
	name = "Eora Mask"
	path = /obj/item/clothing/head/roguetown/eoramask
	category = "Headwear"

/datum/loadout_item/antlerhood
	name = "Antler Hood"
	path = /obj/item/clothing/head/roguetown/antlerhood
	category = "Headwear"

/datum/loadout_item/briarthorns
	name = "Briar Thorns Headpiece"
	path = /obj/item/clothing/head/roguetown/padded/briarthorns
	category = "Headwear"

/datum/loadout_item/mentorhat
	name = "conical mentor hat"
	path = /obj/item/clothing/head/roguetown/mentorhat
	category = "Headwear"

/datum/loadout_item/decorative_mentorhat
	name = "decorative bamboo hat"
	path = /obj/item/clothing/head/roguetown/mentorhat/decorative
	category = "Headwear"

// ROBES - ASTRATA
/datum/loadout_item/robe_astrata
	name = "Sun Robe"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/astrata
	category = "Shirts and robes"

/datum/loadout_item/hood_astrata
	name = "Sun Hood"
	path = /obj/item/clothing/head/roguetown/roguehood/astrata
	category = "Headwear"

// ROBES - NOC
/datum/loadout_item/robe_noc
	name = "Moon Robe"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/noc
	category = "Shirts and robes"

// ROBES - DENDOR
/datum/loadout_item/robe_dendor
	name = "Briar Robe"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/dendor
	category = "Shirts and robes"

// ROBES - ABYSSOR
/datum/loadout_item/robe_abyssor
	name = "Depths Robe"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/abyssor
	category = "Shirts and robes"

/datum/loadout_item/hood_abyssor
	name = "Depths Hood"
	path = /obj/item/clothing/head/roguetown/roguehood/abyssor
	category = "Headwear"

// ROBES - NECRA
/datum/loadout_item/robe_necra
	name = "Mourning Robe"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/necra
	category = "Shirts and robes"

// ROBES - RAVOX
/datum/loadout_item/hood_ravox
	name = "Ravox Tabard Gorget"
	path = /obj/item/clothing/head/roguetown/roguehood/ravoxgorget
	category = "Headwear"

// ROBES - EORA
/datum/loadout_item/robe_eora
	name = "Eoran Robe"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/eora
	category = "Shirts and robes"

//==========================
// TRIUMPH LOADOUT ITEMS
//==========================
//
// IMPORTANT INFORMATION ABOUT LOADOUT ITEMS:
// All items selected from the loadout system receive the following automatic modifications:
// - ARMOR: Set to ARMOR_PADDED_BAD (basic padded values) and ARMOR_INT_CHEST_LIGHT_BASE max integrity
// - ARMOR CLASS: Set to LIGHT for all armor pieces
// - SELL PRICE: Set to 0 (cannot be sold for profit)
// - CRIT PREVENTION: Removed from clothing items (prevent_crits set to null)
// - WEAPON DAMAGE: Reduced by 30% (force reduced to 70% of original)
// - WEAPON DEFENSE: Reduced by 50% (wdefense halved)
// - SMELT RESULT: Set to ash (cannot be smelted for materials)
// - EXAMINATION: Items show as reproductions when examined
//
// These modifications ensure loadout items provide utility and customization
// without bypassing game progression or economy balance.
// without bypassing game progression or economy balance.
//
//─────────────────────────────────────────────────────────────
// 2 TRIUMPH - Mundane Tools & Basic Items
//─────────────────────────────────────────────────────────────

// TOOLS & OBJECTS
/datum/loadout_item/tri_shovel
	name = "Shovel"
	path = /obj/item/rogueweapon/shovel
	category = "Weapons and tools"
	triumph_cost = 2

/datum/loadout_item/tri_sickle
	name = "Sickle"
	path = /obj/item/rogueweapon/sickle
	category = "Weapons and tools"
	triumph_cost = 2

// BLUNT WEAPONS
/datum/loadout_item/tri_woodclub
	name = "Wooden Club"
	path = /obj/item/rogueweapon/mace/woodclub
	category = "Weapons and tools"
	triumph_cost = 2
	keep_loadout_stats = TRUE

// AXES
/datum/loadout_item/tri_bone_axe
	name = "Bone Axe"
	path = /obj/item/rogueweapon/stoneaxe/boneaxe
	category = "Weapons and tools"
	triumph_cost = 2
	keep_loadout_stats = TRUE

/datum/loadout_item/ancient_axe
	name = "Ancient Axe"
	path = /obj/item/rogueweapon/stoneaxe/woodcut/steel/ancient
	category = "Weapons and tools"
	triumph_cost = 4

// SWORDS
/datum/loadout_item/tri_stone_sword
	name = "Stone Sword"
	path = /obj/item/rogueweapon/sword/stone
	category = "Weapons and tools"
	triumph_cost = 2
	keep_loadout_stats = TRUE

/datum/loadout_item/ancient_gladius
	name = "Ancient Gladius"
	path = /obj/item/rogueweapon/sword/short/gladius/ancient
	category = "Weapons and tools"
	triumph_cost = 4

/datum/loadout_item/ancient_khopesh
	name = "Ancient Khopesh"
	path = /obj/item/rogueweapon/sword/sabre/ancient
	category = "Weapons and tools"
	triumph_cost = 4

// DAGGERS & KNIVES
/datum/loadout_item/tri_stone_knife
	name = "Stone Knife"
	path = /obj/item/rogueweapon/huntingknife/stoneknife
	category = "Weapons and tools"
	triumph_cost = 2
	keep_loadout_stats = TRUE

// MACES & BLUNT
/datum/loadout_item/ancient_mace
	name = "Ancient Mace"
	path = /obj/item/rogueweapon/mace/goden/steel/ancient
	category = "Weapons and tools"
	triumph_cost = 4

// POLEARMS & SPEARS
/datum/loadout_item/tri_stone_spear
	name = "Stone Spear"
	path = /obj/item/rogueweapon/spear/stone
	category = "Weapons and tools"
	triumph_cost = 2
	keep_loadout_stats = TRUE

/datum/loadout_item/tri_bone_spear
	name = "Bone Spear"
	path = /obj/item/rogueweapon/spear/bonespear
	category = "Weapons and tools"
	triumph_cost = 2
	keep_loadout_stats = TRUE

/datum/loadout_item/ancient_spear
	name = "Ancient Spear"
	path = /obj/item/rogueweapon/spear/ancient/decrepit
	category = "Weapons and tools"
	triumph_cost = 4

// ARMOR & CLOTHING
/datum/loadout_item/ancient_mask
	name = "Ancient Mask"
	path = /obj/item/clothing/mask/rogue/facemask/ancient
	category = "Masks"
	triumph_cost = 4

/datum/loadout_item/ancient_kilt
	name = "Ancient Kilt"
	path = /obj/item/clothing/under/roguetown/chainlegs/kilt/ancient
	category = "Pants"
	triumph_cost = 4

//─────────────────────────────────────────────────────────────
// 3 TRIUMPH - Wooden Polearms & Noble Clothing
//─────────────────────────────────────────────────────────────

// POLEARMS & SPEARS
/datum/loadout_item/tri_quarterstaff
	name = "Quarterstaff"
	path = /obj/item/rogueweapon/woodstaff/quarterstaff
	category = "Weapons and tools"
	triumph_cost = 3
	keep_loadout_stats = TRUE

/datum/loadout_item/tri_woodstaff
	name = "Woodstaff"
	path = /obj/item/rogueweapon/woodstaff
	category = "Weapons and tools"
	triumph_cost = 3
	keep_loadout_stats = TRUE

/datum/loadout_item/tri_scythe
	name = "Peasant Scythe"
	path = /obj/item/rogueweapon/scythe
	category = "Weapons and tools"
	triumph_cost = 3
	keep_loadout_stats = TRUE

// CLOTHING - TABARDS & RELIGIOUS CLOAKS
/datum/loadout_item/tri_astrata_tabard
	name = "Astratan Tabard"
	path = /obj/item/clothing/cloak/templar/astratan
	category = "Cloaks"


/datum/loadout_item/tri_malum_tabard
	name = "Malumite Tabard"
	path = /obj/item/clothing/cloak/templar/malumite
	category = "Cloaks"

/datum/loadout_item/tri_necra_tabard
	name = "Necran Tabard"
	path = /obj/item/clothing/cloak/templar/necran
	category = "Cloaks"

/datum/loadout_item/tri_pestra_tabard
	name = "Pestran Tabard"
	path = /obj/item/clothing/cloak/templar/pestran
	category = "Cloaks"

/datum/loadout_item/tri_eora_tabard
	name = "Eoran Tabard"
	path = /obj/item/clothing/cloak/templar/eoran
	category = "Cloaks"

/datum/loadout_item/tri_xylix_cloak
	name = "Xylixian Cloak"
	path = /obj/item/clothing/cloak/templar/xylixian
	category = "Cloaks"

/datum/loadout_item/tri_psydon_tabard
	name = "Psydonian Tabard"
	path = /obj/item/clothing/cloak/psydontabard
	category = "Cloaks"

/datum/loadout_item/tri_reform_tabard
	name = "Reformist Tabard"
	path = /obj/item/clothing/cloak/reformtabard
	category = "Cloaks"

/datum/loadout_item/tri_abyssor_tabard
	name = "Abyssorite Tabard"
	path = /obj/item/clothing/cloak/abyssortabard
	category = "Cloaks"

/datum/loadout_item/tri_see_tabard
	name = "See Tabard"
	path = /obj/item/clothing/cloak/templar/undivided
	category = "Cloaks"
	triumph_cost = 4

/datum/loadout_item/tri_see_cloak
	name = "See Cloak"
	path = /obj/item/clothing/cloak/undivided
	category = "Cloaks"
	triumph_cost = 4

/datum/loadout_item/tri_justice_tabard
	name = "Justice Tabard (Ravox)"
	path = /obj/item/clothing/cloak/templar/ravox
	category = "Cloaks"

// CLOTHING - DRESSES & ROBES
/datum/loadout_item/tri_ornate_dress
	name = "Ornate Dress"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/silkdress/steward
	category = "Shirts and robes"
	triumph_cost = 3

/datum/loadout_item/tri_princess_dress/nobility_check(client/C)
	var/datum/preferences/P = C.prefs
	if(!P)
		return FALSE
	// Check if user has the Nobility quirk
	if(P.has_quirk(/datum/quirk/noble))
		return TRUE
	// Check if user has high priority for any noble, courtier, or yeoman job
	for(var/job_title in GLOB.noble_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.courtier_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.yeoman_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	return FALSE

/datum/loadout_item/tri_ornate_tunic
	name = "Ornate Tunic"
	path = /obj/item/clothing/suit/roguetown/shirt/tunic/silktunic
	category = "Shirts and robes"
	triumph_cost = 3

/datum/loadout_item/tri_princess_dress/nobility_check(client/C)
	var/datum/preferences/P = C.prefs
	if(!P)
		return FALSE
	// Check if user has the Nobility quirk
	if(P.has_quirk(/datum/quirk/noble))
		return TRUE
	// Check if user has high priority for any noble, courtier, or yeoman job
	for(var/job_title in GLOB.noble_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.courtier_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.yeoman_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	return FALSE

/datum/loadout_item/tri_princess_dress
	name = "Princess Dress"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/royal/princess
	category = "Shirts and robes"
	triumph_cost = 3

/datum/loadout_item/tri_princess_dress/nobility_check(client/C)
	var/datum/preferences/P = C.prefs
	if(!P)
		return FALSE
	// Check if user has the Nobility quirk
	if(P.has_quirk(/datum/quirk/noble))
		return TRUE
	// Check if user has high priority for any noble, courtier, or yeoman job
	for(var/job_title in GLOB.noble_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.courtier_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.yeoman_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	return FALSE

/datum/loadout_item/tri_royal_dress
	name = "Royal Dress"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/royal
	category = "Shirts and robes"
	triumph_cost = 3

/datum/loadout_item/tri_royal_dress/nobility_check(client/C)
	var/datum/preferences/P = C.prefs
	if(!P)
		return FALSE
	// Check if user has the Nobility quirk
	if(P.has_quirk(/datum/quirk/noble))
		return TRUE
	// Check if user has high priority for any noble, courtier, or yeoman job
	for(var/job_title in GLOB.noble_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.courtier_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.yeoman_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	return FALSE

/datum/loadout_item/tri_royal_sleeves
	name = "Royal Sleeves"
	path = /obj/item/clothing/wrists/roguetown/royalsleeves
	category = "Jewelry and neckwear"
	triumph_cost = 3

/datum/loadout_item/tri_royal_sleeves/nobility_check(client/C)
	var/datum/preferences/P = C.prefs
	if(!P)
		return FALSE
	// Check if user has the Nobility quirk
	if(P.has_quirk(/datum/quirk/noble))
		return TRUE
	// Check if user has high priority for any noble, courtier, or yeoman job
	for(var/job_title in GLOB.noble_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.courtier_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.yeoman_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	return FALSE

/datum/loadout_item/tri_lady_cloak
	name = "Lady's Cloak"
	path = /obj/item/clothing/cloak/lordcloak/ladycloak
	category = "Cloaks"
	triumph_cost = 3

/datum/loadout_item/wedding_dress
	name = "Wedding Silk Dress"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/silkdress/weddingdress
	category = "Shirts and robes"

/datum/loadout_item/tri_lady_cloak/nobility_check(client/C)
	var/datum/preferences/P = C.prefs
	if(!P)
		return FALSE
	// Check if user has the Nobility quirk
	if(P.has_quirk(/datum/quirk/noble))
		return TRUE
	// Check if user has high priority for any noble, courtier, or yeoman job
	for(var/job_title in GLOB.noble_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.courtier_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.yeoman_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	return FALSE

// CLOTHING - HEADWEAR
/datum/loadout_item/tri_circlet
	name = "Circlet"
	path = /obj/item/clothing/head/roguetown/circlet
	category = "Headwear"
	triumph_cost = 3

/datum/loadout_item/tri_circlet/nobility_check(client/C)
	var/datum/preferences/P = C.prefs
	if(!P)
		return FALSE
	// Check if user has the Nobility quirk
	if(P.has_quirk(/datum/quirk/noble))
		return TRUE
	// Check if user has high priority for any noble, courtier, or yeoman job
	for(var/job_title in GLOB.noble_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.courtier_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.yeoman_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	return FALSE

/datum/loadout_item/tri_volfhelm
	name = "Volf Helm"
	path = /obj/item/clothing/head/roguetown/helmet/leather/volfhelm
	category = "Headwear"
	triumph_cost = 2

/datum/loadout_item/tri_saiga
	name = "Saiga Helm"
	path = /obj/item/clothing/head/roguetown/helmet/leather/saiga
	category = "Headwear"
	triumph_cost = 2

// CLOTHING - JEWELRY & ACCESSORIES
/datum/loadout_item/tri_noble_amulet
	name = "Noble Amulet"
	path = /obj/item/clothing/neck/roguetown/ornateamulet/noble
	category = "Jewelry and neckwear"
	triumph_cost = 4

/datum/loadout_item/tri_shell_bracelet
	name = "Shell Bracelet"
	path = /obj/item/clothing/neck/roguetown/psicross/shell/bracelet
	category = "Jewelry and neckwear"
	triumph_cost = 2

/datum/loadout_item/tri_shell_necklace
	name = "oyster shell necklace"
	path = /obj/item/clothing/neck/roguetown/psicross/shell
	category = "Jewelry and neckwear"
	triumph_cost = 2

// CLOTHING - ARMOR (Alphabetically Ordered)
/datum/loadout_item/tri_desert_coat
	name = "Desert Coat"
	path = /obj/item/clothing/suit/roguetown/armor/gambeson/heavy/zyb
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_duelist_coat
	name = "Duelist Coat"
	path = /obj/item/clothing/armor/leather/jacket/leathercoat/duelcoat
	triumph_cost = 3

/datum/loadout_item/tri_fencing_gambeson
	name = "Fencing Gambeson (Otavan)"
	path = /obj/item/clothing/suit/roguetown/armor/gambeson/heavy/otavan
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_fencing_shirt
	name = "Fencing Shirt (Padded)"
	path = /obj/item/clothing/suit/roguetown/shirt/freifechter
	category = "Shirts and robes"
	triumph_cost = 3

/datum/loadout_item/tri_gambeson
	name = "Gambeson"
	path = /obj/item/clothing/suit/roguetown/armor/gambeson
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_gambeson_light
	name = "Gambeson (Light)"
	path = /obj/item/clothing/suit/roguetown/armor/gambeson/light
	category = "Armor"
	triumph_cost = 2

/datum/loadout_item/tri_gambeson_padded
	name = "Gambeson (Padded)"
	path = /obj/item/clothing/suit/roguetown/armor/gambeson/heavy
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_grenzelhoft_hipshirt
	name = "Grenzelhoft Hip-Shirt"
	path = /obj/item/clothing/suit/roguetown/armor/gambeson/heavy/grenzelhoft
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_gronn_byrine_chausses
	name = "Byrine Chausses"
	path = /obj/item/clothing/under/roguetown/splintlegs/iron/gronn
	category = "Pants"
	triumph_cost = 3

/datum/loadout_item/tri_gronn_byrine_gloves
	name = "Byrine Gloves"
	path = /obj/item/clothing/gloves/roguetown/chain/gronn
	category = "Gloves"
	triumph_cost = 3

/datum/loadout_item/tri_gronn_byrine_hauberk
	name = "Byrine"
	path = /obj/item/clothing/suit/roguetown/armor/brigandine/gronn
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_gronn_fur_pants
	name = "Fur Pants"
	path = /obj/item/clothing/under/roguetown/trou/leather/gronn
	category = "Pants"
	triumph_cost = 3

/datum/loadout_item/tri_gronn_bone_gloves
	name = "Bone Gloves"
	path = /obj/item/clothing/gloves/roguetown/angle/gronnfur
	category = "Gloves"
	triumph_cost = 3

/datum/loadout_item/tri_hierophant_gambeson
	name = "Hierophant Gambeson"
	path = /obj/item/clothing/suit/roguetown/armor/gambeson/heavy/hierophant
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_gronn_ravager_mantle
	name = "Ravager Mantle"
	path = /obj/item/clothing/suit/roguetown/armor/leather/heavy/gronn
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_huus_quyaq
	name = "Huus Quyaq (Northern)"
	path = /obj/item/clothing/suit/roguetown/armor/leather/Huus_quyaq
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_kurche
	name = "Kurche (Gronn)"
	path = /obj/item/clothing/suit/roguetown/armor/kurche
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_leather_cuirass
	name = "Leather Cuirass"
	path = /obj/item/clothing/suit/roguetown/armor/leather/cuirass
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_leather_corslet
	name = "Leather Corslet"
	path = /obj/item/clothing/suit/roguetown/armor/leather/bikini
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/corset
	name = "Corset"
	path = /obj/item/clothing/suit/roguetown/armor/corset
	category = "Armor"

/datum/loadout_item/tri_moose_hood
	name = "Moose Hood (Shaman)"
	path = /obj/item/clothing/head/roguetown/helmet/leather/shaman_hood
	category = "Headwear"
	triumph_cost = 4

/datum/loadout_item/tri_newmoon_hood
	name = "New Moon Hood"
	path = /obj/item/clothing/head/roguetown/roguehood/reinforced/newmoon
	category = "Headwear"
	triumph_cost = 2

/datum/loadout_item/tri_newmoon_jacket
	name = "New Moon Jacket"
	path = /obj/item/clothing/suit/roguetown/armor/leather/newmoon_jacket
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_newmoon_tunic
	name = "New Moon Tunic"
	path = /obj/item/clothing/suit/roguetown/shirt/tunic/newmoon
	category = "Shirts and robes"
	triumph_cost = 3

/datum/loadout_item/tri_otavan_gambeson
	name = "Otavan Gambeson"
	path = /obj/item/clothing/suit/roguetown/armor/gambeson/heavy/otavan
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_padded_caftan
	name = "Padded Caftan"
	path = /obj/item/clothing/suit/roguetown/armor/gambeson/heavy/chargah
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_pontifex_gambeson
	name = "Pontifex Gambeson"
	path = /obj/item/clothing/suit/roguetown/armor/gambeson/heavy/pontifex
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_psyaltrist_leather
	name = "Psyaltrist Leather"
	path = /obj/item/clothing/suit/roguetown/armor/leather/studded/psyaltrist
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_zyb_coat
	name = "Desert Coat"
	path = /obj/item/clothing/suit/roguetown/armor/leather/heavy/coat/zyb
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_zyb_gambeson
	name = "Desert Gambeson"
	path = /obj/item/clothing/suit/roguetown/armor/gambeson/heavy/zyb
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_shamanic_coat
	name = "Shamanic Coat"
	path = /obj/item/clothing/suit/roguetown/armor/leather/heavy/atgervi
	category = "Armor"
	triumph_cost = 3

/datum/loadout_item/tri_spellcaster_hat
	name = "Spellcaster Hat"
	path = /obj/item/clothing/head/roguetown/spellcasterhat
	category = "Headwear"
	triumph_cost = 2

/datum/loadout_item/tri_steppe_coat
	name = "Steppe Coat"
	path = /obj/item/clothing/suit/roguetown/armor/leather/heavy/coat/steppe
	category = "Armor"
	triumph_cost = 3

// HELMETS AND HEADWEAR (Alphabetically Ordered)
/datum/loadout_item/tri_grenzelhoft_hat
	name = "Grenzelhoft Hat"
	path = /obj/item/clothing/head/roguetown/grenzelhofthat
	category = "Headwear"
	triumph_cost = 2

/datum/loadout_item/tri_hierophant_hood
	name = "Hierophant Hood"
	path = /obj/item/clothing/head/roguetown/roguehood/hierophant
	category = "Headwear"
	triumph_cost = 2

/datum/loadout_item/tri_armorhood_hood
	name = "Studded Leather Hood"
	path = /obj/item/clothing/head/roguetown/helmet/leather/armorhood/advanced
	category = "Headwear"
	triumph_cost = 2

/datum/loadout_item/tri_pontifex_hood
	name = "Pontifex Hood"
	path = /obj/item/clothing/head/roguetown/roguehood/pontifex
	category = "Headwear"
	triumph_cost = 2

/datum/loadout_item/tri_zyb_hijab
	name = "Desert Hijab"
	path = /obj/item/clothing/head/roguetown/roguehood/shalal/hijab/zyb
	category = "Headwear"
	triumph_cost = 2


// GLOVES (Alphabetically Ordered)
/datum/loadout_item/tri_atgervi_gloves
	name = "Atgervi Gloves"
	path = /obj/item/clothing/gloves/roguetown/angle/atgervi
	category = "Gloves"
	triumph_cost = 2

/datum/loadout_item/tri_eastern_gloves
	name = "Eastern Gloves"
	path = /obj/item/clothing/gloves/roguetown/eastgloves2
	category = "Gloves"
	triumph_cost = 2

/datum/loadout_item/tri_grenzelhoft_gloves
	name = "Grenzelhoft Gloves"
	path = /obj/item/clothing/gloves/roguetown/angle/grenzelgloves
	category = "Gloves"
	triumph_cost = 2

/datum/loadout_item/tri_kote_gloves
	name = "Kote Gauntlets"
	path = /obj/item/clothing/gloves/roguetown/plate/kote
	category = "Gloves"
	triumph_cost = 2

/datum/loadout_item/tri_otavan_gloves
	name = "Otavan Gloves"
	path = /obj/item/clothing/gloves/roguetown/otavan
	category = "Gloves"
	triumph_cost = 2

/datum/loadout_item/tri_pontifex_gloves
	name = "Pontifex Gloves"
	path = /obj/item/clothing/gloves/roguetown/angle/pontifex
	category = "Gloves"
	triumph_cost = 2

// BOOTS & SHOES (Alphabetically Ordered)
/datum/loadout_item/tri_atgervi_boots
	name = "Atgervi Boots"
	path = /obj/item/clothing/shoes/roguetown/boots/leather/atgervi
	category = "Footwear"


/datum/loadout_item/tri_grenzelhoft_boots
	name = "Grenzelhoft Boots"
	path = /obj/item/clothing/shoes/roguetown/boots/grenzelhoft
	category = "Footwear"


/datum/loadout_item/tri_kazengun_boots
	name = "Kazengun Boots"
	path = /obj/item/clothing/shoes/roguetown/boots/leather/reinforced/kazengun
	category = "Footwear"


/datum/loadout_item/tri_otavan_boots
	name = "Otavan Boots"
	path = /obj/item/clothing/shoes/roguetown/boots/otavan
	category = "Footwear"


/datum/loadout_item/tri_rumaclan_boots
	name = "Ruma Clan Boots"
	path = /obj/item/clothing/shoes/roguetown/armor/rumaclan
	category = "Footwear"


/datum/loadout_item/tri_shalal_boots
	name = "Shalal Boots"
	path = /obj/item/clothing/shoes/roguetown/shalal
	category = "Footwear"


// PANTS (Alphabetically Ordered)
/datum/loadout_item/tri_atgervi_pants
	name = "Atgervi Fur Pants"
	path = /obj/item/clothing/under/roguetown/trou/leather/atgervi
	category = "Pants"
	triumph_cost = 2

/datum/loadout_item/tri_eastern_pants_1
	name = "Eastern Pants (Black)"
	path = /obj/item/clothing/under/roguetown/heavy_leather_pants/eastpants1
	category = "Pants"
	triumph_cost = 2

/datum/loadout_item/tri_eastern_pants_2
	name = "Eastern Pants (White)"
	path = /obj/item/clothing/under/roguetown/heavy_leather_pants/eastpants2
	category = "Pants"
	triumph_cost = 2

/datum/loadout_item/tri_grenzelhoft_pants
	name = "Grenzelhoft Pants"
	path = /obj/item/clothing/under/roguetown/heavy_leather_pants/grenzelpants
	category = "Pants"
	triumph_cost = 2

/datum/loadout_item/tri_otavan_pants
	name = "Otavan Pants"
	path = /obj/item/clothing/under/roguetown/heavy_leather_pants/otavan
	category = "Pants"
	triumph_cost = 2

/datum/loadout_item/tri_otavan_generic_pants
	name = "Otavan Pants (Generic)"
	path = /obj/item/clothing/under/roguetown/heavy_leather_pants/otavan/generic
	category = "Pants"
	triumph_cost = 2

/datum/loadout_item/tri_kazengun_pants
	name = "Kazengun Pants"
	path = /obj/item/clothing/under/roguetown/heavy_leather_pants/kazengun
	category = "Pants"
	triumph_cost = 2

/datum/loadout_item/tri_pontifex_pants
	name = "Pontifex Pants"
	path = /obj/item/clothing/under/roguetown/trou/leather/pontifex
	category = "Pants"
	triumph_cost = 2

/datum/loadout_item/tri_zyb_pants
	name = "Zybantine Pants"
	path = /obj/item/clothing/under/roguetown/trou/leather/pontifex/zyb
	category = "Pants"
	triumph_cost = 2


// CLOAKS & CAPES (Alphabetically Ordered)
/datum/loadout_item/tri_eastern_cloak_1
	name = "Eastern Cloak"
	path = /obj/item/clothing/cloak/eastcloak1
	category = "Cloaks"


/datum/loadout_item/tri_hierophant_cloak
	name = "Hierophant Cloak"
	path = /obj/item/clothing/cloak/hierophant
	category = "Cloaks"


/datum/loadout_item/tri_kazengun_cloak
	name = "Kazengun Cloak"
	path = /obj/item/clothing/cloak/kazengun
	category = "Cloaks"


// NECK ACCESSORIES (Alphabetically Ordered)

/datum/loadout_item/tri_fencerguard
	name = "Fencerguard"
	path = /obj/item/clothing/neck/roguetown/fencerguard
	category = "Jewelry and neckwear"
	triumph_cost = 4

/datum/loadout_item/tri_naledi_cross
	name = "Naledi Psicross"
	path = /obj/item/clothing/neck/roguetown/psicross/naledi
	category = "Jewelry and neckwear"

/datum/loadout_item/woolencollar
	name = "Woolen Collar"
	path = /obj/item/clothing/neck/roguetown/collar/woolen
	category = "Jewelry and neckwear"

// MASKS (Alphabetically Ordered)

// SHIRTS & ROBES (Alphabetically Ordered)
/datum/loadout_item/tri_hierophant_robe
	name = "Hierophant Robe"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/hierophant
	category = "Shirts and robes"
	triumph_cost = 2

/datum/loadout_item/tri_pontifex_robe
	name = "Pontifex Robe"
	path = /obj/item/clothing/suit/roguetown/shirt/robe/pointfex
	category = "Shirts and robes"
	triumph_cost = 2

/datum/loadout_item/slitteddress
	name = "Slitted dress"
	path = /obj/item/clothing/suit/roguetown/shirt/dress/slit
	category = "Shirts and robes"

// POLEARMS & STAVES
/datum/loadout_item/tri_naledi_staff
	name = "Naledi Staff (Decorative)"
	path = /obj/item/rogueweapon/woodstaff/decorative
	category = "Weapons and tools"
	triumph_cost = 3


//─────────────────────────────────────────────────────────────
// 10 TRIUMPH - Lord's Cloak
//─────────────────────────────────────────────────────────────

// CLOTHING - CLOAKS
/datum/loadout_item/tri_lord_cloak
	name = "Lord's Cloak"
	path = /obj/item/clothing/cloak/lordcloak
	category = "Cloaks"
	triumph_cost = 10

/datum/loadout_item/tri_lord_cloak/nobility_check(client/C)
	var/datum/preferences/P = C.prefs
	if(!P)
		return FALSE
	// Check if user has the Nobility quirk
	if(P.has_quirk(/datum/quirk/noble))
		return TRUE
	// Check if user has high priority for any noble, courtier, or yeoman job
	for(var/job_title in GLOB.noble_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.courtier_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	for(var/job_title in GLOB.yeoman_positions)
		if(P.job_preferences[job_title] == JP_HIGH)
			return TRUE
	return FALSE

//==========================
//Donator Section
//==========================
//All these items are stored in the donator_fluff.dm in the azure modular folder for simplicity.
//All should be subtypes of existing weapons/clothes/armor/gear, whatever, to avoid balance issues I guess. Idk, I'm not your boss.

/datum/loadout_item/donator_plex
	name = "Donator Kit - Rapier di Aliseo"
	path = /obj/item/enchantingkit/plexiant
	category = "Donator items"
	ckeywhitelist = list("plexiant")

/datum/loadout_item/donator_sru
	name = "Donator Kit - Emerald Dress"
	path = /obj/item/enchantingkit/srusu
	category = "Donator items"
	ckeywhitelist = list("cheekycrenando")

/datum/loadout_item/donator_strudel
	name = "Donator Kit - Grenzelhoftian Mage Vest"
	path = /obj/item/enchantingkit/strudle
	category = "Donator items"
	ckeywhitelist = list("toasterstrudes")

/datum/loadout_item/donator_bat
	name = "Donator Kit - Handcarved Harp"
	path = /obj/item/enchantingkit/bat
	category = "Donator items"
	ckeywhitelist = list("kitchifox")

/datum/loadout_item/donator_mansa
	name = "Donator Kit - Wortträger"
	path = /obj/item/enchantingkit/ryebread
	category = "Donator items"
	ckeywhitelist = list("pepperoniplayboy")	//Byond maybe doesn't like spaces. If a name has a space, do it as one continious name.

/datum/loadout_item/donator_rebel
	name = "Donator Kit - Gilded Sallet"
	path = /obj/item/enchantingkit/rebel
	category = "Donator items"
	ckeywhitelist = list("rebel0")

/datum/loadout_item/donator_bigfoot
	name = "Donator Kit - Gilded Knight Helm"
	path = /obj/item/enchantingkit/bigfoot
	category = "Donator items"
	ckeywhitelist = list("bigfoot02")

/datum/loadout_item/donator_bigfoot_axe
	name = "Donator kit - Gilded Greataxe"
	path = /obj/item/enchantingkit/bigfoot_axe
	category = "Donator items"
	ckeywhitelist = list("bigfoot02")

/datum/loadout_item/donator_zydras
	name = "Donator Kit - Padded silky dress"
	path = /obj/item/enchantingkit/zydras
	category = "Donator items"
	ckeywhitelist = list("1ceres")

/datum/loadout_item/leather_collar
	name = "Leather Collar"
	path = /obj/item/clothing/neck/roguetown/collar/leather
	category = "Jewelry and neckwear"

/datum/loadout_item/cowbell_collar
	name = "Cowbell Collar"
	path = /obj/item/clothing/neck/roguetown/collar/cowbell
	category = "Jewelry and neckwear"

/datum/loadout_item/catbell_collar
	name = "Catbell Collar"
	path = /obj/item/clothing/neck/roguetown/collar/catbell
	category = "Jewelry and neckwear"

/datum/loadout_item/catbell
	name = "Catbell"
	path = /obj/item/catbell

/datum/loadout_item/cowbell
	name = "Cowbell"
	path = /obj/item/catbell/cow

/datum/loadout_item/rope_leash
	name = "Rope Leash"
	path = /obj/item/leash

/datum/loadout_item/leather_leash
	name = "Leather Leash"
	path = /obj/item/leash/leather

/datum/loadout_item/chain_leash
	name = "Chain Leash"
	path = /obj/item/leash/chain

/datum/loadout_item/magic_recipes
	name = "Guide to Arcyne"
	path = /obj/item/recipe_book/magic
	category = "Books and writing"

/datum/loadout_item/alch_recipes
	name = "Guide to Alchemy"
	path = /obj/item/recipe_book/alchemy
	category = "Books and writing"

/datum/loadout_item/leather_recipes
	name = "Guide to Leatherworking"
	path = /obj/item/recipe_book/leatherworking
	category = "Books and writing"

/datum/loadout_item/sewing_recipes
	name = "Guide to Tailoring"
	path = /obj/item/recipe_book/sewing
	category = "Books and writing"

/datum/loadout_item/smith_recipes
	name = "Guide to Smithing"
	path = /obj/item/recipe_book/blacksmithing
	category = "Books and writing"

/datum/loadout_item/engi_recipes
	name = "Guide to Engineering"
	path = /obj/item/recipe_book/engineering
	category = "Books and writing"

/datum/loadout_item/build_recipes
	name = "Guide to Building"
	path = /obj/item/recipe_book/builder
	category = "Books and writing"

/datum/loadout_item/potter_recipes
	name = "Guide to Pottery"
	path = /obj/item/recipe_book/ceramics
	category = "Books and writing"

/datum/loadout_item/survival_recipes
	name = "Guide to Survival"
	path = /obj/item/recipe_book/survival
	category = "Books and writing"

/datum/loadout_item/cooking_recipes
	name = "Guide to Cooking"
	path = /obj/item/recipe_book/cooking
	category = "Books and writing"

/datum/loadout_item/tenbibble
	name = "The Verses and Acts of the Ten"
	path = /obj/item/book/rogue/bibble
	category = "Books and writing"

/datum/loadout_item/psybibble
	name = "Tome of Psydon"
	path = /obj/item/book/rogue/bibble/psy
	category = "Books and writing"

/datum/loadout_item/zizobibble
	name = "Lexicon of Her Truth"
	path = /obj/item/book/rogue/bibble/zizo
	category = "Books and writing"

//COSMETICS (Perfumes & Lipsticks)

/datum/loadout_item/perfume_lavender
	name = "Lavender Perfume"
	path = /obj/item/perfume/lavender
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/perfume_cherry
	name = "Cherry Perfume"
	path = /obj/item/perfume/cherry
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/perfume_rose
	name = "Rose Perfume"
	path = /obj/item/perfume/rose
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/perfume_jasmine
	name = "Jasmine Perfume"
	path = /obj/item/perfume/jasmine
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/perfume_mint
	name = "Mint Perfume"
	path = /obj/item/perfume/mint
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/perfume_vanilla
	name = "Vanilla Perfume"
	path = /obj/item/perfume/vanilla
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/perfume_pear
	name = "Pear Perfume"
	path = /obj/item/perfume/pear
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/perfume_strawberry
	name = "Strawberry Perfume"
	path = /obj/item/perfume/strawberry
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/perfume_cinnamon
	name = "Cinnamon Perfume"
	path = /obj/item/perfume/cinnamon
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/perfume_frankincense
	name = "Frankincense Perfume"
	path = /obj/item/perfume/frankincense
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/perfume_sandalwood
	name = "Sandalwood Perfume"
	path = /obj/item/perfume/sandalwood
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/perfume_myrrh
	name = "Myrrh Perfume"
	path = /obj/item/perfume/myrrh
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/lipstick_red
	name = "Red Lipstick"
	path = /obj/item/azure_lipstick
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/lipstick_jade
	name = "Jade Lipstick"
	path = /obj/item/azure_lipstick/jade
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/lipstick_purple
	name = "Purple Lipstick"
	path = /obj/item/azure_lipstick/purple
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/lipstick_black
	name = "Black Lipstick"
	path = /obj/item/azure_lipstick/black
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/hair_dye
	name = "Hair Dye Cream"
	path = /obj/item/hair_dye_cream
	category = "Cosmetics"
	triumph_cost = 2

/datum/loadout_item/branding_stick
	name = "Crude Branding Stick"
	path = /obj/item/rogueweapon/surgery/cautery/branding/crude
	category = "Weapons and tools"
	triumph_cost = 1

//ADDITIONAL ITEMS

/datum/loadout_item/backpack
	name = "Backpack"
	path = /obj/item/storage/backpack/rogue/backpack
	category = "Belts and storage"
	triumph_cost = 6

/datum/loadout_item/satchel
	name = "Satchel"
	path = /obj/item/storage/backpack/rogue/satchel
	category = "Belts and storage"
	triumph_cost = 5

/datum/loadout_item/otavansatchel
	name = "Otavan Satchel"
	path = /obj/item/storage/backpack/rogue/satchel/otavan
	category = "Belts and storage"
	triumph_cost = 5

/datum/loadout_item/shortsatchel
	name = "Short Satchel"
	path = /obj/item/storage/backpack/rogue/satchel/short
	category = "Belts and storage"
	triumph_cost = 4

/datum/loadout_item/saddle
	name = "Saddle"
	path = /obj/item/natural/saddle
	triumph_cost = 4

/datum/loadout_item/pouches
	name = "Pouche"
	path = /obj/item/storage/belt/rogue/pouch
	category = "Belts and storage"
	triumph_cost = 3

/datum/loadout_item/swatchbook
	name = "Tailor's Swatchbook"
	path = /obj/item/book/rogue/swatchbook
	category = "Books and writing"
	triumph_cost = 3

/datum/loadout_item/parasol
	name = "Paper Parasol"
	path = /obj/item/rogueweapon/mace/parasol
	category = "Weapons and tools"
	triumph_cost = 3

/datum/loadout_item/scabbard
	name = "Scabbard"
	path = /obj/item/rogueweapon/scabbard/sword
	category = "Weapons and tools"
	triumph_cost = 1

/datum/loadout_item/scabbard/noble
	name = "Noble Scabbard"
	path = /obj/item/rogueweapon/scabbard/sword/noble
	category = "Weapons and tools"
	triumph_cost = 2

/datum/loadout_item/scabbard/royal
	name = "Royal Scabbard"
	path = /obj/item/rogueweapon/scabbard/sword/royal
	category = "Weapons and tools"
	triumph_cost = 3

/datum/loadout_item/scabbard/sheathe/noble
	name = "Noble Sheathe"
	path = /obj/item/rogueweapon/scabbard/sheath/noble
	category = "Weapons and tools"
	triumph_cost = 1

/datum/loadout_item/scabbard/sheathe/royal
	name = "Royal Sheathe"
	path = /obj/item/rogueweapon/scabbard/sheath/royal
	category = "Weapons and tools"
	triumph_cost = 1

/datum/loadout_item/greatweaponstrap
	name = "Great Weapon Strap"
	path = /obj/item/rogueweapon/scabbard/gwstrap
	category = "Weapons and tools"
	triumph_cost = 2

//INSTRUMENTS

/datum/loadout_item/accordion
	name = "Accordion"
	path = /obj/item/rogue/instrument/accord
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/bagpipe
	name = "Bagpipe"
	path = /obj/item/rogue/instrument/bagpipe
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/banjo
	name = "Banjo"
	path = /obj/item/rogue/instrument/banjo
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/drum
	name = "Drum"
	path = /obj/item/rogue/instrument/drum
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/flute
	name = "Flute"
	path = /obj/item/rogue/instrument/flute
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/guitar
	name = "Guitar"
	path = /obj/item/rogue/instrument/guitar
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/harmonica
	name = "Harmonica"
	path = /obj/item/rogue/instrument/harmonica
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/harp
	name = "Harp"
	path = /obj/item/rogue/instrument/harp
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/hurdygurdy
	name = "Hurdy-Gurdy"
	path = /obj/item/rogue/instrument/hurdygurdy
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/jawharp
	name = "Jaw Harp"
	path = /obj/item/rogue/instrument/jawharp
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/lute
	name = "Lute"
	path = /obj/item/rogue/instrument/lute
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/psyaltery
	name = "Psyaltery"
	path = /obj/item/rogue/instrument/psyaltery
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/shamisen
	name = "Shamisen"
	path = /obj/item/rogue/instrument/shamisen
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/trumpet
	name = "Trumpet"
	path = /obj/item/rogue/instrument/trumpet
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/viola
	name = "Viola"
	path = /obj/item/rogue/instrument/viola
	category = "Instruments"
	triumph_cost = 1

/datum/loadout_item/vocaltalisman
	name = "Vocal Talisman"
	path = /obj/item/rogue/instrument/vocals
	category = "Instruments"
	triumph_cost = 1

// Unique stuff that doesn't quite fit anywhere else.

/datum/loadout_item/kazengunite_smithing_manual
	name = "Kajutsu no Densho"
	desc = "A Kazengunite smithing manual. Unlocks kazengunite armor and weapon recipes at the anvil when read — requires knowledge of Kazengunese. "
	path = /obj/item/book/granter/trait/kazengunite_smith
	category = "Books and writing"
	triumph_cost = 3

//CAPARISONS

/datum/loadout_item/caparison
	name = "Caparison"
	path = /obj/item/caparison
	category = "Animal equipment"

/datum/loadout_item/caparison/psy
	name = "Psydonite Caparison"
	path = /obj/item/caparison/psy
	category = "Animal equipment"

/datum/loadout_item/caparison/astrata
	name = "Astratan Caparison"
	path = /obj/item/caparison/astrata
	category = "Animal equipment"

/datum/loadout_item/caparison/eora
	name = "Eoran Caparison"
	path = /obj/item/caparison/eora
	category = "Animal equipment"

/datum/loadout_item/caparison/azure
	name = "Ducal Caparison"
	path = /obj/item/caparison/azure
	category = "Animal equipment"

/datum/loadout_item/caparison/fogbeast
	name = "Fogbeast Caparison"
	path = /obj/item/caparison/fogbeast
	category = "Animal equipment"

/datum/loadout_item/caparison/fogbeast/azure
	name = "Ducal Caparison (Fogbeast)"
	path = /obj/item/caparison/fogbeast/azure
	category = "Animal equipment"
