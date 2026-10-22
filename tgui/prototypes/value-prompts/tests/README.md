# Disconnected value-prompt behavioral oracle

`production-oracle.tsx` mounts the actual `TextInputModal` and
`NumberInputModal`, actual backend reducer/store/action transport, common footer
and Loader, installed tgui-core 4.3.3 controls, and repository keyboard adapters.
Only Window/layout chrome is mocked. It never imports candidate implementations.
Run it **alone in a fresh subprocess** so Bun module mocks cannot contaminate
candidate tests or other suites. From `tgui/`:

    VALUE_ORACLE_PATH=/tmp/value-prompts-production.json /path/to/bun test --tsconfig-override tsconfig.json ./prototypes/value-prompts/tests/production-oracle.tsx

Bun reads the repository `bunfig.toml` and `happydom.ts`. Parent comparison runners
should execute this subprocess first, then load its JSON in a separate candidate
process. The output path is mandatory, and records are generated rather than
checked in. No engine, live server, saves, database, or native delivery is used.

## Candidate-neutral driver contract

`Factory(kind, data)` returns `{ host, calls, settle, update, destroy, selectors? }`.
`kind` is `number` or `text`. `update(partial)` merges a backend-style dynamic
payload without remounting. `settle(action?)` runs the DOM action and flushes
render/effects, including initial 1ms focus timers. `calls` contains exact
`[action, parameters]` pairs. The production factory captures real `Byond.sendMessage`
action delivery; it does not replace backend callbacks.

`selectors` can override any named DOM target. Defaults recognize production
classes and candidate data-testid input/confirm/cancel/min/decrease/increase/max/
reset/prompt/hint/preview/count/timeout. Candidates may use `data-large-buttons`
and `data-swapped-buttons` flags, or preserve production footer classes. The
`timeout` target represents progress width as a CSS percentage. Preview/count
hints are observed in DOM order. Selection and focus are observed, not inferred.

`runScenarios` reuses native property setters, bubbling input/keyboard events,
focus, click, and cancelable paste/drop events. It never reads a candidate model,
sets validity, calls component callbacks, or injects a mocked input control.
Native constraint validity is recorded separately from footer/button disabled
state. Non-finite numbers and undefined action parameters have explicit JSON-safe
markers; null is not conflated with undefined.

## Scope and intentional quirks

The focused sequences cover native integer/floating validity and recovery,
step=any versus 0.01 adjustment, clamping, reset/min/max, undefined and zero
initial values, empty numeric conversion, sign inversion, mount-only defaults,
focused internal buffers, backend constraint/dynamic deliveries, timeout and
footer flags, keyboard footer actions once, Enter/Shift+Enter at the 30-character
visual-multiline boundary, Escape, Tab prevention, newline sanitization, preview,
counts, maxLength attributes, markup selection and paste/drop prevention.

These are observations of production, not idealized behavior:

- A focused numeric editor can retain its local draft after Reset changes the
  parent's submit value. Focus transfer is explicit in recovery scenarios.
- Native validity may change when bounds are delivered while the parent's
  `isValid` remains unchanged until the RestrictedInput value effect runs.
- A focused textarea can display unsanitized text while count/preview/submission
  use sanitized parent text. Initial placeholder text is not sanitized.
- Ctrl/Meta markup uses the maintained tgui-core fix that reports the computed
  string immediately. The earlier stale callback was reproduced separately in
  the production markup regression tests; it is not copied into the candidates.
- Tab is left to the browser by the repository textarea adapter. No synthetic
  focus traversal is manufactured by this test.

## Limits, not browser claims

Happy DOM input assignment plus an input event is not physical keyboard typing.
It does not establish real browser intermediate numeric-string behavior (`-`,
trailing decimals, incomplete exponents), native spinbutton handling, IME
composition, undo, selection restoration across browser edits, or mobile input.
Textarea CR/LF assignment behavior can differ from browser normalization.
maxLength attributes are observed; programmatic assignment does not prove native
user-typing truncation. Paste/drop checks establish cancellation only, not system
clipboard insertion, drag data, or browser editing defaults. `.click()` does not
simulate pointer focus; tests call `.focus()` explicitly when that matters.
No visual/layout/accessibility or live BYOND parity claim follows from these DOM
records. Those require separate browser/native review before promotion.

Tripwires throw before browser network, storage, workers, media, or beacon calls.
Native action messages are captured; unexpected native calls throw. These guards
are a focused browser API boundary, not an OS-level network sandbox. Candidate
checks should install their own native-denying tripwires. Full existing numeric
and text archives remain separate and are not counted as new oracle scenarios.
