# Snapshot wire version 2

Request ASCII, <=65,536 bytes excluding NUL. Fixed stack input copy and fixed parser row scratch; no payload-dependent heap allocation until complete validation. Header exactly:

`2|submit|request|round|requester|generation|scene_revision|target_revision|capability_revision|ttl_ms|node_count|start|goal|exclude|maxnodes_bits|depth_bits|min_range_bits|allow_multiz;ROW;ROW...`

Seven identity fields are exact decimal u64; ttl 0..10000. Node count 1..144. Indices 0-based; exclude '-' means absent. Start and goal must be expandable. Float fields exactly eight hex digits, finite/nonnegative f32 bits. Boolean fields exactly 0/1. Whole request must contain exactly n rows and no trailing separator.

Each terminal row exactly `0,z`. Each expandable row exactly `1,z,heuristic_bits,range_bits,target_N,cost_N_bits,allowed_N,target_S,cost_S_bits,allowed_S,target_E,cost_E_bits,allowed_E,target_W,cost_W_bits,allowed_W`. Direction order N,S,E,W is implicit and fixed, preserving blocked candidate attempts as well as allowed ones. Targets must be present nodes. Allowed edges must lead to expandable nodes. Repeated target pairs must have identical cost/allowed. Candidate-to-goal cost must equal heuristic bits. z is checked i32. Terminal data is unknown, never fabricated as valid observations; closure prevents expansion.

Validation uses fixed [Row;144] scratch and iterator field parsing (no Vec of fields), then checks closure and consistency. After full validation only: allocate dense kernel rows (n*(n+1) entries), initialize unknown pairs to zero/false under the closure contract, fill directional attempts, assign distance[goal]=heuristic. Sparse on wire; bounded dense adapter remains inside Rust. Checked arithmetic confirms dense logical payload <=104,400 bytes at n=144 (4-byte f32 plus bool); row scratch <24 KiB. Existing 24 MiB worker accounting ledger, 8 MiB result reserve, explicit 2 MiB worker stack, max 144 path nodes, edges-accounting cap 576, work cap 100,000. Input stack 64 KiB, parser scratch, 8 KiB output, returned DM copies and allocator/runtime overhead are outside ledger. No process RSS guarantee. Response full exact identity + kind + bounded route as before.

Lifecycle uses version 2 and existing init/poll/cancel/supersede/stop/join/failure semantics. No automatic recreation. Stop request never implies join. Malformed input must not consume the one admitted slot. Command envelopes other than submit bounded to 32 bytes before field splitting.


This supported subset requires finite nonnegative parameters. Parser and caller remain subject to README ABI/lifecycle requirements.
