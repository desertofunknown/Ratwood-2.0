"""Static source contracts for pumpkin uproot-loot encoding; never executes DM.

Run: python3 tools/ci/test_pumpkin_uproot_loot.py
The soil consumer spawns once per list entry, not per associated numeric value.
Three repeated fiber paths preserve pumpkin's declared quantity of three using
the same encoding as wheat/oat/rice. Guard tests inspect actual source and do
not simulate farming, random yields, item initialization, or engine behavior.
"""

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
PLANTS = ROOT / "code/modules/farming/plant_def.dm"
SOIL = ROOT / "code/modules/farming/soil.dm"
SEEDS = ROOT / "code/modules/farming/seeds.dm"
PUMPKIN = "/datum/plant_def/pumpkin"
FIBER = "/obj/item/natural/fibers"
SMALL_LOG = "/obj/item/grown/log/tree/small"
STICK = "/obj/item/grown/log/tree/stick"
SOIL_PROC = "/obj/structure/soil/proc/"


def definition(source, path):
    match = re.search(r"^" + re.escape(path) + r"\n(.*?)(?=^/|\Z)",
                      source, re.M | re.S)
    if match is None:
        raise AssertionError("Missing definition: " + path)
    return match[1].rstrip() + "\n"


def flat_loot(body):
    declarations = re.findall(r"^\tuproot_loot = (.+)$", body, re.M)
    if len(declarations) != 1:
        raise AssertionError("Expected exactly one uproot_loot declaration")
    match = re.fullmatch(r"list\((/obj/[\w/]+(?:, /obj/[\w/]+)*)\)",
                         declarations[0])
    if match is None:
        raise AssertionError("Expected flat typepath-only uproot list: "
                             + declarations[0])
    return match[1].split(", ")


