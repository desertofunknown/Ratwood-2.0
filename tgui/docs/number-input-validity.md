# Number input validity coverage

`packages/tgui/__tests__/number-input-validity.test.tsx` exercises the production
`NumberInputModal`, backend action dispatch, `RestrictedInput`, button adapter,
core buttons, and confirmation footer. Only native window chrome is replaced.
The layout mock runs in a subprocess so it cannot affect other test files.

The 36 mounted cases cover:

- Below-minimum, above-maximum, and fractional integer drafts blocking Enter,
  Confirm, and adjustment controls.
- Pointer and keyboard min/max/reset recovery restoring valid display and the
  submitted value without submitting merely by activating a recovery control.
- Integer and decimal adjustment after recovery, repeated invalid/valid
  transitions, zero-only bounds, and negative integer ranges.

The integer fixture uses bounds 0–10; the decimal fixture uses the voice-pitch
bounds 0.8–1.35. This coverage preserves the existing equality, adjustment, and
rounding policies. The backend contract in `code/modules/tgui_input/number.dm`
rounds submissions when requested, rejects out-of-range results, and closes the
modal after an accepted value, including zero. These tests inspect dispatched
frontend actions; they do not execute that DM code.

## Scope and limitations

The checks use happy-dom and dispatched DOM events, not physical keyboard or
pointer automation. Edits explicitly set the input value and dispatch an input
event. Pointer helpers explicitly blur the editor and focus enabled buttons
before clicking because happy-dom's `click()` does not supply native focus
movement. Without this step, a test could incorrectly retain editor focus and
suppress `RestrictedInput`'s external-value synchronization.

This is tests-only coverage, not a production behavior change. It does not
verify native browser numeric editing, browser-specific validity edge cases,
window chrome, BYOND runtime behavior, or live servers, saves, or databases.
Each mounted case restores the backend store, BYOND shim, React test flag, and
prior focus after unmounting.

Run from `tgui/`:

```sh
bun test packages/tgui/__tests__/number-input-validity.test.tsx
```

To see the individual mounted cases directly:

```sh
TGUI_NUMBER_VALIDITY_TEST_CHILD=1 bun test packages/tgui/__tests__/number-input-validity.test.tsx
```
