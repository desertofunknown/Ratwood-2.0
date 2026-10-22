#!/usr/bin/env python3
"""Source-bound borrowed HUD palette regressions; never executes DM/BYOND.

Run: python3 tools/ci/test_borrowed_palette_refresh.py
Optional --hud-source checks an old HUD source without changing the checkout.
The narrow Python model covers candidate selection and shared icon/component
references, not DM list/runtime execution, rendering, full observer lifecycle,
save I/O or native-client acceptance. Fixtures bind exact reviewed source;
unreviewed changes fail instead of silently extending the model. Synthetic
screen objects exercise the supported lending routes, including client-only
popups and an observer's palette-using notify_cloning alert.
"""

import argparse
from dataclasses import dataclass, field
from hashlib import sha256
import json
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
HUD = ROOT / "code/_onclick/hud/hud.dm"
FIXTURE = Path(__file__).with_name("fixtures") / "borrowed_palette_refresh.json"
HEADER = "/datum/hud/proc/update_colorblind_hud_palette(datum/preferences/prefs)"
RETAINED = ("static_inventory", "toggleable_inventory", "hotkeybuttons",
            "infodisplay", "screenoverlays", "inv_slots")
DIRECT_LISTS = RETAINED[:4]
OLD_EXTRAS = "\t\tscreen_objects += mymob.client.screen\n"
NEW_EXTRAS = """\t\tvar/list/client_screen_objects = mymob.client.screen.Copy()
\t\tvar/mob/dead/observer/watcher = mymob
\t\tif(istype(watcher) && watcher.observetarget)
\t\t\t// Shared target objects must keep their owner's palette, including HUDs lent without a target client.
\t\t\tif(watcher.observed_screens)
\t\t\t\tclient_screen_objects -= watcher.observed_screens
\t\t\tvar/datum/hud/target_hud = watcher.observetarget.hud_used
\t\t\tif(target_hud)
\t\t\t\tif(target_hud.static_inventory)
\t\t\t\t\tclient_screen_objects -= target_hud.static_inventory
\t\t\t\tif(target_hud.toggleable_inventory)
\t\t\t\t\tclient_screen_objects -= target_hud.toggleable_inventory
\t\t\t\tif(target_hud.hotkeybuttons)
\t\t\t\t\tclient_screen_objects -= target_hud.hotkeybuttons
\t\t\t\tif(target_hud.infodisplay)
\t\t\t\t\tclient_screen_objects -= target_hud.infodisplay
\t\t\t\tif(target_hud.vis_holder)
\t\t\t\t\tclient_screen_objects -= target_hud.vis_holder
\t\t\t\tif(target_hud.action_intent)
\t\t\t\t\tclient_screen_objects -= target_hud.action_intent
\t\t\t\tif(target_hud.hand_slots)
\t\t\t\t\tfor(var/borrowed_index in target_hud.hand_slots)
\t\t\t\t\t\tclient_screen_objects -= target_hud.hand_slots[borrowed_index]
\t\tscreen_objects += client_screen_objects
"""


def definition(source, header):
    matches = re.findall(r"^" + re.escape(header) + r"\n(.*?)(?=^/(?![/*])|\Z)", source, re.M | re.S)
    if len(matches) != 1:
        raise AssertionError(f"Expected exactly one definition: {header}")
    return matches[0]


def palette_contract(source, fixture):
    """Return the modeled mode only for an entire exact reviewed proc body."""
    baseline = fixture["baseline_update"]
    if baseline.count(OLD_EXTRAS) != 1:
        raise AssertionError("Invalid baseline fixture")
    body = definition(source, HEADER)
    if body == baseline:
        return False
    if body == baseline.replace(OLD_EXTRAS, NEW_EXTRAS):
        return True
    raise AssertionError("Unreviewed palette candidate selection or application")


def palette_icon(family, palette):
    suffix = {"default": "", "deuten": "_deuten", "protan": "_protan", "tritan": "_tritan"}[palette]
    return f"icons/mob/{family}{suffix}.dmi"