class PumpkinUprootLootTests(unittest.TestCase):
    def test_pumpkin_declares_exactly_three_fiber_entries(self):
        self.assertEqual(flat_loot(definition(PLANTS.read_text(), PUMPKIN)),
                         [FIBER, FIBER, FIBER])

    def test_all_explicit_producers_preserve_their_entry_counts(self):
        source = PLANTS.read_text()
        producers = {}
        for match in re.finditer(r"^(/datum/plant_def[\w/]*)\n", source, re.M):
            path = match[1]
            body = definition(source, path)
            if re.search(r"^\tuproot_loot = ", body, re.M):
                producers[path.rstrip("/")] = flat_loot(body)
        self.assertEqual(producers, {
            "/datum/plant_def/wheat": [FIBER, FIBER],
            "/datum/plant_def/oat": [FIBER, FIBER],
            "/datum/plant_def/rice": [FIBER, FIBER],
            "/datum/plant_def/tree": [SMALL_LOG],
            "/datum/plant_def/bush": [STICK],
            "/datum/plant_def/nut": [SMALL_LOG],
            PUMPKIN: [FIBER, FIBER, FIBER],
        })

    def test_associative_or_nonliteral_loot_is_rejected(self):
        for expression in [f"list({FIBER} = 3)", f"list({FIBER} = 1)",
                           f"list({FIBER}, pick({FIBER}))", "list()"]:
            with self.subTest(expression=expression):
                with self.assertRaises(AssertionError):
                    flat_loot("\tuproot_loot = " + expression + "\n")

    def test_other_pumpkin_attributes_and_nonperennial_default_are_unchanged(self):
        source = PLANTS.read_text()
        pumpkin = definition(source, PUMPKIN)
        self.assertEqual(re.sub(r"^\tuproot_loot = .+\n", "", pumpkin, flags=re.M),
                         '\tname = "pumpkin plant"\n'
                         '\ticon_state = "pumpkin"\n'
                         '\tproduce_type = /obj/item/natural/shellplant/pumpkin\n'
                         '\tproduce_amount_min = 2\n'
                         '\tproduce_amount_max = 4\n'
                         '\tmaturation_nutrition = HUNGRINESS_DEMANDING\n'
                         '\tmaturation_time = SLOW_GROWING\n'
                         '\tproduce_time = 3 MINUTES\n')
        self.assertIn("\tvar/perennial = FALSE\n", definition(source, "/datum/plant_def"))

    def test_real_seed_registry_and_soil_dispatch(self):
        seeds = SEEDS.read_text()
        self.assertEqual(definition(seeds, "/obj/item/seeds/pumpkin"),
                         '\tseed_identity = "pumpkin seeds"\n'
                         '\tplant_def_type = /datum/plant_def/pumpkin\n'
                         '\tcooked_type = /obj/item/reagent_containers/food/snacks/roastseeds/pumpkin\n')
        registry = (ROOT / "code/_globalvars/plant_defs.dm").read_text()
        self.assertIn("GLOBAL_LIST_INIT(plant_defs, build_plant_defs())", registry)
        self.assertEqual(definition(registry, "/proc/build_plant_defs()"),
                         "\t. = list()\n"
                         "\tfor(var/path in subtypesof(/datum/plant_def))\n"
                         "\t\t.[path] = new path()\n")
        plant_seed = definition(seeds, "/obj/item/seeds/proc/try_plant_seed"
                                "(mob/living/user, obj/structure/soil/soil)")
        self.assertIn("\tsoil.insert_plant(GLOB.plant_defs[plant_def_type])\n", plant_seed)
        self.assertEqual(definition(SOIL.read_text(), SOIL_PROC +
                                    "insert_plant(datum/plant_def/new_plant)"),
                         "\tif(plant)\n\t\treturn\n"
                         "\tplant = new_plant\n\tplant_health = MAX_PLANT_HEALTH\n"
                         "\tgrowth_time = 0\n\tproduce_time = 0\n"
                         "\tmatured = FALSE\n\tproduce_ready = FALSE\n"
                         "\tplant_dead = FALSE\n\tupdate_icon()\n")

    def test_dispatch_files_and_fiber_type_are_included(self):
        fiber_file = "code/game/objects/items/rogueitems/natural/clothfibersthorn.dm"
        dme = (ROOT / "roguetown.dme").read_text().replace("\\", "/")
        for path in [PLANTS, SOIL, SEEDS, ROOT / "code/_globalvars/plant_defs.dm",
                     ROOT / fiber_file]:
            self.assertIn(f'#include "{path.relative_to(ROOT).as_posix()}"', dme)
        definition((ROOT / fiber_file).read_text(), FIBER)

    def test_immature_or_missing_loot_returns_before_per_entry_spawning(self):
        # Exact source pins the maturity guard and one spawn per entry, with
        # neither associated-value lookup nor a second quantity loop.
        self.assertEqual(definition(SOIL.read_text(), SOIL_PROC + "yield_uproot_loot()"),
                         "\tif(!matured || !plant.uproot_loot)\n"
                         "\t\treturn\n"
                         "\tfor(var/loot_type in plant.uproot_loot)\n"
                         "\t\tnew loot_type(loc)\n")

    def test_uproot_guard_and_plant_clear_prevent_repeated_yields(self):
        source = SOIL.read_text()
        # Inspect actual guards, ordering and cleanup, not a Python soil model.
        self.assertEqual(definition(source, SOIL_PROC + "uproot()"),
                         "\tif(!plant)\n\t\treturn\n"
                         "\tadjust_weeds(-100)\n\tyield_uproot_loot()\n"
                         "\truin_produce()\n\tplant = null\n\tupdate_icon()\n")
        self.assertEqual(definition(source, SOIL_PROC + "ruin_produce()"),
                         "\tproduce_ready = FALSE\n\tupdate_icon()\n")

    def test_harvest_guard_quantity_and_legendary_vs_ordinary_branches_are_unchanged(self):
        self.assertEqual(definition(SOIL.read_text(), SOIL_PROC +
                                    "yield_produce(modifier = 0, is_legendary = FALSE)"),
                         "\tif(!produce_ready)\n\t\treturn\n"
                         "\tvar/base_amount = rand(plant.produce_amount_min, plant.produce_amount_max)\n"
                         "\tvar/spawn_amount = max(base_amount + modifier, 1)\n"
                         "\tfor(var/i in 1 to spawn_amount)\n"
                         "\t\tnew plant.produce_type(loc)\n"
                         "\tproduce_ready = FALSE\n"
                         "\tif(!plant.perennial)\n"
                         "\t\tif(is_legendary) //the user has legendary skill\n"
                         "\t\t\tgrowth_time = 0 //reset growth time\n"
                         "\t\t\tmatured = FALSE //not mature anymore\n"
                         "\t\telse\n\t\t\tuproot()\n\tupdate_icon()\n")

    def test_user_harvest_passes_legendary_flag_and_keeps_readiness_guard(self):
        harvest = definition(SOIL.read_text(), SOIL_PROC + "user_harvests(mob/living/user)")
        self.assertTrue(harvest.startswith("\tif(!produce_ready)\n\t\treturn\n"))
        self.assertIn("\tvar/farming_skill = user.get_skill_level(/datum/skill/labor/farming)\n"
                      "\tvar/is_legendary = FALSE\n"
                      "\tif(farming_skill == SKILL_LEVEL_LEGENDARY) //check if the user has legendary farming skill\n"
                      "\t\tis_legendary = TRUE //we do\n", harvest)
        self.assertEqual(harvest.count("\tyield_produce(modifier, is_legendary)\n"), 1)


if __name__ == "__main__":
    unittest.main()
