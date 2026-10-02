SUBSYSTEM_DEF(pathfinder)
	name = "Pathfinder"
	init_order = INIT_ORDER_PATH
	flags = SS_NO_FIRE
	var/datum/flowcache/mobs
	var/datum/flowcache/circuits

/datum/controller/subsystem/pathfinder/Initialize()
	mobs = new(10)
	circuits = new(3)
	return ..()

/datum/flowcache
	var/lcount
	var/list/requests = list()

/datum/flowcache/New(n)
	. = ..()
	lcount = n

/datum/flowcache/proc/getfree(atom/M)
	if(length(requests) >= lcount)
		return null
	var/datum/pathfinding_request/request = new
	request.requester = M
	requests[request] = TRUE
	request.timer_id = addtimer(CALLBACK(src, PROC_REF(toolong), request), 150, TIMER_STOPPABLE)
	return request

/datum/flowcache/proc/toolong(datum/pathfinding_request/request)
	if(!requests[request])
		return
	log_game("Pathfinder route took longer than 150 ticks, src bot [request.requester]")
	found(request)

/datum/flowcache/proc/found(datum/pathfinding_request/request)
	// A timed-out path may finish after a new request has claimed its capacity.
	if(!requests[request])
		return
	requests -= request
	qdel(request)

/datum/flowcache/Destroy()
	for(var/datum/pathfinding_request/request as anything in requests)
		qdel(request)
	requests.Cut()
	return ..()

/datum/pathfinding_request
	var/atom/requester
	var/timer_id

/datum/pathfinding_request/Destroy()
	if(timer_id)
		deltimer(timer_id)
		timer_id = null
	requester = null
	return ..()
