# Historical disconnected-renderer chat highlight A/B

This is a historical study, not a measurement or validation of current production. The renderer in historical/renderer.jsx.txt was recovered verbatim from commit e6f2f9265fb3059804c765fcf3eeb17202b248a8, path tgui/packages/tgui-panel/chat/renderer.jsx, SHA-256 60703d0758d3130fa1927dd8a15edd86d83fc25ebf3bd08c6ea83caa246f1ee2. Its original MIT header is preserved. Do not edit or re-pin this fixture to accommodate production changes. The plugin resolves its imports from the original production directory and records the fixture, not the live renderer, as the bundled input. Other existing source pins still fail closed. Production does not import the fixture.

Historical source differential tests and current production applicability are separate: current renderer drift is explicitly reported as stale-source-drift, never as newly measured performance. Build provenance records actual historical bytes and current-source comparison separately. Existing dist and hosted artifacts remain frozen; source/doc changes here do not update those artifacts or their old measurements. check.ts intentionally rejects stale artifact provenance against the checkout. Do not rebuild frozen dist to silence that check. No new performance measurements were made for this isolation.

Imports a byte-frozen historical production chat renderer, model, constants, highlight/linkify helpers, React, Tooltip/TooltipHTML, DOMPurify and logging. Preserves the relevant production implementations, with one explicit disconnected-host boundary: the core component barrel resolves directly to its unchanged Tooltip export. The production keyboard barrel does not override Tooltip. This excludes unrelated ByondUi native beforeunload side effects; exact keyboard/core barrels, ByondUi and Tooltip hashes are pinned and recorded. Both arms use this identical boundary. This is the actual chat renderer within a disconnected host, not the entire unchanged production initialization graph. Historical baseline source is unchanged; candidate changes only pinned renderer/highlighter sources through candidate-overlay.ts during bundling. The experiment never changes production config/source or other previews. No Svelte/new dependency.

For separately authorized historical reproduction only, work in a disposable copy, never this checkout’s frozen dist. In that separate copy, from tgui: bun prototypes/chat-highlights/build.ts
Then, in the same copy: bun prototypes/chat-highlights/check.ts
For source-only validation without altering frozen artifacts: bun test prototypes/chat-highlights/tests
See tests/ and candidate-notes.md for differential tests.

Output: dist/index.html with baseline/ and candidate/ routes for later authorized static hosting. Building does not host, publish, deploy or modify game behavior. Do not weaken browser security if local file loading is restricted.

## Visible workflow

Run correctness in both routes and compare JSON snapshots. Run benchmarks with equal sample/warmup counts. Defaults: 7 measured, 2 warmups. All controls disable during runs. Per-phase DOM/model/type/highlight count and FNV-1a HTML signatures are generated outside timing for each sample; compare these between arms before interpreting timing. Fixture logs are cleared outside each sample setup. JSON includes every sample and warmup plus summaries and browser/viewport metadata. Copy the complete JSON. Alternate arm order, repeat runs, keep tab visible and conditions stable. No outliers removed. Small samples/timer resolution limit confidence; one run cannot establish improvement.

## Timing method

Each arm uses the actual singleton and its one pruning interval; no constructors accumulate and no production timers are patched. Before each sample, dispose all messages, unmount, reset message/queue/page/scroll/highlight state, and mount a fresh equivalent DOM root outside timing. Payload generation/setup/cleanup are excluded. No event subscribers added during benchmarks. Actual synchronous processBatch includes message creation, combining scans, highlighting, linkification, image-query work, component detection, insertion and notification dispatch.

Scenarios: dense no-highlight/one-group/multi-group use identical inputs; sparse (5% matching) and sparse-no-highlight also use identical inputs; mixed HTML/plain/no-match/avoidHighlighting/linkified content. Inferred local-chat/plain-message classification and explicitly typed content are both represented. Unique suffixes prevent unintended combining; intentional combines are correctness tests.

- settingsUpdate: setHighlight only, excluding settings generation.
- firstUseOneMessage: first processBatch after settings, including lazy candidate preparation.
- warmOneMessage: one ordinary single-message processBatch after an equal priming message.
- live1000SingleCalls: synchronous burst total of 1000 single-message processBatch calls after one equal priming message, retaining growing history. Not per-message time or paced live throughput.
- restore1000Batch: one 1000-message processBatch with prepend:true and notifyListeners:false into an empty mounted log. Includes first use.
- rebuild1000: actual rebuildChat of 1000 existing messages, including disposal/reprocessing; excludes initial population, with prepared state warm.

Scheduled scroll/badge callbacks, pruning callbacks, React async commits and paint/layout after return are excluded. Callbacks cannot interleave a synchronous timed region but may run during sample yields. Timing fixtures do not instantiate recognized React tooltip components; correctness is separately reported. These are elapsed synchronous wall-clock measurements, NOT CPU usage, FPS, frame time, paint performance, backend latency or an end-to-end game benchmark. GC/system contention can affect results; outliers remain visible.

## Disconnection/lifecycle

Fail-closed Byond proxy permits only renderer fixture logs in local memory, rejecting saveBlob/subscriptions/all other access. Production logging remains real. Production dead-code elimination removes development transport; build/check rejects connected runtime residue. CSP denies network connections, images, fonts, workers, frames and forms. Inline styles are allowed only because actual highlights use style attributes; inline scripts remain forbidden. Fixture links use example.invalid and are not automatically followed. No storage/saves/assets/native-helper subscriptions/network endpoints.

The singleton pruning timer lives for document lifetime. pagehide disposes/unmounts and marks unloaded; closing/reloading discards it. Both arms are separate pages, not simultaneous hidden renderers. Correctness functions clean up the same singleton before timing resumes.

## Source/license requirements

See NOTICE.txt, LICENSE.txt, licenses/ and manifest.json. Manifest records original source and bundle hashes, input graph and dependency versions. Overlay fails closed on source drift. Local output alone is not a complete legal corresponding-source package; publish only with matching source and required notices.
