"""Static source/asset contract for the Loudmouth headcover's worn icon.

Run: python3 tools/ci/test_loudmouth_overlay.py
This reads DM and DMI metadata; it does not execute DM or render a mob.
"""

from pathlib import Path
import re
import struct
import unittest
import zlib


ROOT = Path(__file__).resolve().parents[2]
HATS = ROOT / "code/modules/clothing/rogueclothes/headwear/hats.dm"
TYPE = "/obj/item/clothing/head/roguetown/veiled/loudmouth"
HEAD_ICON = "icons/roguetown/clothing/onmob/head.dmi"
MASK_ICON = "icons/mob/clothing/mask.dmi"
STATES = ("loudmouth", "loudmouth_detail", "loudmouth_t", "loudmouth_t_detail")


def definition(source, path):
    match = re.search(r"^" + re.escape(path) + r"\n(.*?)(?=^/|\Z)", source, re.M | re.S)
    if match is None:
        raise AssertionError(f"Missing definition: {path}")
    return match[1]


def dmi_states(path):
    """Read the compressed Description chunk used by these checked-in DMIs."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"Not a PNG: {path}")
    offset = 8
    while offset + 12 <= len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        payload = data[offset + 8:offset + 8 + length]
        if len(payload) != length or offset + 12 + length > len(data):
            raise AssertionError(f"Truncated PNG chunk: {path}")
        offset += length + 12
        if kind != b"zTXt":
            continue
        key, compressed = payload.split(b"\0", 1)
        if key != b"Description":
            continue
        if compressed[:1] != b"\0":
            raise AssertionError(f"Unsupported PNG text compression: {path}")
        metadata = zlib.decompress(compressed[1:]).decode("utf-8")
        entries = re.findall(r'^state = "([^"]*)"\n(.*?)(?=^state =|\Z)', metadata, re.M | re.S)
        return {name: body for name, body in entries}
    raise AssertionError(f"Missing compressed DMI description: {path}")


class LoudmouthOverlayTests(unittest.TestCase):
    def test_specific_item_selects_existing_head_atlas(self):
        source = HATS.read_text()
        item = definition(source, TYPE)
        self.assertIn(f"\tmob_overlay_icon = '{HEAD_ICON}'\n", item)
        self.assertIn('\ticon_state = "loudmouth"\n', item)
        self.assertIn('\titem_state = "loudmouth"\n', item)
        parent = definition(source, TYPE.rsplit("/", 1)[0])
        self.assertIn("\tslot_flags = ITEM_SLOT_HEAD|ITEM_SLOT_MASK\n", parent)
        self.assertNotIn("mob_overlay_icon", parent)
        self.assertIn('#include "code\\modules\\clothing\\rogueclothes\\headwear\\hats.dm"', (ROOT / "roguetown.dme").read_text())

    def test_normal_adjusted_and_detail_states_exist_for_all_directions(self):
        head = dmi_states(ROOT / HEAD_ICON)
        mask = dmi_states(ROOT / MASK_ICON)
        for state in STATES:
            with self.subTest(state=state):
                self.assertIn(state, head)
                self.assertRegex(head[state], r"(?m)^\s*dirs = 4$")
                self.assertRegex(head[state], r"(?m)^\s*frames = 1$")
                self.assertNotIn(state, mask)
        self.assertNotIn("loudmouth_snout", head)

    def test_actual_consumers_preserve_head_and_in_hand_selection(self):
        human = (ROOT / "code/modules/mob/living/carbon/human/update_icons.dm").read_text()
        carbon = (ROOT / "code/modules/mob/living/carbon/update_icons.dm").read_text()
        mask = definition(carbon, "/mob/living/carbon/update_inv_wear_mask()")
        self.assertIn(f"wear_mask.build_worn_icon(default_layer = MASK_LAYER, default_icon_file = '{MASK_ICON}')", mask)
        self.assertIn(f"head.build_worn_icon(default_layer = HEAD_LAYER, default_icon_file = '{HEAD_ICON}'", human)
        self.assertIn("\tif(!isinhands && mob_overlay_icon)\n\t\tfile2use = mob_overlay_icon\n\tif(!file2use)\n\t\tfile2use = default_icon_file\n", human)
        self.assertIn('mutable_appearance(icon(file2use, "[detail_state][get_detail_tag()]"), -layer2use)', human)


if __name__ == "__main__":
    unittest.main()
