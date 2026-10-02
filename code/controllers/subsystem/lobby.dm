SUBSYSTEM_DEF(lobbymenu)
	name = "Lobbyrefresh"
	wait = 2 SECONDS
	priority = FIRE_PRIORITY_DEFAULT
	flags = SS_NO_INIT
//	runlevels = RUNLEVEL_SETUP | RUNLEVEL_LOBBY | RUNLEVEL_GAME
	runlevels = RUNLEVEL_SETUP | RUNLEVEL_LOBBY
	var/list/currentrun = list()
	var/current_actor_list

/datum/controller/subsystem/lobbymenu/fire(resumed = 0)
	if(!resumed)
		currentrun = GLOB.new_player_list.Copy()

		// This info is the same for every player, so CALCULATE. IT. ONCE.
		var/list/actor_list = list()
		var/list/ready_players_by_job = list()
		var/list/wanderer_jobs = list(
			"Adventurer",
			"Wretch",
			"Court Agent"
		)
		for (var/mob/dead/new_player/player in GLOB.player_list)
			if (player.client?.ckey in GLOB.hiderole)
				continue
			var/job_choice = player.client?.prefs?.job_preferences
			if (job_choice)
				for (var/job_name in job_choice)
					if (job_choice[job_name] == JP_HIGH)
						if (job_name in wanderer_jobs)
							job_name = "Wanderer"
						if (player.ready == PLAYER_READY_TO_PLAY)
							if (!ready_players_by_job[job_name])
								ready_players_by_job[job_name] = list()
							ready_players_by_job[job_name] += html_encode(player.client.prefs.real_name)
							break

		var/list/job_list_by_department = list( // Oorah Key value pair
			"Noblemen" = list(), // High nobility
			"Courtiers" = list(), // Low Nobility
			"Garrison" = list(), // Retinue
			"Church" = list(), // Clergy
			"Inquisition" = list(), // Inq
			"Yeomen" = list(), // Workers
			"Guildsmen" = list(), // Guildsmen
			"Peasants" = list(), // Pheasants (the birb)
			"Sidefolk" = list(), // Side strugglers
			"Wanderers" = list(), // Nobodies.
			"Tribe" = list(), // Nobodies.
		)
		for(var/job_name in ready_players_by_job)
			var/datum/job/J = SSjob.GetJob(job_name)
			var/key
			if(!J)
				key = SSjob.bitflag_to_department(WANDERER, TRUE)
			else
				key = SSjob.bitflag_to_department(J.department_flag)

			var/list/job_players = ready_players_by_job[job_name]
			job_list_by_department[key] += "<tr><th scope='row'>[html_encode(job_name)] <span class='job-count'>([job_players.len])</span></th><td>[job_players.Join(", ")]</td></tr>"

		for(var/department in job_list_by_department)
			var/list/jobs_under_department = job_list_by_department[department]
			if(jobs_under_department.len)
				sortTim(jobs_under_department, cmp = GLOBAL_PROC_REF(cmp_text_asc))
				actor_list += "<section class='department'><h3>[html_encode(department)]</h3><table class='job-list'><tbody>"
				actor_list += jobs_under_department
				actor_list += "</tbody></table></section>"

		current_actor_list = actor_list.Join()

	while(currentrun.len)
		var/mob/dead/new_player/player = currentrun[currentrun.len]
		currentrun.len--
		if(player.client)
			player.lobby_refresh(current_actor_list)
		if (MC_TICK_CHECK)
			return
