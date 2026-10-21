# Writing frontend tests

The current test runner is Bun. Run `bun test` from `tgui`; `bunfig.toml` preloads
`happydom.ts` for a simulated DOM. Tests import assertions and lifecycle hooks
from `bun:test` and use `.test.ts` or `.test.tsx` filenames.

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
it cannot contaminate other tests. Follow that pattern when necessary; do not
replace the input/control whose behavior the test is meant to exercise. The
outer runner counts the isolated child suite as one test, so report its focused
case count separately from the full suite count.

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
