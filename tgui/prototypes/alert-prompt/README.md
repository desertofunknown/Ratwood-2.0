# Disconnected alert / confirmation study

Matched React and Svelte candidates for the existing AlertModal contract. This is
sample-only work, not a replacement production route or a native-client rollout.
Both arms reuse the existing prototype tokens and control styling, system fonts,
literal messages and exact choice strings. Production sources and prior previews
are unchanged. No additional dependency is installed.

## Reproduce

From `tgui`, with the project's Bun and installed dependencies:

```sh
bun prototypes/alert-prompt/check.ts
bun prototypes/alert-prompt/tests/run.ts
bun prototypes/alert-prompt/build.ts
```

`dist/` and local test output are ignored. The build records input hashes,
production provenance and dependency licenses. Keep the repository license,
notices, dependency licenses and an exact corresponding-source offer with any
hosted distribution. This uses the existing Svelte study toolchain; it does not
add Svelte to the production entrypoint.

The generated `react/` and `svelte/` routes use the same in-memory samples and
CSS. Their CSP denies connections, workers, objects, images and fonts. The
existing disconnected endpoint guard refuses native host/transport contexts.
Neither fixture imports the production backend or saves preferences. These are
source/build constraints, not independent proof of absent network traffic.

## Preserved interaction contract

Source of truth: [`AlertModal.tsx`](../../packages/tgui/interfaces/AlertModal.tsx),
[`Loader.tsx`](../../packages/tgui/interfaces/common/Loader.tsx), and
[`alert.dm`](../../../code/modules/tgui_input/alert.dm).

- Selection starts at index zero. Left/Right and Tab/Shift+Tab wrap selection,
  prevent default and do not move DOM focus. Focusing a choice selects its index.
  This intentionally retains the current unconventional Tab policy.
- Enter/Space prevent default and submit the selected exact string, if that index
  exists. Modifier and repeated key events are not newly blocked. Escape/Esc
  records `cancel` without preventing default; Up/Down are not intercepted.
- Duplicate, blank, whitespace and case-distinct labels are not normalized.
  Duplicate strings have the same backend choice identity. A literal `Cancel`
  choice is a `choose` payload, not the `cancel` action. Empty or whitespace-only buttons get
  an accessible-only numbered name; their visible label and payload stay blank.
- New data preserves the selected index, even if a shorter choice list makes it
  temporarily invalid. Enter then sends nothing until selection becomes valid.
- Choices retain DOM/index order. The swapped flag changes visual flex direction.
  Long labels (more than 18 UTF-16 code units) or more than three choices select
  the vertical arrangement; large-button styling follows delivered data.
- Autofocus is a one-millisecond, cleanup-owned mount timer, not a selection-driven
  focus effect. Timeout is delivered progress only, clamped for display. There is
  no local deadline, ticking timer or invented expiry action.
- Header Close is outside content key handling and suspends the local sample,
  without choosing or cancelling. Reopen creates fresh state. Choose/cancel
  records do not pretend a server acknowledged or closed the prompt.

The candidate uses semantic native buttons instead of the production core's
button-role elements. Mounted synthetic event parity is not proof of browser
activation parity. Native-browser checks must cover single emission, focus,
keyboard activation, narrow widths and zoom before accepting this distinction.
Window size calculations are exposed as metadata; responsive document layout is
not proof of a fixed-size DreamSeeker window's geometry.

## Preview checks

The visible record shows exact payloads and action counts. Exercise default,
exact-label, verbose, timeout, empty-list and literal-markup samples. Test arrows,
Tab/Shift+Tab, Enter/Space, modifiers, Escape and direct choice clicks; compare both
arms. Deliver fewer/no choices without reopening, toggle visual flags, and
confirm timeout zero hides progress without closing. Test Close and Reopen
separately. Hide the preview controls for unobstructed layout checks; reload
restores them. All records and delivery controls are sample-only.

## Native fallback remains unchanged

The existing DM preference/strict-native branch handles only two or three
choices. Other list lengths still follow the existing TGUI path. Do not infer
that the `strict_byond` argument guarantees a native alert for every count.
The native alert API does not expose the TGUI timeout, autofocus or ui_state
arguments. Its documented one-to-three-button support does not establish
Escape/Close/disconnect, focus or exact-label equivalence. No new fallback is
added here. See the [BYOND alert reference](https://www.byond.com/docs/ref/info.html#/proc/alert).

The server retains membership validation, actual timeout disposal and callback
rules. This study neither exercises them in a running game nor changes them.
Native BYOND acceptance, minimum-client policy and production routing remain
separate rollout gates. There is no new performance, startup or memory claim.
