/// Avoid the real master's replacement, recovery, subsystem startup, and RNG setup.
/// This fixture is not a subsystem subtype, so startup never instantiates it.
/datum/controller/master/queue_order_test
	processing = FALSE

/datum/controller/master/queue_order_test/New()
	subsystems = list()

/datum/unit_test/subsystem_queue_order
	var/datum/controller/master/saved_master
	var/datum/controller/master/queue_order_test/test_master
	var/list/test_nodes = list()
	var/master_replaced = FALSE

/datum/unit_test/subsystem_queue_order/Destroy()
	restore_master()
	return ..()

/datum/unit_test/subsystem_queue_order/proc/restore_master()
	// Detach test nodes without relying on links that a failed assertion may have
	// found corrupt. Nothing may yield while the global Master is replaced.
	for(var/datum/controller/subsystem/node in test_nodes)
		node.queue_next = null
		node.queue_prev = null
		node.queued_priority = null
		node.queued_time = 0
		node.state = SS_IDLE
	if(master_replaced)
		Master = saved_master
		master_replaced = FALSE
		saved_master = null
	for(var/datum/controller/subsystem/node in test_nodes)
		qdel(node)
	test_nodes.Cut()
	if(test_master)
		test_master.queue_head = null
		test_master.queue_tail = null
		test_master.queue_priority_count = 0
		test_master.queue_priority_count_bg = 0
		qdel(test_master)
		test_master = null

/datum/unit_test/subsystem_queue_order/proc/add_node(node_name, node_priority, node_flags)
	// Plain base instances avoid adding a test subtype to the real startup scan.
	var/datum/controller/subsystem/node = new
	test_nodes += node
	node.name = node_name
	node.priority = node_priority
	node.flags = node_flags
	node.enqueue()
	return node

/datum/unit_test/subsystem_queue_order/proc/check_queue(list/expected, context)
	TEST_ASSERT_EQUAL(Master.queue_head, length(expected) ? expected[1] : null, "[context]: wrong head.")
	TEST_ASSERT_EQUAL(Master.queue_tail, length(expected) ? expected[length(expected)] : null, "[context]: wrong tail.")
	var/foreground = 0
	var/background = 0
	for(var/index in 1 to length(expected))
		var/datum/controller/subsystem/node = expected[index]
		TEST_ASSERT_EQUAL(node.queue_prev, index > 1 ? expected[index - 1] : null, "[context]: wrong previous link at [node.name].")
		TEST_ASSERT_EQUAL(node.queue_next, index < length(expected) ? expected[index + 1] : null, "[context]: wrong next link at [node.name].")
		TEST_ASSERT_EQUAL(node.queued_priority, node.priority, "[context]: wrong stored priority at [node.name].")
		TEST_ASSERT_EQUAL(node.state, SS_QUEUED, "[context]: wrong queued state at [node.name].")
		if(node.flags & SS_BACKGROUND)
			background += node.queued_priority
		else
			foreground += node.queued_priority
	TEST_ASSERT_EQUAL(Master.queue_priority_count, foreground, "[context]: wrong foreground total.")
	TEST_ASSERT_EQUAL(Master.queue_priority_count_bg, background, "[context]: wrong background total.")
	return TRUE

/datum/unit_test/subsystem_queue_order/proc/check_ordering()
	var/datum/controller/subsystem/ticker_a = add_node("ticker A", 50, SS_TICKER)
	var/datum/controller/subsystem/foreground_a = add_node("foreground A", 100, 0)
	var/list/expected = list(ticker_a, foreground_a)
	if(!check_queue(expected, "Ticker precedence over higher foreground priority"))
		return
	var/datum/controller/subsystem/ticker_b = add_node("ticker B", 50, SS_TICKER)
	expected.Insert(2, ticker_b)
	if(!check_queue(expected, "Equal ticker priorities preserve insertion order"))
		return
	var/datum/controller/subsystem/ticker_high = add_node("higher ticker", 80, SS_TICKER)
	expected.Insert(1, ticker_high)
	var/datum/controller/subsystem/ticker_low = add_node("lower ticker", 10, SS_TICKER)
	expected.Insert(4, ticker_low)
	if(!check_queue(expected, "Ticker priorities sort within their class"))
		return
	var/datum/controller/subsystem/foreground_high = add_node("higher foreground", 200, SS_NO_TICK_CHECK | SS_POST_FIRE_TIMING)
	expected.Insert(5, foreground_high)
	var/datum/controller/subsystem/foreground_b = add_node("foreground B", 100, 0)
	expected += foreground_b
	var/datum/controller/subsystem/foreground_low = add_node("lower foreground", 1, 0)
	expected += foreground_low
	if(!check_queue(expected, "Foreground priorities, stable ties, and unrelated flags"))
		return
	var/datum/controller/subsystem/background_a = add_node("background A", 1000, SS_BACKGROUND)
	expected += background_a
	var/datum/controller/subsystem/background_low = add_node("lower background", 1, SS_BACKGROUND)
	expected += background_low
	var/datum/controller/subsystem/background_b = add_node("background B", 1000, SS_BACKGROUND)
	expected.Insert(length(expected), background_b)
	var/datum/controller/subsystem/background_ticker = add_node("background ticker", 2000, SS_BACKGROUND | SS_TICKER | SS_POST_FIRE_TIMING)
	expected.Insert(9, background_ticker)
	if(!check_queue(expected, "Background precedence, stable ties, and combined ticker flag"))
		return
	ticker_a.enqueue()
	background_ticker.enqueue()
	if(!check_queue(expected, "Repeated enqueue must be idempotent"))
		return
	for(var/datum/controller/subsystem/node in list(ticker_high, foreground_a, background_low))
		node.dequeue()
		expected -= node
		if(!check_queue(expected, "Dequeue head, middle, and tail"))
			return
		node.dequeue()
		if(!check_queue(expected, "Repeated dequeue must be idempotent"))
			return
	while(length(expected))
		var/datum/controller/subsystem/node = expected[length(expected)]
		node.dequeue()
		expected.Cut(length(expected), length(expected) + 1)
		if(!check_queue(expected, "Drain queue"))
			return
	for(var/datum/controller/subsystem/node in test_nodes)
		TEST_ASSERT_NULL(node.queue_prev, "A dequeued node retained its previous link.")
		TEST_ASSERT_NULL(node.queue_next, "A dequeued node retained its next link.")
		TEST_ASSERT_NULL(node.queued_priority, "A dequeued node retained its priority.")
		TEST_ASSERT_EQUAL(node.queued_time, 0, "A dequeued node retained its enqueue time.")
		TEST_ASSERT_EQUAL(node.state, SS_IDLE, "A dequeued node retained its queued state.")

/datum/unit_test/subsystem_queue_order/Run()
	test_master = new
	saved_master = Master
	Master = test_master
	master_replaced = TRUE
	// Assertions return from check_ordering(), so restoration happens on both
	// success and assertion failure. Destroy() remains a fallback for runtimes.
	try
		check_ordering()
	catch(var/exception/error)
		restore_master()
		throw error
	restore_master()
