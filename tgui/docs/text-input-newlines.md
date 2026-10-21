# Text input newline normalization

TextInputModal normalizes edited text before submitting it. Single-line inputs
remove CR/LF runs; multiline inputs reduce runs of three or more LF/CRLF line
breaks to two LF characters. The same existing rules now apply to every separated
run, rather than only the first one. Spaces, tabs, short multiline runs and the
existing CR-only multiline behavior are unchanged.

The previous non-global replacements allowed later newline runs through both the
Confirm button and Enter submission paths. The backend text-input handler checks
length, optionally HTML-encodes and trims the entry, but does not remove internal
newlines. This patch changes only the two regex flags, not backend validation,
initial placeholder handling, paste restrictions, markup, layout or key policy.

`packages/tgui/__tests__/text-input-newlines.test.tsx` tests the actual exported
sanitizers and mounts the real modal, backend, TextArea and buttons with only the
native window shell replaced. Cases cover separated LF/CRLF/CR runs, unchanged
whitespace, normalization idempotence and edited values submitted by Confirm or
Enter. DOM input events model an edit result, not a native clipboard operation;
these checks do not establish DreamSeeker keyboard, paste or visual acceptance.
