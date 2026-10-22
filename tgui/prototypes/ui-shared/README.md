# Tithewood prototype primitives

These small, framework-neutral primitives seed new disconnected candidates with
the reviewed colors, system serif typography and control metrics from
`../crafting-workbench/workbench.css`. The frozen crafting stylesheet, demos and
builds remain untouched for measurement provenance. This is not a production
theme migration or a new visual design.

Import `tokens.css`, then `controls.css`, before the candidate's own stylesheet.
For a sibling prototype, the paths are `../ui-shared/tokens.css` and
`../ui-shared/controls.css`. Put `.TithewoodSurface` on an enclosing element; all
variables and rules are scoped there. The wrapper supplies color, typography and
box sizing, not dimensions, scrolling, flex layout or a global heading reset.

- Use `--tw-canvas`, `--tw-surface`, `--tw-raised`, `--tw-selected`, `--tw-text`,
  `--tw-heading`, `--tw-muted`, `--tw-border`, `--tw-control-border`, `--tw-accent`,
  `--tw-success` and `--tw-copper` for candidate-specific layout styles.
- Put `.TithewoodControl` on native `button`, text-like `input` and `select`
  elements. Checkbox, radio, range, file and other specialized inputs are outside
  this small contract. Keep native labels, types and disabled attributes; these
  styles add no behavior or accessibility semantics. Buttons retain the source
  hover/active states; all opted-in controls share its disabled treatment.
- `.TithewoodHeading` supplies the source's main-heading typography and margin.
  `.TithewoodMuted` supplies its secondary-text color and 12px size. Use semantic
  headings and labels appropriate to each screen independently of these classes.
- All focusable descendants retain the source's visible keyboard-focus outline.

There are no JavaScript, framework, font, image or package dependencies. Candidate
styles remain responsible for responsive layout, control widths and content.

## Static provenance check

From the repository root, run:

```sh
python3 tgui/prototypes/ui-shared/check_parity.py
git diff --exit-code -- tgui/prototypes/crafting-workbench
```

The first check compares the copied palette, typography, control metrics and
interaction declarations with the frozen source, and rejects unscoped selectors
or external assets. It is a source-value check, not browser, accessibility,
visual-equivalence or performance evidence. No application or server is started.
