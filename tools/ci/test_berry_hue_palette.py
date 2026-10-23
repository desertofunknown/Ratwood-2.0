"""Source-bound jacksberry hue palette regression.

Run: python3 tools/ci/test_berry_hue_palette.py
Baseline: e1d520e95cfdb3bf3f7566e51fbf96c352dfbee8.
Exact production hunk by CentralSmith
<1962028+CentralSmith@users.noreply.github.com>:
https://github.com/Rotwood-Vale/Ratwood-2.0/commit/7fb14614705ad4239770d40223ad20fb2b73e878
PR: https://github.com/Rotwood-Vale/Ratwood-2.0/pull/3127
Merged as 0d919b7a0009262db294eaab0011abb475e88e66.

These are Python source-contract tests, NOT native DM execution. They verify
literal ordered keys and associations, inventory all DM macro consumers, and
bind the unchanged selection, lookup, monochrome guard and overlay source.
They do not execute or statistically test DM pick, rendering or gameplay.
DM list elements remain the same five hex keys; the new associated values are
used only by the existing hue-name lookup. Existing duplicate-color selection
behavior is intentionally unchanged, not repaired by this patch.
"""

import hashlib
import os
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[2]
PALETTE = "code/_globalvars/plant_defs.dm"
PRODUCE = "code/modules/farming/produce.dm"
EXPECTED = [
    ("#6a6699", "Light Blue"),
    ("#9b6464", "Red"),
    ("#58a75c", "Green"),
    ("#5658a9", "Blue"),
    ("#669799", "Cyan"),
]
LEGACY = '#define BERRYCOLORS\tlist(' + ', '.join('"' + k + '"' for k, _ in EXPECTED) + ')'
FIXED = '#define BERRYCOLORS\tlist(' + ', '.join('"' + k + '" = "' + v + '"' for k, v in EXPECTED) + ')'
BASE_SHA = "883cce1e459caa822cddafbba3f4b7564469444f1533856bccf116dc71a0f806"
PRODUCE_SHA = "ffc7b44f63d5ad5928c343058ff9a20c02ea8743cf62941c1e0b14eed3e7e077"


def sha(data):
    return hashlib.sha256(data).hexdigest()


def dm_sources():
    # Include modular_*, interface, maps and future source directories.
    excluded = {'.git', '.aws', '.codex', '.agents', 'node_modules', '__pycache__'}
    paths = []
    for directory, children, files in os.walk(ROOT, followlinks=False):
        children[:] = [name for name in children
                       if name not in excluded
                       and not (Path(directory) / name).is_symlink()]
        for name in files:
            path = Path(directory) / name
            if name.endswith('.dm') and not path.is_symlink():
                if not path.resolve().is_relative_to(ROOT):
                    raise AssertionError('DM source outside repository: ' + str(path))
                paths.append(path)
    return sorted(paths)


class BerryHuePaletteTests(unittest.TestCase):
    def setUp(self):
        self.palette = (ROOT / PALETTE).read_text()
        self.produce = (ROOT / PRODUCE).read_text()

    def test_exact_upstream_palette_and_unchanged_remaining_file(self):
        first, rest = self.palette.split("\n", 1)
        self.assertEqual(first, FIXED)
        self.assertEqual(sha((LEGACY + "\n" + rest).encode()), BASE_SHA)

    def test_all_five_names_keys_and_order(self):
        first = self.palette.splitlines()[0]
        pairs = re.findall(r'"(#[0-9a-f]{6})" = "([^"\n]+)"', first)
        self.assertEqual(pairs, EXPECTED)
        self.assertEqual(re.findall(r'"(#[0-9a-f]{6})"', first), [key for key, _ in EXPECTED])
        self.assertEqual(len(dict(pairs)), 5)

    def test_macro_consumer_inventory(self):
        found = []
        for path in dm_sources():
            # Latin-1 preserves ASCII macro tokens in legacy non-UTF-8 DM files.
            for line in path.read_text(encoding="latin-1").splitlines():
                if re.search(r"\bBERRYCOLORS\b", line):
                    found.append((path.relative_to(ROOT).as_posix(), line.strip()))
        self.assertEqual(found, [
            (PALETTE, self.palette.splitlines()[0]),
            (PRODUCE, '. += span_notice("These berries have a <b>[BERRYCOLORS[filling_color]]</b> hue.")'),
            (PRODUCE, 'var/newcolor = pick(BERRYCOLORS)'),
            (PRODUCE, 'GLOB.berrycolors[color_index] = pick(BERRYCOLORS)'),
        ])

    def test_existing_selection_lookup_monochrome_overlay_contracts(self):
        self.assertEqual(sha((ROOT / PRODUCE).read_bytes()), PRODUCE_SHA)
        self.assertIn('if(!user.get_client_color(/datum/client_colour/monochrome))\n\t\t. += span_notice("These berries have a <b>[BERRYCOLORS[filling_color]]</b> hue.")', self.produce)
        self.assertIn('var/newcolor = pick(BERRYCOLORS)\n\t\tif(newcolor in GLOB.berrycolors)\n\t\t\tGLOB.berrycolors[color_index] = pick(BERRYCOLORS)\n\t\telse\n\t\t\tGLOB.berrycolors[color_index] = newcolor', self.produce)
        self.assertEqual(self.produce.count('filling_color = GLOB.berrycolors[color_index]'), 2)
        self.assertIn('item_overlay.color = filling_color\n\tadd_overlay(item_overlay)', self.produce)
        self.assertIn('var/color_index = "good"', self.produce)
        self.assertIn('color_index = "bad"', self.produce)

    def test_dme_includes_both_files_once_in_order(self):
        dme = (ROOT / "roguetown.dme").read_text()
        includes = ['#include "' + path.replace('/', chr(92)) + '"' for path in (PALETTE, PRODUCE)]
        for line in includes:
            self.assertEqual(dme.splitlines().count(line), 1)
        self.assertLess(dme.index(includes[0]), dme.index(includes[1]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
