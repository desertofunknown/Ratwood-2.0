"""Narrow source-derived embedding return-contract tests, not DM execution.

Run: python3 tools/ci/test_projectile_embed.py
Only the exact current guard/call syntax is supported; changes require review.
"""
from itertools import product
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
CARBON = ROOT / "code/modules/mob/living/carbon/carbon_defense.dm"
PATH = "/mob/living/carbon/check_projectile_embed(obj/projectile/P, def_zone, blocked)"
CALL = "BP.add_embedded_object(P.dropped, silent = FALSE, crit_message = TRUE)"
PREFIX = """\tvar/obj/item/bodypart/BP = get_bodypart(check_zone(def_zone))
\tif(!BP)
\t\treturn FALSE
\tvar/newdam = P.damage * (100-blocked)/100
\tif(newdam <= 8)
\t\treturn FALSE
\tif(prob(P.embedchance) && P.dropped)
"""


def definition(source, path):
    match = re.search(r"^" + re.escape(path) + r"\n(.*?)(?=^/|\Z)", source, re.M | re.S)
    if match is None:
        raise AssertionError(f"Missing definition: {path}")
    return match[1].rstrip() + "\n"


def parse_return_mode(body):
    if not body.startswith(PREFIX) or not body.endswith("\treturn FALSE\n"):
        raise AssertionError("Embedding guards changed; review model")
    branch = body[len(PREFIX):-len("\treturn FALSE\n")]
    if branch == f"\t\treturn {CALL}\n":
        return "propagate"
    if branch == f"\t\t{CALL}\n\t\treturn TRUE\n":
        return "unconditional"
    raise AssertionError("Unsupported embedding branch")


def evaluate(body, bodypart, damage, blocked, chance, dropped, accepted):
    mode = parse_return_mode(body)
    if not bodypart or damage * (100 - blocked) / 100 <= 8:
        return False, 0
    if not chance or not dropped:
        return False, 0
    return (accepted if mode == "propagate" else True), 1


class ProjectileEmbedTests(unittest.TestCase):
    def test_return_contract_and_single_call_for_all_guard_combinations(self):
        body = definition(CARBON.read_text(), PATH)
        for bodypart, chance, dropped, accepted in product([False, True], repeat=4):
            for damage, blocked in [(0, 0), (8, 0), (9, 0), (16, 50), (18, 50), (20, 100)]:
                with self.subTest(bodypart=bodypart, chance=chance, dropped=dropped,
                                  accepted=accepted, damage=damage, blocked=blocked):
                    reached = bodypart and damage * (100 - blocked) / 100 > 8 and chance and dropped
                    self.assertEqual(evaluate(body, bodypart, damage, blocked, chance, dropped, accepted),
                                     (bool(reached and accepted), int(bool(reached))))

    def test_original_unconditional_success_is_detected(self):
        old = PREFIX + f"\t\t{CALL}\n\t\treturn TRUE\n\treturn FALSE\n"
        self.assertEqual(evaluate(old, True, 20, 0, True, True, False), (True, 1))
        current = definition(CARBON.read_text(), PATH)
        self.assertEqual(evaluate(current, True, 20, 0, True, True, False), (False, 1))

    def test_model_rejects_unreviewed_control_flow(self):
        body = definition(CARBON.read_text(), PATH)
        with self.assertRaises(AssertionError):
            parse_return_mode(body.replace("newdam <= 8", "newdam <= 9"))
        with self.assertRaises(AssertionError):
            parse_return_mode(body.replace(CALL, CALL + "\n\t\tunexpected_side_effect()"))

    def test_rejections_precede_embedding_mutation_and_success_returns_true(self):
        source = (ROOT / "code/modules/surgery/bodyparts/bodypart_wounds.dm").read_text()
        body = definition(source, "/obj/item/bodypart/proc/add_embedded_object(obj/item/embedder, silent = FALSE, crit_message = FALSE)")
        expected = "\tif(!embedder || !can_embed(embedder))\n\t\treturn FALSE\n\tif(owner && ((owner.status_flags & GODMODE) || HAS_TRAIT(owner, TRAIT_PIERCEIMMUNE)))\n\t\treturn FALSE\n"
        self.assertTrue(body.startswith(expected))
        self.assertIn("\tembedder.forceMove(src)\n", body[len(expected):])
        self.assertTrue(body.endswith("\treturn TRUE\n"))

    def test_existing_caller_and_reusable_drop_ownership_contract(self):
        caller = (ROOT / "code/modules/mob/living/living_defense.dm").read_text()
        self.assertIn("if(P.embedchance && !check_projectile_embed(P, def_zone, armor))\n\t\t\t\tP.handle_drop()", caller)
        reusable = (ROOT / "code/modules/projectiles/projectile/reusable/_reusable.dm").read_text()
        body = definition(reusable, "/obj/projectile/bullet/reusable/handle_drop()")
        self.assertRegex(body, r"if\(has_dropped\)[^\n]*\n\t\treturn")
        self.assertLess(body.index("has_dropped = TRUE"), body.index("dropped.forceMove(get_turf(src))"))
        self.assertIn("\tif(dropped)", body)
        on_hit = definition(reusable, "/obj/projectile/bullet/reusable/on_hit()")
        self.assertIn("\tdropped = new ammo_type(src)\n", on_hit)


if __name__ == "__main__":
    unittest.main()
