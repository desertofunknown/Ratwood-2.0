"""Static catalog contracts; these do not compile DM or instantiate purchased items.

Run from any directory: python3 tools/ci/test_merchant_catalog.py
The fixture records the ten offers corrected by upstream PR #3096, including
unchanged prices, quantities, ordered kit contents and explicit metadata.
"""

import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((Path(__file__).parent / "fixtures/merchant_catalog.json").read_text())


def pack_block(source, pack):
    matches = re.findall(r"^" + re.escape(pack) + r"\n(.*?)(?=^/|\Z)", source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError(f"Expected exactly one definition of {pack}")
    return matches[0]


class MerchantCatalogTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        dme = (ROOT / "roguetown.dme").read_text()
        cls.includes = {
            path.replace("\\", "/")
            for path in re.findall(r'^#include "([^"]+\.dm)"', dme, re.M)
        }
        cls.definitions = set()
        for path in cls.includes:
            # Legacy DM sources use mixed encodings; type paths are ASCII.
            source = (ROOT / path).read_bytes().decode("latin-1")
            cls.definitions.update(re.findall(r"^(/obj/[\w/]+?)[ \t]*(?://.*)?$", source, re.M))

    def test_exact_ordered_items_and_unchanged_offer_fields(self):
        for case in CASES:
            with self.subTest(pack=case["pack"]):
                block = pack_block((ROOT / case["file"]).read_text(), case["pack"])
                contains = re.search(r"\tcontains = list\s*\((.*?)\)", block, re.S)
                self.assertIsNotNone(contains)
                self.assertEqual(re.findall(r"/obj/[\w/]+", contains[1]), case["contains"])
                rest = block[:contains.start()] + block[contains.end():]
                self.assertEqual(dict(re.findall(r"^\t(\w+) = (.+)$", rest, re.M)), case["fields"])

    def test_catalog_and_item_definitions_are_included(self):
        for case in CASES:
            with self.subTest(pack=case["pack"]):
                self.assertIn(case["file"], self.includes)
                for item in case["contains"]:
                    self.assertTrue(item in self.definitions, f"No included explicit definition: {item}")

    def test_realm_registration_is_preserved(self):
        for case in CASES:
            with self.subTest(pack=case["pack"]):
                path = "code/modules/roguetown/roguemachine/merchant/trade/realms/realm_" + case["realm"] + ".dm"
                self.assertIn(path, self.includes)
                registrations = re.findall(r"/datum/supply_pack/[\w/]+", (ROOT / path).read_text())
                self.assertEqual(registrations.count(case["pack"]), case["realm_registrations"])

    def test_gronn_cultural_alias_is_intentional(self):
        case = next(case for case in CASES if case["realm"] == "gronn")
        self.assertEqual(case["fields"]["name"], '"Zayran Battleaxe"')
        self.assertEqual(case["contains"], ["/obj/item/rogueweapon/stoneaxe/woodcut/steel/atgervi"])
        item = pack_block(
            (ROOT / "code/modules/jobs/job_types/roguetown/mercenaries/classes/atgervi.dm").read_text(),
            case["contains"][0],
        )
        self.assertIn('\tname = "Bearded Axe"', item)


if __name__ == "__main__":
    unittest.main()
