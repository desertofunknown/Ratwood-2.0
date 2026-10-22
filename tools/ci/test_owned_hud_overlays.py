#!/usr/bin/env python3
"""Source-bound CRT/grain ownership regressions; never executes DM/BYOND.

Run: python3 tools/ci/test_owned_hud_overlays.py
Optional --interface-source supports checking a baseline without a checkout.
The Python model uses retained HUD objects and borrowed object references, not
rendering, native client behavior, save I/O, or a complete observer simulation.
Exact callback fixtures preserve every non-overlay statement and its position.
Reviewed source-body digests guard the model's ownership/sharing assumptions;
source drift requires review rather than silently extending the model.
"""

import argparse
from dataclasses import dataclass, field
from hashlib import sha256
import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
INTERFACE = ROOT / "interface/interface.dm"
FIXTURE = Path(__file__).with_name("fixtures") / "owned_hud_overlays.json"
EFFECTS = {"crt": ("crtmode", "scannies", 70), "grain": ("grainfilter", "grain", 55)}


def definition(source, header):
    matches = re.findall(r"^" + re.escape(header) + r"\n(.*?)(?=^/|\Z)", source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError(f"Expected exactly one definition: {header}")
    return matches[0]


def overlay_block(overlay, alpha, owned):
    if owned:
        return (f"\t\tif(mob?.hud_used?.{overlay})\n"
                f"\t\t\tmob.hud_used.{overlay}.alpha = {alpha}\n")
    return (f"\t\tfor(var/atom/movable/screen/{overlay}/S in screen)\n"
            f"\t\t\tS.alpha = {alpha}\n")


def callback_contract(source, effect, fixture):
    """Accept only the baseline loops or reviewed guarded-field replacements."""
    callback, overlay, on_alpha = EFFECTS[effect]
    body = definition(source, f"/client/verb/{callback}()")
    baseline = fixture["callbacks"][callback]
    normalized = body
    modes = {}
    for alpha in (0, on_alpha):
        old = overlay_block(overlay, alpha, False)
        new = overlay_block(overlay, alpha, True)
        if baseline.count(old) != 1 or body.count(old) + body.count(new) != 1:
            raise AssertionError(f"Unreviewed {effect} alpha={alpha} overlay update")
        modes[alpha] = new in body
        normalized = normalized.replace(new, old)
    if normalized != baseline:
        raise AssertionError(f"Non-overlay {effect} callback statements or positions changed")
    return modes


@dataclass(eq=False)
class Overlay:
    kind: str
    alpha: int


@dataclass
class Hud:
    scannies: object = None
    grain: object = None

    def inventory(self):
        return [item for item in (self.scannies, self.grain) if item is not None]


@dataclass
class Mob:
    hud_used: object = None


@dataclass
class Client:
    prefs: object
    mob: object
    screen: list = field(default_factory=list)
    events: list = field(default_factory=list)


def client_with_hud(enabled, visible=True):
    hud = Hud(Overlay("scannies", 70 if enabled else 0),
              Overlay("grain", 55 if enabled else 0))
    return Client({"crt": enabled, "grain": enabled}, Mob(hud),
                  hud.inventory() if visible else [])


def non_overlay_events(effect, enabled):
    """The unchanged baseline side effects, in callback order."""
    events = []
    if effect == "crt":
        events.append(("winset", "mapwindow.map", "zoom-mode=blur" if enabled else "zoom-mode=normal"))
        chat = "CRT... ON" if enabled else "CRT... OFF"
    else:
        chat = ("Grain is <font color='#007fff'>ON.</font>" if enabled
                else "Grain is <font color='gray'>OFF.</font>")
    events.extend((("preference", effect, enabled), ("save_preferences",), ("chat", chat)))
    return events


def modeled_toggle(client, effect, modes):
    """Model only a callback whose entire source passed callback_contract()."""
    if client.prefs is None:
        return
    enabled = not (client.prefs[effect] == True)
    client.prefs[effect] = enabled
    client.events.extend(non_overlay_events(effect, enabled))
    _, overlay, on_alpha = EFFECTS[effect]
    alpha = on_alpha if enabled else 0
    if modes[alpha]:
        hud = client.mob.hud_used if client.mob is not None else None
        target = getattr(hud, overlay, None)
        targets = [] if target is None else [target]
    else:
        targets = [item for item in client.screen if item.kind == overlay]
    for target in targets:
        target.alpha = alpha


class OwnedHudOverlayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads(FIXTURE.read_text())
        cls.source = INTERFACE.read_text()
        cls.modes = {effect: callback_contract(cls.source, effect, cls.fixture) for effect in EFFECTS}

    def toggle(self, client, effect):
        modeled_toggle(client, effect, self.modes[effect])

    def test_non_overlay_callbacks_and_dispatch_are_unchanged(self):
        toggles = (ROOT / "code/modules/client/preferences_toggles.dm").read_text()
        action = definition(toggles, "/datum/toggle_options_menu/ui_act(action, list/params, datum/tgui/ui, datum/ui_state/state)")
        for effect in EFFECTS:
            callback_contract(self.source, effect, self.fixture)
            self.assertEqual(action.count(self.fixture["dispatch"][effect]), 1)

    def test_reviewed_ownership_and_shared_reference_source_is_unchanged(self):
        for contract in self.fixture["source_contracts"]:
            with self.subTest(header=contract["header"]):
                body = definition((ROOT / contract["path"]).read_text(), contract["header"])
                self.assertEqual(sha256(body.encode()).hexdigest(), contract["sha256"],
                                 "Ownership/sharing source changed; review the model")

    def test_visible_owned_overlay_changes_in_both_directions(self):
        for effect, (_, overlay, on_alpha) in EFFECTS.items():
            for enabled in (False, True):
                with self.subTest(effect=effect, enabled=enabled):
                    client = client_with_hud(enabled)
                    before = list(client.screen)
                    self.toggle(client, effect)
                    self.assertEqual(getattr(client.mob.hud_used, overlay).alpha, 0 if enabled else on_alpha)
                    self.assertEqual(client.screen, before)
                    self.assertEqual(client.events, non_overlay_events(effect, not enabled))

    def test_hidden_owned_overlay_changes_in_both_directions(self):
        for effect, (_, overlay, on_alpha) in EFFECTS.items():
            for enabled in (False, True):
                with self.subTest(effect=effect, enabled=enabled):
                    client = client_with_hud(enabled, visible=False)
                    self.toggle(client, effect)
                    self.assertEqual(getattr(client.mob.hud_used, overlay).alpha, 0 if enabled else on_alpha)
                    self.assertEqual(client.screen, [])

    def test_observer_updates_own_hidden_overlay_not_borrowed_target(self):
        for effect, (_, overlay, on_alpha) in EFFECTS.items():
            for enabled in (False, True):
                with self.subTest(effect=effect, enabled=enabled):
                    observer = client_with_hud(enabled, visible=False)
                    target = client_with_hud(enabled)
                    observer.screen = list(target.screen)
                    borrowed = getattr(target.mob.hud_used, overlay)
                    before = borrowed.alpha
                    self.toggle(observer, effect)
                    self.assertEqual(borrowed.alpha, before)
                    self.assertEqual(getattr(observer.mob.hud_used, overlay).alpha, 0 if enabled else on_alpha)
                    self.assertEqual(target.prefs[effect], enabled)
                    self.assertEqual(target.events, [])
                    self.assertEqual(observer.screen, target.screen)

    def test_hide_toggle_restore_reuses_owned_objects_with_updated_alpha(self):
        for effect, (_, overlay, on_alpha) in EFFECTS.items():
            for enabled in (False, True):
                with self.subTest(effect=effect, enabled=enabled):
                    client = client_with_hud(enabled)
                    owned = getattr(client.mob.hud_used, overlay)
                    original_inventory = list(client.screen)
                    # Model removal and re-addition of the retained static inventory.
                    client.screen = []
                    self.toggle(client, effect)
                    self.assertEqual(client.screen, [])
                    client.screen = client.mob.hud_used.inventory()
                    self.assertEqual(client.screen, original_inventory)
                    restored = next(item for item in client.screen if item.kind == overlay)
                    self.assertIs(restored, owned)
                    self.assertEqual(restored.alpha, 0 if enabled else on_alpha)

    def test_unowned_same_type_screen_objects_are_untouched(self):
        for effect, (_, overlay, _) in EFFECTS.items():
            for enabled in (False, True):
                with self.subTest(effect=effect, enabled=enabled):
                    client = client_with_hud(enabled)
                    borrowed = Overlay(overlay, 123)
                    client.screen.append(borrowed)
                    self.toggle(client, effect)
                    self.assertEqual(borrowed.alpha, 123)

    def test_target_updates_are_visible_through_shared_references(self):
        for effect, (_, overlay, on_alpha) in EFFECTS.items():
            for enabled in (False, True):
                with self.subTest(effect=effect, enabled=enabled):
                    target = client_with_hud(enabled)
                    observer = client_with_hud(not enabled, visible=False)
                    observer.screen = list(target.screen)
                    borrowed = next(item for item in observer.screen if item.kind == overlay)
                    self.assertIs(borrowed, getattr(target.mob.hud_used, overlay))
                    self.toggle(target, effect)
                    self.assertEqual(borrowed.alpha, 0 if enabled else on_alpha)
                    self.assertEqual(observer.prefs[effect], not enabled)
                    self.assertEqual(observer.events, [])

    def test_repeated_hidden_toggles_reuse_objects_without_changing_screen(self):
        for effect, (_, overlay, on_alpha) in EFFECTS.items():
            with self.subTest(effect=effect):
                client = client_with_hud(False, visible=False)
                owned = getattr(client.mob.hud_used, overlay)
                for expected in (on_alpha, 0, on_alpha, 0):
                    self.toggle(client, effect)
                    self.assertIs(getattr(client.mob.hud_used, overlay), owned)
                    self.assertEqual(owned.alpha, expected)
                    self.assertEqual(client.screen, [])

    def test_missing_mob_hud_or_either_overlay_preserves_other_behavior(self):
        for effect, (_, overlay, on_alpha) in EFFECTS.items():
            for missing in ("mob", "hud", "scannies", "grain", "both"):
                for enabled in (False, True):
                    with self.subTest(effect=effect, missing=missing, enabled=enabled):
                        client = client_with_hud(enabled, visible=False)
                        if missing == "mob":
                            client.mob = None
                        elif missing == "hud":
                            client.mob.hud_used = None
                        else:
                            for name in (("scannies", "grain") if missing == "both" else (missing,)):
                                setattr(client.mob.hud_used, name, None)
                        self.toggle(client, effect)
                        self.assertEqual(client.prefs[effect], not enabled)
                        self.assertEqual(client.events, non_overlay_events(effect, not enabled))
                        self.assertEqual(client.screen, [])
                        hud = client.mob.hud_used if client.mob else None
                        remaining = getattr(hud, overlay, None)
                        if remaining is not None:
                            self.assertEqual(remaining.alpha, 0 if enabled else on_alpha)

    def test_missing_preferences_remains_a_no_op(self):
        for effect in EFFECTS:
            client = client_with_hud(True)
            client.prefs = None
            before = [(item, item.alpha) for item in client.screen]
            self.toggle(client, effect)
            self.assertEqual([(item, item.alpha) for item in client.screen], before)
            self.assertEqual(client.events, [])

    def test_contract_rejects_non_overlay_changes_and_unguarded_or_wrong_updates(self):
        for effect, (callback, overlay, on_alpha) in EFFECTS.items():
            baseline = self.fixture["callbacks"][callback]
            fixed = baseline
            for alpha in (0, on_alpha):
                fixed = fixed.replace(overlay_block(overlay, alpha, False), overlay_block(overlay, alpha, True))
            source = f"/client/verb/{callback}()\n" + fixed
            callback_contract(source, effect, self.fixture)
            mutations = [
                ("\t\tprefs.save_preferences()\n", ""),
                (f"\tif(prefs.{effect} == TRUE)", f"\tif(prefs.{effect} != TRUE)"),
                (f"\t\tif(mob?.hud_used?.{overlay})\n", ""),
                (f"mob.hud_used.{overlay}.alpha = {on_alpha}", f"mob.hud_used.{overlay}.alpha = 255"),
                (f"mob?.hud_used?.{overlay}", f"mob.hud_used.{overlay}"),
                ("\tif(!prefs)\n", "\tif(!prefs || !mob?.hud_used)\n"),
            ]
            if effect == "crt":
                mutations.append(("zoom-mode=blur", "zoom-mode=normal"))
            for original, replacement in mutations:
                with self.subTest(effect=effect, original=original):
                    self.assertIn(original, source)
                    with self.assertRaises(AssertionError):
                        callback_contract(source.replace(original, replacement, 1), effect, self.fixture)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--interface-source", type=Path)
    options, remaining = parser.parse_known_args()
    if options.interface_source is not None:
        INTERFACE = options.interface_source
    unittest.main(argv=[__file__] + remaining)
