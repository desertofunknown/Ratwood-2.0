# Short-height layout validation

Scope: disconnected sample UI only. At viewport heights of 500 CSS pixels or
less, the shared workbench scrolls its header and filters above a bounded
recipe/detail region (70% of the dynamic viewport height, at least 240px).
The hosted demo instead uses the document as that outer scroller, including
its notices and benchmark controls. Normal-height layouts are unchanged.

The existing inner list and detail scrollers are intentional. Back focuses its
recipe row (or search if the row disappeared) with `preventScroll`, restores the
saved list position, then calls `scrollIntoView` with `block: 'nearest'`,
`inline: 'nearest'` and `behavior: 'instant'`. This also permits the outer
scroller to reveal the target, without smooth animation. A row that fits fully
inside the list keeps the saved inner position; for a clipped or oversized row,
usable focus takes priority over exact scroll restoration. Opening a detail,
ordinary data deliveries and automatic selection-removal focus are unchanged.
Flattening these panels into document flow would change their independent scroll
behavior.
No text, hit targets, controls, theme colors, or width breakpoints change.

## Repeatable browser acceptance checks

- At physical 1180x757 and 200% browser zoom (about 590x379 CSS pixels), scroll
  the page toward the recipe list. The recipe/detail region should be about 265px
  tall rather than about 50px; its controls and text retain their original size.
  Some preceding controls may remain visible at maximum page scroll; the full
  panel should fit without needing to hide controls or add empty trailing space.
- Scroll down the recipe list, open a recipe, use every craft control and Back;
  verify the selected row, list position, focus, and detail heading stay usable.
  Record the row, list and viewport rectangles before and after Back. When the
  row fits inside the list but is clipped by the viewport, Back should preserve
  the inner list position and move the outer scroller enough to reveal focus.
  Repeat with a row clipped inside the list and an oversized wrapped row; allow
  nearest-alignment adjustment rather than requiring the old inner scroll value.
- Tab and Shift+Tab across search, filters, recipe rows, detail controls, and
  demo controls. Confirm focused controls can be brought into view and neither
  scroll region traps keyboard or pointer navigation.
- Repeat at a wide short viewport (900x379) to check both panels, and at 320x379
  for horizontal overflow and wrapped controls. Check expanded benchmark UI.
- At 500x601, retain the existing one-panel layout. At 900x700, retain the
  existing two-panel layout. Check the 500/501px height boundary.
- Repeat navigation in React, Svelte, and Lua-backed hosted variants that share
  these styles. Check the shared workbench in a fixed-height host separately.

Static checks do not establish actual scrolling, focus visibility, or zoom
usability; browser acceptance is required before calling this visually verified.
The matched mounted tests check Back's target, options and focus/restore/reveal
ordering, search fallback, and absence of extra calls during unrelated updates.
Their simulated scroll adjustment checks that restoration does not overwrite a
reveal, not that Happy DOM performs browser layout or scrolling.

## Sampled browser results, 22 October 2026

The hosted React, Svelte and Lua builds at
[`fe543e16`](https://github.com/desertofunknown/Ratwood-2.0/commit/fe543e16f56032100b197f3d9452767a1db56e5b)
passed sampled craft/Back checks in Chromium at 200% zoom, 320x378 with expanded
comparison controls, 900x379, 500x601, 900x700, and the 500/501px height boundary.
No horizontal overflow was observed. In the original zoom reproduction, Back
preserved the inner list's 642.5px scroll position and moved the outer document
from 143px to 178.5px; the focused row's bottom moved from 414.10px to 378.60px.
The approximately 36px content clipping was corrected, with a 264.95px panel.

A minor outline-margin limitation remains: the row ends fractionally beyond the
approximately 378.5px visual viewport, clipping its bottom focus-outline edge.
Text and substantial top/side highlighting remain visible. Additional pointer
and Tab/Shift+Tab checks found no trap in Lua; that additional sequence was not
repeated independently in the other two implementations. The height breakpoint
intentionally changes panel sizing, not continuously interpolates it.

This is sampled hosted-browser QA, not exhaustive accessibility certification.
A deliberately oversized row, fixed-height embedded host and native game client
remain unverified. No new timing measurements were made on this focus-fix build.
