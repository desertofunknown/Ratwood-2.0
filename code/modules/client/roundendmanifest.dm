/client/proc/view_rogue_manifest()
	var/list/dat = list()
	if(length(GLOB.character_list))
		dat += "<div class='roster-section'><h2>Recorded inhabitants</h2>"
		for(var/X in GLOB.character_list)
			dat += "<div class='roster-entry'>[GLOB.character_list[X]]</div>"
		dat += "</div>"
	else
		dat += "<div class='roster-empty'>No inhabitants have been recorded for this round.</div>"

	show_realm_roster("Inhabitants of the Realm", dat.Join(), filterable = length(GLOB.character_list) > 0)

/client/proc/view_actors_manifest()
	var/list/dat = list()
	var/has_actors = FALSE
	for(var/department in GLOB.actors_list)
		var/list/actors_under_department = GLOB.actors_list[department]
		if(actors_under_department.len)
			has_actors = TRUE
			dat += "<div class='roster-section'><h2><span class='roster-marker' style='background-color: [JCOLOR_BY_DEPARTMENT[department]];' aria-hidden='true'></span>[html_encode(department)]</h2>"
			for(var/X in actors_under_department)
				dat += "<div class='roster-entry'>[actors_under_department[X]]</div>"
			dat += "</div>"
	if(!length(dat))
		dat += "<div class='roster-empty'>No actors are currently listed in the realm's departments.</div>"

	show_realm_roster("This Story's Actors", dat.Join(), filterable = has_actors)

/client/proc/view_roleplay_ads()
	var/list/dat = list()
	if(length(GLOB.roleplay_ads))
		dat += "<div class='roster-section'>"
		for(var/X in GLOB.roleplay_ads)
			dat += "<div class='roster-entry roster-ad'>[GLOB.roleplay_ads[X]]</div>"
		dat += "</div>"
	else
		dat += "<div class='roster-empty'>No roleplay advertisements are currently posted.</div>"

	show_realm_roster("Roleplay Ads", dat.Join(), 650, length(GLOB.roleplay_ads) > 0)

/client/proc/show_realm_roster(title, content, height = 700, filterable = FALSE)
	var/dat = "<div class='realm-rosters'><div class='roster-header'><h1>[html_encode(title)]</h1><span>Round ID: [GLOB.rogue_round_id]</span></div>"
	if(filterable)
		dat += "<div class='roster-filter'><label for='roster-filter'>Filter names or text</label><input id='roster-filter' type='text' autocomplete='off' oninput='filterRealmRoster(this.value)' aria-controls='roster-entries'></div>"
	dat += "<div id='roster-entries'>[content]</div>"
	if(filterable)
		dat += "<p id='roster-no-matches' class='roster-empty' role='status' aria-live='polite' style='display: none;'>No entries match this filter.</p>"
	dat += "</div>"
	var/datum/browser/popup = new(src, "actors", null, 700, height)
	popup.set_window_options("can_close=1;can_resize=1;can_minimize=1;can_maximize=1;titlebar=1;")
	popup.add_stylesheet("realm_rosters", 'html/browser/realm_rosters.css')
	var/list/font_urls = get_asset_datum(/datum/asset/simple/roguefonts).get_url_mappings()
	var/head = "<title>[html_encode(title)]</title><style>@font-face { font-family: 'Roster Lora'; src: url('[font_urls["lora-regular.ttf"]]'); } @font-face { font-family: 'Roster Lora'; font-weight: 700; src: url('[font_urls["lora-bold.ttf"]]'); } @font-face { font-family: 'Roster Lora'; font-style: italic; src: url('[font_urls["lora-italic.ttf"]]'); } @font-face { font-family: 'Roster Pterra'; src: url('[font_urls["pterra.ttf"]]'); } @font-face { font-family: 'Roster Rocker'; src: url('[font_urls["newrocker.ttf"]]'); }</style>"
	if(filterable)
		head += {"<script type='text/javascript'>
function filterRealmRoster(value) {
	var query = value.toLowerCase().trim();
	var sections = document.getElementById('roster-entries').querySelectorAll('.roster-section');
	var total = 0;
	for (var i = 0; i < sections.length; i++) {
		var section = sections.item(i);
		var entries = section.querySelectorAll('.roster-entry');
		var visible = 0;
		for (var j = 0; j < entries.length; j++) {
			var entry = entries.item(j);
			if (typeof entry.rosterSearchText === 'undefined') {
				entry.rosterSearchText = (entry.innerText || entry.textContent || '').toLowerCase();
			}
			var matches = entry.rosterSearchText.indexOf(query) !== -1;
			entry.style.display = matches ? '' : 'none';
			if (matches) visible++;
		}
		section.style.display = visible ? '' : 'none';
		total += visible;
	}
	document.getElementById('roster-no-matches').style.display = total ? 'none' : 'block';
}
</script>"}
	popup.add_head_content(head)
	popup.set_content(dat)
	popup.open(FALSE)
