# Experiment-only prepared highlighter overlay

Not a production change, performance claim, or shipping recommendation. The source checkpoint is f8438d1. The two exact input hashes are exported in candidate-overlay.ts; both baseline and candidate builds reject source drift rather than silently adapting. Existing MIT source attribution is preserved in the transformed modules and acknowledged in the overlay.

## Build/test API

Import `transformSource(path, source, variant)` and `SOURCE_SHA256` from candidate-overlay.ts. `Variant` is `baseline | candidate`; `SourcePath` is the union of the two exact repository-relative keys. The bundler must map its absolute file paths to those keys. Pass only these files through this transform. It validates SHA-256 and exactly one occurrence of every edit anchor before returning unchanged baseline text or candidate text. Unknown paths/variants, altered input, or attempting to transform already-overlaid source throw. This is a Node/Bun build-time module, not a browser runtime import. It does not read or write files.

## Narrow candidate

The replacement module adds `prepareHighlightNode(regex, words, createNode?)`, returning a `(node) => count` callback. It lazily invokes the existing `replaceInTextNode` factory on the first invocation, then reuses that replacement callback. A factory exception leaves preparation unset so later calls retry, rather than caching a failure. The existing `highlightNode` API and implementation remain unchanged, including its eager per-invocation construction. No regex construction is moved into settings application.

The renderer creates one prepared callback per parser in `setHighlight`, keeping existing parser fields. It captures that parser's settings-derived regex, words, and color. Every settings application resets the parser collection and rebuilds callbacks; the existing message loop calls each parser's callback in the same order. Reused callbacks capture only preparation inputs and replacement state, never message DOM nodes. Message nodes remain call-local arguments; this adds no source/runtime cache retaining them.

## Invariants and mutation audit

Repository-wide reference search at the pinned checkpoint found `highlightParsers` assignments and pushes only inside renderer `setHighlight`; its only other use is the rendering loop. No production writer changes parser fields or mutates the prepared regex/word inputs after construction. Middleware calls `setHighlight` when settings change. The captured color is therefore equivalent to the previous per-message parser color lookup under this source's supported lifecycle. This must be re-audited if source changes; hashes intentionally prevent unnoticed renderer drift, but unrelated future source additions require a fresh repository-wide mutation audit too.

The `regexParseNode`, `replaceInTextNode`, and `replaceChildText` implementations are untouched. This preserves primary-first matching, secondary-only unmatched nodes, the secondary `gi` flags regardless of primary match-case, every existing lastIndex reset, empty-match progress, the 9,999-match cap, capture adjustment, snapshot sibling traversal, and group overlap/nesting behavior. No deduplication, escaping, regular-expression rewrite, or traversal optimization is included. Avoid-highlight messages still skip all groups. Whole-message marking and linkification remain ordered identically.

Lazy construction preserves the baseline first eligible message's secondary-pattern exception timing, including nodes without eligible text children: replacement preparation occurs before traversal. It also avoids doing secondary preparation for parsers that are never used. Primary regex creation and its existing try/catch remain in settings processing. Settings input arrays are not cloned, because that would alter the existing reference semantics; renderer builds fresh internal word arrays and has no subsequent writer.

## Evidence required before promotion

Run source-transform fail-closed tests, behavioral differential tests (including malformed secondary patterns, settings/color changes, overlap, case behavior, regex lastIndex, empty matches, safety cap, no-word and no-text cases), then actual ChatRenderer Chromium A/B using identical deterministic fixtures and build options. Report raw repeated samples and correctness checks; do not infer end-to-end speed from fewer factory calls or a synthetic microbenchmark. Production files are unchanged by this artifact. No engine, live data, hosting, installation, or publication is involved.
