# List selection letter shortcuts

List dialogs classify single-character letter keys case-insensitively, matching
their existing case-insensitive choice lookup. Shift or Caps Lock therefore works
like lowercase input: jump to a choice when search is hidden, or start/focus the
visible search field. Handled shortcuts prevent the existing gameplay-key
passthrough. Ctrl/Alt/Meta combinations keep their prior behavior.

The single-character check is intentional: the shared alphabetic helper compares
string ranges, so lowercasing key names such as Tab, Home or Backspace without
checking length would incorrectly classify them as letters. Their behavior,
footer controls, normal search editing and numeric shortcuts are unchanged.

Run `bun test packages/tgui/__tests__/list-input-shortcuts.test.tsx` from `tgui`.
The isolated child mounts the production component and backend store, core input
controls and hotkey handlers, with layout chrome replaced and Byond commands
recorded rather than sent. Tests pair keydown/keyup and clean held-key state.
They verify uppercase/lowercase selection, search/focus, modifiers, footer actions
and non-character keys. These are synthetic DOM events, not native-client or
live-game keyboard acceptance tests.
