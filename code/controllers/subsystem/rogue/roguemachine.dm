
PROCESSING_SUBSYSTEM_DEF(roguemachine)
	name = "roguemachine"
	wait = 20
	flags = SS_NO_INIT
	priority = 1
	var/list/hermailers = list()
	/// Mailbox numbers are never reused during a round.
	var/list/hermes_by_number = list()
	var/next_hermes_number = 0
	var/list/cameras = list()
	var/list/scomm_machines = list()
	/// Dialling numbers stay stable when the broadcast list changes.
	var/list/scom_by_number = list()
	var/next_scom_number = 0
	var/list/broadcaster_machines = list()
	var/list/stock_machines = list()
	var/list/noticeboards = list()
	/// The primary mercenary talking statue (first one Initialize()d). See talkstatue_mercenary.dm.
	var/obj/structure/roguemachine/talkstatue/mercenary/mercenary_statue
	/// All mercenary talking statues, in case more than one is mapped in.
	var/list/mercenary_statues = list()
	/// The primary church talking statue (first one Initialize()d). See talkstatue.dm.
	var/obj/structure/roguemachine/talkstatue/church/church_statue
	/// All Rosewall boards (bathhouse service adverts). See noticeboard/rosewall.dm.
	var/list/rosewalls = list()
	var/hermailermaster
	var/list/death_queue = list()
	var/last_death_report
	var/obj/item/clothing/head/roguetown/crown/serpcrown/crown
	var/obj/item/rogueweapon/sword/long/martyr/martyrweapon
	var/obj/item/key

/datum/controller/subsystem/processing/roguemachine/proc/register_hermes_number(obj/structure/roguemachine/mail/machine)
	next_hermes_number++
	hermes_by_number["[next_hermes_number]"] = machine
	return next_hermes_number

/datum/controller/subsystem/processing/roguemachine/proc/unregister_hermes_number(obj/structure/roguemachine/mail/machine, number)
	if(hermes_by_number["[number]"] == machine)
		hermes_by_number -= "[number]"

/datum/controller/subsystem/processing/roguemachine/proc/get_hermes_by_number(number)
	if(!isnum(number) || number < 1 || number != round(number))
		return null
	var/obj/structure/roguemachine/mail/machine = hermes_by_number["[number]"]
	if(QDELETED(machine))
		return null
	return machine

/datum/controller/subsystem/processing/roguemachine/proc/register_scom_number(atom/machine)
	next_scom_number++
	scom_by_number["[next_scom_number]"] = machine
	return next_scom_number

/datum/controller/subsystem/processing/roguemachine/proc/unregister_scom_number(atom/machine, number)
	if(scom_by_number["[number]"] == machine)
		scom_by_number -= "[number]"

/datum/controller/subsystem/processing/roguemachine/fire(resumed = 0)
	. = ..()
	if(death_queue.len)
		if(world.time > last_death_report + 3 SECONDS)
			last_death_report = world.time
			if(SSroguemachine.hermailermaster)
				var/obj/item/roguemachine/mastermail/X = SSroguemachine.hermailermaster
				for(var/I in death_queue)
					var/obj/item/paper/P = new(X.loc)
					P.mailer = "death witness"
					P.mailedto = "steward of roguetown"
					P.update_icon()
					P.info = I
					var/datum/component/storage/STR = X.GetComponent(/datum/component/storage)
					STR.handle_item_insertion(P, prevent_warning=TRUE)
					X.new_mail=TRUE
					X.update_icon()
				playsound(X, 'sound/misc/hiss.ogg', 100, FALSE, -1)
				var/the_track = 'sound/misc/cas1.ogg'
				if(death_queue.len >= 2)
					the_track = 'sound/misc/cas2.ogg'
				if(death_queue.len >= 5)
					the_track = 'sound/misc/cas3.ogg'
				for(var/mob/M in GLOB.player_list)
					if(is_in_roguetown(M))
						M.playsound_local(M.loc, the_track, 100, FALSE)
				death_queue.Cut()

/proc/is_in_roguetown(atom/A)
	if(!A)
		return FALSE
	var/turf/T = get_turf(A)
	if(!T)
		return FALSE
	var/area/the_area = get_area(T)
	var/static/list/safe_areas = typecacheof(list(\
		/area/rogue/outdoors/town,\
		/area/rogue/indoors/town,\
		/area/rogue/under/town,\
		/area/rogue/under/town/basement,\
		/area/rogue/under/town/caverogue,\
	))
	if(is_type_in_typecache(the_area.type, safe_areas))
		return TRUE
	return FALSE

#ifdef TESTING
/mob/living/verb/maxzcdec()
	set category = "DEBUGTEST"
	set name = "IsInRoguetown"
	set desc = ""
	if(is_in_roguetown(src))
		to_chat(src, "\n<font color='purple'>IS IN</font>")
	else
		to_chat(src, "\n<font color='purple'>IS NOT IN</font>")
#endif
