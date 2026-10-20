/// Synchronous production-queue tests. No test subsystem subtype, fire override,
/// sleep, or tick-usage override is introduced. The real Master is always restored.
/datum/controller/master/suffix_accounting_test
	processing = FALSE

/datum/controller/master/suffix_accounting_test/New()
	subsystems = list()

/datum/unit_test/scheduler_suffix_accounting
	var/datum/controller/master/saved_master
	var/datum/controller/master/suffix_accounting_test/test_master
	var/list/test_nodes = list()
	var/master_replaced = FALSE

/datum/unit_test/scheduler_suffix_accounting/Destroy()
	restore_master()
	return ..()

/datum/unit_test/scheduler_suffix_accounting/proc/install_master()
	test_master = new
	saved_master = Master
	Master = test_master
	master_replaced = TRUE

/datum/unit_test/scheduler_suffix_accounting/proc/restore_master()
	// Do not trust links after a failed corruption test. Detach every owned node
	// directly before restoring the real Master and allowing ordinary qdel cleanup.
	for(var/datum/controller/subsystem/node in test_nodes)
		node.queue_next = null
		node.queue_prev = null
		node.queued_priority = null
		node.queued_time = 0
		node.state = SS_IDLE
		if("queue_budget" in node.vars)
			node.vars["queue_budget"] = null
	if(test_master)
		test_master.queue_head = null
		test_master.queue_tail = null
		test_master.queue_priority_count = 0
		test_master.queue_priority_count_bg = 0
		if("queue_count" in test_master.vars)
			test_master.vars["queue_count"] = 0
		if("queue_changed" in test_master.vars)
			test_master.vars["queue_changed"] = FALSE
	if(master_replaced)
		Master = saved_master
		master_replaced = FALSE
		saved_master = null
	for(var/datum/controller/subsystem/node in test_nodes)
		qdel(node)
	test_nodes.Cut()
	if(test_master)
		qdel(test_master)
		test_master = null

/datum/unit_test/scheduler_suffix_accounting/proc/add_node(node_name, node_priority, node_flags = 0, enqueue_now = TRUE)
	var/datum/controller/subsystem/node = new
	test_nodes += node
	Master.subsystems += node
	node.name = node_name
	node.priority = node_priority
	node.flags = node_flags
	if(enqueue_now)
		node.enqueue()
	return node

/datum/unit_test/scheduler_suffix_accounting/proc/check_cancellation()
	// 1.2 is the stored float produced by the isolated real-RunQueue deferral
	// regression. Replaying its membership needs no mutable tick-usage source.
	var/datum/controller/subsystem/first = add_node("first",100)
	var/datum/controller/subsystem/middle = add_node("rounded boosted member",1.2)
	var/datum/controller/subsystem/last = add_node("terminal",1)
	first.dequeue()
	middle.dequeue()
	var/remaining_budget = Master.queue_priority_count
	// Dynamic lookup permits the same focused regression to execute against
	// original source: its subtractive remaining budget is below 1 and fails.
	if(hascall(Master,"RebuildQueueBudgets"))
		TEST_ASSERT(call(Master,"RebuildQueueBudgets")(),"The remaining queue must validate.")
		remaining_budget = last.vars["queue_budget"]
	TEST_ASSERT(remaining_budget >= last.queued_priority,"Subtractive cancellation must not underfund the terminal member.")
	TEST_ASSERT_EQUAL(remaining_budget,1,"The terminal authoritative suffix must equal its own stored weight.")
	TEST_ASSERT_EQUAL(Master.queue_head,last,"Cancellation regression changed the remaining head.")
	TEST_ASSERT_EQUAL(Master.queue_tail,last,"Cancellation regression changed the remaining tail.")
	last.dequeue()
	TEST_ASSERT_EQUAL(Master.queue_priority_count,0,"Draining must clear the foreground estimate exactly.")
	TEST_ASSERT_EQUAL(Master.queue_priority_count_bg,0,"Draining must clear the background estimate exactly.")

