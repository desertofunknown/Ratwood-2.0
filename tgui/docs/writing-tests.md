# Writing frontend tests

The current test runner is Bun. Run `bun run tgui:test` from `tgui` for the complete
suite; `bunfig.toml` preloads `happydom.ts` for a simulated DOM. Tests import
assertions and lifecycle hooks from `bun:test` and use `.test.ts` or `.test.tsx`
filenames.

```ts
import { expect, test } from 'bun:test';

test('example', () => {
	expect('a').toBe('a');
});
```

Run one suite with `bun test packages/tgui/__tests__/text-input-newlines.test.tsx`.
The [validation guide](../../VALIDATION.md) lists the separate typecheck, build,
lint and source-check commands. A production build does not run these tests.

## Mounted components

Use React `act` around mounting, edits and state updates. Prefer real components
and backend state over mocks of the behavior being tested. Assert user-visible
state and exact action payloads, not just internal callback counts.

Some interfaces import native window chrome or bundler-only facilities. Existing
modal suites run a bounded child test process with a layout-only module mock so
it cannot contaminate other tests. Do not replace the input/control whose
behavior the test is meant to exercise.

The canonical `tgui:test` runner executes the ordinary suite, excluding exactly
the number-validity, blueprint-import and list-shortcut aggregate wrappers, then
runs their existing child suites serially in separate processes. Each child case
keeps Bun's default 5-second deadline; each child process keeps its existing
30-second watchdog. The ordinary suite has no aggregate watchdog. Running a
whole child suite inside one outer test would instead share that outer test's
5-second deadline across all child cases. Do not increase timeouts to hide this.

The runner forwards all output, runs the remaining suites after a failure and
returns nonzero for failed processes or missing/inconsistent JUnit coverage.
Exactly the three intended wrappers must be skipped in the ordinary report;
each isolated report must contain actual, unskipped child cases, not its wrapper.
Inherited child flags are cleared before every invocation. No extra arguments
are accepted by the complete-suite runner: use `bun test <file>` for focused
work. The original wrappers remain available, as do direct child commands:

```sh
TGUI_NUMBER_VALIDITY_TEST_CHILD=1 bun test packages/tgui/__tests__/number-input-validity.test.tsx
TGUI_BLUEPRINT_IMPORT_TEST_CHILD=1 bun test packages/tgui/__tests__/blueprint-import.test.tsx
TGUI_LIST_SHORTCUT_TEST_CHILD=1 bun test packages/tgui/__tests__/list-input-shortcuts.test.tsx
```

Report ordinary and isolated counts separately. Other existing wrappers still
count their child suite as one outer test; do not add their child counts again
as independent coverage. Bare `bun test` retains the old aggregate wrappers and
is not the canonical complete-suite command.

Unmount roots, remove fixtures and restore modified globals, backend stores and
focus in cleanup, including when an assertion fails. Settle or cancel task-owned
timers. For asynchronous requests, test stale results and unmount cleanup as well
as the successful path.

Happy-dom events do not reproduce every browser default. For example, synthetic
`.click()` does not reliably model pointer-induced focus/blur or native text
insertion. Explicitly model the relevant edit/focus sequence and document that
scope. Do not overwrite validity or call internal handlers directly to make an
integration test pass. Native keyboard, clipboard, numeric editing, layout and
DreamSeeker acceptance still require suitable client testing.

Useful examples:

- `packages/tgui/__tests__/number-input-validity.test.tsx`: real numeric validity,
  recovery controls, focus and exact submission payloads.
- `packages/tgui/__tests__/text-input-newlines.test.tsx`: pure helper cases plus
  mounted edit-to-submit behavior.
- `packages/tgui/__tests__/changelog-loading.test.tsx`: guarded asynchronous load,
  retry and teardown behavior.
