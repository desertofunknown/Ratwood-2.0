/datum/controller/subsystem/gamemode
	var/list/rolled_villain_events = list()
	var/list/queued_villains = list()

/datum/controller/subsystem/gamemode/proc/count_queued_villains(job_title)
	. = 0
	for(var/ckey in queued_villains)
		if(queued_villains[ckey] == job_title)
			.++

/datum/controller/subsystem/gamemode/proc/open_villain_signups()
	if(current_storyteller)
		current_storyteller.guarantees_roundstart_roleset = FALSE
		current_storyteller.roundstart_prob = 0
	for(var/datum/round_event_control/event as anything in rolled_villain_events)
		TriggerEvent(event, TRUE)
	rolled_villain_events = list()
	for(var/datum/round_modifier/M in active_modifiers)
		for(var/event_type in M.trigger_events)
			var/datum/round_event_control/event = locate(event_type) in control
			if(event)
				TriggerEvent(event, TRUE)
	for(var/mob/dead/new_player/player as anything in GLOB.new_player_list)
		var/job_title = queued_villains[player.ckey]
		if(!job_title || !player.client || player.spawning)
			continue
		to_chat(player, span_boldwarning("You have been chosen for villainy as a [job_title]!"))
		player.AttemptLateSpawn(job_title)
	queued_villains = list()

