# Pinned drag lifecycle repair

The maintained `tgui-core@4.3.3` patch adds cancellation to the shared
`DraggableControl` used by Slider and Knob. It retains the existing Floating
patch and does not upgrade the package.

The original control leaves document listeners and timers behind when unmounted.
A pending 100 ms timer can even install new listeners and an interval after the
control disappears. The repair keeps each gesture's exact listener identities,
clears its drag/editor-focus timers and interval on cancellation, and never
commits a value while cancelling. A replacement active gesture cancels the previous
cooperating control's active session. After normal mouseup, another control does
not cancel the previous control's pending click-to-edit focus, matching upstream.

Normal drag arithmetic, callback ordering, captured periodic callback values,
and quick-click editing remain unchanged. Disabled behavior and the separate
periodic-value issue are intentionally outside this patch. Normal mouseup keeps
the upstream pointer reset; cancellation restores the prior inline pointer value
and priority only while the session owns the matching override. Identical writes
by unrelated controls cannot be distinguished without broader coordination.

Run `bun install --frozen-lockfile` to apply the patch, then
`bun test packages/tgui/components/keyboard/Slider.test.tsx`. Regression tests
exercise real React controls with controlled timers. Explicit CSS alias tests
model a browser property alias missing from Happy DOM; they do not replace native
client validation.

Source baseline: [tgui-core v4.3.3 DraggableControl](https://github.com/tgstation/tgui-core/blob/680e1d11ff7377d95ef2f25503e2f13f61ad94c1/lib/components/DraggableControl.tsx).
