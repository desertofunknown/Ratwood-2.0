"""Static routing contracts for upstream roasted squash recipe correction.

Run: python3 tools/ci/test_squash_recipe.py
This models successful first-match selection only, not cooking or DM execution.
"""

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
RECIPES = ROOT / "modular/Neu_Food/code/recipes/stew_recipes.dm"
SLICED = "/obj/item/reagent_containers/food/snacks/rogue/fruit/pumpkin_sliced"
MASHED = "/obj/item/reagent_containers/food/snacks/rogue/preserved/pumpkin_mashed"
OUTPUT = "/datum/reagent/consumable/soup/stew/"


def recipes():
    """Parse the file's direct recipe declarations, rejecting nonliteral inputs."""
    result = []
    for match in re.finditer(r"^/datum/stew_recipe/(\w+)\n(.*?)(?=^/|\Z)", RECIPES.read_text(), re.M | re.S):
        name, body = match.groups()
        inputs = re.search(r"^\tinputs = list\((.*?)\)", body, re.M | re.S)
        output = re.search(r"^\toutput = (/datum/[\w/]+)$", body, re.M)
        if inputs is None or output is None:
            raise AssertionError(f"Unsupported recipe declaration: {name}")
        paths = re.findall(r"/obj/[\w/]+", inputs[1])
        if re.sub(r"/obj/[\w/]+|[\s,]", "", inputs[1]):
            raise AssertionError(f"Nonliteral recipe inputs: {name}")
        result.append((name, paths, output[1], body))
    return result


def matching(recipes, ingredient):
    # These concrete pumpkin types use ordinary path inheritance. Do not treat
    # this narrow model as a general substitute for DM's istype/parent_type.
    return [recipe for recipe in recipes if any(
        ingredient == path or ingredient.startswith(path + "/")
        for path in recipe[1]
    )]


class SquashRecipeTests(unittest.TestCase):
    def test_unique_recipe_and_first_match_in_either_order(self):
        ordered = recipes()
        for ingredient, expected in [(SLICED, "squash_soup"), (MASHED, "frysquash_soup")]:
            with self.subTest(ingredient=ingredient):
                self.assertEqual([recipe[0] for recipe in matching(ordered, ingredient)], [expected])
                for order in [ordered, list(reversed(ordered))]:
                    self.assertEqual(matching(order, ingredient)[0][2], OUTPUT + expected)

    def test_both_recipes_keep_outputs_and_inherited_cooking_time(self):
        by_name = {recipe[0]: recipe for recipe in recipes()}
        for name, ingredient in [("squash_soup", SLICED), ("frysquash_soup", MASHED)]:
            recipe = by_name[name]
            self.assertEqual(recipe[1], [ingredient])
            self.assertEqual(recipe[2], OUTPUT + name)
            self.assertNotIn("cooktime =", recipe[3])
        source = RECIPES.read_text()
        self.assertIn("#define STEW_COOKING_TIME 60 SECONDS", source)
        self.assertIn("var/cooktime = STEW_COOKING_TIME", source)

    def test_real_hearth_uses_type_matching_and_returns_after_success(self):
        source = (ROOT / "code/game/objects/lighting/rogue_fires.dm").read_text()
        start = source.index("for(var/datum/stew_recipe/R in GLOB.stew_recipes)")
        route = source[start:source.index("\n\t. = ..()", start)]
        expressions = ["for(var/I in R.inputs)", "if(istype(W, I))", "if(do_after(user, 2 SECONDS / cooktime_divisor, target = src))", "sleep(R.cooktime / cooktime_divisor)", "pot.reagents.add_reagent(R.output, VOLUME_PER_STEW_COOK + VOLUME_PER_STEW_COOK_AFTER)"]
        positions = [route.index(expression) for expression in expressions]
        self.assertEqual(positions, sorted(positions))
        self.assertEqual(route[positions[-1]:].splitlines()[-1].strip(), "return")
        globals_source = (ROOT / "code/_globalvars/lists/objects.dm").read_text()
        self.assertIn("GLOBAL_LIST_INIT(stew_recipes, init_subtypes(/datum/stew_recipe))", globals_source)

    def test_ingredients_and_outputs_exist_in_included_files(self):
        files = {
            "modular/Neu_Food/code/raw/raw_fruit.dm": [SLICED],
            "modular/Neu_Food/code/cooked/cooked_fruits.dm": [MASHED],
            "modular/Neu_Food/code/drinks/stew.dm": [OUTPUT + "squash_soup", OUTPUT + "frysquash_soup"],
        }
        dme = (ROOT / "roguetown.dme").read_text().replace("\\", "/")
        for path, types in files.items():
            self.assertIn(f'#include "{path}"', dme)
            source = (ROOT / path).read_text()
            for kind in types:
                self.assertRegex(source, r"(?m)^" + re.escape(kind) + r"$")
        self.assertIn(f"cooked_type = {MASHED}", (ROOT / "modular/Neu_Food/code/raw/raw_fruit.dm").read_text())


if __name__ == "__main__":
    unittest.main()
