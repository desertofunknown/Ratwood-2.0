# Roasted squash soup routing

Ported from CentralSmith's upstream commit
[`71ae3af4e8bdb99aac32da6ccb5b1332e8aa9c30`](https://github.com/Rotwood-Vale/Ratwood-2.0/commit/71ae3af4e8bdb99aac32da6ccb5b1332e8aa9c30).
Only cooked pumpkin mash is removed from ordinary squash soup's accepted inputs.
The roasted recipe still accepts it; sliced pumpkin still makes ordinary soup.
Both outputs, cooking times, ingredient definitions and licenses are unchanged.

The hearth checks `istype(W, I)` for each recipe/input pair and returns after a
successful cook. Previously both soup recipes accepted cooked pumpkin mash, so
the earlier successful match could produce ordinary soup. The correction gives
each pumpkin ingredient exactly one matching recipe, independent of enumeration
order. Recipe initialization uses `init_subtypes`; a Python declaration-order
model is not proof of BYOND's subtype enumeration order.

Run `python3 tools/ci/test_squash_recipe.py`. Its static checks parse literal
recipe inputs, check unique matching and first-match results in both declaration
and reversed order, and pin the relevant hearth routing structure. They do not
execute DM or simulate water, heat, cooking interruption, deep frying, reagent
effects or player interactions. Compile-only validation is likewise not a live
cooking test.
