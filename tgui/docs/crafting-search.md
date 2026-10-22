# Crafting search

The crafting window searches recipe names and the ingredient text shown in each
recipe. For example, `iron bar` can find a plough even though its name does not
mention iron. Matching is case-insensitive, literal substring search. Clear the
field to restore the full eligible list.

The existing “Show only craftables” filter still applies. Turn it off to find
recipes that are not currently craftable. Categories and recipes
retain their existing order, and crafting buttons submit the same recipe paths,
quantities and automatic-crafting option.

Only recipes already supplied by the backend are searched. Tools, catalysts,
category names, paths and other metadata are not additional search fields.
Ingredient text includes displayed quantities and punctuation; there is no
plural expansion, aliasing, tokenization or whitespace trimming. Missing
ingredient text is treated as absent, not converted to the word `undefined`.
No extra backend request or cache is introduced.

The pure matcher tests cover field boundaries and literal matching. Mounted
regressions exercise the production input, categories, craftability controls and
craft actions with a layout-only mock. They establish synthetic DOM behavior,
not native-client visual or keyboard acceptance.
