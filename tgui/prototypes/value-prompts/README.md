# Disconnected text and number value prompts

Sample-only React and Svelte studies using the same fixtures, parent controller,
CSS, shared Tithewood tokens, and system fonts. This directory does not replace
production interfaces, backend wiring, native bridge, DM inputs, or the historical
oracle. Nothing here connects to a game, saves values, plays audio, or deploys.

## Local commands

From `tgui/`, using the already installed Bun and dependencies:

    bun prototypes/value-prompts/check.ts
    bun prototypes/value-prompts/tests/run.ts
    bun prototypes/value-prompts/build.ts

`check.ts` runs strict TypeScript and Svelte diagnostics. The test runner keeps
model checks, the actual production oracle, and each candidate in separate test
processes. Generated records are under `tests/.generated/`; build output is
`dist/`. These paths are ignored. Do not treat source inspection as a passing test
result. See `tests/README.md` for scenario details and oracle limitations.

The build only writes local static files. It does not start a server or publish.
`dist/react/index.html` and `dist/svelte/index.html` use identical fixture controls.
A permitted static browser preview must preserve the generated CSP. It denies
network connections, fonts, images, workers, objects and form submissions. The
shared selection-prompt native endpoint guard rejects a native connection both
at mount and action boundaries. No remote assets are needed.

## Preview use

Choose text or number and a fixture. Changing either creates a fresh sample.
Reopen recreates the current sample and clears its record. Confirm and Cancel
record the exact latest local action, parameters, and total action count; they do
not simulate a server acknowledgement or close. Undefined parameters and entry
values remain explicitly visible. Clear local record clears the memory-only log.
Close suspends/disposes the local sample without emitting Cancel or a native
close receipt. The controls remain available to reopen it.

Timeout values, large/swapped button flags and paste/drop blocking can be
explicitly delivered without remounting. Timeout never ticks or submits on its
own. Paste blocking applies to text only. Controls occupy normal document flow,
can collapse, and can be hidden until reload; they never float over keyboard
focus. The record uses wrapping and scrolling rather than discarding long text.
At narrow widths the number controls use two rows in DOM/tab order: minimum,
decrease and editor; then increase, maximum and reset.
Multiline text has a generous editor area, and long messages remain scrollable.

## Preserved behavior and intentional distinction

The parent controller retains mount-only defaults, numeric clamping and rounding,
validity-dependent Confirm, bounds/reset/step controls, dynamic delivered flags,
text sanitization, preview/count, visual multiline threshold, and footer order.
React uses the actually installed tgui-core RestrictedInput and TextArea editors;
Svelte mirrors their local buffer and focus behavior. Delivery is not a remount.
Keyboard and native validity behavior belongs to those views, not this harness.

Current production and both candidates supply newly marked-up text immediately.
The maintained tgui-core patch fixes an earlier callback that read the pre-render
DOM value, leaving parent count/preview/submission behind the editor. Separate
production regression tests retain that failure evidence. The oracle runs the
actual corrected production controls; the candidates do not reproduce the old bug.

Happy DOM records actual production component behavior in an isolated fake DOM;
they are not proof of physical browser typing, IME, native selection/undo,
maxLength enforcement, spinbutton behavior, zoom or screen-reader usability.
Browser checks are separate. No BYOND/native receipt, engine integration,
performance/FPS advantage, or production-readiness claim is made.

## Source and licensing

The build copies the original repository license, inventories exact loaded
sources and their hashes, hashes the production TextInputModal/NumberInputModal,
common footer/loader and DM sources, and copies detected dependency licenses.
It must capture the actual installed tgui-core editor package and license text;
a missing editor license fails the build. React, React DOM, and Svelte provenance
comes from installed dependencies rather than invented versions.

Before distributing or hosting anything, provide the exact corresponding source,
original notices, dependency lockfiles, build instructions and required license
texts. The local generated NOTICE and manifest are an audit aid, not by
themselves a complete legal distribution package. No screenshots or measurements
are fabricated by the build.
