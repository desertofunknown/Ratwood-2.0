# Local differential evidence

Run from `tgui/` with the existing Bun installation:

```
bun test ./prototypes/chat-highlights/tests
```

No added dependencies or package scripts. `happydom.ts` is the existing test preload.
The helper suite imports temporary copies of the **actual pinned source**, transformed
only by `candidate-overlay.ts`. The renderer test bundles the **actual production
renderer and dependencies**, using the preview's pinned Tooltip-only resolver boundary and
production logging define. The original Tooltip export is used directly to avoid
unrelated ByondUi native registration from the production component barrel; this
is the actual renderer in a disconnected host, not the entire production init graph. It does not reconstruct classification or replace
rendering helpers. The only runtime test seams are a disconnected Byond stub and
tracking/clearing constructor interval timers. Temporary bundles are removed.

`renderer-fixtures.ts` is browser-compatible and shared with the preview. It emits
15 snapshots comparing HTML, highlight count, type, visible order, stored message
state and batchProcessed events. It covers repeated-message combining, reused DOM
identity, avoidHighlighting, internal/reconnect messages, hidden tabs, restoration
prepending/queued ordering, settings/color replacement, rebuild, clearing settings,
word/regex options, punctuation/Cyrillic, empty and invalid patterns. Explicit
expected type assertions cover say/radio/notice/warning/danger, pm exclusions,
competing category priority, reused-node root-only classes and explicit type overrides. Link, image
(no src) and unknown-component fixtures are inert. Known React tooltip mounting,
real image loading/retries and real browser layout are **not** validated here.

Helper cases additionally cover repeated prepared calls, primary lastIndex reset,
secondary case-insensitive matching, null factory fallback, nested original-child
traversal, overlapping groups, zero-length global regexes, lazy invalid secondary
regex errors, safety-cap behavior and subsequent reuse. Non-global zero-length
regexes are intentionally not executed: the existing helper's loop is not bounded
for that unsupported input; production creates global patterns. This experiment
does not change that existing behavior.

Cache inspection confirms the new closure stores preparation/callback state, not
message nodes. Per-call node/fragment locals remain in the unchanged helper. This
is a source review plus fresh-node identity check, **not** a garbage-collector or
heap-retention proof. The prepared helper assumes fixed word inputs per settings
parser, matching the actual renderer lifecycle; arbitrary external mutation of a
words array after first use is not its supported contract.

Source-drift, repeated-overlay and invalid-variant/path checks fail closed. Existing
HTML/sanitizer boundaries remain unchanged. Passing happyDOM/local differential
checks do not establish browser speed, BYOND/IE compatibility, game acceptance,
or blanket security/sanitizer correctness.