def recolor(icon, palette):
    for family in ("roguehud", "rogueheat"):
        if icon in [palette_icon(family, old) for old in ("default", "deuten", "protan", "tritan")]:
            return palette_icon(family, palette)
    return icon


@dataclass(eq=False)
class Screen:
    icon: str = "icons/mob/roguehud.dmi"
    components: list = field(default_factory=list)
    # The bloodpool override updates four explicit nested parts separately.
    bloodpool_parts: list = field(default_factory=list)
    hud: object = None


@dataclass(eq=False)
class Item:
    """Inventory /obj/item is not an /atom/movable/screen."""
    icon: str = "icons/mob/roguehud.dmi"


@dataclass
class Hud:
    mymob: object = None
    static_inventory: list = field(default_factory=list)
    toggleable_inventory: list = field(default_factory=list)
    hotkeybuttons: list = field(default_factory=list)
    infodisplay: list = field(default_factory=list)
    screenoverlays: list = field(default_factory=list)
    inv_slots: list = field(default_factory=list)
    hand_slots: dict = field(default_factory=dict)
    vis_holder: object = None
    action_intent: object = None


@dataclass
class Mob:
    hud_used: object = None
    client: object = None
    observer: bool = False
    observetarget: object = None
    observed_screens: object = None


@dataclass
class Client:
    prefs: object = "default"
    screen: list = field(default_factory=list)


def actor(observer=False, connected=True, palette="default"):
    mob = Mob(observer=observer, client=Client(palette) if connected else None)
    mob.hud_used = Hud(mymob=mob)
    return mob


def modeled_refresh(hud, prefs, filtered):
    """Called only after the whole source proc matches a reviewed contract."""
    mob = hud.mymob
    client = mob.client if mob is not None else None
    if prefs is None:
        prefs = client.prefs if client is not None else None
    if prefs is None:
        return
    candidates = []
    for name in RETAINED:
        candidates.extend(getattr(hud, name))
    if hud.hand_slots:
        candidates.extend(hud.hand_slots.values())
    if client is not None:
        extras = list(client.screen)
        if filtered and mob.observer and mob.observetarget is not None:
            borrowed = list(mob.observed_screens or [])
            target_hud = mob.observetarget.hud_used
            if target_hud is not None:
                for name in DIRECT_LISTS:
                    borrowed.extend(getattr(target_hud, name) or [])
                borrowed.extend([target_hud.vis_holder, target_hud.action_intent])
                borrowed.extend((target_hud.hand_slots or {}).values())
            extras = [item for item in extras if item not in borrowed]
        candidates.extend(extras)
    for item in candidates:
        if not isinstance(item, Screen):
            continue
        item.icon = recolor(item.icon, prefs)
        for component in item.components:
            component.icon = recolor(component.icon, prefs)
        for part in item.bloodpool_parts:
            part.icon = palette_icon("rogueheat", prefs)


def inputs_snapshot(*mobs):
    """Capture input collection identities and members, excluding icon state."""
    result = []
    for mob in mobs:
        collections = [mob.observed_screens]
        if mob.client is not None:
            collections.append(mob.client.screen)
        if mob.hud_used is not None:
            collections.extend(getattr(mob.hud_used, name) for name in RETAINED)
            collections.append(mob.hud_used.hand_slots)
        for collection in collections:
            if collection is None:
                result.append(None)
            elif isinstance(collection, dict):
                result.append((id(collection), tuple((key, id(value)) for key, value in collection.items())))
            else:
                result.append((id(collection), tuple(id(value) for value in collection)))
    return result


class BorrowedPaletteRefreshTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = json.loads(FIXTURE.read_text())
        cls.source = HUD.read_text()
        cls.filtered = palette_contract(cls.source, cls.fixture)

    def refresh(self, mob, prefs="tritan"):
        modeled_refresh(mob.hud_used, prefs, self.filtered)

    def test_reviewed_sources_callbacks_and_persistence_order_unchanged(self):
        # This freezes all other HUD code, including refresh callback order and show_hud.
        body = definition(self.source, HEADER)
        remaining = self.source.replace(HEADER + "\n" + body, HEADER + "\n<reviewed palette proc>\n", 1)
        self.assertEqual(sha256(remaining.encode()).hexdigest(), self.fixture["surrounding_hud_sha256"])
        for contract in self.fixture["source_contracts"]:
            with self.subTest(header=contract["header"]):
                source = (ROOT / contract["path"]).read_text()
                body = definition(source, contract["header"])
                self.assertEqual(sha256(body.encode()).hexdigest(), contract["sha256"],
                                 "Ownership, palette or callback source changed; review the model")

    def test_connected_target_shared_icons_components_and_client_only_popup_unchanged(self):
        for kind in ("icon", "component", "bloodpool", "popup"):
            with self.subTest(kind=kind):
                target, observer = actor(), actor(observer=True)
                shared = Screen()
                if kind == "component":
                    shared.icon = "non_palette.dmi"
                    shared.components = [Screen(icon=palette_icon("rogueheat", "default"))]
                elif kind == "bloodpool":
                    shared.bloodpool_parts = [Screen(icon=palette_icon("rogueheat", "default")) for _ in range(4)]
                if kind != "popup":
                    target.hud_used.infodisplay.append(shared)
                target.client.screen = [shared]
                observer.observetarget = target
                observer.observed_screens = [shared]
                observer.client.screen = [shared]
                before = [part.icon for part in [shared] + shared.components + shared.bloodpool_parts]
                self.refresh(observer)
                self.assertEqual([part.icon for part in [shared] + shared.components + shared.bloodpool_parts], before)
                self.assertEqual(target.client.prefs, "default")

    def test_clientless_target_every_direct_lending_route_is_protected(self):
        for field_name in DIRECT_LISTS + ("vis_holder", "action_intent", "hand_slots"):
            with self.subTest(field=field_name):
                target, observer = actor(connected=False), actor(observer=True)
                shared = Screen(icon=palette_icon("rogueheat", "default"))
                self.assertIsNone(shared.hud)  # Includes unclaimed human stamina/energy.
                if field_name in DIRECT_LISTS:
                    setattr(target.hud_used, field_name, [shared])
                elif field_name == "hand_slots":
                    target.hud_used.hand_slots = {"1": shared, "2": None}
                else:
                    setattr(target.hud_used, field_name, shared)
                observer.observetarget = target
                observer.client.screen = [shared]
                self.refresh(observer)
                self.assertEqual(shared.icon, palette_icon("rogueheat", "default"))

    def test_viewer_only_toggleable_inventory_not_in_target_screen_is_protected(self):
        target, observer = actor(), actor(observer=True)
        inventory = Screen()
        target.hud_used.toggleable_inventory = [inventory]
        observer.observetarget = target
        observer.observed_screens = []
        observer.client.screen = [inventory]
        self.assertNotIn(inventory, target.client.screen)
        self.refresh(observer)
        self.assertEqual(inventory.icon, palette_icon("roguehud", "default"))

    def test_holder_only_component_is_protected_without_tracking(self):
        target, observer = actor(connected=False), actor(observer=True)
        component = Screen()
        holder = Screen(icon="", components=[component])
        target.hud_used.vis_holder = holder
        observer.observetarget = target
        observer.client.screen = [holder]
        self.refresh(observer)
        self.assertEqual(component.icon, palette_icon("roguehud", "default"))
        self.assertEqual(holder.icon, "")

    def test_observer_own_hidden_hud_hands_and_client_only_cloning_alert_refresh(self):
        target, observer = actor(), actor(observer=True)
        observer.observetarget = target
        owned = []
        for field_name in RETAINED:
            screen = Screen()
            getattr(observer.hud_used, field_name).append(screen)
            owned.append(screen)
        hand, alert = Screen(), Screen()
        observer.hud_used.hand_slots = {"1": hand, "2": None}
        observer.client.screen = [alert]
        self.refresh(observer)
        for screen in owned + [hand, alert]:
            self.assertEqual(screen.icon, palette_icon("roguehud", "tritan"))
        self.assertEqual(observer.client.screen, [alert])

    def test_target_refresh_remains_visible_through_shared_references(self):
        target, observer = actor(), actor(observer=True)
        shared = Screen(components=[Screen(icon=palette_icon("rogueheat", "default"))])
        target.hud_used.static_inventory = [shared]
        target.client.screen = [shared]
        observer.observetarget = target
        observer.client.screen = [shared]
        observer.observed_screens = [shared]
        self.refresh(target, "protan")
        self.assertIs(observer.client.screen[0], shared)
        self.assertEqual(shared.icon, palette_icon("roguehud", "protan"))
        self.assertEqual(shared.components[0].icon, palette_icon("rogueheat", "protan"))
        self.assertEqual(observer.client.prefs, "default")

    def test_ordinary_client_only_popup_keeps_refresh_behavior(self):
        owner = actor()
        popup = Screen(components=[Screen()])
        owner.client.screen = [popup]
        self.refresh(owner)
        self.assertEqual(popup.icon, palette_icon("roguehud", "tritan"))
        self.assertEqual(popup.components[0].icon, palette_icon("roguehud", "tritan"))

    def test_observer_without_active_target_does_not_filter_stale_tracking(self):
        observer = actor(observer=True)
        own_alert = Screen()
        observer.observed_screens = [own_alert]
        observer.client.screen = [own_alert]
        self.refresh(observer)
        self.assertEqual(own_alert.icon, palette_icon("roguehud", "tritan"))

    def test_target_without_hud_still_filters_tracked_objects_not_own_alert(self):
        observer = actor(observer=True)
        observer.observetarget = Mob()
        borrowed, own_alert = Screen(), Screen()
        observer.observed_screens = [borrowed]
        observer.client.screen = [borrowed, own_alert]
        self.refresh(observer)
        self.assertEqual(borrowed.icon, palette_icon("roguehud", "default"))
        self.assertEqual(own_alert.icon, palette_icon("roguehud", "tritan"))

    def test_nullable_target_lists_and_hand_values_do_not_suppress_own_extras(self):
        target, observer = actor(connected=False), actor(observer=True)
        observer.observetarget = target
        for field_name in DIRECT_LISTS + ("hand_slots",):
            setattr(target.hud_used, field_name, None)
        own_alert = Screen()
        observer.client.screen = [own_alert, None]
        self.refresh(observer)
        self.assertEqual(own_alert.icon, palette_icon("roguehud", "tritan"))
        target.hud_used.hand_slots = {"1": None}
        self.refresh(observer, "protan")
        self.assertEqual(own_alert.icon, palette_icon("roguehud", "protan"))

    def test_explicit_preferences_override_fallback_and_missing_prefs_are_noop(self):
        owner = actor(palette="deuten")
        screen = Screen()
        owner.hud_used.static_inventory = [screen]
        self.refresh(owner, None)
        self.assertEqual(screen.icon, palette_icon("roguehud", "deuten"))
        self.refresh(owner, "protan")
        self.assertEqual(screen.icon, palette_icon("roguehud", "protan"))
        owner.client.prefs = None
        self.refresh(owner, None)
        self.assertEqual(screen.icon, palette_icon("roguehud", "protan"))
        owner.client = None
        self.refresh(owner, None)
        self.assertEqual(screen.icon, palette_icon("roguehud", "protan"))
        self.refresh(owner, "tritan")
        self.assertEqual(screen.icon, palette_icon("roguehud", "tritan"))
        owner.hud_used.mymob = None
        self.refresh(owner, None)
        self.assertEqual(screen.icon, palette_icon("roguehud", "tritan"))
        self.refresh(owner, "default")
        self.assertEqual(screen.icon, palette_icon("roguehud", "default"))

    def test_input_collection_identity_order_membership_and_nulls_never_change(self):
        target, observer = actor(), actor(observer=True)
        shared, own = Screen(), Screen()
        for field_name in RETAINED:
            getattr(target.hud_used, field_name).append(shared)
            getattr(observer.hud_used, field_name).append(own)
        target.hud_used.hand_slots = {"1": shared, "2": None}
        observer.hud_used.hand_slots = {"1": own, "2": None}
        target.client.screen = [shared]
        observer.observetarget = target
        observer.observed_screens = [shared]
        observer.client.screen = [shared, own, shared, None]
        before = inputs_snapshot(target, observer)
        for palette in ("tritan", "protan", "default"):
            self.refresh(observer, palette)
            self.assertEqual(inputs_snapshot(target, observer), before)
            self.assertEqual(shared.icon, palette_icon("roguehud", "default"))
            self.assertEqual(own.icon, palette_icon("roguehud", palette))

    def test_nonscreen_inventory_items_and_unrecognized_icons_are_unchanged(self):
        owner = actor()
        item, other = Item(), Screen(icon="icons/mob/screen_gen.dmi")
        owner.client.screen = [item, other, None, "1"]
        self.refresh(owner)
        self.assertEqual(item.icon, palette_icon("roguehud", "default"))
        self.assertEqual(other.icon, "icons/mob/screen_gen.dmi")

    def test_all_palette_transitions_keep_family_and_component_rules(self):
        for old in ("default", "deuten", "protan", "tritan"):
            for new in ("default", "deuten", "protan", "tritan"):
                with self.subTest(old=old, new=new):
                    owner = actor()
                    component = Screen(icon=palette_icon("rogueheat", old))
                    fixed_component = Screen(icon="screen_gen.dmi")
                    screen = Screen(icon=palette_icon("roguehud", old), components=[component, fixed_component])
                    owner.hud_used.static_inventory = [screen]
                    self.refresh(owner, new)
                    self.assertEqual(screen.icon, palette_icon("roguehud", new))
                    self.assertEqual(component.icon, palette_icon("rogueheat", new))
                    self.assertEqual(fixed_component.icon, "screen_gen.dmi")

    def test_exact_source_contract_rejects_wrong_filters_guards_and_side_effects(self):
        baseline = self.fixture["baseline_update"]
        source = HEADER + "\n" + baseline.replace(OLD_EXTRAS, NEW_EXTRAS)
        self.assertTrue(palette_contract(source, self.fixture))
        self.assertFalse(palette_contract(HEADER + "\n" + baseline, self.fixture))
        mutations = [
            ("mymob.client.screen.Copy()", "mymob.client.screen"),
            ("if(istype(watcher) && watcher.observetarget)", "if(watcher)"),
            ("if(watcher.observed_screens)", "if(watcher.observetarget.client)"),
            ("client_screen_objects -= watcher.observed_screens", "client_screen_objects = list()"),
            ("if(target_hud)", "if(target_hud.mymob.client)"),
            ("target_hud.hand_slots[borrowed_index]", "borrowed_index"),
            ("screen_objects += client_screen_objects", "mymob.client.screen = client_screen_objects"),
            ("screen_objects += hand_slots[held_index]", "screen_objects += held_index"),
            ("screen_object.apply_colorblind_hud_palette(prefs)", "screen_object.apply_colorblind_hud_palette()"),
            ("\tif(!prefs)\n\t\treturn\n", ""),
        ]
        for field_name in DIRECT_LISTS + ("vis_holder", "action_intent", "hand_slots"):
            mutations.append((f"\t\t\t\tif(target_hud.{field_name})\n", ""))
        for old, new in mutations:
            with self.subTest(old=old):
                self.assertIn(old, source)
                with self.assertRaises(AssertionError):
                    palette_contract(source.replace(old, new, 1), self.fixture)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--hud-source", type=Path)
    options, remaining = parser.parse_known_args()
    if options.hud_source is not None:
        HUD = options.hud_source
    unittest.main(argv=[__file__] + remaining)
