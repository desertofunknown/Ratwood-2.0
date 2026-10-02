/datum/clan_menu_interface
	var/mob/living/carbon/human/user
	var/datum/clan/user_clan
	var/list/datum/coven/user_covens
	var/current_coven // Currently selected coven for research view
	var/datum/clan_hierarchy_interface/hierarchy_interface // Hierarchy management
	var/datum/clan_hierarchy_node/selected_position // Currently selected position

	var/datum/coven/coven_one_preliminary
	var/datum/coven/coven_two_preliminary
	var/datum/coven/coven_three_preliminary

/datum/clan_menu_interface/New(mob/living/carbon/human/target_user)
	user = target_user
	user_clan = user.clan
	user_covens = user.covens
	if(user_clan)
		hierarchy_interface = new /datum/clan_hierarchy_interface(user)
	..()

/datum/clan_menu_interface/Destroy()
	if(user?.clan_menu_interface == src)
		user.clan_menu_interface = null
	QDEL_NULL(hierarchy_interface)
	user = null
	user_clan = null
	user_covens = null
	return ..()

/datum/clan_menu_interface/proc/is_current_user(mob/caller)
	return !QDELETED(user) && caller == user && !QDELETED(user_clan) && user.clan == user_clan && user.clan_menu_interface == src && (user in user_clan.clan_members)

/datum/clan_menu_interface/proc/select_coven(slot, coven_path)
	if(user != user_clan.clan_leader || user_clan.covens_to_select < slot || !user_clan.can_select_coven(coven_path))
		return
	if(coven_path == coven_one_preliminary || coven_path == coven_two_preliminary || coven_path == coven_three_preliminary)
		return
	switch(slot)
		if(1)
			coven_one_preliminary = coven_path
		if(2)
			coven_two_preliminary = coven_path
		if(3)
			coven_three_preliminary = coven_path

/datum/clan_menu_interface/proc/show_hierarchy()
	if(!hierarchy_interface)
		return
	current_coven = null

	var/hierarchy_html = hierarchy_interface.generate_hierarchy_html()

	user << browse(generate_combined_html(hierarchy_html), "window=clan_menu")

/datum/clan_menu_interface/proc/generate_interface()
	//probably should make this an asset instead
	user << browse_rsc('html/research_hover.png')
	user << browse_rsc('html/research_base.png')
	user << browse_rsc('html/research_known.png')
	user << browse_rsc('html/research_selected.png')
	user << browse_rsc('html/KettleParallaxBG.png')
	user << browse_rsc('html/KettleParallaxNeb.png')

	user << browse_rsc('html/gifs/Awe.gif')

	var/html = generate_combined_html(generate_setup_html())
	user << browse(html, "window=clan_menu;size=1400x900;can_resize=1")