/datum/unit_test/scheduler_suffix_accounting/proc/check_integer_compatibility()
	var/datum/controller/subsystem/foreground = add_node("foreground",3)
	var/datum/controller/subsystem/ticker = add_node("ticker",10,SS_TICKER)
	var/datum/controller/subsystem/background = add_node("background",7,SS_BACKGROUND)
	TEST_ASSERT_EQUAL(Master.queue_head,ticker,"Ticker ordering must remain compatible.")
	TEST_ASSERT_EQUAL(Master.queue_priority_count,13,"Foreground estimate must update immediately on enqueue.")
	TEST_ASSERT_EQUAL(Master.queue_priority_count_bg,7,"Background estimate must update immediately on enqueue.")
	ticker.enqueue()
	TEST_ASSERT_EQUAL(Master.queue_priority_count,13,"Duplicate enqueue must not change estimates.")
	foreground.dequeue()
	TEST_ASSERT_EQUAL(Master.queue_priority_count,10,"Foreground estimate must update immediately on dequeue.")
	background.Destroy()
	TEST_ASSERT_NULL(background.queued_priority,"Destroy must remove queued membership.")
	TEST_ASSERT_EQUAL(Master.queue_priority_count,10,"Background Destroy changed foreground estimate.")
	TEST_ASSERT_EQUAL(Master.queue_priority_count_bg,0,"Background Destroy did not clear its estimate.")
	if("queue_count" in Master.vars)
		TEST_ASSERT_EQUAL(Master.vars["queue_count"],1,"Duplicate/removal operations changed membership count incorrectly.")
	ticker.dequeue()
	TEST_ASSERT_EQUAL(Master.queue_priority_count,0,"Draining must clear the foreground estimate exactly.")
	TEST_ASSERT_EQUAL(Master.queue_priority_count_bg,0,"Draining must clear the background estimate exactly.")

