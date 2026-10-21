"""Regression checks for resource paths rejected by the Linux DM compiler.

Run: python3 tools/ci/test_resource_case.py
Requires a Git checkout. This checks exact tracked filenames, not DM execution.
"""

import json
from pathlib import Path
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((Path(__file__).parent / "fixtures/resource_case.json").read_text())


class ResourceCaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tracked = subprocess.check_output(
            ["git", "ls-files", "-z"], cwd=ROOT
        ).decode().split("\0")

    def test_references_use_exact_unique_tracked_asset_paths(self):
        for case in CASES:
            with self.subTest(resource=case["after"]):
                matches = [path for path in self.tracked if path.casefold() == case["after"].casefold()]
                self.assertEqual(matches, [case["after"]])
                self.assertEqual(case["before"].casefold(), case["after"].casefold())
                self.assertTrue((ROOT / case["after"]).is_file())
                for source, count in case["sources"].items():
                    self.assertIn(source, self.tracked)
                    data = (ROOT / source).read_bytes()
                    self.assertNotIn(("'" + case["before"] + "'").encode(), data)
                    self.assertEqual(data.count(("'" + case["after"] + "'").encode()), count)

    def test_known_bad_spellings_do_not_reappear_in_other_dm_files(self):
        bad = [("'" + case["before"] + "'").encode() for case in CASES]
        for source in self.tracked:
            if source.endswith(".dm"):
                data = (ROOT / source).read_bytes()
                for spelling in bad:
                    self.assertTrue(spelling not in data, f"Incorrect resource case in {source}: {spelling!r}")


if __name__ == "__main__":
    unittest.main()