/datum/clan_menu_interface/proc/generate_welcome_screen_html()
	var/clan_downside = "burn in sunlight"
	var/blood_preference = "any blood"

	if(user_clan)
		clan_downside = user_clan.get_downside_string()
		blood_preference = user_clan.get_blood_preference_string()

	return {"
	<div class="welcome-screen">
		<h2>Welcome to your Clan</h2>

		<div class="intro-section">
			<p>Select a coven from the sidebar to view its research tree and manage your powers.
			Each coven represents a different aspect of your vampiric abilities.</p>
		</div>

		<div class="vampire-mechanics">
			<h3>Vampiric Nature</h3>
			<div class="mechanic-item">
				<strong>Blood Hunger:</strong> You must drink blood to survive. You prefer <span class="blood-type">[blood_preference]</span>.
			</div>
			<div class="mechanic-item">
				<strong>Clan Weakness:</strong> Your clan's curse means you <span class="weakness">[clan_downside]</span>.
			</div>
			<div class="mechanic-item">
				<strong>Silver Vulnerability:</strong> Silver weaponry may trigger a blood frenzy, causing you to lose control and attack indiscriminately.
			</div>
		</div>

		<div class="gameplay-tips">
			<h3>Gameplay Tips</h3>
			<div class="tip-item">
				<strong>Coven Abilities:</strong> Right-click on any coven ability to switch between different powers from that coven.
			</div>
			<div class="tip-item">
				<strong>Creating Progeny:</strong> Drain someone's blood to critical levels to gain the option to embrace them as a new vampire.
			</div>
		</div>
	</div>
	"}

/datum/clan_menu_interface/proc/generate_setup_html()
	var/clan_downside = "burn in sunlight"
	var/blood_preference = "any blood"

	if(user_clan)
		clan_downside = user_clan.get_downside_string()
		blood_preference = user_clan.get_blood_preference_string()

	return {"
	<script>
		function submitCovens() {
			if(confirm('This choice is final, you will not be able to change covens later. Are you sure??')) {
				window.location.href = '?src=[REF(src)];action=select_covens';
			}
		}
		function previewCovenOne() {
			window.location.href = '?src=[REF(src)];action=load_coven_preview_one_tree;';
		}
		function previewCovenTwo() {
			window.location.href = '?src=[REF(src)];action=load_coven_preview_two_tree;';
		}
		function previewCovenThree() {
			window.location.href = '?src=[REF(src)];action=load_coven_preview_three_tree;';
		}
		function selectCovenOne() {
			const formOne = document.getElementById('coven-selection1');
			const formOneData = new FormData(formOne);

			let params = '?src=[REF(src)];action=select_coven_one';
			for(let \[key, value\] of formOneData.entries()) {
				params += ';' + key + '=' + encodeURIComponent(value);
			}
			window.location.href = params;
		}
		function selectCovenTwo() {
			const formOne = document.getElementById('coven-selection2');
			const formOneData = new FormData(formOne);

			let params = '?src=[REF(src)];action=select_coven_two';
			for(let \[key, value\] of formOneData.entries()) {
				params += ';' + key + '=' + encodeURIComponent(value);
			}
			window.location.href = params;
		}
		function selectCovenThree() {
			const formOne = document.getElementById('coven-selection3');
			const formOneData = new FormData(formOne);

			let params = '?src=[REF(src)];action=select_coven_three';
			for(let \[key, value\] of formOneData.entries()) {
				params += ';' + key + '=' + encodeURIComponent(value);
			}
			window.location.href = params;
		}
	</script>
	<div class="welcome-screen">
		<h2>Welcome to your Clan</h2>

		<div class="intro-section">
			<p>Select up to three covens (two if you are a wretch)
			Each coven represents a different aspect of your vampiric abilities.
			Select a coven from the sidebar to view its research tree and manage your powers.
			</p>
		</div>
		[generate_coven_selection()]
		<div class="vampire-mechanics">
			<h3>Vampiric Nature</h3>
			<div class="mechanic-item">
				<strong>Blood Hunger:</strong> You must drink blood to survive. You prefer <span class="blood-type">[blood_preference]</span>.
			</div>
			<div class="mechanic-item">
				<strong>Clan Weakness:</strong> Your clan's curse means you <span class="weakness">[clan_downside]</span>.
			</div>
			<div class="mechanic-item">
				<strong>Silver Vulnerability:</strong> Silver weaponry may trigger a blood frenzy, causing you to lose control and attack indiscriminately.
			</div>
		</div>

		<div class="gameplay-tips">
			<h3>Gameplay Tips</h3>
			<div class="tip-item">
				<strong>Coven Abilities:</strong> Right-click on any coven ability to switch between different powers from that coven.
			</div>
			<div class="tip-item">
				<strong>Creating Progeny:</strong> Drain someone's blood to critical levels to gain the option to embrace them as a new vampire.
			</div>
		</div>
	</div>
	"}

/datum/clan_menu_interface/proc/generate_coven_selection()
	if(user_clan.covens_to_select < 1 || user != user_clan?.clan_leader)
		return ""
	return {"
	<div class="coven-selection">
		<div class ='coven-form'>
			<form id='coven-selection1'>
				<div class='form-group' style='margin-right: 15px;'>
					<label for='coven-select' style='display: block; margin-left: 5px; margin-right: 5px;margin-bottom: 5px; color: #fff;'></label>
					<select id='coven-select' onchange='selectCovenOne()' name='coven-type' required style='padding: 8px; background: #444; color: #fff; border: 1px solid #666; border-radius: 3px;'>
						<option value=''>[ispath(coven_one_preliminary) ? initial(coven_one_preliminary.name) : "-- EMPTY --"]</option>
						[coven_choice()]
					</select>
				</div>
			</form>
			[ispath(coven_one_preliminary) ? initial(coven_one_preliminary.desc) : ""]
			<button type='button' onclick='previewCovenOne()' class='btn-secondary' style='padding: 8px 16px; background: #0066cc; color: white; border: none; cursor: pointer;'>(?)</button>
		</div>
		[user_clan?.covens_to_select >= 2 ? "\
		<div class ='coven-form'>\
			<form id='coven-selection2'>\
				<div class='form-group' style='margin-right: 15px;'>\
					<label for='coven-select' style='display: block; margin-bottom: 5px; color: #fff;'></label>\
					<select id='coven-select' onchange='selectCovenTwo()' name='coven-type' required style='padding: 8px; background: #444; color: #fff; border: 1px solid #666; border-radius: 3px;'>\
						<option value=''>[ispath(coven_two_preliminary) ? initial(coven_two_preliminary.name) : "-- EMPTY --"]</option>\
						[coven_choice()]\
					</select>\
				</div>\
			</form>\
			[ispath(coven_two_preliminary) ? initial(coven_two_preliminary.desc) : ""]\
			<button type='button' onclick='previewCovenTwo()' class='btn-secondary' style='padding: 8px 16px; background: #0066cc; color: white; border: none; cursor: pointer;'>(?)</button>\
		</div>\
		":""]
		[user_clan?.covens_to_select >= 3 ? "\
		<div class ='coven-form'>\
			<form id='coven-selection3'>\
				<div class='form-group' style='margin-right: 15px;'>\
					<label for='coven-select' style='display: block; margin-bottom: 5px; color: #fff;'></label>\
					<select id='coven-select' onchange='selectCovenThree()' name='coven-type' required style='padding: 8px; background: #444; color: #fff; border: 1px solid #666; border-radius: 3px;'>\
						<option value=''>[ispath(coven_three_preliminary) ? initial(coven_three_preliminary.name) : "-- EMPTY --"]</option>\
						[coven_choice()]\
					</select>\
				</div>\
			</form>\
			[ispath(coven_three_preliminary) ? initial(coven_three_preliminary.desc) : ""]\
			<button type='button' onclick='previewCovenThree()' class='btn-secondary' style='padding: 8px 16px; background: #0066cc; color: white; border: none; cursor: pointer;'>(?)</button>\
		</div>\
		":""]
	</div>
	<button type='button' onclick='submitCovens()' class='btn-primary' style='padding: 8px 16px; background: #0066cc; color: white; border: none; border-radius: 3px; cursor: pointer; margin-right: 10px;'>Select Covens</button>
	"}

/datum/clan_menu_interface/proc/coven_choice()
	var/html = ""
	for(var/coven_path in subtypesof(/datum/coven))
		var/datum/coven/typecasted = coven_path
		if(!user_clan.can_select_coven(coven_path))
			continue

		if(coven_path == coven_one_preliminary || coven_path == coven_two_preliminary || coven_path == coven_three_preliminary)
			continue

		html += "<option value='[coven_path]'>[initial(typecasted.name)]</option>"

	return html

/datum/clan_menu_interface/proc/generate_coven_list_html()
	var/html = ""

	if(!user_covens || !length(user_covens))
		return "<li style='color: #999; padding: 20px; text-align: center;'>No covens available</li>"

	for(var/coven_name in user_covens)
		var/datum/coven/coven = user_covens[coven_name]
		var/experience_percent = coven.experience_needed > 0 ? round((coven.experience / coven.experience_needed) * 100, 1) : 100

		html += {"
		<li><a class="coven-item" id="coven-[html_encode(coven_name)]" href="byond://?src=[REF(src)];action=load_coven_tree;coven_name=[url_encode(coven_name)]">
			<div class="coven-name">[coven.name]</div>
			<div class="coven-stats">
				<span>Level [coven.level]/[coven.max_level]</span>
				<span>[coven.experience]/[coven.experience_needed] XP</span>
			</div>
			<div class="coven-progress">
				<div class="coven-progress-fill" style="width: [experience_percent]%"></div>
			</div>
		</a></li>
		"}

	return html

/datum/clan_menu_interface/proc/generate_combined_html(research_content, in_preview = FALSE)
	// shitcode
	var/datum/antagonist/vampire/vampire = user.mind?.has_antag_datum(/datum/antagonist/vampire)
	var/html = {"
	<html>
	<head>
		<style>
			.hierarchy-container {
				display: flex;
				width: 100%;
				height: calc(100vh - 100px);
				position: relative;
				margin-top: 20px;
			}
			.research-container {
				flex: 1;
				position: relative;
				overflow: auto;
				background: #1a1a1a;
				height: calc(100% - 40px);
				margin-bottom: 20px;
			}

			.hierarchy-sidebar {
				width: 280px;
				background: #2a2a2a;
				border-left: 1px solid #444;
				padding: 10px;
				overflow-y: auto;
				position: fixed;
				right: 0;
				top: 80px;
				height: calc(100vh - 100px);
				z-index: 1000;
			}

			.sidebar-header {
				margin-bottom: 20px;
				border-bottom: 1px solid #444;
				padding-bottom: 10px;
			}

			.sidebar-header h3 {
				color: #fff;
				margin: 0 0 10px 0;
			}

			.sidebar-content {
				max-height: calc(100% - 50px);
				overflow-y: auto;
			}

			.position-details h4 {
				color: #fff;
				margin-bottom: 15px;
			}

			.position-details p {
				margin: 8px 0;
				line-height: 1.4;
			}

			.position-actions {
				margin-top: 15px;
			}

			.btn-primary, .btn-secondary, .btn-danger {
				padding: 8px 16px;
				margin: 5px 5px 5px 0;
				border: none;
				border-radius: 4px;
				cursor: pointer;
				font-size: 14px;
			}

			.btn-primary {
				background: #007bff;
				color: white;
			}

			.btn-secondary {
				background: #6c757d;
				color: white;
			}

			.btn-danger {
				background: #dc3545;
				color: white;
			}

			.btn-primary:hover {
				background: #0056b3;
			}

			.btn-secondary:hover {
				background: #545b62;
			}

			.btn-danger:hover {
				background: #c82333;
			}

			/* Adjust main content to account for sidebar */
			.research-canvas {
				margin-right: 320px; /* Account for sidebar width */
				min-height: 600px;
				position: relative;
			}

			.member-name {
				font-size: 9px;
				color: #ccc;
				text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
				margin-top: 2px;
				line-height: 1.1;
				word-wrap: break-word;
				max-width: 100%;
				overflow: hidden;
				text-overflow: ellipsis;
			}

			.hierarchy-connection {
				position: absolute;
				height: 3px;
				background: linear-gradient(90deg, #666, #888, #666);
				border-radius: 1px;
				opacity: 0.8;
			}

			/* Node selection styles */
			.hierarchy-node {
				position: absolute;
				width: 110px
				height: 70px;
				background: rgba(40, 40, 50, 0.9);
				border: 2px solid #666;
				border-radius: 8px;
				cursor: pointer;
				transition: all 0.3s ease;
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				text-align: center;
				padding: 5px;
				box-sizing: border-box;
			}

			.hierarchy-node.selected {
				border-color: #4CAF50;
				box-shadow: 0 0 15px rgba(76, 175, 80, 0.5);
			}

			.hierarchy-node.filled {
				background: rgba(60, 80, 60, 0.9);
				border-color: #4CAF50;
			}

			.hierarchy-node.vacant {
				background: rgba(60, 40, 40, 0.9);
				border-color: #f44336;
			}

			.hierarchy-node.leader {
				background: rgba(80, 60, 40, 0.9);
				border-color: #FF9800;
				box-shadow: 0 0 10px rgba(255, 152, 0, 0.3);
			}

			.hierarchy-node:hover {
				transform: scale(1.05);
				box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
			}

			/* Icon container within the node */
			.hierarchy-node .icon-container {
				width: 32px;
				height: 32px;
				margin-bottom: 5px;
				display: flex;
				align-items: center;
				justify-content: center;
				background: rgba(0, 0, 0, 0.3);
				border-radius: 4px;
			}

			/* Modal styles */
			.modal {
				position: fixed;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				background: rgba(0,0,0,0.8);
				z-index: 2000;
			}

			.modal-content {
				position: relative;
				background: #2a2a2a;
				margin: 10% auto;
				padding: 20px;
				width: 500px;
				border-radius: 8px;
				color: #fff;
				overflow-y: auto;
			}

			.close {
				position: absolute;
				top: 10px;
				right: 15px;
				font-size: 24px;
				cursor: pointer;
				color: #ccc;
			}

			.close:hover {
				color: #fff;
			}

			.form-group {
				margin-bottom: 5px;
			}

			.form-group label {
				display: block;
				margin-bottom: 5px;
				color: #ccc;
			}

			.form-group input, .form-group textarea, .form-group select {
				width: 100%;
				padding: 6px;
				border: 1px solid #555;
				background: #1a1a1a;
				color: #fff;
				border-radius: 4px;
			}

			.form-actions {
				margin-top: 20px;
				text-align: right;
			}
			body {
				margin: 0;
				padding: 0;
				background: #000;
				color: #eee;
				font-family: Arial, sans-serif;
				overflow: hidden;
			}

			.clan-header {
				position: fixed;
				top: 0;
				left: 0;
				right: 0;
				height: 80px;
				background: linear-gradient(135deg, rgba(139, 69, 19, 0.95), rgba(160, 82, 45, 0.95));
				border-bottom: 3px solid #8B4513;
				z-index: 1001;
				display: flex;
				align-items: center;
				padding: 0 30px;
				box-shadow: 0 4px 15px rgba(0,0,0,0.6);
			}

			.clan-info {
				display: flex;
				align-items: center;
				gap: 30px;
				flex-grow: 1;
			}

			.clan-name {
				font-size: 28px;
				font-weight: bold;
				color: #FFD700;
				text-shadow: 2px 2px 6px rgba(0,0,0,0.8);
			}

			.clan-desc {
				font-size: 14px;
				color: #DDD;
				max-width: 400px;
				font-style: italic;
			}

			.header-controls {
				display: flex;
				gap: 15px;
			}

			.header-btn {
				background: rgba(0,0,0,0.4);
				border: 2px solid #8B4513;
				color: #FFD700;
				padding: 10px 20px;
				border-radius: 8px;
				cursor: pointer;
				font-weight: bold;
				transition: all 0.3s ease;
			}

			.header-btn:hover {
				background: rgba(160, 82, 45, 0.6);
				transform: translateY(-2px);
			}

			.main-container {
				display: flex;
				margin-top: 80px;
				height: calc(100vh - 80px);
			}

			.sidebar {
				width: 300px;
				background: linear-gradient(180deg, rgba(139, 69, 19, 0.3), rgba(0, 0, 0, 0.8));
				border-right: 2px solid #8B4513;
				padding: 20px;
				overflow-y: auto;
				z-index: 100;
			}

			.sidebar h3 {
				color: #FFD700;
				border-bottom: 2px solid #8B4513;
				padding-bottom: 8px;
				margin-bottom: 15px;
			}

			.coven-list {
				list-style: none;
				padding: 0;
				margin: 0;
			}

			.coven-item {
				background: rgba(0,0,0,0.4);
				margin-bottom: 10px;
				padding: 15px;
				cursor: pointer;
				transition: all 0.3s ease;
				position: relative;
			}

			.coven-item:hover {
				background: rgba(139, 69, 19, 0.4);
				transform: translateX(5px);
			}

			.coven-item.selected {
				background: rgba(160, 82, 45, 0.5);
				border-color: #FFD700;
				box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
			}

			.coven-item .coven-name {
				font-weight: bold;
				color: #FFD700;
				font-size: 16px;
				margin-bottom: 5px;
			}

			.coven-stats {
				font-size: 12px;
				color: #CCC;
				display: flex;
				justify-content: space-between;
				margin-bottom: 8px;
			}

			.coven-progress {
				width: 100%;
				height: 6px;
				background: rgba(0,0,0,0.5);
				border-radius: 3px;
				overflow: hidden;
				margin-bottom: 5px;
			}

			.coven-progress-fill {
				height: 100%;
				background: linear-gradient(90deg, #FF6B35, #F7931E);
				border-radius: 3px;
				transition: width 0.3s ease;
			}

			.research-points {
				background: rgba(106, 90, 205, 0.3);
				color: #ADD8E6;
				padding: 4px 8px;
				border-radius: 4px;
				font-size: 11px;
				display: inline-block;
			}

			.content-area {
				flex: 1;
				position: relative;
				overflow: hidden;
			}

			.coven-selection {
				display: flex;
				flex-direction: row;
				align-items: center;
				justify-content: center;
				text-align: center;
			}

			.coven-form {
				display: flex;
				flex: auto;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				text-align: center;
				align-content: stretch;
			}

			/* Research tree styles integrated */
			.parallax-container {
				position: absolute;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				overflow: hidden;
				z-index: 1;
			}

			.parallax-layer {
				position: absolute;
				width: 120%;
				height: 120%;
				background-repeat: repeat;
			}

			.parallax-bg {
				background-image: url('KettleParallaxBG.png');
				background-size: cover;
				background-repeat: no-repeat;
				background-position: center;
			}

			.parallax-stars-1 {
				background: radial-gradient(ellipse at center,
					rgba(139, 69, 19, 0.3) 0%,
					rgba(160, 82, 45, 0.2) 40%,
					transparent 70%),
					radial-gradient(circle at 20% 30%, rgba(255, 215, 0, 0.8) 1px, transparent 2px),
					radial-gradient(circle at 80% 20%, rgba(139, 69, 19, 0.6) 1px, transparent 2px),
					radial-gradient(circle at 60% 80%, rgba(160, 82, 45, 0.4) 2px, transparent 4px);
				background-size: 800px 600px, 200px 150px, 300px 200px, 250px 180px;
				opacity: 0.8;
			}

			.gif-showcase {
				margin: 12px 0;
				text-align: center;
				border-top: 1px solid rgba(139, 0, 0, 0.3);
				border-bottom: 1px solid rgba(139, 0, 0, 0.3);
				padding: 12px 0;
			}

			.gif-container {
				position: relative;
				margin: 0 auto;
				border-radius: 8px;
				overflow: hidden;
				background: #000;
				box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
				border: 2px solid #8b0000;
			}

			.gif-overlay {
				position: absolute;
				bottom: 0;
				left: 0;
				right: 0;
				background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
				padding: 6px;
				transform: translateY(100%);
				transition: transform 0.3s ease;
			}

			.gif-container:hover .gif-overlay {
				transform: translateY(0);
			}

			.gif-label {
				color: #ff6b6b;
				font-size: 11px;
				font-weight: bold;
				text-transform: uppercase;
				letter-spacing: 1px;
				text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.8);
			}

			.parallax-neb {
				background-image: url('KettleParallaxNeb.png');
				background-size: cover;
				background-repeat: no-repeat;
				background-position: center;
				opacity: 0.4;
			}

			.research-container {
				position: relative;
				background: transparent;
				width: 100%;
				height: 100%;
				overflow: hidden;
				cursor: grab;
				z-index: 10;
			}

			.research-container.dragging { cursor: grabbing; }

			.research-canvas {
				position: absolute;
				transform-origin: 0 0;
			}

			.connection-line {
				position: absolute;
				height: 3px;
				background: linear-gradient(90deg,
					rgba(139, 69, 19, 0.8) 0%,
					rgba(160, 82, 45, 0.6) 50%,
					rgba(139, 69, 19, 0.4) 100%);
				transform-origin: left center;
				z-index: 5;
				border-radius: 1px;
				box-shadow: 0 0 4px rgba(139, 69, 19, 0.3);
			}

			.connection-line.unlocked {
				background: linear-gradient(90deg,
					rgba(255, 215, 0, 0.8) 0%,
					rgba(255, 140, 0, 0.6) 50%,
					rgba(255, 215, 0, 0.4) 100%);
				box-shadow: 0 0 4px rgba(255, 215, 0, 0.3);
			}

			.research-node {
				background: url('research_base.png');
				position: absolute;
				width: 32px;
				height: 32px;
				cursor: pointer;
				transition: all 0.15s ease;
				display: flex;
				align-items: center;
				justify-content: center;
				z-index: 10;
			}

			.research-node img {
				width: 40px;
				height: 40px;
				object-fit: contain;
			}

			.research-node.unlocked {
				background: url('research_known.png');
			}

			.research-node.unlocked img {
				filter: hue-rotate(45deg) brightness(1.3) drop-shadow(0 0 6px rgba(255, 215, 0, 0.8));
			}

			.research-node.available {
			}

			.research-node.available img {
				filter: hue-rotate(90deg) brightness(1.1) drop-shadow(0 0 4px rgba(50, 205, 50, 0.6));
			}

			.research-node.locked img {
				opacity: 0.4;
				filter: grayscale(100%) brightness(0.7);
			}

			.research-node.power-node {
			}

			.research-node.enhancement-node {
			}

			.research-node:hover {
				background: url('research_hover.png');
				transform: scale(1.15);
				z-index: 100;
			}
			.power-level {
				position: absolute;
				top: -5px;
				right: -5px;
				background: #8B4513;
				color: #FFD700;
				border-radius: 50%;
				width: 16px;
				height: 16px;
				font-size: 10px;
				font-weight: bold;
				display: flex;
				align-items: center;
				justify-content: center;
				border: 1px solid #FFD700;
			}

			.tooltip {
				position: absolute;
				background: rgba(139, 69, 19, 0.95);
				border: 2px solid #8B4513;
				border-radius: 12px;
				padding: 15px;
				max-width: 350px;
				z-index: 1000;
				pointer-events: none;
				box-shadow: 0 8px 24px rgba(0,0,0,0.7);
				backdrop-filter: blur(5px);
			}

			.tooltip h3 {
				margin: 0 0 10px 0;
				color: #FFD700;
				text-shadow: 0 0 4px rgba(255,215,0,0.5);
			}

			.tooltip p {
				margin: 8px 0;
				font-size: 13px;
				line-height: 1.4;
			}

			.tooltip .power-stats {
				background: rgba(0,0,0,0.3);
				padding: 8px;
				border-radius: 6px;
				margin: 8px 0;
			}

			.tooltip .requirements {
				color: #FF6B6B;
				background: rgba(255, 107, 107, 0.1);
				padding: 6px;
				border-radius: 4px;
				margin: 6px 0;
			}

			.tooltip .research-cost {
				color: #ADD8E6;
				font-weight: bold;
			}

			.close-btn {
				position: fixed;
				bottom: 30px;
				right: 30px;
				background: rgba(139, 69, 19, 0.9);
				border: 2px solid #8B4513;
				color: #FFD700;
				padding: 15px 25px;
				border-radius: 8px;
				cursor: pointer;
				font-weight: bold;
				z-index: 1000;
				transition: all 0.3s ease;
			}

			.close-btn:hover {
				background: rgba(160, 82, 45, 0.9);
				transform: translateY(-3px);
			}

			.welcome-screen {
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				height: 100%;
				text-align: center;
				padding: 40px;
			}

			.welcome-screen h2 {
				color: #FFD700;
				font-size: 36px;
				margin-bottom: 20px;
				text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
			}

			.welcome-screen p {
				font-size: 18px;
				color: #CCC;
				max-width: 600px;
				line-height: 1.6;
				margin-bottom: 30px;
			}

			.clan-emblem {
				width: 120px;
				height: 120px;
				background: rgba(139, 69, 19, 0.3);
				border: 3px solid #8B4513;
				border-radius: 50%;
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 48px;
				color: #FFD700;
				margin-bottom: 30px;
			}

			a.coven-item {
				display: block;
				color: inherit;
				text-decoration: none;
			}
			button.hierarchy-node, button.research-node {
				font: inherit;
				color: inherit;
				margin: 0;
			}
			button.research-node {
				padding: 0;
				border: 0;
			}
			a:focus, button:focus, input:focus, select:focus, textarea:focus, #container:focus {
				outline: 2px solid #ffe3a3;
				outline-offset: 2px;
			}
			#container:focus { outline-offset: -3px; }
			#container:focus::after {
				content: 'Arrows: pan | + / -: zoom | 0: reset | Tab: nodes';
				position: absolute;
				top: 8px;
				left: 8px;
				padding: 6px 10px;
				background: #17151c;
				color: #ffe3a3;
				font-size: 12px;
				pointer-events: none;
				z-index: 102;
			}
			.hierarchy-node:focus, .research-node:focus { z-index: 101; }
		</style>
	</head>
	<body>
		<div class="clan-header">
			<div class="clan-info">
				<div class="clan-name">[user_clan ? user_clan.name : "Unknown Clan"]</div>
				<div class="clan-desc">[user_clan ? user_clan.desc : ""]</div>
				<div class="clan-desc">RP: [vampire ? vampire.research_points : ""]</div>
			</div>
			<div class="header-controls">
				<a href="?src=[REF(src)];action=refresh_clan_menu" class="header-btn">Refresh</a>
			</div>
		</div>

		<div class="main-container">
			<div class="sidebar">
				<h3>Clan Hierarchy</h3>
				<ul class="coven-list">
					<li><a class="coven-item hierarchy-button" id="clan-hierarchy" href="?src=[REF(src)];action=show_hierarchy">
					<div class="coven-name">Clan Hierarchy</div>
					<div class="coven-stats">
						<span>Management</span>
						<span>View & Edit</span>
					</div>
					</a></li>
				</ul>
				<h3>Your Covens</h3>
				<ul class="coven-list">
					[generate_coven_list_html()]
				</ul>
			</div>

			<div class="content-area" id="content-area">
				[research_content]
			</div>
		</div>

		<a href="byond://?src=[REF(src)];action=[in_preview ? "refresh_clan_menu" : "close_clan_menu"]" class="close-btn">[in_preview ? "Return" : "Close"]</a>

		<script>


		function closeModal() {
			closeHierarchyModal();
		}



		// Modal click-outside-to-close functionality
		window.onclick = function(event) {
			const modal = document.getElementById('management-modal');
			if (event.target == modal) {
				closeHierarchyModal();
			}
		}

		// Initialize hierarchy controls when the hierarchy is loaded
		document.addEventListener('DOMContentLoaded', function() {
			initializeHierarchyControls();
		});

			// Hierarchy canvas dragging
			let hierarchyDragging = false;
			let hierarchyStartX, hierarchyStartY;
			let hierarchyCurrentX = 400, hierarchyCurrentY = 300;

			function initializeHierarchyControls() {
				const canvas = document.getElementById('hierarchy-canvas');
				const container = document.getElementById('hierarchy-container');

				if(!canvas || !container) return;

				container.addEventListener('mousedown', function(e) {
					if(e.target === container || e.target === canvas) {
						hierarchyDragging = true;
						hierarchyStartX = e.clientX - hierarchyCurrentX;
						hierarchyStartY = e.clientY - hierarchyCurrentY;
					}
				});

				document.addEventListener('mousemove', function(e) {
					if(hierarchyDragging) {
						hierarchyCurrentX = e.clientX - hierarchyStartX;
						hierarchyCurrentY = e.clientY - hierarchyStartY;
						canvas.style.transform = `translate(${hierarchyCurrentX}px, ${hierarchyCurrentY}px)`;
					}
				});

				document.addEventListener('mouseup', function() {
					hierarchyDragging = false;
				});
			}
			// Research tree interaction variables
			let isDragging = false;
			let startX, startY;
			let currentX = 400, currentY = 300;
			let scale = 1;


			const container = document.getElementById('container');
			const canvas = document.getElementById('canvas');
			const tooltip = document.getElementById('tooltip');
			const parallaxBg = document.getElementById('parallax-bg');
			const parallaxStars1 = document.getElementById('parallax-stars-1');
			const parallaxNeb = document.getElementById('parallax-neb');
			// Load saved position
			try {
				const savedX = sessionStorage.getItem('research_pos_x');
				const savedY = sessionStorage.getItem('research_pos_y');
				const savedScale = sessionStorage.getItem('research_scale');
				if (savedX !== null) currentX = parseFloat(savedX);
				if (savedY !== null) currentY = parseFloat(savedY);
				if (savedScale !== null) scale = parseFloat(savedScale);
			} catch(e) {
				currentX = 400;
				currentY = 300;
				scale = 1;
			}

			function savePosition() {
				try {
					sessionStorage.setItem('research_pos_x', currentX.toString());
					sessionStorage.setItem('research_pos_y', currentY.toString());
					sessionStorage.setItem('research_scale', scale.toString());
				} catch(e) {
					// Silently fail
				}
			}

			var treeFocusKey = 'clan_tree_focus_[REF(src)]';
			var modalReturnId = '';
			var activationKeyDown = 0;

			function getOpenHierarchyModal() {
				var modal = document.getElementById('management-modal');
				return modal && modal.style.display !== 'none' ? modal : null;
			}

			function modalControls(modal) {
				return Array.prototype.filter.call(modal.querySelectorAll('input, select, textarea, button, a'), function(control) {
					return !control.disabled && control.tabIndex >= 0 && control.getClientRects().length > 0;
				});
			}

			function closeHierarchyModal() {
				var modal = document.getElementById('management-modal');
				if (!modal) return;
				modal.style.display = 'none';
				try { sessionStorage.removeItem(treeFocusKey); } catch(e) {}
				var returnControl = document.getElementById(modalReturnId) || document.getElementById('hierarchy-create') || container;
				if (returnControl) returnControl.focus();
			}

			// Restore the initiating control after a server-rendered page refresh.
			document.addEventListener('click', function(e) {
				var control = e.target.closest('button, a');
				if (!control || !control.id || control.closest('#management-modal')) return;
				try { sessionStorage.setItem(treeFocusKey, control.id); } catch(error) {}
			}, true);

			document.addEventListener('keydown', function(e) {
				var modal = getOpenHierarchyModal();
				if (modal && !e.defaultPrevented && !e.altKey && !e.ctrlKey && !e.metaKey) {
					if (e.keyCode === 9) {
						var controls = modalControls(modal);
						var first = controls\[0\];
						var last = controls\[controls.length - 1\];
						if (first && (!modal.contains(document.activeElement) || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last))) {
							e.preventDefault();
							(e.shiftKey ? last : first).focus();
						}
					} else if (e.keyCode === 27 && !e.shiftKey && !e.target.isContentEditable && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
						e.preventDefault();
						e.stopPropagation();
						closeHierarchyModal();
					}
				}
				if ((e.keyCode === 13 || e.keyCode === 32) && !e.defaultPrevented && !e.target.isContentEditable && e.target.matches('button, a') && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
					if (e.repeat || activationKeyDown === e.keyCode) {
						e.preventDefault();
						return;
					}
					activationKeyDown = e.keyCode;
					if (e.keyCode === 32 && e.target.tagName === 'A' && e.target.hasAttribute('href') && !e.target.isContentEditable) {
						e.preventDefault();
						e.target.click();
					}
				}
			});
			document.addEventListener('keyup', function(e) {
				if (e.keyCode === activationKeyDown) activationKeyDown = 0;
			});
			window.addEventListener('blur', function() { activationKeyDown = 0; });

			document.addEventListener('focusin', function(e) {
				var modal = getOpenHierarchyModal();
				if (modal && !modal.contains(e.target)) {
					var controls = modalControls(modal);
					if (controls.length) controls\[0\].focus();
				}
			});

			document.addEventListener('DOMContentLoaded', function() {
				var savedFocus = '';
				try { savedFocus = sessionStorage.getItem(treeFocusKey) || ''; } catch(e) {}
				var modal = getOpenHierarchyModal();
				if (modal) {
					modalReturnId = savedFocus;
					var controls = modalControls(modal);
					var field = controls.filter(function(control) { return /^(INPUT|SELECT|TEXTAREA)$/.test(control.tagName); })\[0\];
					if (field || controls.length) (field || controls\[0\]).focus();
				} else {
					try { sessionStorage.removeItem(treeFocusKey); } catch(e) {}
					var control = document.getElementById(savedFocus);
					if (control) control.focus();
				}
			});

			function revealTreeNode(node) {
				container.scrollLeft = 0;
				container.scrollTop = 0;
				var bounds = container.getBoundingClientRect();
				var right = bounds.right;
				var sidebar = document.getElementById('hierarchy-sidebar');
				if (sidebar && window.getComputedStyle(sidebar).position === 'fixed') right = Math.min(right, sidebar.getBoundingClientRect().left);
				var nodeBounds = node.getBoundingClientRect();
				var padding = 18;
				var dx = nodeBounds.left < bounds.left + padding ? bounds.left + padding - nodeBounds.left : Math.min(0, right - padding - nodeBounds.right);
				var dy = nodeBounds.top < bounds.top + padding ? bounds.top + padding - nodeBounds.top : Math.min(0, bounds.bottom - padding - nodeBounds.bottom);
				currentX += dx;
				currentY += dy;
				updateCanvasTransform();
				updateParallax();
				savePosition();
				var rect = node.getBoundingClientRect();
				if (node.classList.contains('hierarchy-node')) {
					showNodeTooltip({clientX: rect.left, clientY: rect.bottom}, node.dataset.nodeData);
				} else {
					showCovenTooltip({clientX: rect.left, clientY: rect.bottom}, node);
				}
			}

			// Initialize research tree if elements exist
			if (container && canvas) {
				updateCanvasTransform();
				updateParallax();

				container.addEventListener('focusin', function(e) {
					if (e.target.matches('.hierarchy-node, .research-node')) {
						var node = e.target;
						window.setTimeout(function() {
							if (document.activeElement === node) revealTreeNode(node);
						}, 0);
					}
				});
				container.addEventListener('focusout', function(e) {
					if (e.target.matches('.hierarchy-node, .research-node')) hideTooltip();
				});
				container.addEventListener('keydown', function(e) {
					if (e.target !== container || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || getOpenHierarchyModal()) return;
					var oldScale = scale;
					switch (e.keyCode) {
						case 37: currentX += 40; break;
						case 38: currentY += 40; break;
						case 39: currentX -= 40; break;
						case 40: currentY -= 40; break;
						case 107: case 187: scale = Math.min(scale + 0.1, 2.0); break;
						case 109: case 189: scale = Math.max(scale - 0.1, 0.3); break;
						case 48: case 96: currentX = 400; currentY = 300; scale = 1; break;
						default: return;
					}
					e.preventDefault();
					if (e.keyCode !== 48 && e.keyCode !== 96 && oldScale !== scale) {
						var ratio = scale / oldScale;
						currentX = container.clientWidth / 2 - (container.clientWidth / 2 - currentX) * ratio;
						currentY = container.clientHeight / 2 - (container.clientHeight / 2 - currentY) * ratio;
					}
					updateCanvasTransform();
					updateParallax();
					savePosition();
				});

				// Mouse interaction events
				container.addEventListener('mousedown', function(e) {
					if (e.target === container || e.target === canvas || e.target.classList.contains('connection-line')) {
						isDragging = true;
						startX = e.clientX - currentX;
						startY = e.clientY - currentY;
						container.classList.add('dragging');
						e.preventDefault();
					}
				});

				document.addEventListener('mousemove', function(e) {
					if (isDragging) {
						currentX = e.clientX - startX;
						currentY = e.clientY - startY;
						updateCanvasTransform();
						updateParallax();
						savePosition();
					}

					if (document.activeElement && document.activeElement.matches('.hierarchy-node:focus, .research-node:focus')) return;

					// Tooltip handling
					if (e.target.classList.contains('research-node') || e.target.parentElement.classList.contains('research-node')) {
						const node = e.target.classList.contains('research-node') ? e.target : e.target.parentElement;
						showCovenTooltip(e, node);
					} else {
						hideTooltip();
					}
				});

				document.addEventListener('mouseup', function() {
					isDragging = false;
					container.classList.remove('dragging');
				});

				// Zoom functionality
				container.addEventListener('wheel', function(e) {
					e.preventDefault();
					const zoomSpeed = 0.1;
					const rect = container.getBoundingClientRect();
					const mouseX = e.clientX - rect.left;
					const mouseY = e.clientY - rect.top;
					const oldScale = scale;

					if (e.deltaY < 0) {
						scale = Math.min(scale + zoomSpeed, 2.0);
					} else {
						scale = Math.max(scale - zoomSpeed, 0.3);
					}

					const scaleRatio = scale / oldScale;
					currentX = mouseX - (mouseX - currentX) * scaleRatio;
					currentY = mouseY - (mouseY - currentY) * scaleRatio;

					updateCanvasTransform();
					updateParallax();
					savePosition()
				});

				// Node click handling
				document.addEventListener('click', function(e) {
					if (e.target.classList.contains('research-node') || e.target.parentElement.classList.contains('research-node')) {
						const node = e.target.classList.contains('research-node') ? e.target : e.target.parentElement;
						const nodeId = node.dataset.nodeId;
						if (nodeId) {
							window.location.href = '?src=[REF(src)];action=research_node;node_id=' + nodeId;
						}
					}
				});
			}

			function updateCanvasTransform() {
				if (canvas) {
					canvas.style.transform = 'translate(' + currentX + 'px, ' + currentY + 'px) scale(' + scale + ')';
				}
			}

			function updateParallax() {
				if (parallaxBg && parallaxStars1 && parallaxNeb) {
					const parallaxOffset = 0.3;
					const parallaxX = -currentX * parallaxOffset;
					const parallaxY = -currentY * parallaxOffset;

					parallaxBg.style.transform = 'translate(' + (parallaxX * 0.1) + 'px, ' + (parallaxY * 0.1) + 'px)';
					parallaxStars1.style.transform = 'translate(' + (parallaxX * 0.3) + 'px, ' + (parallaxY * 0.3) + 'px)';
					parallaxNeb.style.transform = 'translate(' + (parallaxX * 0.5) + 'px, ' + (parallaxY * 0.5) + 'px)';
				}
			}

			function showCovenTooltip(e, node) {
				if (!tooltip) return;

				const nodeData = JSON.parse(node.dataset.nodeData || '{}');
				let tooltipContent = '<h3>' + (nodeData.name || 'Unknown Power') + '</h3>';

				if (nodeData.desc) {
					tooltipContent += '<p>' + nodeData.desc + '</p>';
				}

				if (nodeData.showcase_gif) {
					const gifWidth = parseInt(nodeData.gif_width) || 200;
					const gifHeight = parseInt(nodeData.gif_height) || 150;
					const gifUrl = String(nodeData.showcase_gif).replace(/"/g, '&quot;');

					tooltipContent += '<div class="gif-showcase">';
					tooltipContent += '<div class="gif-container" style="width: ' + gifWidth + 'px; height: ' + gifHeight + 'px; background-image: url(' + gifUrl + '); background-size: cover; background-position: center; background-repeat: no-repeat;">';
					tooltipContent += '<div class="gif-overlay">';
					tooltipContent += '<span class="gif-label">Ability Preview</span>';
					tooltipContent += '</div>';
					tooltipContent += '</div>';
					tooltipContent += '</div>';
				}

				if (nodeData.cooldown && nodeData.cooldown > 0) {
					tooltipContent += '<div class="power-stats">Cooldown: ' + nodeData.cooldown + ' Seconds</div>';
				}

				if (nodeData.upkeep_cost && nodeData.upkeep_cost > 0) {
					tooltipContent += '<div class="power-stats">Upkeep Cost: ' + nodeData.upkeep_cost + ' every ' + nodeData.upkeep_duration + ' Seconds</div>';
				}

				if (nodeData.vitae_cost && nodeData.vitae_cost > 0) {
					tooltipContent += '<div class="power-stats">Vitae Cost: ' + nodeData.vitae_cost + '</div>';
				}

				if (nodeData.research_cost && nodeData.research_cost > 0) {
					tooltipContent += '<div class="research-cost">Research Cost: ' + nodeData.research_cost + ' RP</div>';
				}

				if (nodeData.prerequisites && nodeData.prerequisites.length > 0) {
					tooltipContent += '<div class="requirements">Requires: ' + nodeData.prerequisites.join(', ') + '</div>';
				}

				if (nodeData.minimal_generation) {
					tooltipContent += '<div class="requirements">Minimal Generation: ' + nodeData.minimal_generation + '</div>';
				}

				if (nodeData.special_effect) {
					tooltipContent += '<div class="power-stats">Special: ' + nodeData.special_effect + '</div>';
				}

				tooltip.innerHTML = tooltipContent;
				tooltip.style.display = 'block';

				// Position tooltip
				const rect = container.getBoundingClientRect();
				let left = e.clientX - rect.left + 15;
				let top = e.clientY - rect.top + 15;

				if (left + tooltip.offsetWidth > container.offsetWidth) {
					left = e.clientX - rect.left - tooltip.offsetWidth - 15;
				}
				if (top + tooltip.offsetHeight > container.offsetHeight) {
					top = e.clientY - rect.top - tooltip.offsetHeight - 15;
				}

				tooltip.style.left = left + 'px';
				tooltip.style.top = top + 'px';
			}

			function hideTooltip() {
				if (tooltip) {
					tooltip.style.display = 'none';
				}
			}
		</script>
	</body>
	</html>
	"}

	return html



/datum/clan_menu_interface/proc/load_coven_research_tree(coven_name, preview = FALSE)
	if(isnull(coven_name))
		return

	if(!(coven_name in user_covens) && !preview)
		return

	var/datum/coven/selected_coven

	if(preview)
		if(!user_clan.can_select_coven(coven_name))
			return
		selected_coven = new coven_name()
		current_coven = null
	else
		selected_coven = user_covens[coven_name]
		current_coven = coven_name

	if(!selected_coven.research_interface)
		selected_coven.initialize_research_tree()

	var/research_html = {"
	<div class="parallax-container">
		<div class="parallax-layer parallax-bg" id="parallax-bg"></div>
		<div class="parallax-layer parallax-stars-1" id="parallax-stars-1"></div>
		<div class="parallax-layer parallax-neb" id="parallax-neb"></div>
	</div>

	<div class="research-container" id="container" tabindex="0" aria-label="Research viewport. Arrow keys pan, plus and minus zoom, zero resets.">
		<div class="research-canvas" id="canvas">
			[selected_coven.research_interface.generate_coven_connections_html()]
			[selected_coven.research_interface.generate_coven_nodes_html()]
		</div>
	</div>

	<div class="tooltip" id="tooltip" style="display: none;"></div>
	"}

	user << browse(generate_combined_html(research_html, in_preview = TRUE), "window=clan_menu")

/datum/clan_menu_interface/Topic(href, href_list)
	if(!is_current_user(usr))
		return
	user_covens = user.covens

	switch(href_list["action"])
		if("load_coven_tree")
			var/coven_name = href_list["coven_name"]
			load_coven_research_tree(coven_name, preview = FALSE)

		if("load_coven_preview_one_tree")
			load_coven_research_tree(coven_one_preliminary, preview = TRUE)

		if("load_coven_preview_two_tree")
			load_coven_research_tree(coven_two_preliminary, preview = TRUE)

		if("load_coven_preview_three_tree")
			load_coven_research_tree(coven_three_preliminary, preview = TRUE)

		if("show_hierarchy")
			show_hierarchy()

		if("refresh_clan_menu")
			generate_interface()

		if("close_clan_menu")
			user << browse(null, "window=clan_menu")

		if("research_node")
			if(current_coven && (current_coven in user_covens))
				var/datum/coven/coven = user_covens[current_coven]
				if(coven.research_interface)
					coven.research_interface.user = user
					coven.research_interface.Topic(href, href_list)

					load_coven_research_tree(current_coven)

		if("select_coven_one")
			select_coven(1, text2path(href_list["coven-type"]))
			generate_interface()

		if("select_coven_two")
			select_coven(2, text2path(href_list["coven-type"]))
			generate_interface()

		if("select_coven_three")
			select_coven(3, text2path(href_list["coven-type"]))
			generate_interface()

		if("select_covens")
			var/list/choices = list()
			for(var/coven_path in list(coven_one_preliminary, coven_two_preliminary, coven_three_preliminary))
				if(coven_path)
					choices += coven_path
			if(user_clan.select_covens(user, choices))
				coven_one_preliminary = null
				coven_two_preliminary = null
				coven_three_preliminary = null
			generate_interface()

		if("edit_position", "submit_edit_position", "select_position", "create_position", "submit_create_position", "assign_member", "submit_assign_member", "remove_position")
			if(hierarchy_interface)
				hierarchy_interface.Topic(href, href_list)