/datum/unit_test/scheduler_suffix_accounting/proc/check_finite_inputs()
	var/datum/controller/subsystem/valid = add_node("valid",10)
	for(var/value in list(null,"invalid",-1,1.#INF,-1.#INF,(1.#INF - 1.#INF)))
		var/datum/controller/subsystem/node = add_node("invalid",1,0,FALSE)
		node.priority = value
		TEST_ASSERT_EQUAL(node.enqueue(),FALSE,"Invalid priority must be rejected.")
		TEST_ASSERT_NULL(node.queued_priority,"Rejected priority created membership.")
		TEST_ASSERT_NULL(node.queue_prev,"Rejected priority changed previous links.")
		TEST_ASSERT_NULL(node.queue_next,"Rejected priority changed next links.")
		TEST_ASSERT_EQUAL(node.state,SS_IDLE,"Rejected priority changed subsystem state.")
		TEST_ASSERT_EQUAL(Master.queue_head,valid,"Rejected priority changed the head.")
		TEST_ASSERT_EQUAL(Master.queue_tail,valid,"Rejected priority changed the tail.")
		TEST_ASSERT_EQUAL(Master.queue_priority_count,10,"Rejected priority changed the scalar estimate.")
	var/datum/controller/subsystem/zero = add_node("zero",0,0,FALSE)
	TEST_ASSERT_EQUAL(zero.enqueue(),TRUE,"Zero is a valid stored membership weight.")
	TEST_ASSERT_NOTNULL(zero.queued_priority,"Zero must remain distinct from the absent null sentinel.")

/datum/unit_test/scheduler_suffix_accounting/proc/check_finite_boost()
	var/datum/controller/subsystem/first = add_node("first",3)
	var/datum/controller/subsystem/last = add_node("last",2)
	var/datum/controller/subsystem/background = add_node("background",7,SS_BACKGROUND)
	TEST_ASSERT(call(Master,"RebuildQueueBudgets")(),"Valid class folds must rebuild.")
	TEST_ASSERT_EQUAL(first.vars["queue_budget"],5,"Foreground head suffix must include both foreground members.")
	TEST_ASSERT_EQUAL(last.vars["queue_budget"],2,"Foreground tail suffix must equal its own weight.")
	TEST_ASSERT_EQUAL(background.vars["queue_budget"],7,"Background fold must remain separate.")
	TEST_ASSERT(call(Master,"BoostQueuePriority")(last),"Finite class boost must succeed.")
	TEST_ASSERT_EQUAL(last.queued_priority,2.5,"Boost must use all remaining same-class weights.")
	TEST_ASSERT_EQUAL(Master.queue_priority_count,5.5,"Compatibility estimate must reflect successful boost.")
	TEST_ASSERT_EQUAL(Master.queue_priority_count_bg,7,"Foreground boost must not alter background estimate.")
	// A skipped node's old suffix may remain stale until the next traversal.
	TEST_ASSERT(call(Master,"RebuildQueueBudgets")(),"Next traversal must rebuild after successful boost.")
	TEST_ASSERT_EQUAL(first.vars["queue_budget"],5.5,"Fresh head suffix must include boosted weight.")
	TEST_ASSERT_EQUAL(last.vars["queue_budget"],2.5,"Fresh terminal suffix must equal boosted weight.")

/datum/unit_test/scheduler_suffix_accounting/proc/check_boost_value_overflow()
	var/datum/controller/subsystem/first = add_node("maximum",3.4028234663852886e38)
	TEST_ASSERT(call(Master,"RebuildQueueBudgets")(),"Maximum finite member must validate.")
	TEST_ASSERT_EQUAL(call(Master,"BoostQueuePriority")(first),FALSE,"Nonfinite boosted weight must be rejected.")
	TEST_ASSERT_EQUAL(first.queued_priority,3.4028234663852886e38,"Rejected boost changed stored priority.")
	TEST_ASSERT_EQUAL(Master.queue_priority_count,3.4028234663852886e38,"Rejected boost changed compatibility estimate.")
	TEST_ASSERT_EQUAL(Master.queue_head,first,"Rejected boost changed head membership.")
	TEST_ASSERT_EQUAL(Master.queue_tail,first,"Rejected boost changed tail membership.")

/datum/unit_test/scheduler_suffix_accounting/proc/check_boost_class_overflow()
	var/datum/controller/subsystem/first = add_node("large",3.4028234663852886e38 * 0.6)
	var/datum/controller/subsystem/last = add_node("smaller",3.4028234663852886e38 * 0.35)
	TEST_ASSERT(call(Master,"RebuildQueueBudgets")(),"Initial near-maximum class must validate.")
	var/old_priority = last.queued_priority
	var/old_total = Master.queue_priority_count
	TEST_ASSERT_EQUAL(call(Master,"BoostQueuePriority")(last),FALSE,"Finite boost with overflowing prospective class must be rejected.")
	TEST_ASSERT_EQUAL(last.queued_priority,old_priority,"Rejected class overflow changed stored priority.")
	TEST_ASSERT_EQUAL(Master.queue_priority_count,old_total,"Rejected class overflow changed estimate.")
	TEST_ASSERT_EQUAL(first.queue_next,last,"Rejected class overflow changed forward links.")
	TEST_ASSERT_EQUAL(last.queue_prev,first,"Rejected class overflow changed reverse links.")
	TEST_ASSERT_EQUAL(Master.vars["queue_count"],2,"Rejected class overflow changed membership count.")

/datum/unit_test/scheduler_suffix_accounting/proc/check_aggregate_validation()
	var/datum/controller/subsystem/first = add_node("maximum-first",3.4028234663852886e38)
	var/datum/controller/subsystem/last = add_node("maximum-last",3.4028234663852886e38)
	TEST_ASSERT_NOTNULL(first.queued_priority,"Individually finite first member must be admitted.")
	TEST_ASSERT_NOTNULL(last.queued_priority,"Individually finite last member must be admitted.")
	TEST_ASSERT_EQUAL(call(Master,"RebuildQueueBudgets")(),FALSE,"Full pre-dispatch fold must reject aggregate overflow.")
	TEST_ASSERT_EQUAL(first.times_fired,0,"Validation helper must not dispatch the first member.")
	TEST_ASSERT_EQUAL(last.times_fired,0,"Validation helper must not dispatch the last member.")

/datum/unit_test/scheduler_suffix_accounting/Run()
	var/list/checks = list("check_cancellation","check_integer_compatibility")
	// Common checks retain a clean original-source fail-before control. New API
	// checks are candidate-only; no fire or intentional CRASH occurs in this unit.
	if(hascall(Master,"BoostQueuePriority"))
		checks += list("check_finite_inputs","check_finite_boost","check_boost_value_overflow","check_boost_class_overflow","check_aggregate_validation")
	for(var/check_name in checks)
		install_master()
		try
			call(src,check_name)()
		catch(var/exception/error)
			restore_master()
			throw error
		restore_master()
