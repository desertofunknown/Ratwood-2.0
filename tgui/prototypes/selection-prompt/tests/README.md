# Selection prompt regression evidence

Run from `tgui` with the already-installed Bun:

```
bun prototypes/selection-prompt/tests/run.ts
bun test packages/tgui/__tests__/list-input-shortcuts.test.tsx
```

`run.ts` runs three isolated stages without installing dependencies:

1. Mount the actual `packages/tgui/interfaces/ListInputModal.tsx` using its real backend reducer/store, `InputButtons`, `Loader`, and repository-adapted tgui-core controls. Only the native Window chrome is replaced. A fake native action sink exists exclusively in this process.
2. Compile the candidate React and Svelte views, execute the same DOM scenarios, and compare each recorded state/action/default-prevention/focus observation to the separately written production records. No candidate controller is imported by the production oracle. Undefined payload properties are encoded explicitly, not silently lost by JSON serialization.
3. Assert source contracts for the DM producer and action handler, suffix-key reservation, titlebar suspension, footer controls and delivered-only timeout rendering.

Current differential coverage is 19 scenarios and 136 observations per arm. It includes exact string/order/case/whitespace/suffix identity; numeric/missing default fallback; mount-only selection/search visibility; reference replacement versus in-place item mutation; immediate untrimmed substring filtering; effective fallback and restoration; wrapping arrows; shortcut repetition/reset/modifiers; input focus/editing; click/focus/double-click; footer/search key ownership and disabled-key default prevention; preview state/fallback and empty-list Stop; omitted/full/fractional/zero timeout; and dynamic-only deliveries. True large/swapped flags are defensive fixtures, not working preferences: the DM producer hardcodes both false.

Additional mounted candidate tests cover fresh sessions versus deliveries, local Close versus Cancel, actual sample controls, reentrant close/action callbacks, stale detached controls/controller calls, repeated teardown, global event-listener/timer cleanup, and native-host rejection before and after mounting. Network, worker, storage, beacon and audio APIs are tripwired. Native presence probes include undefined and inherited values and getters that must not be read.

The existing production shortcut suite is run separately because it also exercises real document hotkeys/key passthrough. Its process isolation remains unchanged.

## Limits

These are safe, synthetic happy-dom events, not physical browser input, layout/accessibility testing, or native BYOND integration. The native Window shell is not mounted; Close/suspend linkage is source-checked, and candidate local disposal is DOM-tested. No DM code, sound, live server, save or database runs. Source contract checks do not establish runtime DM mapping or backend acceptance. There is no native receipt, browser-default-behavior certification, countdown/expiry simulation, or performance comparison. Global listener/timer checks do not claim a heap-level leak proof.

Generated bundles and source records stay in ignored `tests/.generated/`. Console diagnostics are not suppressed. The source's existing in-memory-storage diagnostic remains visible. No production source or previous prototype is modified by these tests.
