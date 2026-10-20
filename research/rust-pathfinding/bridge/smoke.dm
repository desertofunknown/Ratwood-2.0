world
    fps = 10
/proc/check(actual, expected, label)
    if(actual != expected)
        world.log << "FAIL [label]: [actual] expected [expected]"
        shutdown()
    world.log << "PASS [label]"
/world/New()
    ..()
    check(call_ext("./libbridge.so", "bridge")("1|version"), "OK|1|echo", "version")
    var/held = call_ext("./libbridge.so", "bridge")("1|echo|original")
    check(held, "original", "first-output")
    for(var/i in 1 to 100)
        check(call_ext("./libbridge.so", "bridge")("1|echo|x"), "x", "short-[i]")
    check(held, "original", "DM-copy-retained")
    check(call_ext("./libbridge.so", "bridge")("1|echo|"), "", "empty-echo")
    check(call_ext("./libbridge.so", "bridge")(""), "ERR|protocol", "empty-input")
    check(call_ext("./libbridge.so", "bridge")(42), "ERR|protocol", "non-string")
    check(call_ext("./libbridge.so", "bridge")(), "ERR|argc", "argc-zero")
    check(call_ext("./libbridge.so", "bridge")("a", "b"), "ERR|argc", "argc-two")
    check(call_ext("./libbridge.so", "bridge")("2|version"), "ERR|protocol", "unsupported-version")
    check(call_ext("./libbridge.so", "bridge")("1|echo|\n"), "ERR|ascii", "non-ascii")
    var/payload = ""
    for(var/i in 1 to 1017)
        payload += "a"
    check(call_ext("./libbridge.so", "bridge")("1|echo|[payload]"), payload, "max-input")
    check(call_ext("./libbridge.so", "bridge")("1|echo|[payload]a"), "ERR|size", "oversize")
    world.log << "BRIDGE_SMOKE_PASS no worker started"
    shutdown()
