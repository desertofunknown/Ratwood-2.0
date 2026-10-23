# Letter editor acknowledgements

`PaperWriterPanel` keeps local draft and font edits until they are sent and the
server acknowledges their action sequence. An older echo must not replace newer
text after the textarea loses focus, revert a font choice, or undo Clear.

The existing server contract in `code/modules/paperwork/paper.dm` numbers accepted
`update_draft`, `sign`, and `clear` actions per writer UI and includes
`writer_sequence` in its payload. The editor accepts draft/font echoes only when
there are no unsent preview changes and the delivered sequence is at least its
last sent sequence. Draft synchronization also retains the existing focused-input
guard. Sequence changes are dependencies even if the delivered text is unchanged,
so an acknowledged Done can reset a draft to its original empty value.

This does not change the 450 ms debounce, atomic Done payload, Clear action,
server truncation/font validation, markup, sanitization, or shared-paper behavior.
An idle external update is still accepted. It is not a multi-writer merge protocol
or a promise to preserve unsent edits when the window closes.

From `tgui/`, run:

```sh
bun test packages/tgui/__tests__/paper-writer-mounted.test.tsx
bun run tgui:test
bun run tgui:tsc
bun run tgui:build
```

The mounted tests exercise the real editor and backend store with captured action
messages and controlled delivered payloads. Only the native window layout is
replaced in an isolated child process. They establish frontend ordering behavior,
not BYOND transport timing, native-client editing, or live paper persistence.