/mob/dead/new_player/proc/VillainChoices()
	var/list/dat = list()
	var/pregame = SSticker.current_state <= GAME_STATE_PREGAME
	dat += "<main class='villain-choices' id='villain-list' tabindex='0' aria-label='Villains'><header class='villain-heading'><h1>Villains</h1><a href='?src=[REF(src)];villains=1'>Refresh</a></header>"

	if(!SSgamemode.modifiers_rolled)
		dat += "<p class='villain-empty'>Waiting for this round's villain roles.</p>"
	else
		dat += "<h2>Greater villains</h2>"
		if(!length(SSgamemode.rolled_villain_events))
			dat += "<p class='villain-empty'>None this round.</p>"
		else
			dat += "<table><thead><tr><th scope='col'>Role</th><th scope='col' class='villain-slots'>Slots</th></tr></thead><tbody>"
		for(var/datum/round_event_control/antagonist/event in SSgamemode.rolled_villain_events)
			var/slots = 1
			if(istype(event, /datum/round_event_control/antagonist/solo))
				var/datum/round_event_control/antagonist/solo/solo_event = event
				slots = solo_event.get_antag_amount()
			dat += "<tr><th scope='row'>[html_encode(event.name)]</th><td class='villain-slots'>[slots]</td></tr>"
		if(length(SSgamemode.rolled_villain_events))
			dat += "</tbody></table><p class='villain-note'>Selected at roundstart from your antagonist preferences.</p>"

		dat += "<h2>Lesser villains</h2>"
		if(pregame)
			dat += "<p class='villain-note'>Choose a priority for roundstart selection.</p>"
		dat += "<table><thead><tr><th scope='col'>Role</th><th scope='col' class='villain-state'>[pregame ? "Preference" : "Join / slots"]</th></tr></thead><tbody>"
		var/found = FALSE
		for(var/job_title in GLOB.villain_positions)
			var/datum/job/J = SSjob.GetJob(job_title)
			if(!J || !J.total_positions)
				continue
			found = TRUE
			dat += "<tr><th scope='row'><a class='villain-name' href='?src=[REF(J)];explainjob=1'>[html_encode(J.title)]</a>"
			if(pregame)
				dat += "<span class='villain-note villain-slot-note'>[J.total_positions] [J.total_positions == 1 ? "slot" : "slots"]</span></th><td class='villain-state'>"
				var/pref_label = "Never"
				var/pref_class = "villain-never"
				var/next_level = 3
				switch(client.prefs.job_preferences[J.title])
					if(JP_HIGH)
						pref_label = "High"
						pref_class = "villain-high"
						next_level = 4
					if(JP_MEDIUM)
						pref_label = "Medium"
						pref_class = "villain-medium"
						next_level = 1
					if(JP_LOW)
						pref_label = "Low"
						pref_class = "villain-low"
						next_level = 2
				dat += "<a class='[pref_class]' role='button' aria-label='[html_encode(J.title)]: [pref_label] priority. Cycle preference.' data-villain-pref='[html_encode(J.title)]' href='byond://?src=[REF(src)];villain_pref=[url_encode(J.title)];level=[next_level]'>[pref_label]</a>"
			else
				dat += " <a class='villain-details' aria-label='[html_encode(J.title)] subclasses' href='?src=[REF(J)];jobsubclassinfo=1'>Details</a></th><td class='villain-state'><a aria-label='Join as [html_encode(J.title)], [J.current_positions] of [J.total_positions] slots filled' href='byond://?src=[REF(src)];SelectedJob=[url_encode(J.title)]'>Join</a><span class='villain-note villain-slot-note'>[J.current_positions] / [J.total_positions] filled</span>"
			dat += "</td></tr>"

		if(!found)
			dat += "<tr><td colspan='2' class='villain-empty'>No villain roles this round.</td></tr>"
		dat += "</tbody></table>"
	dat += "</main>"
	if(pregame)
		dat += {"<script>
		(function() {
			var list = document.getElementById('villain-list');
			var role = '';
			var scroll = 0;
			try {
				role = sessionStorage.getItem('keep-villain-focus') || '';
				scroll = Number(sessionStorage.getItem('keep-villain-scroll')) || 0;
				sessionStorage.removeItem('keep-villain-focus');
				sessionStorage.removeItem('keep-villain-scroll');
			} catch(e) {}
			var controls = list.querySelectorAll('a\[data-villain-pref\]');
			for(var i = 0; i < controls.length; i++) {
				var control = controls.item(i);
				control.onclick = function() {
					try {
						sessionStorage.setItem('keep-villain-focus', this.getAttribute('data-villain-pref'));
						sessionStorage.setItem('keep-villain-scroll', list.scrollTop);
					} catch(e) {}
				};
				if(control.getAttribute('data-villain-pref') === role) {
					control.focus();
					list.scrollTop = scroll;
				}
			}
		})();
		</script>"}

	var/datum/browser/popup = new(src, "villainchoices", "", 440, 440)
	popup.add_stylesheet("villain_choices", 'html/browser/villain_choices.css')
	var/list/font_urls = get_asset_datum(/datum/asset/simple/roguefonts).get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Keep Rocker'; src: url('[font_urls["newrocker.ttf"]]'); }</style>")
	popup.set_content(jointext(dat, ""))
	popup.open(FALSE)
	winset(src, "villainchoices.browser", "focus=true")

// this menu allows players 2 boost their stats to wretch tier (+12 weight) & choose between DE / Heavy Armor
/mob/living/carbon/human/var/datum/antag_setup/antag_setup

/datum/antag_setup
	var/mob/living/carbon/human/user
	var/list/stats = list()
	var/list/defaults = list()
	var/chosen_trait
	var/budget = 12
	var/static/list/stat_keys = list(STATKEY_STR, STATKEY_PER, STATKEY_INT, STATKEY_CON, STATKEY_WIL, STATKEY_SPD)

/datum/antag_setup/New(mob/living/carbon/human/H)
	// Equipment assigns advjob after post_equip, which can create this setup.
	set waitfor = FALSE
	user = H
	H.antag_setup = src
	var/waited = 0
	while(!H.advjob)
		sleep(1 SECONDS)
		waited += 1 SECONDS
		if(QDELETED(H) || waited > 60 SECONDS)
			qdel(src)
			return
	for(var/key in stat_keys)
		stats[key] = H.get_stat_level(key)
		defaults[key] = stats[key]
	user.verbs |= /mob/living/carbon/human/proc/open_antag_setup
	open_menu()

/datum/antag_setup/Destroy()
	if(user?.antag_setup == src)
		user.antag_setup = null
		user.verbs -= /mob/living/carbon/human/proc/open_antag_setup
	user = null
	return ..()

/mob/living/carbon/human/proc/open_antag_setup()
	set name = "Take Up Arms"
	set category = "IC"
	set desc = "Finish choosing your training and abilities."
	if(antag_setup)
		antag_setup.open_menu()

/datum/antag_setup/proc/statweight(key)
	if(key == STATKEY_STR || key == STATKEY_SPD)
		return 2
	return 1

/datum/antag_setup/proc/statspent()
	. = 0
	for(var/key in stat_keys)
		. += (stats[key] - defaults[key]) * statweight(key)

/datum/antag_setup/proc/open_menu(focus_control = null)
	if(QDELETED(user) || !user.client)
		return
	var/remaining = budget - statspent()
	var/contents = "<main class='arms-setup'><header class='arms-heading'><h1>Take Up Arms</h1><span class='arms-budget'><strong class='remaining'>[remaining]</strong> / [budget] points left</span></header>"
	contents += "<div class='arms-body' tabindex='0' aria-label='Abilities and training'><table class='arms-stats'><thead><tr><th scope='col'>Ability</th><th scope='col'>Cost</th><th scope='col'>Value</th><th scope='col'>Adjust</th></tr></thead><tbody>"
	for(var/key in stat_keys)
		var/stat_name = html_encode(capitalize(key))
		var/cost = statweight(key)
		contents += "<tr><th scope='row'>[stat_name]</th><td>[cost]</td><td>[stats[key]]<span class='arms-base'>base [defaults[key]]</span></td><td class='arms-adjust'>"
		for(var/action in list("lower", "raise"))
			var/enabled = action == "lower" ? stats[key] > defaults[key] : (stats[key] < 20 && remaining >= cost)
			var/control_id = "arms-[action]-[key]"
			var/control_label = "[action == "lower" ? "Decrease" : "Increase"] [stat_name]"
			var/symbol = action == "lower" ? "&minus;" : "+"
			if(enabled)
				contents += "<a class='arms-step' role='button' id='[control_id]' aria-label='[control_label]' href='?src=[REF(src)];[action]=[url_encode(key)]'>[symbol]</a>"
			else
				var/reason = action == "lower" ? "Starting value" : (stats[key] >= 20 ? "Maximum value" : "Not enough points")
				contents += "<span class='arms-step is-disabled' role='button' tabindex='-1' aria-disabled='true' id='[control_id]' aria-label='[control_label]: [reason]' title='[reason]'>[symbol]</span>"
		contents += "</td></tr>"
	contents += "</tbody></table><p class='arms-note'>Cost is per increase. Abilities can rise to 20.</p><h2>Training</h2><div class='arms-traits'>"
	var/list/training = list("dodge" = TRAIT_DODGEEXPERT, "heavy" = TRAIT_HEAVYARMOR)
	for(var/choice in training)
		var/trait = training[choice]
		var/description = choice == "dodge" ? "Dodge better in light armour or without armour." : "Move freely in heavy armour."
		contents += "<a class='arms-trait' role='button' id='arms-trait-[choice]' aria-pressed='[chosen_trait == trait ? "true" : "false"]' href='?src=[REF(src)];trait=[choice]'><strong>[html_encode(trait)]</strong><small>[description]</small>"
		if(HAS_TRAIT(user, trait))
			contents += "<small class='arms-known'>Already known</small>"
		contents += "</a>"
	contents += "</div><p class='arms-note'>Close to decide later; reopen with Take Up Arms in IC.</p></div><footer class='arms-footer'><p>Unspent points are discarded on confirmation.</p>"
	if(chosen_trait)
		contents += "<a class='arms-confirm' role='button' href='?src=[REF(src)];confirm=1'>Confirm training</a>"
	else
		contents += "<span class='arms-confirm is-disabled' role='button' aria-disabled='true' title='Choose training first'>Confirm training</span>"
	contents += "</footer></main>"
	if(focus_control)
		contents += "<script>var target = document.getElementById('[focus_control]'); if(target) target.focus();</script>"
	var/datum/browser/popup = new(user, "antagsetup", "", 420, 560)
	popup.add_stylesheet("antag_setup", 'html/browser/antag_setup.css')
	var/list/font_urls = get_asset_datum(/datum/asset/simple/roguefonts).get_url_mappings()
	popup.add_head_content("<style>@font-face { font-family: 'Keep Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Keep Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Keep Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Keep Rocker'; src: url('[font_urls["newrocker.ttf"]]'); }</style>")
	popup.set_content(contents)
	popup.open(FALSE)
	winset(user, "antagsetup.browser", "focus=true")

/datum/antag_setup/Topic(href, href_list)
	if(usr != user || QDELETED(user))
		return
	if(href_list["raise"])
		var/key = href_list["raise"]
		if(!(key in stat_keys))
			return
		if(stats[key] < 20 && (budget - statspent()) >= statweight(key))
			stats[key] += 1
		open_menu("arms-raise-[key]")
		return
	if(href_list["lower"])
		var/key = href_list["lower"]
		if(!(key in stat_keys))
			return
		if(stats[key] > defaults[key])
			stats[key] -= 1
		open_menu("arms-lower-[key]")
		return
	if(href_list["trait"])
		if(href_list["trait"] == "dodge")
			chosen_trait = TRAIT_DODGEEXPERT
		else if(href_list["trait"] == "heavy")
			chosen_trait = TRAIT_HEAVYARMOR
		else
			return
		open_menu("arms-trait-[href_list["trait"]]")
		return
	if(href_list["confirm"])
		if(!chosen_trait)
			to_chat(user, span_warning("Choose a trait."))
			return
		for(var/key in stat_keys)
			var/diff = stats[key] - defaults[key]
			if(diff)
				user.change_stat(key, diff)
		ADD_TRAIT(user, chosen_trait, TRAIT_GENERIC)
		user << browse(null, "window=antagsetup")
		qdel(src)

